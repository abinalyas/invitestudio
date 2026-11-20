// The WhatsApp share card (share-card.js): a picture and a ready message for live invitations on every design.
const { test, expect } = require('@playwright/test');

const project = {
  id: 'p1', templateId: 'lantern-night', title: 'Palash & Amruta', date: '2026-11-28', location: 'Govindmani Lawns, Thane',
  publishStatus: 'published', publicSlug: 'palash-amruta',
  functions: [
    { id: 'r', title: 'Reception', date: '2026-11-28', time: '19:30', venue: 'Govindmani Lawns, Thane', visible: true },
    { id: 'w', title: 'Wedding', date: '2026-11-27', time: '10:00', venue: 'Kochi', visible: true }
  ]
};

const openCard = page => page.evaluate(p => { window.openShareCard(p); }, project);

test('a design gets a card with the picture and a message the couple can change', async ({ page }) => {
  await page.goto('/');
  await openCard(page);
  const modal = page.locator('#modal-root');
  await expect(modal.locator('[data-sc-image]')).toBeVisible({ timeout: 15000 });
  const size = await modal.locator('[data-sc-image]').evaluate(img => [img.naturalWidth, img.naturalHeight]);
  expect(size).toEqual([1086, 1448]); // lantern-night has its own card design
  const text = modal.locator('[data-sc-text]');
  await expect(text).toHaveValue(/the Reception of Palash & Amruta/);
  await expect(text).toHaveValue(/See the full invitation: http:\/\/[\w.]+:\d+\/s\/palash-amruta/);
  // Another event rewrites the message and the picture.
  await modal.locator('[data-sc-event]').selectOption('1');
  await expect(text).toHaveValue(/the Wedding of Palash & Amruta/);
  await expect(text).toHaveValue(/📅 Friday, 27 November 2026, 10:00 AM/);
  await expect(modal.locator('[data-sc-download]')).toBeEnabled({ timeout: 15000 });
});

test('a Classic design gets a card too, with its own artwork', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(p => { window.openShareCard({ ...p, templateId: 'minimalist' }); }, project);
  const modal = page.locator('#modal-root');
  await expect(modal.locator('[data-sc-image]')).toBeVisible({ timeout: 15000 });
  expect(await modal.locator('[data-sc-image]').evaluate(img => [img.naturalWidth, img.naturalHeight])).toEqual([1086, 1448]);
  await expect(modal.locator('[data-sc-locked]')).toHaveCount(0);
});

test('with no event details yet, the dialog asks for them', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(p => { window.openShareCard({ ...p, date: '', location: '', functions: [] }); }, project);
  await expect(page.locator('#modal-root [data-sc-empty]')).toBeVisible();
});
