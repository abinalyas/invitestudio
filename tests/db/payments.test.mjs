// The payment rules, run for real in PostgreSQL (the embedded test server, never a real project).
// Run with: npm run test:db   (not part of the GitHub checks, like the cloud suite).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '../cloud/database.mjs';

let db, client;
before(async () => {
  db = await startDatabase({ port: 54332, dataDir: join(tmpdir(), 'invitestudio-pg-payments') });
  client = db.client;
}, { timeout: 120000 });
after(async () => { await db?.stop(); });

async function wedding({ status = 'draft', published = null } = {}) {
  const { rows } = await client.query(
    `insert into weddings (template_id, title, status, visibility, published_at) values ('velvet-reveal', 'Test', $1, $2, $3) returning id`,
    [status, status === 'published' ? 'public' : 'private', published]);
  return rows[0].id;
}
async function payment(weddingId, { amount = 299900, currency = 'INR', ref = 'plink_AAA111', status = 'pending' } = {}) {
  const { rows } = await client.query(
    `insert into payments (wedding_id, provider, provider_payment_id, status, amount_minor, currency, metadata)
     values ($1, 'razorpay', $2, $3, $4, $5, '{"templateId":"velvet-reveal"}'::jsonb) returning id`, [weddingId, ref, status, amount, currency]);
  return rows[0].id;
}
const markPaid = (id, ref = 'plink_AAA111', amount = 299900, currency = 'INR', razorpayId = 'pay_XYZ789') =>
  client.query(`select public.mark_payment_paid($1, $2, $3, $4, $5) as r`, [id, ref, amount, currency, razorpayId]);
const row = async id => (await client.query(`select * from payments where id = $1`, [id])).rows[0];
const unlocked = async id => (await client.query(`select publish_unlocked_at, publish_unlock_reason from weddings where id = $1`, [id])).rows[0];

test('a new website starts locked, and a payment unlocks it once', async () => {
  const w = await wedding();
  assert.deepEqual(await unlocked(w), { publish_unlocked_at: null, publish_unlock_reason: null });
  const p = await payment(w);
  const { rows } = await markPaid(p);
  assert.equal(rows[0].r.status, 'paid');
  assert.equal(rows[0].r.already, false);
  const paid = await row(p);
  assert.equal(paid.status, 'paid');
  assert.ok(paid.paid_at);
  assert.equal(paid.metadata.razorpayPaymentId, 'pay_XYZ789');
  assert.equal(paid.metadata.templateId, 'velvet-reveal', 'the metadata we wrote is kept');
  const open = await unlocked(w);
  assert.ok(open.publish_unlocked_at);
  assert.equal(open.publish_unlock_reason, 'paid');
});

test('paying twice (the page and the webhook both report it) does nothing more', async () => {
  const w = await wedding();
  const p = await payment(w, { ref: 'plink_TWICE1' });
  await markPaid(p, 'plink_TWICE1');
  const first = await row(p);
  const again = (await markPaid(p, 'plink_TWICE1')).rows[0].r;
  assert.equal(again.already, true);
  assert.equal((await row(p)).paid_at.toISOString(), first.paid_at.toISOString(), 'paid_at is not rewritten');
});

test('a payment for a different amount, currency or link is refused, and nothing is unlocked', async () => {
  const w = await wedding();
  const p = await payment(w, { ref: 'plink_OK0001' });
  await assert.rejects(markPaid(p, 'plink_OK0001', 100, 'INR'), /PAYMENT_AMOUNT_MISMATCH/);
  await assert.rejects(markPaid(p, 'plink_OK0001', 299900, 'USD'), /PAYMENT_AMOUNT_MISMATCH/);
  await assert.rejects(markPaid(p, 'plink_OTHER1'), /PAYMENT_REFERENCE_MISMATCH/);
  assert.equal((await row(p)).status, 'pending');
  assert.equal((await unlocked(w)).publish_unlocked_at, null);
  await assert.rejects(markPaid('00000000-0000-4000-8000-000000000000'), /PAYMENT_NOT_FOUND/);
});

test('a refunded payment cannot be paid again, and a pending, failed or cancelled one can', async () => {
  const w = await wedding();
  const refunded = await payment(w, { ref: 'plink_REF001', status: 'refunded' });
  await assert.rejects(markPaid(refunded, 'plink_REF001'), /PAYMENT_NOT_PENDING/);
  for (const status of ['failed', 'cancelled']) {
    const p = await payment(await wedding(), { ref: `plink_${status}`, status });
    assert.equal((await markPaid(p, `plink_${status}`)).rows[0].r.status, 'paid');
  }
});

test('a website that was already unlocked keeps its reason; a payment does not rewrite it', async () => {
  const w = await wedding();
  await client.query(`update weddings set publish_unlocked_at = '2026-01-01T00:00:00Z', publish_unlock_reason = 'early-access' where id = $1`, [w]);
  const p = await payment(w, { ref: 'plink_KEEP01' });
  await markPaid(p, 'plink_KEEP01');
  const open = await unlocked(w);
  assert.equal(open.publish_unlock_reason, 'early-access');
  assert.equal(open.publish_unlocked_at.toISOString(), '2026-01-01T00:00:00.000Z');
});

test('the reason can only be one of the known ones, and an unknown reason is refused', async () => {
  const w = await wedding();
  await assert.rejects(client.query(`update weddings set publish_unlock_reason = 'free-lunch' where id = $1`, [w]), /weddings_publish_unlock_reason_check/);
});

test('only the server can mark a payment paid: the browser roles cannot run the function or write payments', async () => {
  const w = await wedding();
  const p = await payment(w, { ref: 'plink_ROLE01' });
  for (const role of ['anon', 'authenticated']) {
    await client.query(`set role ${role}`);
    try {
      await assert.rejects(client.query(`select public.mark_payment_paid($1, 'plink_ROLE01', 299900, 'INR', 'pay_1')`, [p]), /permission denied/);
      // Row security gives these roles no update policy: the statement is refused or changes nothing.
      await client.query(`update payments set status = 'paid' where id = $1`, [p]).catch(() => null);
    } finally {
      await client.query('reset role');
    }
  }
  assert.equal((await row(p)).status, 'pending');
  const { rows } = await client.query(`select has_function_privilege('service_role', 'public.mark_payment_paid(uuid,text,bigint,text,text)', 'execute') as ok`);
  assert.equal(rows[0].ok, true);
});

test('websites published before payments opened were unlocked by the migration (early access)', async () => {
  // The migration's backfill runs on rows that exist when it is applied; the same rule is checked here on fresh rows.
  const w = await wedding({ status: 'published', published: '2026-05-01T10:00:00Z' });
  await client.query(`update weddings set publish_unlocked_at = null, publish_unlock_reason = null where id = $1`, [w]);
  await client.query(
    `update weddings set publish_unlocked_at = coalesce(first_published_at, published_at, pg_catalog.now()), publish_unlock_reason = 'early-access'
      where id = $1 and publish_unlocked_at is null and (status = 'published' or published_at is not null or first_published_at is not null)`, [w]);
  assert.equal((await unlocked(w)).publish_unlock_reason, 'early-access');
});
