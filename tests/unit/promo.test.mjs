// Promo codes: the redeem route and the admin route that makes them. A fake Supabase records every request; no network, no database.
// (The redemption rules themselves run for real in PostgreSQL: tests/db/promo.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashEditToken } from '../../functions/_shared/api.js';
import { cookieName, signSession } from '../../functions/_shared/admin.js';
import { generateCode, normalizeCode } from '../../functions/_shared/promo.js';
import { onRequest as promo } from '../../functions/api/weddings/[id]/promo.js';
import { onRequest as adminCodes } from '../../functions/api/admin/promo-codes.js';

const WID = '5f0c5a7e-1c4b-4e0a-9c3d-2b1a0f9e8d7c';
const TOKEN = 'T'.repeat(43);
const LIVE = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key-test', ALLOWED_ORIGIN: 'https://app.example.test', PAYMENTS_MODE: 'live' };
const ADMIN_ENV = { ...LIVE, ADMIN_SESSION_SECRET: 'x'.repeat(40), ADMIN_EMAILS: 'owner@example.com', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' };
const realFetch = globalThis.fetch;
const realError = console.error;

function install(state) {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ method, path: url.pathname, query: url.search, body });
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/rest/v1/edit_tokens' && method === 'GET') {
      const ok = url.searchParams.get('token_hash') === `eq.${state.tokenHash}` && url.searchParams.get('wedding_id') === `eq.${state.tokenWeddingId}`;
      return json(200, ok ? [{ id: 1, wedding_id: state.tokenWeddingId, purpose: 'edit', expires_at: '2099-01-01T00:00:00Z', revoked_at: null }] : []);
    }
    if (url.pathname === '/rest/v1/edit_tokens' && method === 'PATCH') return json(200, []);
    if (url.pathname === '/rest/v1/weddings' && method === 'GET') return json(200, [state.wedding]);
    if (url.pathname === '/rest/v1/rpc/redeem_promo_code' && method === 'POST') {
      state.wedding.version += 1;
      return json(200, { status: state.status });
    }
    if (url.pathname === '/rest/v1/promo_codes' && method === 'GET') return json(200, state.codes);
    if (url.pathname === '/rest/v1/promo_codes' && method === 'POST') { const row = { used_count: 0, active: true, created_at: '2026-11-20T00:00:00Z', ...body }; state.codes.push(row); return json(201, [row]); }
    if (url.pathname === '/rest/v1/promo_codes' && method === 'PATCH') {
      const code = (url.searchParams.get('code') || '').replace('eq.', '');
      const row = state.codes.find(item => item.code === code);
      if (row) Object.assign(row, body);
      return json(200, row ? [row] : []);
    }
    return json(404, { code: 'PGRST125', message: `unexpected request in test: ${method} ${url.pathname}` });
  };
}

async function run(handler, { env = LIVE, method = 'POST', path, body, params, token = TOKEN, headers = {}, status = 'unlocked', tokenWeddingId = WID, codes = [] } = {}) {
  const state = { calls: [], status, codes, tokenWeddingId, tokenHash: await hashEditToken(TOKEN), wedding: { id: WID, version: 3, publish_unlocked_at: null } };
  install(state);
  console.error = () => {};
  try {
    const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (token !== null) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const response = await handler({ request: new Request(`https://app.example.test${path}`, init), env, params });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, body: data, calls: state.calls, state };
  } finally { globalThis.fetch = realFetch; console.error = realError; }
}
const redeem = (code, options = {}) => run(promo, { path: `/api/weddings/${WID}/promo`, params: { id: WID }, body: { code }, ...options });
const spent = result => result.calls.filter(call => call.path === '/rest/v1/rpc/redeem_promo_code');

test('a good code unlocks the website, is sent to the database tidied up, and the new version comes back', async () => {
  const result = await redeem('  is-abcd efgh-2345 ');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.unlocked, true);
  assert.equal(result.body.already, false);
  assert.equal(result.body.version, 4, 'the version after the unlock, so Make it live is not refused');
  assert.equal(spent(result).length, 1);
  assert.deepEqual(spent(result)[0].body, { p_wedding_id: WID, p_code: 'IS-ABCD-EFGH-2345' });
});

test('a website that was already unlocked is told so, and nothing is spent', async () => {
  const result = await redeem('IS-ABCD-EFGH-2345', { status: 'already' });
  assert.equal(result.status, 200);
  assert.equal(result.body.already, true);
});

test('each way a code can fail has its own answer', async () => {
  for (const [status, http, code] of [['invalid', 422, 'PROMO_INVALID'], ['expired', 422, 'PROMO_EXPIRED'], ['used_up', 422, 'PROMO_USED_UP'], ['too_many', 429, 'PROMO_TOO_MANY'], ['something-new', 422, 'PROMO_INVALID']]) {
    const result = await redeem('IS-ABCD-EFGH-2345', { status });
    assert.equal(result.status, http, status);
    assert.equal(result.body.error.code, code, status);
  }
});

test('a code of the wrong shape never reaches the database', async () => {
  for (const code of ['', 'short', '!!!', 'x'.repeat(60), null, 12345678, { a: 1 }]) {
    const result = await redeem(code);
    assert.equal(result.status, 422, String(code));
    assert.equal(result.body.error.code, 'PROMO_INVALID');
    assert.equal(spent(result).length, 0);
  }
});

test('while payments are not open nothing is spent: publishing is free anyway', async () => {
  const { PAYMENTS_MODE, ...early } = LIVE;
  const result = await redeem('IS-ABCD-EFGH-2345', { env: early });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'PAYMENTS_NOT_LIVE');
  assert.equal(spent(result).length, 0);
});

test('only the owner of that website can use a code on it', async () => {
  const none = await redeem('IS-ABCD-EFGH-2345', { token: null });
  assert.ok([401, 403].includes(none.status), String(none.status));
  const wrong = await redeem('IS-ABCD-EFGH-2345', { token: 'W'.repeat(43) });
  assert.ok([401, 403].includes(wrong.status), String(wrong.status));
  const other = await redeem('IS-ABCD-EFGH-2345', { tokenWeddingId: '0a0b0c0d-1111-4222-8333-444455556666' });
  assert.ok([401, 403].includes(other.status), String(other.status));
  for (const result of [none, wrong, other]) assert.equal(spent(result).length, 0);
  const get = await run(promo, { method: 'GET', path: `/api/weddings/${WID}/promo`, params: { id: WID } });
  assert.equal(get.status, 405);
});

test('codes are long, random, unambiguous and read back whatever case or spacing they are typed in', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const code = generateCode();
    assert.match(code, /^IS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(normalizeCode(code), code);
    seen.add(code);
  }
  assert.equal(seen.size, 500, 'no repeats');
  assert.equal(normalizeCode('is abcd--efgh 2345'), 'IS-ABCD-EFGH-2345');
  assert.equal(normalizeCode('abc'), '');
});

async function adminRun(options = {}) {
  const cookie = `${cookieName('https://app.example.test/', 'is_admin')}=${await signSession(ADMIN_ENV.ADMIN_SESSION_SECRET, 'owner@example.com')}`;
  return run(adminCodes, { env: ADMIN_ENV, path: '/api/admin/promo-codes', token: null, ...options, headers: { Cookie: cookie, Origin: 'https://app.example.test', ...options.headers } });
}

test('the admin list and the admin changes need the owner to be signed in', async () => {
  for (const method of ['GET', 'POST']) {
    const result = await run(adminCodes, { env: ADMIN_ENV, method, path: '/api/admin/promo-codes', token: null, body: method === 'POST' ? {} : undefined });
    assert.equal(result.status, 401, method);
    assert.equal(result.calls.filter(call => call.path === '/rest/v1/promo_codes').length, 0);
  }
});

test('the owner can make a code (random, limited, with an end date), list it and switch it off', async () => {
  const made = await adminRun({ body: { note: '  tester   Priya ', maxUses: 3, days: 7 } });
  assert.equal(made.status, 201);
  assert.match(made.body.code.code, /^IS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(made.body.code.note, 'tester Priya');
  assert.equal(made.body.code.max_uses, 3);
  const days = (new Date(made.body.code.expires_at) - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days < 7.1, String(days));
  const plain = await adminRun({ body: {} });
  assert.equal(plain.body.code.max_uses, 1);
  assert.equal(plain.body.code.expires_at, null);

  const row = { code: made.body.code.code, note: '', max_uses: 3, used_count: 0, expires_at: null, active: true };
  const listed = await adminRun({ method: 'GET', codes: [row] });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.codes.map(item => item.code), [row.code]);
  const off = await adminRun({ body: { code: row.code, active: false }, codes: [row] });
  assert.equal(off.status, 200);
  assert.equal(off.body.code.active, false);
});

test('the admin refuses odd limits, a foreign origin and codes it does not have', async () => {
  for (const body of [{ maxUses: 0 }, { maxUses: 10001 }, { maxUses: 1.5 }, { days: 0 }, { days: 400 }]) {
    const result = await adminRun({ body });
    assert.equal(result.status, 422, JSON.stringify(body));
  }
  const foreign = await adminRun({ body: {}, headers: { Origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  const missing = await adminRun({ body: { code: 'IS-ABCD-EFGH-2345', active: false } });
  assert.equal(missing.status, 404);
});
