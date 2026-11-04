// Public invitation route: metadata for link previews and reserved slugs.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

async function createPublished(request, { title, slug, location = 'Kochi', date = '2027-01-20' }) {
  const created = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `pub-${randomUUID()}` },
    data: { templateId: 'eternal', title, date, location }
  });
  const draft = await created.json();
  const published = await request.post(`/api/weddings/${draft.wedding.id}/publish`, {
    headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' },
    data: { version: 1, slug }
  });
  expect(published.status()).toBe(200);
  return draft;
}

test('a published invitation serves link-preview metadata for crawlers', async ({ request }) => {
  const slug = `preview-${randomUUID().slice(0, 8)}`;
  await createPublished(request, { title: 'Mira & Arun', slug, location: 'Kochi' });
  const response = await request.get(`/s/${slug}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('<title>Mira &amp; Arun — InviteStudio</title>');
  expect(html).toContain('property="og:title" content="Mira &amp; Arun — InviteStudio"');
  expect(html).toContain('20 January 2027 · Kochi');
  expect(html).toContain(`href="${new URL(response.url()).origin}/s/${slug}"`);
  expect(html).toContain('name="robots" content="index,follow"');
  // The shell still ships: the browser reads the public API from here.
  expect(html).toContain('id="app"');
});

test('an unpublished or unknown invitation is a 404 with noindex', async ({ request }) => {
  const response = await request.get(`/s/never-published-${randomUUID().slice(0, 8)}`);
  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).toContain('name="robots" content="noindex,nofollow"');
  expect(html).not.toMatch(/og:title" content="[^"]*Mira/);
});

test('metadata never includes internal identifiers, tokens or storage paths', async ({ request }) => {
  const slug = `private-${randomUUID().slice(0, 8)}`;
  const draft = await createPublished(request, { title: 'Private Check', slug });
  const html = await (await request.get(`/s/${slug}`)).text();
  expect(html).not.toContain(draft.wedding.id);
  expect(html).not.toContain(draft.editToken);
  expect(html).not.toMatch(/storagePath|token_hash|owner_id/);
});

test('reserved words cannot be claimed as public addresses', async ({ request }) => {
  const draft = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `res-${randomUUID()}` },
    data: { templateId: 'eternal', title: 'Reserved check' }
  });
  const body = await draft.json();
  const response = await request.post(`/api/weddings/${body.wedding.id}/publish`, {
    headers: { Authorization: `Bearer ${body.editToken}`, 'Content-Type': 'application/json' },
    data: { version: 1, slug: 'api' }
  });
  expect(response.status()).toBe(422);
  expect((await response.json()).error.fields.slug).toBeTruthy();
});
