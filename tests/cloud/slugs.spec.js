// Web address (slug) behaviour: availability, suggestions, duplicates, preservation when
// editing, and the guarded change of a live address. See docs/SLUGS.md.
const { completeSetupSteps } = require('../support/setup');
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

const unique = () => `s-${randomUUID().slice(0, 8)}`;

async function createDraft(request, title = 'Slug Couple') {
  const response = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `slug-${randomUUID()}` },
    data: { templateId: 'eternal', title }
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function publish(request, draft, slug, extra = {}) {
  return request.post(`/api/weddings/${draft.wedding.id}/publish`, {
    headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' },
    data: { version: draft.wedding.version ?? 1, slug, ...extra }
  });
}

test.describe('availability', () => {
  test('a free address is reported as available', async ({ request }) => {
    const draft = await createDraft(request);
    const slug = unique();
    const response = await request.get(`/api/weddings/${draft.wedding.id}/slug-availability?slug=${slug}`, {
      headers: { Authorization: `Bearer ${draft.editToken}` }
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).available).toBe(true);
  });

  test('a taken address is reported with free alternatives', async ({ request }) => {
    const slug = unique();
    const first = await createDraft(request, 'First');
    expect((await publish(request, first, slug)).status()).toBe(200);
    const second = await createDraft(request, 'Second');
    const body = await (await request.get(`/api/weddings/${second.wedding.id}/slug-availability?slug=${slug}`, {
      headers: { Authorization: `Bearer ${second.editToken}` }
    })).json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe('taken');
    expect(body.suggestions.length).toBeGreaterThan(0);
    for (const suggestion of body.suggestions) {
      expect(suggestion.startsWith(`${slug}-`)).toBe(true);
    }
  });

  test('the live address of the same website is available to it', async ({ request }) => {
    const slug = unique();
    const draft = await createDraft(request);
    expect((await publish(request, draft, slug)).status()).toBe(200);
    const body = await (await request.get(`/api/weddings/${draft.wedding.id}/slug-availability?slug=${slug}`, {
      headers: { Authorization: `Bearer ${draft.editToken}` }
    })).json();
    expect(body.available).toBe(true);
  });

  test('a reserved or malformed address is invalid, with a reason', async ({ request }) => {
    const draft = await createDraft(request);
    for (const slug of ['api', 'Bad_Slug', '']) {
      const body = await (await request.get(`/api/weddings/${draft.wedding.id}/slug-availability?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${draft.editToken}` }
      })).json();
      expect(body.available, slug).toBe(false);
      expect(body.reason, slug).toBe('invalid');
    }
  });

  test('availability needs the website\'s edit token', async ({ request }) => {
    const draft = await createDraft(request);
    expect((await request.get(`/api/weddings/${draft.wedding.id}/slug-availability?slug=${unique()}`)).status()).toBe(401);
  });
});

test.describe('live address', () => {
  test('editing invitation content keeps the published address', async ({ request }) => {
    const slug = unique();
    const draft = await createDraft(request);
    expect((await publish(request, draft, slug)).status()).toBe(200);
    const patched = await request.patch(`/api/weddings/${draft.wedding.id}`, {
      headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' },
      data: { version: 2, title: 'Edited title' }
    });
    expect(patched.status()).toBe(200);
    expect((await patched.json()).wedding.slug).toBe(slug);
    expect((await request.get(`/api/public-weddings/${slug}`)).status()).toBe(200);
    // The address is not writable through content edits at all.
    const attempted = await request.patch(`/api/weddings/${draft.wedding.id}`, {
      headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' },
      data: { version: 3, slug: 'attempted-change' }
    });
    expect(attempted.status()).toBe(422);
  });

  test('changing a live address requires confirmation, then the old address stops working', async ({ request }) => {
    const oldSlug = unique();
    const newSlug = unique();
    const draft = await createDraft(request);
    expect((await publish(request, draft, oldSlug)).status()).toBe(200);
    const version = (await (await request.get(`/api/weddings/${draft.wedding.id}`, { headers: { Authorization: `Bearer ${draft.editToken}` } })).json()).wedding.version;

    const refused = await publish(request, { ...draft, wedding: { ...draft.wedding, version } }, newSlug);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error.code).toBe('SLUG_CHANGE_CONFIRMATION_REQUIRED');
    expect((await request.get(`/api/public-weddings/${oldSlug}`)).status()).toBe(200);

    const changed = await publish(request, { ...draft, wedding: { ...draft.wedding, version } }, newSlug, { confirmSlugChange: true });
    expect(changed.status()).toBe(200);
    expect((await request.get(`/api/public-weddings/${oldSlug}`)).status()).toBe(404);
    expect((await request.get(`/api/public-weddings/${newSlug}`)).status()).toBe(200);
  });
});

test.describe('publishing dialog', () => {
  test('a taken address shows the conflict and an alternative, which then publishes', async ({ page, request }) => {
    const taken = unique();
    const other = await createDraft(request, 'Taken owner');
    expect((await publish(request, other, taken)).status()).toBe(200);

    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => startCreate('Wedding'));
    await page.locator('#projectTitle').fill(`Dialog ${randomUUID().slice(0, 6)}`);
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('invitestudio-projects') || '[]')[0] || {}).cloudStatus), { timeout: 20000 }).toBe('saved');

    await page.evaluate(() => openPublish());
    await page.locator('#publishSlug').fill(taken);
    await expect(page.locator('#slug-status')).toContainText(/already in use/i, { timeout: 10000 });
    const suggestion = page.locator('[data-use-suggestion]').first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(page.locator('#slug-status')).toContainText(/available/i, { timeout: 10000 });
    await page.getByRole('button', { name: 'Make it live' }).click();
    await expect(page.locator('#modal-root h2')).toHaveText(/your invitation is live/i, { timeout: 20000 });
  });

  test('a live address can be changed only after the warning is acknowledged', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => startCreate('Wedding'));
    await page.locator('#projectTitle').fill(`Change ${randomUUID().slice(0, 6)}`);
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('invitestudio-projects') || '[]')[0] || {}).cloudStatus), { timeout: 20000 }).toBe('saved');
    const firstSlug = unique();
    await page.evaluate(() => openPublish());
    await page.locator('#publishSlug').fill(firstSlug);
    await expect(page.locator('#slug-status')).toContainText(/available/i, { timeout: 10000 });
    await page.getByRole('button', { name: 'Make it live' }).click();
    await expect(page.locator('#modal-root h2')).toHaveText(/your invitation is live/i, { timeout: 20000 });

    await page.getByRole('button', { name: /change web address/i }).click();
    await expect(page.locator('#modal-root')).toContainText(/old address will stop working/i);
    const update = page.getByRole('button', { name: /change address and update/i });
    await page.locator('#publishSlug').fill(unique());
    await expect(update).toBeDisabled();
    await page.getByLabel(/i understand the old link will stop working/i).check();
    await expect(page.locator('#slug-status')).toContainText(/available/i, { timeout: 10000 });
    await expect(update).toBeEnabled();
    await update.click();
    await expect(page.locator('#modal-root h2')).toHaveText(/your invitation is live/i, { timeout: 20000 });
    const old = await page.request.get(`/api/public-weddings/${firstSlug}`);
    expect(old.status()).toBe(404);
  });
});
