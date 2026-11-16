// The owner's sign-in for /admin: "Sign in with Google", done on the server (the browser never talks to Google or Supabase itself).
//
//   /api/admin/login     sends the visitor to Google
//   /api/admin/callback  Google sends them back with a code; we swap it for the person's verified email
//   a signed, HttpOnly cookie then says "this is <email>" for a few hours
//
// Only the emails in ADMIN_EMAILS (comma separated) get in. Anyone else who signs in with Google is turned away with no detail.
// Settings, all in Cloudflare Pages (docs/ADMIN.md): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAILS, ADMIN_SESSION_SECRET.
import { ApiError } from './api.js';

export const SESSION_HOURS = 8;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

const encoder = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export function adminSettings(env) {
  const secret = typeof env.ADMIN_SESSION_SECRET === 'string' ? env.ADMIN_SESSION_SECRET.trim() : '';
  const emails = String(env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const clientId = String(env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || '').trim();
  if (secret.length < 32 || !emails.length || !clientId || !clientSecret) return null;
  return { secret, emails, clientId, clientSecret };
}

// The NAMES of the settings that are missing or too short (never their values), so the page can say what to add.
export function adminMissing(env) {
  const text = key => (typeof env[key] === 'string' ? env[key].trim() : '');
  const missing = [];
  if (!text('GOOGLE_CLIENT_ID')) missing.push('GOOGLE_CLIENT_ID');
  if (!text('GOOGLE_CLIENT_SECRET')) missing.push('GOOGLE_CLIENT_SECRET');
  if (!text('ADMIN_EMAILS').split(',').some(e => e.trim())) missing.push('ADMIN_EMAILS');
  const secret = text('ADMIN_SESSION_SECRET');
  if (!secret) missing.push('ADMIN_SESSION_SECRET');
  else if (secret.length < 32) missing.push('ADMIN_SESSION_SECRET (needs 32 or more characters)');
  return missing;
}

export function requireAdminSettings(env) {
  const settings = adminSettings(env);
  if (!settings) throw new ApiError('The admin page is not set up.', 503, 'ADMIN_NOT_CONFIGURED', { missing: adminMissing(env) });
  return settings;
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

// "<payload>.<signature>"; the payload says who and until when. Anything altered, expired or for another email is refused.
export async function signSession(secret, email, now = Date.now()) {
  const payload = b64url(encoder.encode(JSON.stringify({ email, exp: now + SESSION_HOURS * 3600 * 1000 })));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function readSession(secret, emails, value, now = Date.now()) {
  const [payload, signature, extra] = String(value || '').split('.');
  if (!payload || !signature || extra !== undefined) return null;
  if (!sameText(signature, await hmac(secret, payload))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (typeof data.email !== 'string' || !(data.exp > now) || !emails.includes(data.email.toLowerCase())) return null;
    return { email: data.email };
  } catch {
    return null;
  }
}

export function cookieName(url, base) { return new URL(url).protocol === 'https:' ? `__Host-${base}` : base; }

export function readCookie(request, name) {
  for (const part of String(request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export function setCookie(url, base, value, maxAgeSeconds) {
  const secure = new URL(url).protocol === 'https:';
  return `${cookieName(url, base)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

// The signed-in admin's email, or null.
export async function currentAdmin(request, env) {
  const settings = adminSettings(env);
  if (!settings) return null;
  return readSession(settings.secret, settings.emails, readCookie(request, cookieName(request.url, 'is_admin')));
}

export function loginAddress(request, settings, state) {
  const redirect = new URL('/api/admin/callback', request.url).toString();
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: settings.clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email',
    state, prompt: 'select_account', access_type: 'online'
  }).toString();
  return url.toString();
}

// The person Google says this is. The id token comes straight from Google's token address over TLS in answer to our
// own request, so (as OpenID Connect allows) its contents are read without a signature check, but we still check who it is for.
export function emailFromIdToken(idToken, settings, now = Date.now()) {
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(String(idToken).split('.')[1])));
    if (claims.aud !== settings.clientId) return '';
    if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') return '';
    if (!(claims.exp * 1000 > now) || claims.email_verified !== true || typeof claims.email !== 'string') return '';
    return claims.email.toLowerCase();
  } catch {
    return '';
  }
}

export async function exchangeCode(request, settings, code) {
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: settings.clientId, client_secret: settings.clientSecret,
      redirect_uri: new URL('/api/admin/callback', request.url).toString(), grant_type: 'authorization_code'
    }).toString()
  });
  if (!response.ok) return '';
  const data = await response.json().catch(() => null);
  return data && data.id_token ? emailFromIdToken(data.id_token, settings) : '';
}

export function randomState() {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}
