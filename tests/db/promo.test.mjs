// The promo code rules, run for real in PostgreSQL (the embedded test server, never a real project).
// Run with: npm run test:db   (not part of the GitHub checks, like the cloud suite).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '../cloud/database.mjs';

let db, client;
before(async () => {
  db = await startDatabase({ port: 54333, dataDir: join(tmpdir(), 'invitestudio-pg-promo') });
  client = db.client;
}, { timeout: 120000 });
after(async () => { await db?.stop(); });

async function wedding() {
  const { rows } = await client.query(`insert into weddings (template_id, title, status, visibility) values ('velvet-reveal', 'Test', 'draft', 'private') returning id`);
  return rows[0].id;
}
async function code(code, { maxUses = 1, expires = null, active = true } = {}) {
  await client.query(`insert into promo_codes (code, max_uses, expires_at, active) values ($1, $2, $3, $4)`, [code, maxUses, expires, active]);
  return code;
}
const redeem = async (w, c) => (await client.query(`select public.redeem_promo_code($1, $2) as r`, [w, c])).rows[0].r.status;
const unlocked = async w => (await client.query(`select publish_unlocked_at, publish_unlock_reason from weddings where id = $1`, [w])).rows[0];
const used = async c => (await client.query(`select used_count from promo_codes where code = $1`, [c])).rows[0].used_count;

test('a good code unlocks the website as complimentary and is counted', async () => {
  const w = await wedding(); await code('IS-GOOD-0001');
  assert.equal(await redeem(w, 'IS-GOOD-0001'), 'unlocked');
  const open = await unlocked(w);
  assert.ok(open.publish_unlocked_at);
  assert.equal(open.publish_unlock_reason, 'complimentary');
  assert.equal(await used('IS-GOOD-0001'), 1);
});

test('the code is read without regard to case or spaces around it', async () => {
  const w = await wedding(); await code('IS-CASE-0001');
  assert.equal(await redeem(w, '  is-case-0001 '), 'unlocked');
});

test('a single-use code works for one website only', async () => {
  const a = await wedding(), b = await wedding(); await code('IS-ONCE-0001');
  assert.equal(await redeem(a, 'IS-ONCE-0001'), 'unlocked');
  assert.equal(await redeem(b, 'IS-ONCE-0001'), 'used_up');
  assert.equal((await unlocked(b)).publish_unlocked_at, null, 'the second website stays locked');
  assert.equal(await used('IS-ONCE-0001'), 1);
});

test('a code with several uses stops when they are spent', async () => {
  await code('IS-MANY-0001', { maxUses: 2 });
  const [a, b, c] = [await wedding(), await wedding(), await wedding()];
  assert.equal(await redeem(a, 'IS-MANY-0001'), 'unlocked');
  assert.equal(await redeem(b, 'IS-MANY-0001'), 'unlocked');
  assert.equal(await redeem(c, 'IS-MANY-0001'), 'used_up');
});

test('a website that is already unlocked spends nothing', async () => {
  const w = await wedding(); await code('IS-SAFE-0001');
  await client.query(`update weddings set publish_unlocked_at = now(), publish_unlock_reason = 'paid' where id = $1`, [w]);
  assert.equal(await redeem(w, 'IS-SAFE-0001'), 'already');
  assert.equal(await used('IS-SAFE-0001'), 0);
  assert.equal((await unlocked(w)).publish_unlock_reason, 'paid', 'a payment is never overwritten');
});

test('an expired code, a switched-off code and an unknown code do not unlock', async () => {
  const w = await wedding();
  await code('IS-OLD0-0001', { expires: new Date(Date.now() - 1000).toISOString() });
  await code('IS-OFF0-0001', { active: false });
  assert.equal(await redeem(w, 'IS-OLD0-0001'), 'expired');
  assert.equal(await redeem(w, 'IS-OFF0-0001'), 'invalid');
  assert.equal(await redeem(w, 'IS-NONE-0001'), 'invalid');
  assert.equal((await unlocked(w)).publish_unlocked_at, null);
});

test('ten wrong guesses lock further tries for that website, and a right code is then refused too', async () => {
  const w = await wedding(); await code('IS-LOCK-0001');
  for (let i = 0; i < 10; i++) assert.equal(await redeem(w, `IS-WRNG-000${i}`), 'invalid');
  assert.equal(await redeem(w, 'IS-LOCK-0001'), 'too_many');
  assert.equal((await unlocked(w)).publish_unlocked_at, null);
  const other = await wedding();
  assert.equal(await redeem(other, 'IS-LOCK-0001'), 'unlocked', 'another website is not affected');
});

test('the browser roles see no codes, cannot add or change them, and cannot redeem one', async () => {
  // The test database hands table privileges to anon and authenticated after the migrations (as Supabase does by default), so what
  // keeps codes private is row-level security with no policies: those roles see nothing and may write nothing.
  await code('IS-HIDE-0001');
  const wedding = await client.query(`select id from weddings limit 1`).then(r => r.rows[0]?.id);
  for (const role of ['anon', 'authenticated']) {
    await client.query(`set role ${role}`);
    try {
      assert.equal((await client.query(`select count(*)::int as n from public.promo_codes`)).rows[0].n, 0, `${role} sees no codes`);
      assert.equal((await client.query(`select count(*)::int as n from public.promo_redemptions`)).rows[0].n, 0, `${role} sees no redemptions`);
      await assert.rejects(client.query(`insert into public.promo_codes (code) values ('IS-SELF-0001')`), /row-level security/, `${role} cannot make a code`);
      assert.equal((await client.query(`update public.promo_codes set max_uses = 9999 where code = 'IS-HIDE-0001'`)).rowCount, 0, `${role} changes nothing`);
      await assert.rejects(client.query(`select public.redeem_promo_code($1, 'IS-HIDE-0001')`, [wedding]), /permission denied/, `${role} cannot redeem`);
    } finally {
      await client.query('reset role');
    }
  }
  assert.equal((await client.query(`select max_uses from promo_codes where code = 'IS-HIDE-0001'`)).rows[0].max_uses, 1, 'the code is unchanged');
});

test('a code cannot be made with a short or odd shape', async () => {
  await assert.rejects(client.query(`insert into promo_codes (code) values ('SHORT')`), /promo_codes_code_shape/);
  await assert.rejects(client.query(`insert into promo_codes (code) values ('lower-case-code')`), /promo_codes_code_shape/);
});
