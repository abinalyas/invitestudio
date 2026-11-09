// The protected dry-run address: who may call it, what it records, and that it never changes a website.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequest, sameSecret } from '../../functions/api/internal/retention-sweep.js';

const TOKEN = 't'.repeat(40);
const preview = { asOf: '2027-04-05', settings: { graceDays: 14 }, totals: { websites: 3, wouldDelete: 1 }, publishLeadMonths: { under2: 1 }, due: [{ id: 'a', stage: 'delete_due' }] };

function world() {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method || 'GET', path: u.pathname.replace('/rest/v1/', ''), body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(u.pathname.endsWith('retention_preview') ? preview : 1), { status: 200 });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const env = (extra = {}) => ({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k', RETENTION_SWEEP_TOKEN: TOKEN, ...extra });
const call = (method, headers = {}, e = env()) => onRequest({ env: e, request: new Request('https://x.test/api/internal/retention-sweep', { method, headers }) });
const parse = async res => ({ status: res.status, body: await res.json() });

test('without the secret configured, the address does nothing and touches no database', async () => {
  const w = world();
  try {
    for (const e of [env({ RETENTION_SWEEP_TOKEN: undefined }), env({ RETENTION_SWEEP_TOKEN: '' }), env({ RETENTION_SWEEP_TOKEN: 'short' })]) {
      const res = await parse(await call('POST', { Authorization: `Bearer ${TOKEN}` }, e));
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'RETENTION_NOT_CONFIGURED');
    }
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('a missing or wrong secret is refused before any database call', async () => {
  const w = world();
  try {
    assert.equal((await call('POST')).status, 401);
    assert.equal((await call('POST', { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await call('POST', { Authorization: `Bearer ${TOKEN}x` })).status, 401);
    assert.equal((await call('POST', { Authorization: TOKEN })).status, 401, 'must be a Bearer header');
    assert.equal((await call('GET', { Authorization: `Bearer ${TOKEN}` })).status, 405);
    assert.equal(w.calls.length, 0);
  } finally { w.restore(); }
});

test('with the right secret it reports, records one summary line, and nothing else', async () => {
  const w = world();
  try {
    const res = await parse(await call('POST', { Authorization: `Bearer ${TOKEN}` }));
    assert.equal(res.status, 200);
    assert.equal(res.body.dryRun, true);
    assert.deepEqual(res.body.totals, preview.totals);
    assert.deepEqual(w.calls.map(c => c.path), ['rpc/retention_preview', 'rpc/retention_record_run']);
    assert.equal(w.calls[1].body.p_dry_run, true);
    assert.deepEqual(Object.keys(w.calls[1].body.p_summary).sort(), ['asOf', 'publishLeadMonths', 'totals'], 'the record holds counts only, no ids');
    for (const c of w.calls) assert.equal(c.method, 'POST');
    assert.equal(w.calls.some(c => /DELETE|PATCH/.test(c.method) || /^weddings|wedding_photos|wedding_rsvps/.test(c.path)), false, 'no website table is touched');
  } finally { w.restore(); }
});

test('secrets are compared safely', async () => {
  assert.equal(await sameSecret('a'.repeat(40), 'a'.repeat(40)), true);
  assert.equal(await sameSecret('a'.repeat(40), 'a'.repeat(39) + 'b'), false);
  assert.equal(await sameSecret('', 'a'), false);
});

test('this step has no code that hides or deletes a website', () => {
  const source = readFileSync(new URL('../../functions/api/internal/retention-sweep.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /method:\s*['"](DELETE|PATCH)['"]|\.delete\(|deleteWeddingMedia|status:\s*['"]unpublished/);
});
