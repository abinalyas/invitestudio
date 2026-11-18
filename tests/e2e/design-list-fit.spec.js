// The list of designs in the editor's left panel: every card is tall enough for its picture (so the selection outline is never covered),
// and the list opens scrolled to the current design.
const { test, expect } = require('@playwright/test');

async function openList(page, templateId) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.evaluate(templateId => {
    localStorage.clear();
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const p = { id: 'e1', name: 'Mira', category: 'Wedding', templateId, status: 'Draft', title: 'Mira & Arun', date: '2027-06-19', location: 'Kochi', message: '', hosts: '', story: '', photos: [], functions: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' } };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
  }, templateId);
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Change design/ }).click();
  await expect(page.getByRole('group', { name: 'Designs' })).toBeVisible();
}

test('every design card is tall enough for its picture, so the selection outline is not covered', async ({ page }) => {
  await openList(page, 'minimalist');
  const cards = page.locator('.design-option');
  const count = await cards.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i++) {
    const sizes = await cards.nth(i).evaluate(el => {
      const img = el.querySelector('img, .design-thumb-empty').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { picture: img.height, card: box.height, topGap: img.top - box.top, bottomGap: box.bottom - img.bottom };
    });
    expect(sizes.card).toBeGreaterThanOrEqual(sizes.picture + 8);
    expect(sizes.topGap).toBeGreaterThanOrEqual(4);
    expect(sizes.bottomGap).toBeGreaterThanOrEqual(4);
  }
});

test('the list opens scrolled to the current design', async ({ page }) => {
  await openList(page, 'lantern-night');
  const selected = page.locator('.design-option.selected');
  await expect(selected).toBeVisible();
  const inside = await page.locator('.design-list').evaluate(list => {
    const box = list.getBoundingClientRect();
    const current = list.querySelector('.design-option.selected').getBoundingClientRect();
    return current.top >= box.top - 1 && current.bottom <= box.bottom + 1;
  });
  expect(inside).toBe(true);
});
