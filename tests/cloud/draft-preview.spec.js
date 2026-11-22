// Draft preview links (docs/DRAFT_PREVIEW.md): a read-only, watermarked link to a draft that the couple can send to family
// before publishing. Real Pages Functions against a real database (tests/cloud/stack.mjs).
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

async function createDraft(request, title) {
  const created = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `preview-${randomUUID()}` },
    data: {
      templateId: 'eternal',
      title,
      date: '2027-01-20',
      location: 'Kochi',
      functions: [
        { id: randomUUID(), title: 'Wedding ceremony', date: '2027-01-20', time: '10:00', venue: 'The Garden Estate', visible: true },
        { id: randomUUID(), title: 'Private rehearsal', date: '2027-01-19', visible: false }
      ]
    }
  });
  expect(created.status()).toBe(201);
  return created.json();
}

const auth = token => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function makeLink(request, draft) {
  const response = await request.post(`/api/weddings/${draft.wedding.id}/preview-link`, { headers: auth(draft.editToken), data: {} });
  expect(response.status()).toBe(200);
  return (await response.json()).previewToken;
}

const open = (request, token) => request.post('/api/draft-previews', { headers: { 'Content-Type': 'application/json' }, data: { token } });

test('only the couple can make a preview link, and the link shows the latest draft without private details', async ({ request }) => {
  const title = `Preview ${randomUUID().slice(0, 8)}`;
  const draft = await createDraft(request, title);

  const anonymous = await request.post(`/api/weddings/${draft.wedding.id}/preview-link`, { headers: { 'Content-Type': 'application/json' }, data: {} });
  expect(anonymous.status()).toBe(401);

  const token = await makeLink(request, draft);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const first = await open(request, token);
  expect(first.status()).toBe(200);
  const body = await first.json();
  expect(body.wedding.title).toBe(title);
  expect(body.wedding.content.functions.map(f => f.title)).toEqual(['Wedding ceremony']);
  expect(body.preview.liveSlug).toBeNull();
  const text = JSON.stringify(body);
  expect(text).not.toContain(draft.wedding.id);
  expect(text).not.toContain(draft.editToken);
  expect(text).not.toMatch(/token_hash|owner_id|storagePath/);

  // A later saved change shows on the same link.
  const changed = await request.patch(`/api/weddings/${draft.wedding.id}`, { headers: auth(draft.editToken), data: { version: draft.wedding.version, title: `${title} updated` } });
  expect(changed.status()).toBe(200);
  expect((await (await open(request, token)).json()).wedding.title).toBe(`${title} updated`);
});

test('a preview link can never be used to edit', async ({ request }) => {
  const draft = await createDraft(request, `No Edit ${randomUUID().slice(0, 8)}`);
  const token = await makeLink(request, draft);
  const read = await request.get(`/api/weddings/${draft.wedding.id}`, { headers: auth(token) });
  expect(read.status()).toBe(403);
  const write = await request.patch(`/api/weddings/${draft.wedding.id}`, { headers: auth(token), data: { version: 1, title: 'Taken over' } });
  expect(write.status()).toBe(403);
  const edit = await request.post('/api/edit-links', { headers: { 'Content-Type': 'application/json' }, data: { token } });
  expect(edit.status()).toBe(403);
  const another = await request.post(`/api/weddings/${draft.wedding.id}/preview-link`, { headers: auth(token), data: {} });
  expect(another.status()).toBe(403);
});

test('stopping sharing turns the link off, and a new link replaces the old one', async ({ request }) => {
  const draft = await createDraft(request, `Stop ${randomUUID().slice(0, 8)}`);
  const first = await makeLink(request, draft);
  const second = await makeLink(request, draft);
  expect(second).not.toBe(first);
  expect((await open(request, first)).status()).toBe(404);
  expect((await open(request, second)).status()).toBe(200);

  const stopped = await request.delete(`/api/weddings/${draft.wedding.id}/preview-link`, { headers: auth(draft.editToken) });
  expect(stopped.status()).toBe(200);
  expect((await open(request, second)).status()).toBe(404);
  expect((await open(request, 'not-a-real-token-at-all-not-a-real-token-x')).status()).toBe(404);
});

test('once the invitation is published, the preview points to the live page', async ({ request }) => {
  const draft = await createDraft(request, `Live ${randomUUID().slice(0, 8)}`);
  const token = await makeLink(request, draft);
  const slug = `preview-${randomUUID().slice(0, 8)}`;
  const published = await request.post(`/api/weddings/${draft.wedding.id}/publish`, { headers: auth(draft.editToken), data: { version: 1, slug } });
  expect(published.status()).toBe(200);
  expect((await (await open(request, token)).json()).preview.liveSlug).toBe(slug);
});

test('the preview page shows the draft with a banner, a watermark and a way to make your own, and is never indexed', async ({ page, request }) => {
  const title = `Banner ${randomUUID().slice(0, 8)}`;
  const draft = await createDraft(request, title);
  const token = await makeLink(request, draft);

  const response = await page.goto(`/draft#${token}`);
  expect(response.headers()['x-robots-tag']).toMatch(/noindex/);
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.locator('[data-draft-preview]')).toContainText(title, { timeout: 15000 });
  await expect(page.locator('[data-draft-preview]')).not.toContainText('Private rehearsal');

  const banner = page.locator('[data-draft-banner]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Draft preview');
  await expect(banner).toContainText('Not the final invitation');
  const cta = page.locator('[data-draft-cta]');
  await expect(cta).toHaveAttribute('href', /utm_source=draft-preview/);

  const watermark = page.locator('[data-draft-watermark]');
  await expect(watermark).toBeAttached();
  const style = await watermark.evaluate(el => { const s = getComputedStyle(el); return { position: s.position, events: s.pointerEvents, image: s.backgroundImage }; });
  expect(style).toMatchObject({ position: 'fixed', events: 'none' });
  expect(style.image).toContain('svg');

  // Not a live invitation: the reply form cannot send from here.
  await expect(page.locator('[data-public-invitation]')).toHaveCount(0);
  expect(await page.content()).not.toContain(draft.editToken);
  expect(await page.locator('meta[name="robots"]').first().getAttribute('content')).toMatch(/noindex/);
});

test('a preview link that was turned off says so, and offers a way to make your own', async ({ page, request }) => {
  const draft = await createDraft(request, `Gone ${randomUUID().slice(0, 8)}`);
  const token = await makeLink(request, draft);
  await request.delete(`/api/weddings/${draft.wedding.id}/preview-link`, { headers: auth(draft.editToken) });
  await page.goto(`/draft#${token}`);
  await expect(page.getByText('This preview link is not working.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: /create your own invitation/i })).toHaveAttribute('href', /utm_source=draft-preview/);
  await page.goto('/draft');
  await expect(page.getByText('This preview link is not working.')).toBeVisible({ timeout: 15000 });
});

test('in the Share dialog, the couple gets a preview link, copies it again, and can stop sharing', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
  const title = `Editor ${randomUUID().slice(0, 8)}`;
  const draft = await createDraft(request, title);
  await page.goto(`/edit#${draft.editToken}`);
  await page.getByRole('button', { name: 'Share invitation' }).click({ timeout: 20000 });
  const card = page.locator('[data-draft-preview-share]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Not ready? Friends can see a draft preview.');

  await card.getByRole('button', { name: 'Get preview link' }).click();
  // Said where the person is looking: on the button, and in a line under it (not only in a toast at the bottom of the screen).
  await expect(card.getByRole('button', { name: 'Link copied' })).toBeVisible();
  await expect(card.locator('.pub-copied')).toContainText('Copied.');
  await expect(card).toContainText('Sharing is on');
  // A few seconds later the button offers to copy again.
  await expect(card.getByRole('button', { name: 'Copy preview link' })).toBeVisible({ timeout: 10000 });
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/draft#[A-Za-z0-9_-]{43}$/);

  // Copying again gives the same link (no new link each time).
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await card.getByRole('button', { name: 'Copy preview link' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await expect(card.getByRole('button', { name: 'Link copied' })).toBeVisible();

  const token = link.split('#')[1];
  expect((await open(request, token)).status()).toBe(200);

  // Stopping asks first.
  await card.getByRole('button', { name: 'Stop sharing' }).click();
  await card.getByRole('button', { name: 'Keep sharing' }).click();
  expect((await open(request, token)).status()).toBe(200);
  await card.getByRole('button', { name: 'Stop sharing' }).click();
  await card.getByRole('button', { name: 'Yes, stop sharing' }).click();
  await expect(card.getByRole('button', { name: 'Get preview link' })).toBeVisible();
  await expect.poll(async () => (await open(request, token)).status()).toBe(404);
});

test('the share guide in the editor offers a draft preview link', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
  const draft = await createDraft(request, `Guide ${randomUUID().slice(0, 8)}`);
  await page.goto(`/edit#${draft.editToken}`);
  await page.getByRole('button', { name: 'Copy a draft preview link' }).click({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/draft#[A-Za-z0-9_-]{43}$/);
});

// On a phone the Share dialog is a sheet that scrolls. Copying the preview link must not jump it back to the top (the "Link copied"
// line was then off screen), its close button must stay reachable however far it is scrolled, and the button must read cleanly.
test('phone: getting the preview link keeps the sheet where it was and says Link copied there; the close button stays on screen', async ({ browser, request }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
  const draft = await createDraft(request, `Phone ${randomUUID().slice(0, 8)}`);
  await page.goto(`/edit#${draft.editToken}`);
  await page.getByRole('button', { name: 'Share invitation' }).first().click({ timeout: 20000 });
  const sheet = page.locator('#modal-root section.modal');
  const card = page.locator('[data-draft-preview-share]');
  await expect(card).toBeVisible();
  await page.waitForLoadState('networkidle');   // the price and the address check have arrived, so the sheet is complete
  const button = card.getByRole('button', { name: 'Get preview link' });
  // Scrolled down the sheet to where the button is (as on a phone, where the sheet is longer than the screen).
  await sheet.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(button).toBeInViewport();
  const before = await sheet.evaluate(el => el.scrollTop);
  expect(before).toBeGreaterThan(100);   // the sheet really is scrolled
  // The icon and the words sit on one line, centred.
  const parts = await button.evaluate(el => { const b = el.getBoundingClientRect(), i = el.querySelector('svg').getBoundingClientRect(); return { h: b.height, iconMid: i.top + i.height / 2, mid: b.top + b.height / 2 }; });
  expect(Math.abs(parts.iconMid - parts.mid)).toBeLessThan(3);
  expect(parts.h).toBeLessThan(56);
  await button.click();
  await expect(card.getByRole('button', { name: 'Link copied' })).toBeVisible();
  // The sheet stayed where it was, and the confirmation is on screen.
  expect(Math.abs((await sheet.evaluate(el => el.scrollTop)) - before)).toBeLessThan(40);
  await expect(card.locator('.pub-copied')).toBeInViewport();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/draft#/);
  // Scrolled down like this, the close button is still on screen, and closes the sheet.
  const close = page.getByRole('button', { name: 'Dismiss' });
  await expect(close).toBeInViewport();
  await close.click();
  await expect(sheet).toHaveCount(0);
  await context.close();
});
