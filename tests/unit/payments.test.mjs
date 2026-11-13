// Payments with Razorpay: checkout, verify, webhook and the publish gate. A fake Supabase and a fake Razorpay record every request.
// No network, no database. (The payment rules themselves run for real in PostgreSQL: tests/db/payments.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashEditToken } from '../../functions/_shared/api.js';
import { quote } from '../../functions/_shared/pricing.js';
import { hmacHex, timingSafeEqual, verifyWebhookSignature } from '../../functions/_shared/razorpay.js';
import { onRequest as checkout } from '../../functions/api/weddings/[id]/checkout.js';
import { onRequest as verify } from '../../functions/api/weddings/[id]/payments/[paymentId]/verify.js';
import { onRequest as webhook } from '../../functions/api/payments/razorpay-webhook.js';
import { onRequest as publish } from '../../functions/api/weddings/[id]/publish.js';

const WID = '5f0c5a7e-1c4b-4e0a-9c3d-2b1a0f9e8d7c';
const OTHER_WID = '0a0b0c0d-1111-4222-8333-444455556666';
const TOKEN = 'T'.repeat(43);
const KEY_ID = 'rzp_test_KEYID12345';
const KEY_SECRET = 'key-secret-never-in-a-response';
const WEBHOOK_SECRET = 'webhook-secret-test';
const LIVE = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key-test', ALLOWED_ORIGIN: 'https://app.example.test', PAYMENTS_MODE: 'live', RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET };
const realFetch = globalThis.fetch;
const realError = console.error;

function world(overrides = {}) {
  return {
    wedding: { id: WID, owner_id: null, ownership_mode: 'anonymous', slug: null, status: 'draft', visibility: 'private', template_id: 'velvet-reveal', title: 'A and B', version: 3, slug_change_count: 0, publish_unlocked_at: null },
    tokenWeddingId: WID,
    payments: [],
    link: { id: 'plink_TEST1', short_url: 'https://rzp.io/i/test1', status: 'created', reference_id: '', amount: 0, amount_paid: 0, currency: '', payments: [] },
    razorpayDown: false,
    rpcError: null,
    calls: [],
    ...overrides
  };
}

function install(state) {
  let counter = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ host: url.host, method, path: url.pathname, query: url.search, body, auth: init.headers?.Authorization });
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.host === 'api.razorpay.com') {
      if (state.razorpayDown) return json(500, { error: { code: 'SERVER_ERROR', description: 'details that must never be shown' } });
      if (url.pathname === '/v1/payment_links' && method === 'POST') {
        state.link = { ...state.link, reference_id: body.reference_id, amount: body.amount, currency: body.currency };
        return json(200, { id: state.link.id, short_url: state.link.short_url, status: 'created', reference_id: body.reference_id });
      }
      if (url.pathname === `/v1/payment_links/${state.link.id}` && method === 'GET') return json(200, state.link);
      return json(404, { error: { code: 'BAD_REQUEST_ERROR' } });
    }
    if (url.pathname === '/rest/v1/edit_tokens' && method === 'GET') {
      const match = url.searchParams.get('token_hash') === `eq.${state.tokenHash}` && (!url.searchParams.get('wedding_id') || url.searchParams.get('wedding_id') === `eq.${state.tokenWeddingId}`);
      return json(200, match ? [{ id: 1, wedding_id: state.tokenWeddingId, purpose: 'edit', expires_at: '2099-01-01T00:00:00Z', revoked_at: null }] : []);
    }
    if (url.pathname === '/rest/v1/edit_tokens' && method === 'PATCH') return json(200, []);
    if (url.pathname === '/rest/v1/weddings' && method === 'GET') {
      if (url.searchParams.get('select') === '*') return json(200, [state.wedding]);
      return json(200, []);
    }
    if (url.pathname === '/rest/v1/weddings' && method === 'PATCH') { Object.assign(state.wedding, body); return json(200, [{ id: WID }]); }
    if (url.pathname === '/rest/v1/payments' && method === 'GET') {
      let rows = state.payments;
      for (const [key, value] of url.searchParams) {
        if (!value.startsWith('eq.')) continue;
        const wanted = value.slice(3);
        if (key.startsWith('metadata->>')) rows = rows.filter(row => String(row.metadata?.[key.slice(11)]) === wanted);
        else if (['id', 'wedding_id', 'provider', 'status'].includes(key)) rows = rows.filter(row => String(row[key]) === wanted);
      }
      return json(200, rows);
    }
    if (url.pathname === '/rest/v1/payments' && method === 'POST') {
      const row = { id: `00000000-0000-4000-8000-00000000000${++counter}`, ...body };
      state.payments.push(row);
      return json(201, [row]);
    }
    if (url.pathname === '/rest/v1/payments' && method === 'PATCH') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const row = state.payments.find(item => item.id === id);
      if (row) Object.assign(row, body);
      return json(200, row ? [row] : []);
    }
    if (url.pathname === '/rest/v1/rpc/mark_payment_paid' && method === 'POST') {
      if (state.rpcError) return json(400, { code: 'P0001', message: state.rpcError });
      const row = state.payments.find(item => item.id === body.p_payment_id);
      if (!row) return json(400, { code: 'P0001', message: 'PAYMENT_NOT_FOUND' });
      row.status = 'paid';
      state.wedding.publish_unlocked_at = '2026-11-13T00:00:00Z';
      return json(200, { payment_id: row.id, status: 'paid' });
    }
    if (url.pathname === '/rest/v1/rpc/publish_wedding_slug' && method === 'POST') return json(200, { id: WID, slug: body.p_slug, status: 'published', visibility: 'public', version: 4 });
    return json(404, { code: 'PGRST125', message: `unexpected request in test: ${method} ${url.pathname}` });
  };
}

async function run(handler, state, { env = LIVE, method = 'POST', path, body, token = TOKEN, params, headers = {}, cf } = {}) {
  state.tokenHash = await hashEditToken(TOKEN);
  install(state);
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (token !== null) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const request = new Request(`https://app.example.test${path}`, init);
    if (cf) Object.defineProperty(request, 'cf', { value: cf });
    const response = await handler({ request, env, params });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, body: data, text, logged, state };
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
}
const checkoutRun = (state, options = {}) => run(checkout, state, { path: `/api/weddings/${WID}/checkout`, params: { id: WID }, cf: { country: 'IN' }, body: {}, ...options });
const verifyRun = (state, paymentId, options = {}) => run(verify, state, { path: `/api/weddings/${WID}/payments/${paymentId}/verify`, params: { id: WID, paymentId }, ...options });
const razorpayCalls = state => state.calls.filter(c => c.host === 'api.razorpay.com');

// ---------------------------------------------------------------- the primitives
test('signatures: the HMAC matches a known value, and the comparison is exact', async () => {
  // RFC 4231 test case 2 for HMAC-SHA256.
  assert.equal(await hmacHex('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  const sig = await hmacHex('s', 'body');
  assert.equal(await verifyWebhookSignature('body', sig, 's'), true);
  assert.equal(await verifyWebhookSignature('body', sig.toUpperCase(), 's'), true);
  assert.equal(await verifyWebhookSignature('body2', sig, 's'), false);
  assert.equal(await verifyWebhookSignature('body', sig, 'other'), false);
  assert.equal(await verifyWebhookSignature('body', '', 's'), false);
  assert.equal(await verifyWebhookSignature('body', undefined, 's'), false);
  assert.equal(await verifyWebhookSignature('body', sig, ''), false);
});

// ---------------------------------------------------------------- checkout
test('checkout: nothing happens without a valid token, before payments are live, or without keys', async () => {
  let state = world();
  assert.equal((await checkoutRun(state, { token: null })).status, 401);
  assert.equal((await checkoutRun(state, { token: 'X'.repeat(43) })).status, 403);
  assert.equal(razorpayCalls(state).length, 0);
  state = world();
  const early = await checkoutRun(state, { env: { ...LIVE, PAYMENTS_MODE: undefined } });
  assert.equal(early.status, 409); assert.equal(early.body.error.code, 'PAYMENTS_NOT_LIVE');
  const noKeys = await checkoutRun(state, { env: { ...LIVE, RAZORPAY_KEY_SECRET: '' } });
  assert.equal(noKeys.status, 503); assert.equal(noKeys.body.error.code, 'PAYMENTS_NOT_CONFIGURED');
  assert.equal(razorpayCalls(state).length, 0);
  assert.equal(state.payments.length, 0);
  assert.equal((await checkoutRun(world(), { method: 'GET', body: undefined })).status, 405);
});

test('checkout: the server works out the price, locks it in a payment row, and asks Razorpay for exactly that amount', async () => {
  const state = world();
  // The browser tries to name its own price; it is ignored.
  const r = await checkoutRun(state, { body: { amount: 1, amountMinor: 1, currency: 'USD' } });
  assert.equal(r.status, 200, r.text);
  const expected = quote('velvet-reveal', 'in');
  assert.equal(expected.amountMinor, 299900);
  assert.deepEqual({ url: r.body.url, amountMinor: r.body.amountMinor, currency: r.body.currency, tier: r.body.tier, region: r.body.region }, { url: 'https://rzp.io/i/test1', amountMinor: 299900, currency: 'INR', tier: 'signature', region: 'in' });
  assert.equal(state.payments.length, 1);
  const row = state.payments[0];
  assert.equal(row.wedding_id, WID); assert.equal(row.provider, 'razorpay'); assert.equal(row.amount_minor, 299900); assert.equal(row.currency, 'INR');
  assert.equal(row.provider_payment_id, 'plink_TEST1'); assert.equal(row.metadata.shortUrl, 'https://rzp.io/i/test1'); assert.equal(row.metadata.country, 'IN');
  const [call] = razorpayCalls(state);
  assert.equal(call.path, '/v1/payment_links');
  assert.equal(call.auth, `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`);
  assert.equal(call.body.amount, 299900); assert.equal(call.body.currency, 'INR');
  assert.equal(call.body.reference_id, row.id, 'the link is tied to OUR payment row');
  assert.equal(call.body.callback_url, `https://app.example.test/?payment=${row.id}`);
  assert.equal(call.body.accept_partial, false);
  assert.ok(call.body.expire_by - Math.floor(Date.now() / 1000) >= 15 * 60, 'the link lives at least the 15 minutes Razorpay requires');
  assert.equal(call.body.notify.email, false);
  assert.ok(!r.text.includes(KEY_SECRET), 'the secret never appears in a response');
});

test('checkout: the price follows the visitor\'s country; a region or amount the browser sends is ignored', async () => {
  let state = world();
  const us = await checkoutRun(state, { cf: { country: 'US' } });
  assert.deepEqual([us.body.currency, us.body.amountMinor, us.body.region], ['USD', 5900, 'us']);
  state = world();
  const sneaky = await checkoutRun(state, { cf: { country: 'IN' }, body: { region: 'gb', amount: 1, currency: 'GBP' } });
  assert.deepEqual([sneaky.body.currency, sneaky.body.amountMinor, sneaky.body.region], ['INR', 299900, 'in'], 'a cheaper region cannot be chosen');
  state = world({ wedding: { ...world().wedding, template_id: 'minimalist' } });
  assert.equal((await checkoutRun(state)).body.amountMinor, 99900);
  state = world();
  assert.equal((await checkoutRun(state, { cf: { country: 'ZZ' } })).body.region, 'row', 'an unknown place pays the rest-of-world price');
});

test('checkout: pressing the button again reuses the open link, and an unlocked website is not charged', async () => {
  const state = world();
  const first = await checkoutRun(state);
  const second = await checkoutRun(state);
  assert.equal(second.body.reused, true);
  assert.equal(second.body.paymentId, first.body.paymentId);
  assert.equal(second.body.url, first.body.url);
  assert.equal(state.payments.length, 1);
  assert.equal(razorpayCalls(state).length, 1, 'no second link at Razorpay');
  const unlocked = world({ wedding: { ...world().wedding, publish_unlocked_at: '2026-01-01T00:00:00Z' } });
  const r = await checkoutRun(unlocked);
  assert.equal(r.body.alreadyUnlocked, true);
  assert.equal(razorpayCalls(unlocked).length, 0);
  assert.equal(unlocked.payments.length, 0);
});

test('checkout: if Razorpay refuses, the payment is marked failed, the person is told plainly, and nothing leaks', async () => {
  const state = world({ razorpayDown: true });
  const r = await checkoutRun(state);
  assert.equal(r.status, 502); assert.equal(r.body.error.code, 'PAYMENT_PROVIDER_ERROR');
  assert.equal(state.payments[0].status, 'failed');
  assert.ok(!r.text.includes('details that must never be shown'));
  assert.ok(!r.text.includes(KEY_SECRET));
  assert.ok(!r.logged.join(' ').includes('details that must never be shown'), 'the provider\'s body is not logged either');
  // A design that is no longer offered is not sold.
  const gone = world({ wedding: { ...world().wedding, template_id: 'no-such-design' } });
  assert.equal((await checkoutRun(gone)).body.error.code, 'TEMPLATE_UNAVAILABLE');
});

// ---------------------------------------------------------------- verify
async function startedPayment(overrides = {}) {
  const state = world(overrides);
  const started = await checkoutRun(state);
  return { state, paymentId: started.body.paymentId };
}
const paidLink = (state, payment, patch = {}) => { state.link = { ...state.link, status: 'paid', reference_id: payment.id, amount: payment.amount_minor, amount_paid: payment.amount_minor, currency: payment.currency, payments: [{ payment_id: 'pay_ABC123' }], ...patch }; };

test('verify: an unpaid link unlocks nothing; the answer comes from Razorpay, never from the browser', async () => {
  const { state, paymentId } = await startedPayment();
  const r = await verifyRun(state, paymentId, { body: { status: 'paid', razorpay_payment_status: 'paid' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { unlocked: false, status: 'created' });
  assert.equal(state.calls.filter(c => c.path === '/rest/v1/rpc/mark_payment_paid').length, 0);
  assert.equal(state.wedding.publish_unlocked_at, null);
});

test('verify: a link Razorpay says is paid, for the locked amount, unlocks publishing through the one database function', async () => {
  const { state, paymentId } = await startedPayment();
  paidLink(state, state.payments[0]);
  const r = await verifyRun(state, paymentId);
  assert.deepEqual(r.body, { unlocked: true, status: 'paid' });
  const rpc = state.calls.find(c => c.path === '/rest/v1/rpc/mark_payment_paid');
  assert.deepEqual(rpc.body, { p_payment_id: paymentId, p_provider_ref: 'plink_TEST1', p_amount: 299900, p_currency: 'INR', p_provider_payment_id: 'pay_ABC123' });
  assert.ok(state.wedding.publish_unlocked_at);
  // Asking again is harmless and needs no call to Razorpay.
  const before = razorpayCalls(state).length;
  assert.deepEqual((await verifyRun(state, paymentId)).body, { unlocked: true, status: 'paid' });
  assert.equal(razorpayCalls(state).length, before);
});

test('verify: a paid link for another amount, currency or reference is refused, never unlocked', async () => {
  for (const patch of [{ amount_paid: 100 }, { currency: 'USD' }, { reference_id: '11111111-2222-4333-8444-555555555555' }]) {
    const { state, paymentId } = await startedPayment();
    paidLink(state, state.payments[0], patch);
    const r = await verifyRun(state, paymentId);
    assert.equal(r.status, 409, JSON.stringify(patch)); assert.equal(r.body.error.code, 'PAYMENT_MISMATCH');
    assert.equal(state.calls.filter(c => c.path === '/rest/v1/rpc/mark_payment_paid').length, 0);
    assert.equal(state.wedding.publish_unlocked_at, null);
  }
});

test('verify: only the owner of the payment can ask, and an expired link closes the payment', async () => {
  const { state, paymentId } = await startedPayment();
  assert.equal((await verifyRun(state, paymentId, { token: null })).status, 401);
  assert.equal((await verifyRun(state, paymentId, { token: 'X'.repeat(43) })).status, 403);
  // A real token for ANOTHER wedding cannot read this wedding's payment.
  const other = await run(verify, state, { path: `/api/weddings/${OTHER_WID}/payments/${paymentId}/verify`, params: { id: OTHER_WID, paymentId } });
  assert.equal(other.status, 403);
  assert.equal((await verifyRun(state, '11111111-2222-4333-8444-555555555555')).status, 404);
  assert.equal((await verifyRun(state, 'not-a-uuid')).status, 400);
  state.link.status = 'expired';
  const expired = await verifyRun(state, paymentId);
  assert.deepEqual(expired.body, { unlocked: false, status: 'expired' });
  assert.equal(state.payments[0].status, 'cancelled');
});

// ---------------------------------------------------------------- webhook
async function hook(state, event, { secret = WEBHOOK_SECRET, signature, env = LIVE } = {}) {
  const raw = typeof event === 'string' ? event : JSON.stringify(event);
  const sig = signature === undefined ? await hmacHex(secret, raw) : signature;
  return run(webhook, state, { path: '/api/payments/razorpay-webhook', body: raw, token: null, env, headers: sig === null ? {} : { 'X-Razorpay-Signature': sig } });
}
const paidEvent = (payment, patch = {}) => ({
  event: 'payment_link.paid',
  payload: { payment_link: { entity: { id: 'plink_TEST1', reference_id: payment.id, status: 'paid', amount: payment.amount_minor, amount_paid: payment.amount_minor, currency: payment.currency, ...patch } }, payment: { entity: { id: 'pay_HOOK01' } } }
});

test('webhook: a bad, missing or wrongly keyed signature is refused and changes nothing', async () => {
  const { state } = await startedPayment();
  const event = paidEvent(state.payments[0]);
  for (const options of [{ signature: 'deadbeef' }, { signature: null }, { secret: 'the-wrong-secret' }]) {
    const r = await hook(state, event, options);
    assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_SIGNATURE');
  }
  assert.equal(state.calls.filter(c => c.path === '/rest/v1/rpc/mark_payment_paid').length, 0);
  // The API key secret is not the webhook secret.
  assert.equal((await hook(state, event, { secret: KEY_SECRET })).status, 400);
  const noSecret = await hook(state, event, { env: { ...LIVE, RAZORPAY_WEBHOOK_SECRET: '' } });
  assert.equal(noSecret.status, 503);
  assert.equal((await run(webhook, state, { method: 'GET', path: '/api/payments/razorpay-webhook', token: null })).status, 405);
});

test('webhook: a correctly signed payment_link.paid unlocks publishing, and arriving twice is harmless', async () => {
  const { state } = await startedPayment();
  const event = paidEvent(state.payments[0]);
  const first = await hook(state, event);
  assert.equal(first.status, 200); assert.deepEqual(first.body, { ok: true });
  const rpc = state.calls.find(c => c.path === '/rest/v1/rpc/mark_payment_paid');
  assert.deepEqual(rpc.body, { p_payment_id: state.payments[0].id, p_provider_ref: 'plink_TEST1', p_amount: 299900, p_currency: 'INR', p_provider_payment_id: 'pay_HOOK01' });
  assert.ok(state.wedding.publish_unlocked_at);
  assert.equal((await hook(state, event)).status, 200);
});

test('webhook: what does not match is answered 200 (so Razorpay stops retrying) and logged; a database failure is 500 (so it retries)', async () => {
  const { state } = await startedPayment();
  state.rpcError = 'PAYMENT_AMOUNT_MISMATCH';
  const mismatch = await hook(state, paidEvent(state.payments[0], { amount_paid: 5 }));
  assert.equal(mismatch.status, 200); assert.equal(mismatch.body.refused, true);
  assert.ok(mismatch.logged.join(' ').includes('PAYMENT_AMOUNT_MISMATCH'));
  state.rpcError = 'something else broke';
  assert.equal((await hook(state, paidEvent(state.payments[0]))).status, 502);
  // A link that is not one of ours (no payment id in reference_id) is ignored.
  const notOurs = await hook(state, { event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_X', reference_id: 'invoice-77' } } } });
  assert.deepEqual(notOurs.body, { ok: true, ignored: true });
  assert.deepEqual((await hook(state, { event: 'payment.failed', payload: {} })).body, { ok: true, ignored: true });
  assert.equal((await hook(state, '{not json')).status, 400);
});

test('webhook: a full refund closes the payment (publishing is not taken away); a part refund does not', async () => {
  const { state } = await startedPayment();
  state.payments[0].status = 'paid';
  state.payments[0].metadata = { ...state.payments[0].metadata, razorpayPaymentId: 'pay_HOOK01' };
  await hook(state, { event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_HOOK01', amount: 1000 } } } });
  assert.equal(state.payments[0].status, 'paid', 'a part refund leaves it paid');
  await hook(state, { event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_HOOK01', amount: 299900 } } } });
  assert.equal(state.payments[0].status, 'refunded');
  assert.equal(state.calls.filter(c => c.method === 'PATCH' && c.path === '/rest/v1/weddings').length, 0, 'the website stays unlocked');
});

// ---------------------------------------------------------------- publishing
const publishRun = (state, env = LIVE) => run(publish, state, { env, path: `/api/weddings/${WID}/publish`, params: { id: WID }, body: { version: 3, slug: 'ava-and-ben' } });
const published = state => state.calls.filter(c => c.path === '/rest/v1/rpc/publish_wedding_slug');

test('publishing: once payments are live, a website that has not paid is asked to (402) and nothing is published', async () => {
  const state = world();
  const r = await publishRun(state);
  assert.equal(r.status, 402); assert.equal(r.body.error.code, 'PAYMENT_REQUIRED');
  assert.equal(published(state).length, 0);
});

test('publishing: a paid, early-access or already-live website publishes without paying again', async () => {
  let state = world({ wedding: { ...world().wedding, publish_unlocked_at: '2026-11-13T00:00:00Z', publish_unlock_reason: 'paid' } });
  assert.equal((await publishRun(state)).status, 200);
  assert.equal(published(state).length, 1);
  // A website already live (published before) is not asked, even if it somehow has no unlock record.
  state = world({ wedding: { ...world().wedding, status: 'published', slug: 'ava-and-ben', visibility: 'public' } });
  assert.equal((await publishRun(state)).status, 200);
});

test('publishing: while payments are not live nothing is charged, and the website is marked early access so it stays free later', async () => {
  const state = world();
  const early = { ...LIVE, PAYMENTS_MODE: undefined };
  const r = await publishRun(state, early);
  assert.equal(r.status, 200);
  assert.equal(state.wedding.publish_unlock_reason, 'early-access');
  assert.ok(state.wedding.publish_unlocked_at);
  // Later, with payments live, that website publishes again without paying.
  state.wedding.status = 'unpublished';
  assert.equal((await publishRun(state, LIVE)).status, 200);
});
