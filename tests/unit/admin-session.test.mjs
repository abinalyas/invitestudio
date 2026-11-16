import test from 'node:test';
import assert from 'node:assert/strict';
import { adminMissing, requireAdminSettings, adminSettings, emailFromIdToken, readSession, signSession, loginAddress, cookieName } from '../../functions/_shared/admin.js';

const env = { ADMIN_SESSION_SECRET: 'x'.repeat(40), ADMIN_EMAILS: 'Owner@Example.com, second@example.com', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' };
const settings = adminSettings(env);
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');

test('the admin page stays off until all four settings exist and the session secret is long enough', () => {
  assert.ok(settings);
  assert.deepEqual(settings.emails, ['owner@example.com', 'second@example.com']);
  for (const key of Object.keys(env)) assert.equal(adminSettings({ ...env, [key]: '' }), null, key);
  assert.equal(adminSettings({ ...env, ADMIN_SESSION_SECRET: 'short' }), null);
});

test('a signed session is read back, and is refused when altered, expired, or the email is no longer allowed', async () => {
  const now = Date.now();
  const cookie = await signSession(settings.secret, 'owner@example.com', now);
  assert.deepEqual(await readSession(settings.secret, settings.emails, cookie, now + 1000), { email: 'owner@example.com' });
  assert.equal(await readSession(settings.secret, settings.emails, cookie, now + 9 * 3600 * 1000), null);               // expired
  assert.equal(await readSession(settings.secret, ['someone-else@example.com'], cookie, now + 1000), null);             // removed from the list
  const [payload, signature] = cookie.split('.');
  const forged = b64({ email: 'owner@example.com', exp: now + 99 * 3600 * 1000 }) + '.' + signature;
  assert.equal(await readSession(settings.secret, settings.emails, forged, now + 1000), null);                          // payload changed
  assert.equal(await readSession(settings.secret, settings.emails, payload + '.' + signature.slice(0, -2) + 'AA', now + 1000), null);
  assert.equal(await readSession('y'.repeat(40), settings.emails, cookie, now + 1000), null);                          // other secret
  assert.equal(await readSession(settings.secret, settings.emails, '', now), null);
  assert.equal(await readSession(settings.secret, settings.emails, 'a.b.c', now), null);
});

test('Google\'s id token gives an email only when it is for us, from Google, verified and current', () => {
  const now = Date.now();
  const good = { aud: 'cid', iss: 'https://accounts.google.com', exp: Math.floor(now / 1000) + 300, email: 'Owner@Example.com', email_verified: true };
  const token = claims => 'h.' + b64(claims) + '.s';
  assert.equal(emailFromIdToken(token(good), settings, now), 'owner@example.com');
  assert.equal(emailFromIdToken(token({ ...good, aud: 'other' }), settings, now), '');
  assert.equal(emailFromIdToken(token({ ...good, iss: 'https://evil.example' }), settings, now), '');
  assert.equal(emailFromIdToken(token({ ...good, email_verified: false }), settings, now), '');
  assert.equal(emailFromIdToken(token({ ...good, exp: Math.floor(now / 1000) - 5 }), settings, now), '');
  assert.equal(emailFromIdToken('garbage', settings, now), '');
});

test('the login address asks Google only for the email, and names the callback and the state', () => {
  const url = new URL(loginAddress({ url: 'https://invitestudio.co/api/admin/login' }, settings, 'STATE1'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), 'openid email');
  assert.equal(url.searchParams.get('state'), 'STATE1');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://invitestudio.co/api/admin/callback');
  assert.equal(cookieName('https://invitestudio.co/', 'is_admin'), '__Host-is_admin');
  assert.equal(cookieName('http://127.0.0.1:8788/', 'is_admin'), 'is_admin');
});

test('when something is missing the page is told which settings (names only, never values)', () => {
  assert.deepEqual(adminMissing(env), []);
  assert.deepEqual(adminMissing({}), ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ADMIN_EMAILS', 'ADMIN_SESSION_SECRET']);
  assert.deepEqual(adminMissing({ ...env, ADMIN_SESSION_SECRET: 'too short secret' }), ['ADMIN_SESSION_SECRET (needs 32 or more characters)']);
  assert.deepEqual(adminMissing({ ...env, ADMIN_EMAILS: ' , ' }), ['ADMIN_EMAILS']);
  assert.throws(() => requireAdminSettings({ ...env, GOOGLE_CLIENT_SECRET: '' }), error => error.status === 503 && error.code === 'ADMIN_NOT_CONFIGURED' && JSON.stringify(error.fields) === '{"missing":["GOOGLE_CLIENT_SECRET"]}');
});
