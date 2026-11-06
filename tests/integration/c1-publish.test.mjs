// C1 integration tests: the real publish, availability and /s/ handlers against a real PostgreSQL database,
// through the PostgREST-compatible shim (tests/cloud/rest-shim.mjs), which calls publish_wedding_slug and
// resolve_public_slug over RPC. The database's triggers and reservations are therefore exercised for real.
//
// REQUIRES a DISPOSABLE database, given as INVITESTUDIO_TEST_PG_URL, that has the repository schema and the
// M1 transition-capture migration (21_m1_v8_nonsuper.sql) applied. Never point this at a production project.
// Without the variable the tests are skipped.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { startRestShim } from '../cloud/rest-shim.mjs';
import { onRequest as publish } from '../../functions/api/weddings/[id]/publish.js';
import { onRequest as availability } from '../../functions/api/weddings/[id]/slug-availability.js';
import { onRequest as slugRoute } from '../../functions/s/[slug].js';

const PG_URL = process.env.INVITESTUDIO_TEST_PG_URL;
const SKIP = PG_URL ? false : 'set INVITESTUDIO_TEST_PG_URL to a DISPOSABLE database with M1 v8 applied';
const RUN = `c1${randomBytes(3).toString('hex')}`;   // unique slug prefix per run
let pool, shim, env;

function tokenHash(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function newWedding(slug, { status = 'published', version = 1, changeCount = 0 } = {}) {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `insert into public.weddings (id, template_id, title, status, visibility, version, slug, slug_change_count, published_at)
     values ($1, 'eternal', 'Integration', $2, $3, $4, $5, $6, case when $2 = 'published' then now() end)`,
    [id, status, status === 'published' ? 'public' : 'private', version, slug, changeCount]);
  await pool.query(
    `insert into public.edit_tokens (wedding_id, token_hash, purpose, expires_at, metadata)
     values ($1, $2, 'edit', now() + interval '1 day', '{}'::jsonb)`, [id, tokenHash(token)]);
  return { id, token };
}

async function row(id) {
  const { rows } = await pool.query('select slug, status, visibility, version, slug_change_count from public.weddings where id = $1', [id]);
  return rows[0];
}

async function reservations(slugs) {
  const { rows } = await pool.query('select slug, wedding_id from public.slug_reservations where slug = any($1::text[]) order by slug', [slugs]);
  return Object.fromEntries(rows.map(r => [r.slug, r.wedding_id]));
}

async function post(weddingId, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request(`https://app.example.test/api/weddings/${weddingId}/publish`, { method: 'POST', headers, body: JSON.stringify(body) });
  const response = await publish({ request, env, params: { id: weddingId } });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  if (SKIP) return;
  pool = new pg.Pool({ connectionString: PG_URL, max: 4 });
  shim = await startRestShim({ url: PG_URL, port: 0 });
  const address = shim.server.address();
  env = { SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_SERVICE_ROLE_KEY: 'integration-test-key', ALLOWED_ORIGIN: 'https://app.example.test' };
});

after(async () => {
  if (SKIP) return;
  await shim?.close();
  await pool?.end();
});

test('publish through the RPC: success, the route id is used, and the slug is reserved', { skip: SKIP }, async () => {
  const a = `${RUN}-a`;
  const w = await newWedding(a, { status: 'draft', version: 1, changeCount: 0 });
  // Draft to published under a first address: no confirmation is needed.
  const r = await post(w.id, { version: 1, slug: a }, w.token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.publicUrl, `/s/${a}`);
  assert.equal((await row(w.id)).slug, a);
  assert.equal((await reservations([a]))[a], w.id);
});

test('A -> B -> C keeps A and B reserved to the same wedding', { skip: SKIP }, async () => {
  const [a, b, c] = [`${RUN}-chain-a`, `${RUN}-chain-b`, `${RUN}-chain-c`];
  const w = await newWedding(a, { status: 'published', version: 1, changeCount: 0 });
  const first = await post(w.id, { version: 1, slug: b, confirmSlugChange: true }, w.token);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const second = await post(w.id, { version: (await row(w.id)).version, slug: c, confirmSlugChange: true }, w.token);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  const res = await reservations([a, b, c]);
  assert.deepEqual(res, { [a]: w.id, [b]: w.id, [c]: w.id });
  assert.equal((await row(w.id)).slug_change_count, 2);
});

test('another wedding cannot take a historical address: 409 SLUG_CONFLICT, database unchanged', { skip: SKIP }, async () => {
  const a = `${RUN}-hist`;
  const owner = await newWedding(a, { status: 'published', version: 1 });
  await post(owner.id, { version: 1, slug: `${RUN}-hist-now`, confirmSlugChange: true }, owner.token);
  const other = await newWedding(null, { status: 'draft', version: 1 });
  const r = await post(other.id, { version: 1, slug: a }, other.token);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'SLUG_CONFLICT');
  assert.equal((await row(other.id)).slug, null);
  assert.equal((await reservations([a]))[a], owner.id);
});

test('a stale version is refused: 409 PUBLISH_CONFLICT, database unchanged', { skip: SKIP }, async () => {
  const w = await newWedding(`${RUN}-ver`, { status: 'published', version: 4 });
  const before = await row(w.id);
  const r = await post(w.id, { version: 1, slug: `${RUN}-ver-x`, confirmSlugChange: true }, w.token);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'PUBLISH_CONFLICT');
  assert.equal((await row(w.id)).slug, before.slug);
});

test('the ten-change limit: 422 SLUG_CHANGE_LIMIT_REACHED, database unchanged', { skip: SKIP }, async () => {
  const w = await newWedding(`${RUN}-lim`, { status: 'published', version: 1, changeCount: 10 });
  const r = await post(w.id, { version: 1, slug: `${RUN}-lim-next`, confirmSlugChange: true }, w.token);
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'SLUG_CHANGE_LIMIT_REACHED');
  assert.equal((await row(w.id)).slug, `${RUN}-lim`);
});

test('a missing token is 401 and an invalid token is 403, and neither changes the database', { skip: SKIP }, async () => {
  const w = await newWedding(`${RUN}-auth`, { status: 'published', version: 1 });
  const none = await post(w.id, { version: 1, slug: `${RUN}-auth-x`, confirmSlugChange: true }, null);
  assert.equal(none.status, 401);
  assert.equal(none.body.error.code, 'EDIT_TOKEN_REQUIRED');
  const bad = await post(w.id, { version: 1, slug: `${RUN}-auth-x`, confirmSlugChange: true }, 'x'.repeat(43));
  assert.equal(bad.status, 403);
  assert.equal(bad.body.error.code, 'EDIT_TOKEN_INVALID');
  assert.equal((await row(w.id)).slug, `${RUN}-auth`);
});

test('a historical address redirects with 302 to the current address (route /s/)', { skip: SKIP }, async () => {
  const [old, current] = [`${RUN}-rd-old`, `${RUN}-rd-new`];
  const w = await newWedding(old, { status: 'published', version: 1 });
  const moved = await post(w.id, { version: 1, slug: current, confirmSlugChange: true }, w.token);
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const response = await slugRoute({
    request: new Request(`https://app.example.test/s/${old}`),
    env: { ...env, ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) } },
    params: { slug: old }
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), `/s/${current}`);
});

test('availability: a historical address of another wedding is retired; the owner may reuse its own', { skip: SKIP }, async () => {
  const old = `${RUN}-av-old`;
  const owner = await newWedding(old, { status: 'published', version: 1 });
  await post(owner.id, { version: 1, slug: `${RUN}-av-new`, confirmSlugChange: true }, owner.token);
  const other = await newWedding(null, { status: 'draft', version: 1 });
  const check = async (w, slug) => {
    const request = new Request(`https://app.example.test/api/weddings/${w.id}/slug-availability?slug=${slug}`, { headers: { Authorization: `Bearer ${w.token}` } });
    const response = await availability({ request, env, params: { id: w.id } });
    return { status: response.status, body: await response.json() };
  };
  const forOther = await check(other, old);
  assert.equal(forOther.body.available, false);
  assert.equal(forOther.body.retired, true);
  const forOwner = await check(owner, old);
  assert.equal(forOwner.body.available, true);
  assert.equal(forOwner.body.change_limit.max, 10);
});
