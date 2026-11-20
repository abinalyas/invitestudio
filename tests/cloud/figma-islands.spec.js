// Frontend integration tests for the Figma Make islands, against the real cloud stack.
// Islands render inside open shadow roots; Playwright locators pierce those by default.
const { test, expect } = require('@playwright/test');
const { openLatestDraft, quickStart } = require('../support/setup');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

// Design number (the address /templates/<number>) -> expected backend template id (figma/islands/shared.tsx).
const EXPECTED_TEMPLATES = {
  14: { backend: 'minimalist', name: 'Minimalist' },
  15: { backend: 'cinematic', name: 'Cinematic' },
  16: { backend: 'fairy-tale', name: 'Fairy Tale' },
  18: { backend: 'bloom-reveal', name: 'Bloom Reveal' },
  19: { backend: 'velvet-reveal', name: 'Velvet Reveal' },
  20: { backend: 'under-the-same-moon', name: 'Under the Same Moon' },
  21: { backend: 'golden-butterfly', name: 'Golden Butterfly' },
  22: { backend: 'cherry-blossom', name: 'Cherry Blossom' },
  23: { backend: 'lantern-night', name: 'Lantern Night' }
};
const FIRST = 14;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

async function dbQuery(sql, params) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.end();
  }
}

async function useTemplate(page, number) {
  await page.goto(`/templates/${number}`);
  await expect(page.getByRole('heading', { name: EXPECTED_TEMPLATES[number].name }).first()).toBeVisible({ timeout: 15000 });
  // Skip the setup steps and open the editor on this design.
  await quickStart(page, number);
  await expect(page).toHaveURL(new RegExp(`/editor/${number}$`), { timeout: 15000 });
  // The old full editor is gone: the designer is the only editor.
  await expect(page.locator('button', { hasText: /advanced editing/i })).toHaveCount(0);
}
const sections = page => page.locator('.editor-pages');

test('the home design renders, and only weddings are offered at launch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /create a wedding/i })).toBeVisible({ timeout: 15000 });
  // Launch scope is weddings only (docs/PRODUCT_DECISIONS.md, section 4): no other occasion is offered.
  await expect(page.getByRole('region', { name: /choose an occasion/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /birthday|baptism|engagement/i })).toHaveCount(0);
});

test('the primary action takes a visitor to the designs, and every design is listed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /start your invitation/i }).first().click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole('heading', { name: /find the perfect invitation/i })).toBeVisible({ timeout: 15000 });
  for (const { name } of Object.values(EXPECTED_TEMPLATES)) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  }
});

test('each Figma design maps to its backend template when a website is created', async ({ page }) => {
  for (const number of Object.keys(EXPECTED_TEMPLATES)) {
    await useTemplate(page, Number(number));
    const title = `Mapped ${number} ${randomUUID().slice(0, 6)}`;
    await page.getByLabel('Couple or celebration names').fill(title);
    await expect.poll(async () => (await dbQuery('select template_id from weddings where title = $1', [title])).length, { timeout: 20000 }).toBe(1);
    const [row] = await dbQuery('select template_id from weddings where title = $1', [title]);
    expect(row.template_id).toBe(EXPECTED_TEMPLATES[number].backend);
  }
});

test('editor fields save to the cloud draft and the save status follows', async ({ page }) => {
  await useTemplate(page, 14);
  const title = `Fields ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await page.getByLabel(/^Location \(optional\)/).fill('Kochi, Kerala');
  await page.getByLabel(/^Date \(optional\)/).fill('2027-02-14');
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });

  await expect.poll(async () => (await dbQuery('select title, location, event_date::text as event_date from weddings where title = $1', [title]))[0]?.event_date ?? null, { timeout: 20000 }).toBe('2027-02-14');
  const [row] = await dbQuery('select title, location from weddings where title = $1', [title]);
  expect(row.location).toBe('Kochi, Kerala');
});

test('the canvas shows the real invitation, and the story toggle hides it on the invitation', async ({ page }) => {
  await useTemplate(page, 14);
  const title = `Canvas ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await expect(page.locator('.invitation-canvas')).toContainText(title, { timeout: 15000 });

  await sections(page).getByRole('button', { name: /our story/i }).click();
  await page.getByLabel('Show Our story on the invitation').uncheck();
  await expect.poll(async () => {
    const [row] = await dbQuery('select sections from weddings where title = $1', [title]);
    return row?.sections?.find(section => section.id === 'story')?.visible ?? null;
  }, { timeout: 20000 }).toBe(false);
});

test('a new draft keeps the design\'s own pictures: no hero image is saved, and the photos panel offers uploads', async ({ page }) => {
  await useTemplate(page, 15);
  const title = `Hero ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });
  await sections(page).getByRole('button', { name: /^Photos/ }).click();
  await expect(page.getByText(/No photos yet/i)).toBeVisible();
  await expect(page.getByLabel('Add photos to the gallery')).toHaveCount(1); // the gallery's button; the design's own pictures have theirs
  const [row] = await dbQuery(`select preferences->>'heroImageUrl' as url from weddings where title = $1`, [title]);
  expect(row.url).toBeNull();
});

test('returning to the site offers to continue the draft', async ({ page }) => {
  await useTemplate(page, 16);
  const title = `Continue ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });
  await page.goto('/');
  const banner = page.getByRole('region', { name: /continue your draft/i }).or(page.locator('section[aria-label="Continue your draft"]'));
  await expect(banner).toBeVisible({ timeout: 15000 });
  await openLatestDraft(page);
  await expect(page.getByLabel('Couple or celebration names')).toHaveValue(title, { timeout: 15000 });
});

test('the editor publishes through the existing dialog and the link is shared', async ({ page }) => {
  await useTemplate(page, 19);
  const title = `Publish ${randomUUID().slice(0, 6)}`;
  const slug = `figma-${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
  await page.locator('#publishSlug').fill(slug);
  await page.getByRole('button', { name: 'Make it live' }).click();
  await expect(page.locator('#modal-root h2')).toHaveText(/your invitation is live/i, { timeout: 20000 });

  const guest = await page.context().browser().newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`/s/${slug}`);
  await expect(guestPage.locator('[data-public-invitation]')).toContainText(title, { timeout: 15000 });
  await guest.close();
});

for (const width of [320, 375, 768, 1280]) {
  test(`island screens have no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /create a wedding/i })).toBeVisible({ timeout: 15000 });
    const overflows = async () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await overflows(), 'home').toBe(false);
    await page.goto('/templates');
    await expect(page.getByText(EXPECTED_TEMPLATES[FIRST].name, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    expect(await overflows(), 'templates').toBe(false);
    await useTemplate(page, 20);
    expect(await overflows(), 'editor').toBe(false);
  });
}
