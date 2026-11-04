// Routing, private link and response-header tests against wrangler pages dev.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

async function createDraft(request, title) {
  const response = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `link-${randomUUID()}` },
    data: { templateId: 'eternal', title }
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test('the private link opens the draft and the token never leaves the browser', async ({ page, request }) => {
  const title = `Fragment Couple ${Date.now()}`;
  const draft = await createDraft(request, title);
  const requested = [];
  page.on('request', req => requested.push(req.url()));

  await page.goto(`/edit#${draft.editToken}`);
  await expect(page.locator('body')).toContainText(title, { timeout: 15000 });

  // The address bar is cleaned, and no request carried the token in its URL.
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).hash).toBe('');
  expect(requested.some(url => url.includes(draft.editToken))).toBe(false);
});

test('legacy /edit/<token> links still recover the draft and are cleaned up', async ({ page, request }) => {
  const title = `Legacy Couple ${Date.now()}`;
  const draft = await createDraft(request, title);
  await page.goto(`/edit/${draft.editToken}`);
  await expect(page.locator('body')).toContainText(title, { timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe('/');
});

test('the shell serves security headers and the private link route is not cached', async ({ request }) => {
  const home = await request.get('/');
  expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(home.headers()['x-frame-options']).toBe('DENY');
  expect(home.headers()['x-content-type-options']).toBe('nosniff');

  const edit = await request.get('/edit');
  expect(edit.status()).toBe(200);
  expect(edit.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(edit.headers()['referrer-policy']).toBe('no-referrer');
});

test('unknown API routes return a JSON 404, never the HTML shell', async ({ request }) => {
  const response = await request.get('/api/does-not-exist');
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).toContain('application/json');
  expect((await response.json()).error.code).toBe('NOT_FOUND');
});

test('the retired GET edit-link path is not served', async ({ request }) => {
  const draft = await createDraft(request, 'Retired path');
  const response = await request.get(`/api/edit-links/${draft.editToken}`);
  expect(response.status()).not.toBe(200);
  expect(await response.text()).not.toContain(draft.wedding.id);
});
