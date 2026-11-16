import { adminSettings, exchangeCode, readCookie, cookieName, setCookie, signSession, SESSION_HOURS } from '../../_shared/admin.js';

// Google sends the visitor back here. Wrong state, a failed exchange, or an email that is not on the list all end the
// same way: back to /admin with no explanation. Nothing is said about which part failed.
export async function onRequest({ request, env }) {
  const settings = adminSettings(env);
  const url = new URL(request.url);
  const back = (query, cookies = []) => {
    const headers = new Headers({ Location: `/admin${query}`, 'Cache-Control': 'no-store' });
    for (const cookie of cookies) headers.append('Set-Cookie', cookie);
    return new Response(null, { status: 302, headers });
  };
  const clearState = setCookie(request.url, 'is_admin_state', '', 0);
  if (!settings) return back('?denied=1');
  const state = readCookie(request, cookieName(request.url, 'is_admin_state'));
  const code = url.searchParams.get('code') || '';
  if (!state || !code || url.searchParams.get('state') !== state) return back('?denied=1', [clearState]);
  const email = await exchangeCode(request, settings, code).catch(() => '');
  if (!email || !settings.emails.includes(email)) return back('?denied=1', [clearState]);
  const session = await signSession(settings.secret, email);
  return back('', [clearState, setCookie(request.url, 'is_admin', session, SESSION_HOURS * 3600)]);
}
