// The only address that deletes a website: who may call it, and every guard that has to agree before a draft goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest, CONFIRMATION } from '../../functions/api/internal/retention-delete-drafts.js';

const TOKEN = 't'.repeat(40);
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// A fake database (the calls it receives are recorded in order) and a fake photo bucket that shares the same order.
function world({ plan = {}, deleteResults = {}, deleteFails = [], mediaFails = [] } = {}) {
  const events = [];
  const real = globalThis.fetch;
  const basePlan = { asOf: '2027-03-01', enabled: true, batchLimit: 20, brakeLimit: 10, eligible: 2, ids: [A, B] };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const name = u.pathname.replace('/rest/v1/', '');
    const body = init.body ? JSON.parse(init.body) : null;
    events.push({ kind: 'db', method: init.method || 'GET', name, body });
    if (name === 'rpc/retention_draft_plan') return new Response(JSON.stringify({ ...basePlan, ...plan }), { status: 200 });
    if (name === 'rpc/retention_delete_draft') {
      if (deleteFails.includes(body.p_wedding_id)) return new Response(JSON.stringify({ code: 'XX000', message: 'boom' }), { status: 500 });
      return new Response(JSON.stringify(deleteResults[body.p_wedding_id] ?? true), { status: 200 });
    }
    return new Response(JSON.stringify(1), { status: 200 });
  };
  const MEDIA = {
    async list({ prefix }) {
      events.push({ kind: 'media-list', prefix });
      const id = prefix.split('/')[1];
      if (mediaFails.includes(id)) throw new Error('r2 down');
      return { objects: [{ key: `${prefix}one-full.webp` }, { key: `${prefix}one-thumb.webp` }], truncated: false };
    },
    async delete(keys) { events.push({ kind: 'media-delete', keys }); }
  };
  return { events, MEDIA, restore: () => { globalThis.fetch = real; } };
}
const env = (w, extra = {}) => ({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k', RETENTION_SWEEP_TOKEN: TOKEN, MEDIA: w.MEDIA, ...extra });
const call = (w, { method = 'POST', headers = { Authorization: `Bearer ${TOKEN}` }, body = { confirm: CONFIRMATION }, e } = {}) => onRequest({
  env: e || env(w),
  request: new Request('https://x.test/api/internal/retention-delete-drafts', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : (body === null ? undefined : JSON.stringify(body)) })
});
const parse = async res => ({ status: res.status, body: await res.json() });
const deletes = w => w.events.filter(e => e.name === 'rpc/retention_delete_draft').map(e => e.body.p_wedding_id);

test('without the secret configured, or with a wrong one, nothing is touched', async () => {
  const w = world();
  try {
    for (const e of [env(w, { RETENTION_SWEEP_TOKEN: undefined }), env(w, { RETENTION_SWEEP_TOKEN: 'short' })]) {
      assert.equal((await parse(await call(w, { e }))).body.error.code, 'RETENTION_NOT_CONFIGURED');
    }
    assert.equal((await call(w, { headers: {} })).status, 401);
    assert.equal((await call(w, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await call(w, { headers: { Authorization: TOKEN } })).status, 401);
    assert.equal((await call(w, { method: 'GET' })).status, 405);
    assert.deepEqual(w.events, []);
  } finally { w.restore(); }
});

test('the right secret alone cannot delete: the confirmation word is required', async () => {
  const w = world();
  try {
    for (const body of [null, {}, { confirm: 'yes' }, { confirm: true }, { delete: true }]) {
      const res = await parse(await call(w, { body }));
      assert.equal(res.status, 422);
      assert.equal(res.body.error.code, 'CONFIRMATION_REQUIRED');
    }
    assert.deepEqual(w.events, [], 'no database or storage call was made');
  } finally { w.restore(); }
});

test('with the master switch off it reports and deletes nothing', async () => {
  const w = world({ plan: { enabled: false } });
  try {
    const res = await parse(await call(w));
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.enabled, res.body.braked, res.body.deleted, res.body.eligible], [false, false, 0, 2]);
    assert.deepEqual(deletes(w), []);
    assert.equal(w.events.some(e => e.kind !== 'db'), false, 'no photo was touched');
    const record = w.events.find(e => e.name === 'rpc/retention_record_run');
    assert.equal(record.body.p_dry_run, true);
    assert.equal(record.body.p_summary.draftDeletion, 'off');
  } finally { w.restore(); }
});

test('switched on: each draft is deleted in the database first, then its photos, and a count is recorded', async () => {
  const w = world();
  try {
    const res = await parse(await call(w));
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.enabled, res.body.braked, res.body.deleted, res.body.skipped, res.body.errors, res.body.mediaFailed], [true, false, 2, 0, 0, []]);
    assert.deepEqual(deletes(w), [A, B]);
    const order = w.events.map(e => e.kind === 'db' ? e.name.replace('rpc/', '') + (e.body?.p_wedding_id ? `:${e.body.p_wedding_id.slice(0, 1)}` : '') : `${e.kind}:${(e.prefix || '').split('/')[1]?.slice(0, 1) || ''}`);
    assert.deepEqual(order, [
      'retention_draft_plan',
      'retention_delete_draft:a', 'media-list:a', 'media-delete:',
      'retention_delete_draft:b', 'media-list:b', 'media-delete:',
      'retention_record_run'
    ]);
    const prefixes = w.events.filter(e => e.kind === 'media-list').map(e => e.prefix);
    assert.deepEqual(prefixes, [`w/${A}/`, `w/${B}/`], 'only the stored files under each deleted draft');
    const record = w.events.find(e => e.name === 'rpc/retention_record_run');
    assert.equal(record.body.p_dry_run, false);
    assert.deepEqual(record.body.p_summary, { asOf: '2027-03-01', eligible: 2, deleted: 2, skipped: 0, errors: 0, mediaFailed: [], draftDeletion: 'on' });
  } finally { w.restore(); }
});

test('a draft the database refuses to delete (edited, paid, published since) keeps its photos', async () => {
  const w = world({ deleteResults: { [A]: false } });
  try {
    const res = await parse(await call(w));
    assert.deepEqual([res.body.deleted, res.body.skipped], [1, 1]);
    assert.deepEqual(w.events.filter(e => e.kind === 'media-list').map(e => e.prefix), [`w/${B}/`], 'photos of the skipped draft are not touched');
  } finally { w.restore(); }
});

test('the safety brake: a run that would delete more than the limit stops and reports instead', async () => {
  const ids = Array.from({ length: 11 }, (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`);
  const w = world({ plan: { eligible: 40, ids, batchLimit: 20, brakeLimit: 10 } });
  try {
    const res = await parse(await call(w));
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.braked, res.body.deleted, res.body.wouldDelete, res.body.brakeLimit], [true, 0, 20, 10]);
    assert.deepEqual(deletes(w), []);
    assert.equal(w.events.some(e => e.kind !== 'db'), false);
    assert.equal(w.events.find(e => e.name === 'rpc/retention_record_run').body.p_summary.draftDeletion, 'braked');
  } finally { w.restore(); }
  const small = world({ plan: { eligible: 40, ids: [A], batchLimit: 8, brakeLimit: 10 } });
  try {
    assert.equal((await parse(await call(small))).body.braked, false, 'the brake counts the batch, not everything that is due');
  } finally { small.restore(); }
});

test('a photo clean-up that fails is reported by id; the draft is still counted as deleted', async () => {
  const w = world({ mediaFails: [B] });
  try {
    const res = await parse(await call(w));
    assert.deepEqual([res.body.deleted, res.body.mediaFailed], [2, [B]]);
  } finally { w.restore(); }
});

test('a run that keeps failing stops after three errors in a row', async () => {
  const ids = [A, B, C, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'];
  const w = world({ plan: { eligible: 5, ids }, deleteFails: ids });
  try {
    const res = await parse(await call(w));
    assert.deepEqual([res.body.deleted, res.body.errors], [0, 3]);
    assert.equal(deletes(w).length, 3, 'it stopped trying');
  } finally { w.restore(); }
});

test('the only way this file changes data is the two database functions and the photo clean-up', () => {
  const source = readFileSync(new URL('../../functions/api/internal/retention-delete-drafts.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /method:\s*['"](DELETE|PATCH|PUT)['"]/);
  assert.doesNotMatch(code, /\bdb\(|fetch\(|weddings\?|from\(['"]/);
  assert.deepEqual([...code.matchAll(/rpc\(env, '([a-z_]+)'/g)].map(m => m[1]).sort(), ['retention_delete_draft', 'retention_draft_plan', 'retention_record_run', 'retention_record_run', 'retention_record_run']);
});

test('the report address still has no delete code', () => {
  const source = readFileSync(new URL('../../functions/api/internal/retention-sweep.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ''), /method:\s*['"](DELETE|PATCH)['"]|\.delete\(|deleteWeddingMedia|retention_delete_draft/);
});
