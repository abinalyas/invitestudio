// After a payment the design can be changed only within the price tier that was paid for (or a cheaper one). Real API, real database.
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';
async function dbQuery(sql, params) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try { return (await db.query(sql, params)).rows; } finally { await db.end(); }
}

async function draftOf(request, templateId) {
  const response = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `key-${randomUUID()}` },
    data: { templateId, title: 'Lock Test' }
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return { id: body.wedding.id, auth: { Authorization: `Bearer ${body.editToken}` } };
}

async function markPaid(id, tier) {
  await dbQuery("update weddings set publish_unlocked_at = now(), publish_unlock_reason = 'paid' where id = $1", [id]);
  await dbQuery("insert into payments (wedding_id, provider, provider_payment_id, status, amount_minor, currency, description, metadata) values ($1, 'razorpay', $2, 'paid', 99900, 'INR', 'test', $3::jsonb)",
    [id, `plink_${randomUUID()}`, JSON.stringify({ tier, templateId: 'minimalist' })]);
}

const versionOf = async id => (await dbQuery('select version from weddings where id = $1', [id]))[0].version;
// Sends the change with the wedding's current version (marking it paid bumps the version).
const patch = async (request, draft, data) => request.patch(`/api/weddings/${draft.id}`, { headers: { 'Content-Type': 'application/json', ...draft.auth }, data: { ...data, version: await versionOf(draft.id) } });

test.describe('the design after payment', () => {
  test('before paying, any design can be chosen', async ({ request }) => {
    const draft = await draftOf(request, 'minimalist');
    const response = await patch(request, draft, { templateId: 'velvet-reveal' });
    expect(response.status()).toBe(200);
    expect((await response.json()).wedding.template_id).toBe('velvet-reveal');
  });

  test('after paying for Classic, a dearer design is refused with DESIGN_LOCKED and the design stays', async ({ request }) => {
    const draft = await draftOf(request, 'minimalist');
    await markPaid(draft.id, 'classic');
    const refused = await patch(request, draft, { templateId: 'cinematic' });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.code).toBe('DESIGN_LOCKED');
    const refusedSignature = await patch(request, draft, { templateId: 'velvet-reveal' });
    expect(refusedSignature.status()).toBe(403);
    const rows = await dbQuery('select template_id from weddings where id = $1', [draft.id]);
    expect(rows[0].template_id).toBe('minimalist');
  });

  test('after paying for Classic, another Classic design is allowed, and the response carries the paid tier', async ({ request }) => {
    const draft = await draftOf(request, 'minimalist');
    await markPaid(draft.id, 'classic');
    const allowed = await patch(request, draft, { templateId: 'modern-heritage' });
    expect(allowed.status()).toBe(200);
    const body = await allowed.json();
    expect(body.wedding.template_id).toBe('modern-heritage');
    expect(body.wedding.paid_tier).toBe('classic');
  });

  test('after paying for Premium, a cheaper design is allowed but Signature is not', async ({ request }) => {
    const draft = await draftOf(request, 'cinematic');
    await markPaid(draft.id, 'premium');
    expect((await patch(request, draft, { templateId: 'minimalist' })).status()).toBe(200);
    const refused = await patch(request, draft, { templateId: 'golden-butterfly' });
    expect(refused.status()).toBe(403);
  });

  test('other edits still work after paying, and loading the wedding reports the paid tier', async ({ request }) => {
    const draft = await draftOf(request, 'minimalist');
    await markPaid(draft.id, 'classic');
    expect((await patch(request, draft, { title: 'Renamed after paying' })).status()).toBe(200);
    const loaded = await (await request.get(`/api/weddings/${draft.id}`, { headers: draft.auth })).json();
    expect(loaded.wedding.paid_tier).toBe('classic');
    expect(loaded.wedding.title).toBe('Renamed after paying');
  });
});
