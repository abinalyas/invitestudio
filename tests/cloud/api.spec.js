// API contract tests against the real Pages Functions, Postgres and REST shim
// started by tests/cloud/stack.mjs. No browser is involved.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

const json = data => ({ 'Content-Type': 'application/json' });
const TOKEN_KEYS = /token|hash/i;

function uniqueKey() {
  return `key-${randomUUID()}`;
}

async function createDraft(request, { title = 'Test Couple', key = uniqueKey() } = {}) {
  const response = await request.post('/api/weddings', {
    headers: { ...json(), 'Idempotency-Key': key },
    data: { templateId: 'eternal', title, functions: [{ id: randomUUID(), title: 'Ceremony', date: '2027-01-20', time: '10:00', visible: true }] }
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return { ...body, key };
}

function assertNoLeakedSecrets(text) {
  expect(text).not.toMatch(/"editToken"/);
  expect(text).not.toMatch(/token_hash/);
  expect(text).not.toMatch(/owner_id/);
  expect(text).not.toMatch(/storagePath/);
}

test.describe('draft creation', () => {
  test('creates an anonymous draft, returns the token once, and sends no-store headers', async ({ request }) => {
    const response = await request.post('/api/weddings', { headers: json(), data: { templateId: 'eternal', title: 'Mira & Arun' } });
    expect(response.status()).toBe(201);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    const body = await response.json();
    expect(body.wedding.ownership_mode).toBe('anonymous');
    expect(body.wedding.owner_id).toBeNull();
    expect(body.wedding.status).toBe('draft');
    expect(body.editToken.length).toBeGreaterThanOrEqual(32);
    expect(body.wedding.edit_token).toBeUndefined();
  });

  test('rejects an unknown template without creating a draft', async ({ request }) => {
    const response = await request.post('/api/weddings', { headers: json(), data: { templateId: 'no-such-template', title: 'X' } });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.fields.templateId).toBeTruthy();
  });

  test('a repeated Idempotency-Key returns the same draft, rotates the token and revokes the old one', async ({ request }) => {
    const first = await createDraft(request, { title: 'Replay Couple' });
    const replay = await request.post('/api/weddings', {
      headers: { ...json(), 'Idempotency-Key': first.key },
      data: { templateId: 'eternal', title: 'Replay Couple' }
    });
    expect(replay.status()).toBe(200);
    const replayBody = await replay.json();
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.wedding.id).toBe(first.wedding.id);
    expect(replayBody.editToken).not.toBe(first.editToken);

    const oldToken = await request.get(`/api/weddings/${first.wedding.id}`, { headers: { Authorization: `Bearer ${first.editToken}` } });
    expect(oldToken.status()).toBe(403);
    const newToken = await request.get(`/api/weddings/${first.wedding.id}`, { headers: { Authorization: `Bearer ${replayBody.editToken}` } });
    expect(newToken.status()).toBe(200);
  });

  test('a replay applies the latest payload, so edits made while retrying are not lost', async ({ request }) => {
    const first = await createDraft(request, { title: 'Original title' });
    const replay = await request.post('/api/weddings', {
      headers: { ...json(), 'Idempotency-Key': first.key },
      data: { templateId: 'eternal', title: 'Edited while retrying' }
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).wedding.title).toBe('Edited while retrying');
  });

  test('a malformed Idempotency-Key is rejected', async ({ request }) => {
    const response = await request.post('/api/weddings', {
      headers: { ...json(), 'Idempotency-Key': 'x' },
      data: { templateId: 'eternal', title: 'Bad key' }
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});

test.describe('private access', () => {
  test('reads need a valid token for that draft', async ({ request }) => {
    const a = await createDraft(request, { title: 'Couple A' });
    const b = await createDraft(request, { title: 'Couple B' });

    expect((await request.get(`/api/weddings/${a.wedding.id}`)).status()).toBe(401);
    expect((await request.get(`/api/weddings/${a.wedding.id}`, { headers: { Authorization: 'Bearer ' + 'z'.repeat(43) } })).status()).toBe(403);
    // Token for draft B must not open draft A.
    expect((await request.get(`/api/weddings/${a.wedding.id}`, { headers: { Authorization: `Bearer ${b.editToken}` } })).status()).toBe(403);
    expect((await request.get(`/api/weddings/${a.wedding.id}`, { headers: { Authorization: `Bearer ${a.editToken}` } })).status()).toBe(200);
  });

  test('edit links resolve from a POST body and never from a URL path', async ({ request }) => {
    const draft = await createDraft(request, { title: 'Link Couple' });

    const resolved = await request.post('/api/edit-links', { headers: json(), data: { token: draft.editToken } });
    expect(resolved.status()).toBe(200);
    expect((await resolved.json()).wedding.id).toBe(draft.wedding.id);

    const pathForm = await request.get(`/api/edit-links/${draft.editToken}`);
    const pathBody = await pathForm.text();
    expect(pathBody).not.toContain(draft.wedding.id);
  });

  test('a stale version cannot overwrite a newer save', async ({ request }) => {
    const draft = await createDraft(request, { title: 'Versioned' });
    const auth = { Authorization: `Bearer ${draft.editToken}` };
    const ok = await request.patch(`/api/weddings/${draft.wedding.id}`, { headers: { ...json(), ...auth }, data: { version: 1, title: 'Versioned again' } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).wedding.version).toBe(2);
    const stale = await request.patch(`/api/weddings/${draft.wedding.id}`, { headers: { ...json(), ...auth }, data: { version: 1, title: 'Old write' } });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe('VERSION_CONFLICT');
  });

  test('regenerating a link revokes the previous one', async ({ request }) => {
    const draft = await createDraft(request, { title: 'Regenerate' });
    const regenerated = await request.post(`/api/weddings/${draft.wedding.id}/edit-token`, { headers: { Authorization: `Bearer ${draft.editToken}` } });
    expect(regenerated.status()).toBe(200);
    const next = (await regenerated.json()).editToken;
    expect((await request.get(`/api/weddings/${draft.wedding.id}`, { headers: { Authorization: `Bearer ${draft.editToken}` } })).status()).toBe(403);
    expect((await request.get(`/api/weddings/${draft.wedding.id}`, { headers: { Authorization: `Bearer ${next}` } })).status()).toBe(200);
  });
});

test.describe('publishing and the public invitation', () => {
  test('a draft is not public until it is published', async ({ request }) => {
    const draft = await createDraft(request, { title: 'Hidden until published' });
    const slug = `hidden-${randomUUID().slice(0, 8)}`;
    expect((await request.get(`/api/public-weddings/${slug}`)).status()).toBe(404);
    expect((await request.get('/api/public-weddings/Not_A_Slug')).status()).toBe(404);
    expect(draft.wedding.status).toBe('draft');
  });

  test('publish exposes only the allowlisted projection, and unpublish removes it', async ({ request }) => {
    const slug = `pub-${randomUUID().slice(0, 8)}`;
    const draft = await createDraft(request, { title: 'Public couple' });
    const auth = { Authorization: `Bearer ${draft.editToken}`, ...json() };

    const published = await request.post(`/api/weddings/${draft.wedding.id}/publish`, { headers: auth, data: { version: 1, slug } });
    expect(published.status()).toBe(200);
    expect((await published.json()).publicUrl).toBe(`/s/${slug}`);

    const publicResponse = await request.get(`/api/public-weddings/${slug}`);
    expect(publicResponse.status()).toBe(200);
    const publicText = await publicResponse.text();
    assertNoLeakedSecrets(publicText);
    expect(publicText).not.toContain(draft.wedding.id);
    expect(JSON.parse(publicText).wedding.title).toBe('Public couple');

    const unpublished = await request.post(`/api/weddings/${draft.wedding.id}/unpublish`, { headers: auth, data: { version: 2 } });
    expect(unpublished.status()).toBe(200);
    expect((await request.get(`/api/public-weddings/${slug}`)).status()).toBe(404);
  });

  test('a slug already in use is refused', async ({ request }) => {
    const slug = `taken-${randomUUID().slice(0, 8)}`;
    const first = await createDraft(request, { title: 'First owner' });
    expect((await request.post(`/api/weddings/${first.wedding.id}/publish`, { headers: { Authorization: `Bearer ${first.editToken}`, ...json() }, data: { version: 1, slug } })).status()).toBe(200);

    const second = await createDraft(request, { title: 'Second owner' });
    const conflict = await request.post(`/api/weddings/${second.wedding.id}/publish`, { headers: { Authorization: `Bearer ${second.editToken}`, ...json() }, data: { version: 1, slug } });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).error.code).toBe('SLUG_CONFLICT');
  });

  test('hidden events never reach the public response', async ({ request }) => {
    const slug = `events-${randomUUID().slice(0, 8)}`;
    const key = uniqueKey();
    const created = await request.post('/api/weddings', {
      headers: { ...json(), 'Idempotency-Key': key },
      data: {
        templateId: 'eternal',
        title: 'Event couple',
        functions: [
          { id: randomUUID(), title: 'Visible ceremony', date: '2027-01-20', visible: true },
          { id: randomUUID(), title: 'Secret rehearsal', date: '2027-01-19', visible: false }
        ]
      }
    });
    const draft = await created.json();
    await request.post(`/api/weddings/${draft.wedding.id}/publish`, { headers: { Authorization: `Bearer ${draft.editToken}`, ...json() }, data: { version: 1, slug } });
    const text = await (await request.get(`/api/public-weddings/${slug}`)).text();
    expect(text).toContain('Visible ceremony');
    expect(text).not.toContain('Secret rehearsal');
  });
});
