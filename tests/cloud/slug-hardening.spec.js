// Phase 4A hardening, against the real cloud stack: concurrent address conflicts,
// the 60-character address limit, and expired edit tokens. See docs/SLUGS.md.
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

async function dbQuery(sql, params) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.end();
  }
}

const unique = (length = 8) => `s-${randomUUID().replace(/-/g, '').slice(0, length)}`;

async function createDraft(request, title = 'Hardening Couple') {
  const response = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `hard-${randomUUID()}` },
    data: { templateId: 'eternal', title }
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function publish(request, draft, slug, version) {
  return request.post(`/api/weddings/${draft.wedding.id}/publish`, {
    headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' },
    data: { version: version ?? draft.wedding.version ?? 1, slug }
  });
}

test.describe('concurrent publishing of one address', () => {
  test('two websites publishing the same address at the same moment: one wins, the other gets 409 SLUG_CONFLICT', async ({ request }) => {
    // The conflict is decided by the database's unique constraint, so repeat to make the race likely.
    for (let round = 0; round < 6; round += 1) {
      const first = await createDraft(request, `Race A ${round}`);
      const second = await createDraft(request, `Race B ${round}`);
      const slug = unique();
      const [a, b] = await Promise.all([publish(request, first, slug), publish(request, second, slug)]);
      const results = [a, b];
      const statuses = results.map(result => result.status()).sort((x, y) => x - y);
      expect(statuses, `round ${round}`).toEqual([200, 409]);
      const loser = results.find(result => result.status() === 409);
      const body = await loser.json();
      expect(body.error.code, `round ${round}`).toBe('SLUG_CONFLICT');
      expect(body.error.fields?.slug).toBeTruthy();
    }
  });
});

test.describe('the 60-character address limit', () => {
  test('a new address of 61 characters is refused with a field error', async ({ request }) => {
    const draft = await createDraft(request);
    const slug = `${'a'.repeat(61)}`;
    const response = await publish(request, draft, slug);
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields?.slug).toBeTruthy();
  });

  test('a new address of exactly 60 characters is accepted', async ({ request }) => {
    const draft = await createDraft(request);
    const slug = `${'b'.repeat(60)}`;
    const response = await publish(request, draft, slug);
    expect(response.status()).toBe(200);
  });

  test('a live address longer than 60 characters keeps working and can be republished unchanged', async ({ request }) => {
    // Existing invitations may already have longer addresses. They must not break.
    const draft = await createDraft(request);
    const legacy = `legacy-${'c'.repeat(70)}`;
    await dbQuery(
      `update weddings set slug = $1, status = 'published', visibility = 'public', published_at = now() where id = $2`,
      [legacy, draft.wedding.id]
    );
    const [row] = await dbQuery('select version from weddings where id = $1', [draft.wedding.id]);
    const response = await publish(request, draft, legacy, row.version);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.wedding.slug).toBe(legacy);
  });

  test('moving a live invitation to a new address longer than 60 characters is refused', async ({ request }) => {
    const draft = await createDraft(request);
    const legacy = `legacy-${'d'.repeat(70)}`;
    await dbQuery(
      `update weddings set slug = $1, status = 'published', visibility = 'public', published_at = now() where id = $2`,
      [legacy, draft.wedding.id]
    );
    const [row] = await dbQuery('select version from weddings where id = $1', [draft.wedding.id]);
    const response = await publish(request, draft, `${'e'.repeat(61)}`, row.version);
    expect(response.status()).toBe(422);
  });
});

test.describe('expired edit tokens', () => {
  test('an expired token cannot read or change a website, and is not marked as used', async ({ request }) => {
    const draft = await createDraft(request);
    await dbQuery(
      `update edit_tokens set created_at = now() - interval '91 days', expires_at = now() - interval '1 day' where wedding_id = $1 and purpose = 'edit'`,
      [draft.wedding.id]
    );
    const [before] = await dbQuery(`select last_used_at from edit_tokens where wedding_id = $1`, [draft.wedding.id]);

    const read = await request.get(`/api/weddings/${draft.wedding.id}`, {
      headers: { Authorization: `Bearer ${draft.editToken}` }
    });
    expect(read.status()).toBe(403);
    expect((await read.json()).error.code).toBe('EDIT_TOKEN_INVALID');

    const write = await request.patch(`/api/weddings/${draft.wedding.id}`, {
      headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' },
      data: { version: draft.wedding.version ?? 1, title: 'Should not save' }
    });
    expect(write.status()).toBe(403);

    const [after] = await dbQuery(`select last_used_at from edit_tokens where wedding_id = $1`, [draft.wedding.id]);
    expect(after.last_used_at?.getTime() ?? null).toBe(before.last_used_at?.getTime() ?? null);
    const [wedding] = await dbQuery('select title from weddings where id = $1', [draft.wedding.id]);
    expect(wedding.title).not.toBe('Should not save');
  });

  test('a token expiring in 30 seconds still works (boundary)', async ({ request }) => {
    const draft = await createDraft(request);
    await dbQuery(
      `update edit_tokens set expires_at = now() + interval '30 seconds' where wedding_id = $1 and purpose = 'edit'`,
      [draft.wedding.id]
    );
    const read = await request.get(`/api/weddings/${draft.wedding.id}`, {
      headers: { Authorization: `Bearer ${draft.editToken}` }
    });
    expect(read.status()).toBe(200);
  });

  test('a new edit token lasts 90 days', async ({ request }) => {
    const draft = await createDraft(request);
    const [row] = await dbQuery(
      `select extract(epoch from (expires_at - created_at)) as seconds from edit_tokens where wedding_id = $1 and purpose = 'edit' order by created_at desc limit 1`,
      [draft.wedding.id]
    );
    const days = Number(row.seconds) / 86400;
    expect(Math.abs(days - 90)).toBeLessThan(0.01);
  });
});
