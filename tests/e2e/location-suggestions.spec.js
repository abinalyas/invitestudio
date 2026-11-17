// The location fields suggest main cities (a bundled list), and still accept anything typed.
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

test('setup location offers city suggestions, and free text still works', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  const field = page.locator('#projectLocation');
  const listId = await field.getAttribute('list');
  expect(listId).toBeTruthy();
  // The suggestions sit in the same screen as the field, so the browser can match them up.
  const options = await field.evaluate((el, id) => [...el.getRootNode().querySelectorAll(`datalist#${id} option`)].map(o => o.value), listId);
  expect(options.length).toBeGreaterThan(150);
  for (const city of ['Kochi, Kerala', 'Thiruvananthapuram, Kerala', 'Mumbai, Maharashtra', 'Dubai, UAE', 'London, United Kingdom', 'New York, USA']) expect(options).toContain(city);
  await page.locator('#projectTitle').fill('Mira & Arun');
  await field.fill('St. Mary’s Hall, Kakkanad');
  await expect(field).toHaveValue('St. Mary’s Hall, Kakkanad');
  await field.fill('Kochi, Kerala');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('invitestudio-projects') || '[]')[0] || {}).location)).toBe('Kochi, Kerala');
});

test('the editor location field has the same suggestions', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  const field = page.locator('input[list="invitestudio-places"]').first();
  await expect(field).toHaveCount(1);
  const count = await field.evaluate((el) => el.getRootNode().querySelectorAll('datalist#invitestudio-places option').length);
  expect(count).toBeGreaterThan(150);
});
