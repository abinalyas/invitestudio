// People-friendly wording: the first editor section is "Cover" (not "Home"), and the editor avoids website/cloud jargon.
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

test('the editor calls the first section Cover and explains it', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  await expect(page.getByRole('button', { name: /^Cover\b/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Home\b/ })).toHaveCount(0);
  await expect(page.getByText('The first thing guests see')).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\bhero\b/i);
  expect(text).not.toMatch(/your website/i);
  expect(text).not.toMatch(/cloud/i);
});

test('save status labels do not mention the cloud', async ({ page }) => {
  await page.goto('/');
  const labels = await page.evaluate(() => ['creating', 'saving', 'error', 'token-missing'].map(status => cloudSaveLabel({ cloudStatus: status, cloudId: 'x' })));
  for (const label of labels) expect(label).not.toMatch(/cloud/i);
});
