// What the editor is told about when a website ends, and what a guest is told when it has ended.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashEditToken } from '../../functions/_shared/api.js';
import { onRequest as retention } from '../../functions/api/weddings/[id]/retention.js';
import { onRequest as publicWedding } from '../../functions/api/public-weddings/[slug].js';

const WID = '11111111-1111-4111-8111-111111111111';
const EDIT = 'e'.repeat(43);
const answer = { hasClock: true, endsOn: '2027-08-15', deleteOn: '2027-08-29', stage: 'keep', daysLeft: 10, graceDays: 14, warnDays: 14, source: 'event', lastEventDate: '2027-06-15', endsBeforeEvent: false, closed: false };

async function world({ rpcFails = false, hidden = false, hiddenColumnMissing = false } = {}) {
  const editHash = await hashEditToken(EDIT);
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), method = init.method || 'GET';
    calls.push({ method, path, query: u.search });
    const ok = data => new Response(JSON.stringify(data), { status: 200 });
    if (path === 'edit_tokens') return method === 'PATCH' ? ok(null) : ok(u.searchParams.get('token_hash') === `eq.${editHash}` ? [{ id: 't', wedding_id: WID, expires_at: '2999-01-01T00:00:00Z' }] : []);
    if (path === 'rpc/wedding_retention_shown') return rpcFails ? new Response(JSON.stringify({ code: '42883', message: 'function does not exist' }), { status: 404 }) : ok(JSON.parse(init.body).p_wedding_id === WID ? answer : null);
    if (path === 'weddings' && u.searchParams.get('status') === 'eq.published') return ok([]);
    if (path === 'weddings' && u.searchParams.get('retention_hidden_at')) {
      if (hiddenColumnMissing) return new Response(JSON.stringify({ code: '42703', message: 'column does not exist' }), { status: 400 });
      return ok(hidden ? [{ id: WID }] : []);
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const get = (handler, params, headers = {}, method = 'GET') => handler({ env, params, request: new Request('https://x.test/api', { method, headers }) });
const parse = async res => ({ status: res.status, body: await res.json() });
const AUTH = { Authorization: `Bearer ${EDIT}` };

test('the retention answer needs the edit token and says when the website is kept until', async () => {
  const w = await world();
  try {
    assert.equal((await get(retention, { id: WID })).status, 401);
    assert.equal((await get(retention, { id: WID }, { Authorization: `Bearer ${'f'.repeat(43)}` })).status, 403);
    assert.equal((await get(retention, { id: WID }, AUTH, 'POST')).status, 405);
    const ok = await parse(await get(retention, { id: WID }, AUTH));
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.available, ok.body.endsOn, ok.body.deleteOn, ok.body.stage, ok.body.daysLeft], [true, '2027-08-15', '2027-08-29', 'keep', 10]);
    assert.equal(w.calls.filter(c => c.path === 'rpc/wedding_retention_shown').length, 1);
  } finally { w.restore(); }
});

test('before the retention migration is run, the editor is told nothing is available (no error)', async () => {
  const w = await world({ rpcFails: true });
  try {
    const res = await parse(await get(retention, { id: WID }, AUTH));
    assert.deepEqual([res.status, res.body.available], [200, false]);
  } finally { w.restore(); }
});

test('guests are told when an invitation has ended, and plain "not found" for any other address', async () => {
  const ended = await world({ hidden: true });
  try {
    const res = await parse(await get(publicWedding, { slug: 'asha-ravi' }));
    assert.deepEqual([res.status, res.body.error.code], [410, 'ENDED']);
    assert.equal(JSON.stringify(res.body).includes(WID), false, 'no id, name or date in the answer');
  } finally { ended.restore(); }
  const missing = await world({ hidden: false });
  try {
    const res = await parse(await get(publicWedding, { slug: 'nobody-here' }));
    assert.deepEqual([res.status, res.body.error.code], [404, 'NOT_FOUND']);
  } finally { missing.restore(); }
  const early = await world({ hiddenColumnMissing: true });
  try {
    const res = await parse(await get(publicWedding, { slug: 'asha-ravi' }));
    assert.deepEqual([res.status, res.body.error.code], [404, 'NOT_FOUND'], 'before the migration it stays "not found"');
  } finally { early.restore(); }
});
