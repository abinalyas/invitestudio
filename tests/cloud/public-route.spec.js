// Public invitation route: metadata for link previews and reserved slugs.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

async function createPublished(request, { title, slug, location = 'Kochi', date = '2027-01-20', templateId = 'eternal' }) {
  const created = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `pub-${randomUUID()}` },
    data: { templateId, title, date, location }
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
  expect(html).toContain('name="robots" content="noindex,nofollow"');
  // The shell still ships: the browser reads the public API from here.
  expect(html).toContain('id="app"');
  // The page learns which design it needs, to fetch it straight away.
  expect(html).toContain('<meta name="invitestudio-template" content="eternal"/>');
});

test('a published invitation fetches only its own design, not the whole library', async ({ page, request }) => {
  const slug = `lazy-${randomUUID().slice(0, 8)}`;
  await createPublished(request, { title: 'Lazy Couple', slug, templateId: 'velvet-reveal' });
  const files = [];
  page.on('request', req => { const path = new URL(req.url()).pathname; if (/\.(js|css)$/.test(path)) files.push(path); });
  await page.goto(`/s/${slug}`);
  await expect(page.locator('[data-public-invitation]')).toContainText('Lazy Couple', { timeout: 20000 });
  expect(files).toContain('/templates/dist/velvet-reveal.js');
  expect(files).toContain('/packaged-templates.js');
  for (const other of ['/templates/dist/bloom-reveal.js', '/templates/dist/cinematic.js', '/scene-templates.js', '/scene-templates.css', '/templates/templates.generated.js']) expect(files, other).not.toContain(other);
  // The design starts loading as soon as the page does, in parallel with the invitation's data.
  expect(await page.locator('meta[name="invitestudio-template"]').getAttribute('content')).toBe('velvet-reveal');
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
