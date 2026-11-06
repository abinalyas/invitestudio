// C1 unit tests: the mapping from publish_wedding_slug refusals to API responses, and the historical-address
// redirect's response shape. Pure functions and a stub fetch. No network, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, publishErrorFrom, SLUG_CHANGE_LIMIT } from '../../functions/_shared/api.js';
import { SECURITY_HEADERS } from '../../functions/_shared/security.js';
import { onRequest as slugRoute } from '../../functions/s/[slug].js';

const ENV = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key-test', ALLOWED_ORIGIN: 'https://app.example.test' };
const realFetch = globalThis.fetch;
if (typeof globalThis.HTMLRewriter === 'undefined') {
  globalThis.HTMLRewriter = class { on() { return this; } transform(response) { return response; } };
}

// A database failure as rpc() reports it: 502 DATABASE_ERROR with the PostgREST message and SQLSTATE.
function dbError(message, databaseCode) {
  const error = new ApiError('Database operation failed.', 502, 'DATABASE_ERROR');
  error.databaseMessage = message;
  if (databaseCode !== undefined) error.databaseCode = databaseCode;
  return error;
}

// ---------------------------------------------------------------- error mapping (publishErrorFrom)
test('PUBLISH_CONFLICT (stale version, lost race, deadlock victim) maps to 409 PUBLISH_CONFLICT', () => {
  const mapped = publishErrorFrom(dbError('PUBLISH_CONFLICT', 'P0001'));
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, 'PUBLISH_CONFLICT');
});

test('SLUG_CONFLICT raised by the RPC maps to 409 SLUG_CONFLICT with a slug field', () => {
  const mapped = publishErrorFrom(dbError('SLUG_CONFLICT', 'P0001'));
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, 'SLUG_CONFLICT');
  assert.deepEqual(mapped.fields, { slug: 'Choose another slug.' });
});

test('a 23505 from the transition trigger (ownership refusal) maps to 409 SLUG_CONFLICT even without the message', () => {
  const mapped = publishErrorFrom(dbError('SLUG_CONFLICT: this address is reserved to another wedding', '23505'));
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, 'SLUG_CONFLICT');
  const bare = publishErrorFrom(dbError('duplicate key value violates unique constraint', '23505'));
  assert.equal(bare.code, 'SLUG_CONFLICT');
});

test('VALIDATION_ERROR maps to 422 VALIDATION_ERROR with a slug field', () => {
  const mapped = publishErrorFrom(dbError('VALIDATION_ERROR', 'P0001'));
  assert.equal(mapped.status, 422);
  assert.equal(mapped.code, 'VALIDATION_ERROR');
  assert.ok(mapped.fields.slug);
});

test('SLUG_CHANGE_CONFIRMATION_REQUIRED maps to 409 with the confirmation message', () => {
  const mapped = publishErrorFrom(dbError('SLUG_CHANGE_CONFIRMATION_REQUIRED', 'P0001'));
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, 'SLUG_CHANGE_CONFIRMATION_REQUIRED');
});

test('SLUG_CHANGE_LIMIT_REACHED maps to 422 and names the configured limit', () => {
  const mapped = publishErrorFrom(dbError('SLUG_CHANGE_LIMIT_REACHED', 'P0001'));
  assert.equal(mapped.status, 422);
  assert.equal(mapped.code, 'SLUG_CHANGE_LIMIT_REACHED');
  assert.ok(mapped.message.includes(String(SLUG_CHANGE_LIMIT)));
});

test('an insufficient-privilege refusal (42501) is NOT mapped to success or to a 4xx: it stays 502 DATABASE_ERROR', () => {
  const error = dbError('permission denied for table weddings', '42501');
  const mapped = publishErrorFrom(error);
  assert.equal(mapped, error);
  assert.equal(mapped.status, 502);
  assert.equal(mapped.code, 'DATABASE_ERROR');
});

test('an unknown database message stays 502 DATABASE_ERROR and is not mistaken for a conflict', () => {
  const error = dbError('something unexpected happened', 'XX000');
  const mapped = publishErrorFrom(error);
  assert.equal(mapped.status, 502);
  assert.equal(mapped.code, 'DATABASE_ERROR');
});

test('a non-database error passes through unchanged', () => {
  const error = new ApiError('An edit token is required.', 401, 'EDIT_TOKEN_REQUIRED');
  assert.equal(publishErrorFrom(error), error);
  const plain = new Error('boom');
  assert.equal(publishErrorFrom(plain), plain);
});

// ---------------------------------------------------------------- historical-address redirect: response shape
function stubFetch({ summaryRows = [], resolveRows = [], resolveStatus = 200 }) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push({ path: url.pathname, method: (init.method || 'GET').toUpperCase(), query: url.search });
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/rest/v1/rpc/resolve_public_slug') return json(resolveStatus, resolveRows);
    if (url.pathname === '/rest/v1/weddings') return json(200, summaryRows);
    return json(404, { message: 'unexpected' });
  };
  return calls;
}

function shellAsset(calls) {
  return { fetch: async () => { calls.push({ path: '/index.html', asset: true }); return new Response('<html><head><title>x</title></head></html>', { headers: { 'Content-Type': 'text/html' } }); } };
}

function request(slug) {
  return { request: new Request(`https://app.example.test/s/${slug}`), env: ENV, params: { slug } };
}

test('a historical address returns 302 with Location, no-cache, the security headers, an empty body, and no shell', async () => {
  const calls = stubFetch({ resolveRows: [{ kind: 'redirect', target_slug: 'alpha-two', title: null, event_date: null, location: null }] });
  try {
    const response = await slugRoute({ ...request('alpha'), env: { ...ENV, ASSETS: shellAsset(calls) } });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), '/s/alpha-two');
    assert.equal(response.headers.get('Cache-Control'), 'no-cache');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers.get(name), value, name);
    assert.equal(await response.text(), '');
    assert.equal(calls.some(c => c.asset), false, 'the application shell must not be fetched for a redirect');
  } finally { globalThis.fetch = realFetch; }
});

test('a live address is served as the page (200), never redirected, and resolve_public_slug is not consulted', async () => {
  const calls = stubFetch({ summaryRows: [{ title: 'Alpha', event_date: '2027-06-01', location: 'Lisbon' }] });
  try {
    const response = await slugRoute({ ...request('alpha'), env: { ...ENV, ASSETS: shellAsset(calls) } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(calls.some(c => c.path === '/rest/v1/rpc/resolve_public_slug'), false);
  } finally { globalThis.fetch = realFetch; }
});

test('a redirect whose target is not a valid slug is ignored: the shell is served as not available (404)', async () => {
  const calls = stubFetch({ resolveRows: [{ kind: 'redirect', target_slug: '../evil', title: null, event_date: null, location: null }] });
  try {
    const response = await slugRoute({ ...request('alpha'), env: { ...ENV, ASSETS: shellAsset(calls) } });
    assert.notEqual(response.status, 302);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(response.status, 404);
  } finally { globalThis.fetch = realFetch; }
});

test('a failing resolve_public_slug never breaks the page: the shell is served as not available (404), not a 500', async () => {
  const calls = stubFetch({ resolveStatus: 500, resolveRows: { message: 'boom' } });
  try {
    const response = await slugRoute({ ...request('alpha'), env: { ...ENV, ASSETS: shellAsset(calls) } });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Location'), null);
  } finally { globalThis.fetch = realFetch; }
});
