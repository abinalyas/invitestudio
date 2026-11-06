// C1 unit tests: the publish path, error mapping, availability, and the historical-address redirect.
// A fake Supabase records every request. No network, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashEditToken } from '../../functions/_shared/api.js';
import { onRequest as publish } from '../../functions/api/weddings/[id]/publish.js';
import { onRequest as availability } from '../../functions/api/weddings/[id]/slug-availability.js';
import { onRequest as slugRoute } from '../../functions/s/[slug].js';

const ENV = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key-test', ALLOWED_ORIGIN: 'https://app.example.test' };
const WID = '5f0c5a7e-1c4b-4e0a-9c3d-2b1a0f9e8d7c';
const OTHER_WID = '0a0b0c0d-1111-4222-8333-444455556666';
const TOKEN = 'T'.repeat(43);
const realFetch = globalThis.fetch;
// Cloudflare's HTMLRewriter is not in Node. The shell route only transforms the HTML; this test-only stub passes
// the shell through unchanged so the fallback path (no redirect, shell served) can run here.
if (typeof globalThis.HTMLRewriter === 'undefined') {
  globalThis.HTMLRewriter = class { on() { return this; } transform(response) { return response; } };
}

function world(overrides = {}) {
  return {
    wedding: { id: WID, owner_id: null, ownership_mode: 'anonymous', slug: 'alpha', status: 'published', visibility: 'public',
      template_id: 'eternal', title: 'Alpha wedding', version: 3, slug_change_count: 0, published_at: '2026-01-01T00:00:00Z' },
    tokenWeddingId: WID,
    liveSlugs: {},            // slug -> wedding id that is live on it
    reservations: {},         // slug -> wedding id (or null) reserved
    rpc: { status: 200, body: { id: WID, slug: 'alpha-two', status: 'published', visibility: 'public', version: 4 } },
    resolve: [],
    calls: [],                // every request, method + path + body
    ...overrides
  };
}

function install(state) {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ method, path: url.pathname, query: url.search, body });
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/rest/v1/edit_tokens' && method === 'GET') {
      const hash = url.searchParams.get('token_hash');
      const wid = url.searchParams.get('wedding_id');
      const match = hash === `eq.${state.tokenHash}` && (!wid || wid === `eq.${state.tokenWeddingId}`);
      return json(200, match ? [{ id: 1, wedding_id: state.tokenWeddingId, purpose: 'edit', expires_at: '2099-01-01T00:00:00Z', revoked_at: null }] : []);
    }
    if (url.pathname === '/rest/v1/edit_tokens' && method === 'PATCH') return json(200, []);
    if (url.pathname === '/rest/v1/weddings' && method === 'GET') {
      if (url.searchParams.get('select') === '*') return json(200, [state.wedding]);
      const slug = (url.searchParams.get('slug') || '').replace('eq.', '');
      const owner = state.liveSlugs[slug];
      const excluded = (url.searchParams.get('id') || '').replace('neq.', '');
      return json(200, owner && owner !== excluded ? [{ id: owner }] : []);
    }
    if (url.pathname === '/rest/v1/slug_reservations' && method === 'GET') {
      const slug = (url.searchParams.get('slug') || '').replace('eq.', '');
      return json(200, slug in state.reservations ? [{ wedding_id: state.reservations[slug] }] : []);
    }
    if (url.pathname === '/rest/v1/rpc/publish_wedding_slug' && method === 'POST') return json(state.rpc.status, state.rpc.body);
    if (url.pathname === '/rest/v1/rpc/resolve_public_slug' && method === 'POST') return json(200, state.resolve);
    if (url.pathname === '/rest/v1/weddings' && method === 'PATCH') return json(200, [{ id: WID }]);
    return json(404, { code: 'PGRST125', message: 'unexpected request in test' });
  };
}

function restore() { globalThis.fetch = realFetch; }

function publishRequest(body, token = TOKEN, id = WID) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request(`https://app.example.test/api/weddings/${id}/publish`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function runPublish(state, body, opts = {}) {
  state.tokenHash = await hashEditToken(TOKEN);
  install(state);
  try {
    const response = await publish({ request: publishRequest(body, opts.token === undefined ? TOKEN : opts.token, opts.id || WID), env: ENV, params: { id: opts.id || WID } });
    return { status: response.status, body: await response.json(), state };
  } finally {
    restore();
  }
}

const rpcCalls = state => state.calls.filter(c => c.path === '/rest/v1/rpc/publish_wedding_slug');
const weddingPatches = state => state.calls.filter(c => c.method === 'PATCH' && c.path === '/rest/v1/weddings');

// ---------------------------------------------------------------- authorization: the token is checked first
test('missing edit token: 401 EDIT_TOKEN_REQUIRED, RPC never invoked, no direct write', async () => {
  const state = world();
  const r = await runPublish(state, { version: 3, slug: 'alpha-two' }, { token: null });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'EDIT_TOKEN_REQUIRED');
  assert.equal(rpcCalls(state).length, 0);
  assert.equal(weddingPatches(state).length, 0);
});

test('invalid edit token: 403 EDIT_TOKEN_INVALID, RPC never invoked', async () => {
  const state = world();
  const r = await runPublish(state, { version: 3, slug: 'alpha-two' }, { token: 'X'.repeat(43) });
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'EDIT_TOKEN_INVALID');
  assert.equal(rpcCalls(state).length, 0);
});

test('a valid token for ANOTHER wedding: 403, RPC never invoked', async () => {
  const state = world({ tokenWeddingId: OTHER_WID });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two' });
  assert.equal(r.status, 403);
  assert.equal(rpcCalls(state).length, 0);
});

// ---------------------------------------------------------------- success and the route id
test('success: RPC called with the ROUTE wedding id, version, slug and confirmation; response carries the wedding', async () => {
  const state = world();
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.publicUrl, '/s/alpha-two');
  assert.equal(r.body.wedding.slug, 'alpha-two');
  const [call] = rpcCalls(state);
  assert.deepEqual(call.body, { p_wedding_id: WID, p_version: 3, p_slug: 'alpha-two', p_confirm_slug_change: true });
  assert.equal(weddingPatches(state).length, 0, 'the slug is never PATCHed directly');
});

test('a wedding id in the request body is ignored: the RPC still receives the route id', async () => {
  const state = world();
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true, id: OTHER_WID, wedding_id: OTHER_WID });
  assert.equal(r.status, 200);
  assert.equal(rpcCalls(state)[0].body.p_wedding_id, WID);
});

test('a live wedding changing its address without confirmation: 409 SLUG_CHANGE_CONFIRMATION_REQUIRED, RPC not invoked', async () => {
  const state = world();
  const r = await runPublish(state, { version: 3, slug: 'alpha-two' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'SLUG_CHANGE_CONFIRMATION_REQUIRED');
  assert.equal(rpcCalls(state).length, 0);
});

test('first publish of a draft needs no confirmation', async () => {
  const state = world({ wedding: { ...world().wedding, status: 'draft', slug: null, visibility: 'private', version: 1 }, rpc: { status: 200, body: { id: WID, slug: 'first-one', status: 'published', visibility: 'public', version: 2 } } });
  const r = await runPublish(state, { version: 1, slug: 'first-one' });
  assert.equal(r.status, 200);
  assert.equal(rpcCalls(state)[0].body.p_confirm_slug_change, false);
});

// ---------------------------------------------------------------- preserved validation (no RPC on refusal)
test('template no longer available: 422 TEMPLATE_UNAVAILABLE, RPC not invoked', async () => {
  const state = world({ wedding: { ...world().wedding, template_id: 'not-a-launch-template' } });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'TEMPLATE_UNAVAILABLE');
  assert.equal(rpcCalls(state).length, 0);
});

test('empty title: 422 VALIDATION_ERROR, RPC not invoked', async () => {
  const state = world({ wedding: { ...world().wedding, title: '   ' } });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 422);
  assert.equal(rpcCalls(state).length, 0);
});

test('invalid slug format: 422 VALIDATION_ERROR, RPC not invoked', async () => {
  const state = world();
  const r = await runPublish(state, { version: 3, slug: 'Bad Slug!' });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'VALIDATION_ERROR');
  assert.equal(rpcCalls(state).length, 0);
});

test('reserved word: 422 VALIDATION_ERROR, RPC not invoked', async () => {
  const state = world();
  const r = await runPublish(state, { version: 3, slug: 'admin', confirmSlugChange: true });
  assert.equal(r.status, 422);
  assert.equal(rpcCalls(state).length, 0);
});

test('address live on another wedding: 409 SLUG_CONFLICT before the RPC', async () => {
  const state = world({ liveSlugs: { 'alpha-two': OTHER_WID } });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'SLUG_CONFLICT');
  assert.equal(rpcCalls(state).length, 0);
});

// ---------------------------------------------------------------- database refusals mapped to API responses
const refusal = (status, message, code, extra = {}) => ({ status: 400, body: { code, message, ...extra } });

test('RPC SLUG_CONFLICT (historical address of another wedding): 409 SLUG_CONFLICT', async () => {
  const state = world({ rpc: refusal(400, 'SLUG_CONFLICT', 'P0001') });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'SLUG_CONFLICT');
});

test('RPC 23505 from the transition trigger (ownership refusal): 409 SLUG_CONFLICT', async () => {
  const state = world({ rpc: refusal(400, 'SLUG_CONFLICT: this address is reserved to another wedding', '23505') });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'SLUG_CONFLICT');
});

test('version conflict (stale version or lost race): 409 PUBLISH_CONFLICT', async () => {
  const state = world({ rpc: refusal(400, 'PUBLISH_CONFLICT', 'P0001') });
  const r = await runPublish(state, { version: 2, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'PUBLISH_CONFLICT');
});

test('ten-change limit reached: 422 SLUG_CHANGE_LIMIT_REACHED', async () => {
  const state = world({ rpc: refusal(400, 'SLUG_CHANGE_LIMIT_REACHED', 'P0001') });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'SLUG_CHANGE_LIMIT_REACHED');
  assert.match(r.body.error.message, /10 web address changes/);
});

test('RPC VALIDATION_ERROR: 422', async () => {
  const state = world({ rpc: refusal(400, 'VALIDATION_ERROR', 'P0001') });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 422);
});

test('unexpected database failure: 502 DATABASE_ERROR, never a success', async () => {
  const state = world({ rpc: { status: 500, body: { code: 'XX000', message: 'boom' } } });
  const r = await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(r.status, 502);
  assert.equal(r.body.error.code, 'DATABASE_ERROR');
});

test('across every publish test above, the slug was never written directly', async () => {
  // Re-run one change and assert the complete recorded traffic has no PATCH of weddings.
  const state = world();
  await runPublish(state, { version: 3, slug: 'alpha-two', confirmSlugChange: true });
  assert.equal(state.calls.filter(c => c.method === 'PATCH' && c.path === '/rest/v1/weddings').length, 0);
});

// ---------------------------------------------------------------- availability: historical and change allowance
async function runAvailability(state, slug) {
  state.tokenHash = await hashEditToken(TOKEN);
  install(state);
  try {
    const req = new Request(`https://app.example.test/api/weddings/${WID}/slug-availability?slug=${slug}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const res = await availability({ request: req, env: ENV, params: { id: WID } });
    return { status: res.status, body: await res.json() };
  } finally { restore(); }
}

test('availability: an address reserved to ANOTHER wedding is unavailable and marked retired', async () => {
  const r = await runAvailability(world({ reservations: { 'old-name': OTHER_WID } }), 'old-name');
  assert.equal(r.body.available, false);
  assert.equal(r.body.reason, 'retired');
  assert.equal(r.body.retired, true);
});

test('availability: an address reserved to NOBODY (deleted wedding) is unavailable and retired', async () => {
  const r = await runAvailability(world({ reservations: { 'gone-name': null } }), 'gone-name');
  assert.equal(r.body.available, false);
  assert.equal(r.body.retired, true);
});

test('availability: this wedding\'s own historical address is available to it again', async () => {
  const r = await runAvailability(world({ reservations: { 'alpha': WID } }), 'alpha');
  assert.equal(r.body.available, true);
});

test('availability: a live address on another wedding is taken (not retired)', async () => {
  const r = await runAvailability(world({ liveSlugs: { 'taken-name': OTHER_WID } }), 'taken-name');
  assert.equal(r.body.reason, 'taken');
  assert.equal(r.body.retired, false);
});

test('availability reports the change allowance: used, max and remaining', async () => {
  const r = await runAvailability(world({ wedding: { ...world().wedding, slug_change_count: 10 } }), 'fresh-name');
  assert.deepEqual(r.body.change_limit, { used: 10, max: 10, remaining: 0 });
});

// ---------------------------------------------------------------- /s/ historical address: 302
test('historical address redirects with 302 to the current address', async () => {
  const state = world({ resolve: [{ kind: 'redirect', target_slug: 'alpha-two', title: null, event_date: null, location: null }] });
  install(state);
  try {
    const res = await slugRoute({ request: new Request('https://app.example.test/s/alpha'), env: { ...ENV, ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) } }, params: { slug: 'alpha' } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('Location'), '/s/alpha-two');
    assert.equal(state.calls.find(c => c.path === '/rest/v1/rpc/resolve_public_slug').body.p_slug, 'alpha');
  } finally { restore(); }
});

test('an unknown address is not redirected: the application shell is served', async () => {
  const state = world({ resolve: [] });
  install(state);
  try {
    const res = await slugRoute({ request: new Request('https://app.example.test/s/nothing-here'), env: { ...ENV, ASSETS: { fetch: async () => new Response('<html>shell</html>', { headers: { 'Content-Type': 'text/html' } }) } }, params: { slug: 'nothing-here' } });
    assert.notEqual(res.status, 302);
    assert.equal(res.status, 404);
  } finally { restore(); }
});
