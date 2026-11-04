// Frontend integration tests for the Figma Make islands, against the real cloud stack.
// Islands render inside open shadow roots; Playwright locators pierce those by default.
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

// Figma design id -> expected backend template id (figma/islands/shared.tsx).
const EXPECTED_TEMPLATES = {
  1: { backend: 'romantic-garden-wedding', name: 'Forest Elegance' },
  2: { backend: 'ivory-heirloom', name: 'Kerala Traditions' },
  3: { backend: 'soft-pastels-wedding', name: 'Spring Blossom' },
  4: { backend: 'black-tie-wedding', name: 'Evening Soirée' },
  5: { backend: 'destination-wedding', name: 'Coastal Romance' },
  6: { backend: 'modern-minimal-wedding', name: 'Modern Minimal' },
  7: { backend: 'contemporary-floral-wedding', name: 'Lotus Reverie' },
  8: { backend: 'contemporary-editorial-wedding', name: 'Destination Hills' }
};

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
  await expect(page.getByRole('heading', { name: EXPECTED_TEMPLATES[number].name })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /use this template/i }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${number}$`), { timeout: 15000 });
  await expect(page.getByRole('button', { name: /advanced editing/i })).toBeVisible();
}

test('the home design renders, and only weddings are offered at launch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /create a wedding/i })).toBeVisible({ timeout: 15000 });
  // Launch scope is weddings only (docs/PRODUCT_DECISIONS.md, section 4): no other occasion is offered.
  await expect(page.getByRole('region', { name: /choose an occasion/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /birthday|baptism|engagement/i })).toHaveCount(0);
});

test('the primary action opens the existing setup flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /start your invitation/i }).click();
  await expect(page.getByRole('heading', { name: /create your invitation/i })).toBeVisible();
});

test('the templates page shows the eight designs, and the full catalogue stays reachable', async ({ page }) => {
  await page.goto('/templates');
  for (const { name } of Object.values(EXPECTED_TEMPLATES)) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  }
  await page.getByRole('button', { name: /browse every design/i }).click();
  await expect(page.getByText(/find the feeling/i)).toBeVisible();
});

test('each Figma design maps to its backend template when a website is created', async ({ page }) => {
  for (const number of Object.keys(EXPECTED_TEMPLATES)) {
    await useTemplate(page, Number(number));
    const title = `Mapped ${number} ${randomUUID().slice(0, 6)}`;
    await page.getByLabel('Couple names').fill(title);
    await expect.poll(async () => (await dbQuery('select template_id from weddings where title = $1', [title])).length, { timeout: 20000 }).toBe(1);
    const [row] = await dbQuery('select template_id from weddings where title = $1', [title]);
    expect(row.template_id).toBe(EXPECTED_TEMPLATES[number].backend);
  }
});

test('editor fields save to the cloud draft and the save status follows', async ({ page }) => {
  await useTemplate(page, 1);
  const title = `Fields ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple names').fill(title);
  await page.getByLabel('Location').fill('Kochi, Kerala');
  await page.getByLabel('Date').fill('2027-02-14');
  await expect(page.getByRole('button', { name: /saved/i })).toBeVisible({ timeout: 20000 });

  await expect.poll(async () => (await dbQuery('select title, location, event_date::text as event_date from weddings where title = $1', [title]))[0]?.event_date ?? null, { timeout: 20000 }).toBe('2027-02-14');
  const [row] = await dbQuery('select title, location from weddings where title = $1', [title]);
  expect(row.location).toBe('Kochi, Kerala');
});

test('the canvas shows the real invitation, and the story toggle hides it on the invitation', async ({ page }) => {
  await useTemplate(page, 2);
  const title = `Canvas ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple names').fill(title);
  await expect(page.locator('.invitation-canvas')).toContainText(title, { timeout: 15000 });

  await page.getByRole('button', { name: 'Our Story' }).click();
  await page.getByLabel('Show Our Story on the invitation').uncheck();
  await expect.poll(async () => {
    const [row] = await dbQuery('select sections from weddings where title = $1', [title]);
    return row?.sections?.find(section => section.id === 'story')?.visible ?? null;
  }, { timeout: 20000 }).toBe(false);
});

test('hero images are locked until media storage exists, and no image preference is saved', async ({ page }) => {
  await useTemplate(page, 3);
  const title = `Hero ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple names').fill(title);
  await expect(page.getByRole('button', { name: /saved/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByLabel('Image')).toBeDisabled();
  await expect(page.getByText(/unlock when photo storage is available/i)).toBeVisible();
  const [row] = await dbQuery(`select preferences->>'heroImageUrl' as url from weddings where title = $1`, [title]);
  expect(row.url).toBeNull();
});

test('returning to the site offers to continue the draft', async ({ page }) => {
  await useTemplate(page, 4);
  const title = `Continue ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple names').fill(title);
  await expect(page.getByRole('button', { name: /saved/i })).toBeVisible({ timeout: 20000 });
  await page.goto('/');
  const banner = page.getByRole('region', { name: /continue your draft/i });
  await expect(banner).toBeVisible({ timeout: 15000 });
  await banner.getByRole('button', { name: /continue editing/i }).click();
  await expect(page.getByLabel('Couple names')).toHaveValue(title, { timeout: 15000 });
});

test('advanced editing opens the full editor, and the designer view returns', async ({ page }) => {
  await useTemplate(page, 5);
  await page.getByRole('button', { name: /advanced editing/i }).click();
  await expect(page.locator('.editor-rail')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /designer view/i }).click();
  await expect(page.getByLabel('Couple names')).toBeVisible({ timeout: 15000 });
});

test('the editor publishes through the existing dialog and the link is shared', async ({ page }) => {
  await useTemplate(page, 6);
  const title = `Publish ${randomUUID().slice(0, 6)}`;
  const slug = `figma-${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple names').fill(title);
  await expect(page.getByRole('button', { name: /saved/i })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.locator('#publishSlug').fill(slug);
  await page.getByRole('button', { name: 'Publish invitation' }).click();
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
    await expect(page.getByText(EXPECTED_TEMPLATES[1].name, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    expect(await overflows(), 'templates').toBe(false);
    await useTemplate(page, 7);
    expect(await overflows(), 'editor').toBe(false);
  });
}
