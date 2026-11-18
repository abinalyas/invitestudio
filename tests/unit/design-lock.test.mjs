// After a payment, the design can be changed only within the tier that was paid for or a cheaper one.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertDesignAllowed, paidTierOf, withPaidTier } from '../../functions/_shared/api.js';
import { highestTier, tierFor, tierRank } from '../../functions/_shared/pricing.js';

const env = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubPayments(rows) {
  const calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } }); };
  return calls;
}

test('tiers are ordered cheapest first, and the highest of a list is found', () => {
  assert.ok(tierRank('classic') < tierRank('premium'));
  assert.ok(tierRank('premium') < tierRank('signature'));
  assert.equal(tierRank('nope'), -1);
  assert.equal(highestTier(['classic', 'signature', 'premium']), 'signature');
  assert.equal(highestTier([]), '');
  assert.equal(highestTier(['nope']), '');
});

test('a wedding that was not unlocked by a payment has no paid tier, and no query is made', async () => {
  const calls = stubPayments([{ metadata: { tier: 'signature' } }]);
  assert.equal(await paidTierOf(env, { id: 'w1', publish_unlock_reason: 'early-access' }), '');
  assert.equal(await paidTierOf(env, { id: 'w1', publish_unlock_reason: null }), '');
  assert.equal(calls.length, 0);
});

test('the paid tier is the highest tier among its paid payments', async () => {
  const calls = stubPayments([{ metadata: { tier: 'classic' } }, { metadata: { tier: 'premium' } }]);
  assert.equal(await paidTierOf(env, { id: 'w1', publish_unlock_reason: 'paid' }), 'premium');
  assert.match(calls[0], /payments\?/);
  assert.match(calls[0], /status=eq\.paid/);
  assert.equal((await withPaidTier(env, { id: 'w1', publish_unlock_reason: 'paid', name: 'X' })).paid_tier, 'premium');
});

test('after paying for Classic, a Premium or Signature design is refused; Classic ones are allowed', async () => {
  stubPayments([{ metadata: { tier: 'classic' } }]);
  const paid = { id: 'w1', template_id: 'minimalist', publish_unlock_reason: 'paid' };
  await assert.rejects(() => assertDesignAllowed(env, paid, 'cinematic'), error => error.status === 403 && error.code === 'DESIGN_LOCKED');
  await assert.rejects(() => assertDesignAllowed(env, paid, 'velvet-reveal'), error => error.code === 'DESIGN_LOCKED');
  await assertDesignAllowed(env, paid, 'modern-heritage');
  await assertDesignAllowed(env, paid, 'minimalist'); // no change
});

test('after paying for Premium, Classic and Premium designs are allowed and Signature is refused', async () => {
  stubPayments([{ metadata: { tier: 'premium' } }]);
  const paid = { id: 'w1', template_id: 'cinematic', publish_unlock_reason: 'paid' };
  await assertDesignAllowed(env, paid, 'minimalist');
  await assertDesignAllowed(env, paid, 'fairy-tale');
  await assert.rejects(() => assertDesignAllowed(env, paid, 'golden-butterfly'), error => error.code === 'DESIGN_LOCKED');
});

test('before any payment, or in early access, any design can be chosen', async () => {
  const calls = stubPayments([]);
  await assertDesignAllowed(env, { id: 'w1', template_id: 'minimalist', publish_unlock_reason: null }, 'velvet-reveal');
  await assertDesignAllowed(env, { id: 'w1', template_id: 'minimalist', publish_unlock_reason: 'early-access' }, 'velvet-reveal');
  assert.equal(calls.length, 0);
  assert.equal(tierFor('velvet-reveal'), 'signature');
});
