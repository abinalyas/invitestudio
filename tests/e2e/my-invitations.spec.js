// The My invitations page: filter chips with counts, sort, cards with an Edit button and icon actions, and a real "Edited" date.
const { test, expect } = require('@playwright/test');

async function seed(page, list) {
  await page.goto('/');
  await page.evaluate(list => {
    localStorage.clear();
    const now = Date.now();
    const projects = list.map(([id, name, status, ago]) => ({ id, name, title: name, category: 'Wedding', templateId: 'minimalist', status, functions: [], photos: [], editedAt: now - ago }));
    localStorage.setItem('invitestudio-projects', JSON.stringify(projects));
    // eslint-disable-next-line no-undef
    state.projects = projects; state.page = 'dashboard'; render();
  }, list);
  await expect(page.locator('main.dash h1')).toHaveText('My invitations');
}

const LIST = [['a', 'Zara and Zed', 'Draft', 5000], ['b', 'Meera and Abin', 'Published', 1000], ['c', 'Asha and Ben', 'Draft', 90000000]];
const names = page => page.locator('article.dash-card h3').allTextContents();

test('filter chips show counts and filter the cards', async ({ page }) => {
  await seed(page, LIST);
  await expect(page.getByRole('button', { name: /All invitations\s*3/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Drafts\s*2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Published\s*1/ })).toBeVisible();
  expect(await names(page)).toHaveLength(3);
  await page.getByRole('button', { name: /Published\s*1/ }).click();
  expect(await names(page)).toEqual(['Meera and Abin']);
  await page.getByRole('button', { name: /Drafts\s*2/ }).click();
  expect((await names(page)).sort()).toEqual(['Asha and Ben', 'Zara and Zed']);
  await expect(page.getByRole('button', { name: /Drafts\s*2/ })).toHaveAttribute('aria-pressed', 'true');
});

test('sorting: last edited first by default, or by name', async ({ page }) => {
  await seed(page, LIST);
  expect(await names(page)).toEqual(['Meera and Abin', 'Zara and Zed', 'Asha and Ben']);
  await page.getByLabel('Sort by').selectOption('name');
  expect(await names(page)).toEqual(['Asha and Ben', 'Meera and Abin', 'Zara and Zed']);
});

test('each card has Edit, Preview, Duplicate and Delete, and a readable edited date', async ({ page }) => {
  await seed(page, LIST);
  const card = page.locator('article.dash-card', { hasText: 'Meera and Abin' });
  await expect(card.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  for (const label of ['Preview', 'Duplicate', 'Delete']) await expect(card.getByRole('button', { name: label, exact: true })).toBeVisible();
  await expect(card.locator('.dash-tag')).toHaveText('Published');
  await expect(card.locator('.dash-edited')).toContainText(/Edited [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM)/);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
});

test('there is no grid/list switch, and the new-invitation card goes to the designs', async ({ page }) => {
  await seed(page, LIST);
  await expect(page.getByRole('button', { name: /list view|grid view/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Start a new invitation/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator('.figma-island-host')).toBeVisible();
});

test('editing stamps the edit time; just opening does not', async ({ page }) => {
  await seed(page, [['a', 'Meera and Abin', 'Draft', 3 * 86400000]]);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('invitestudio-projects'))[0].editedAt);
  await page.evaluate(() => { save(); });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('invitestudio-projects'))[0].editedAt)).toBe(before);
  await page.evaluate(() => { state.projects[0].title = 'Meera and Abin Jacob'; save(); });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('invitestudio-projects'))[0].editedAt);
  expect(after).toBeGreaterThan(before + 86400000);
});

test('the whole card opens the editor, but its own buttons do their own job', async ({ page }) => {
  await seed(page, LIST);
  const card = page.locator('article.dash-card', { hasText: 'Meera and Abin' });
  await card.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect.poll(() => page.evaluate(() => state.page)).toBe('preview');
  await page.evaluate(() => { state.page = 'dashboard'; render(); });
  await page.locator('article.dash-card', { hasText: 'Meera and Abin' }).locator('h3').click();
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
});

test('a server-saved invitation shows a readable edited date, not a raw timestamp', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    const p = { id: 'a', name: 'Meera and Abin', title: 'Meera and Abin', category: 'Wedding', templateId: 'minimalist', status: 'Draft', functions: [], photos: [], updated: '2026-11-17T12:37:27.457706+00:00' };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.page = 'dashboard'; render();
  });
  const text = await page.locator('article.dash-card .dash-edited').innerText();
  expect(text).toMatch(/^Edited [A-Z][a-z]{2} \d{1,2}, 2026, \d{1,2}:\d{2} (AM|PM)$/);
  expect(text).not.toContain('T12:37');
});

for (const width of [1600, 1280]) {
  test(`all four card buttons sit on one row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, LIST);
    const card = page.locator('article.dash-card').first();
    const tops = await card.locator('.dash-actions > button').evaluateAll(buttons => buttons.map(b => Math.round(b.getBoundingClientRect().top)));
    expect(tops).toHaveLength(4);
    expect(new Set(tops).size).toBe(1);
  });
}
