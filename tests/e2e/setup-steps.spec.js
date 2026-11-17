// The "Create your invitation" stepper has three steps: the design is already chosen before it opens, so there is no Template step.
const { test, expect } = require('@playwright/test');

test('setup has three steps, no design chooser, and no Change button', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startSetup('minimalist'));
  await expect(page.locator('#projectTitle')).toBeVisible();
  await expect(page.locator('.setup-steps li')).toHaveText([/Essentials/, /Story and details/, /Ready/]);
  await expect(page.locator('.setup-selected')).toContainText('Minimalist');
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0);
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.getByRole('heading', { name: /story and details/i })).toBeVisible();
  await expect(page.getByText('Choose a design')).toHaveCount(0);
  await expect(page.locator('.setup-template')).toHaveCount(0);
});

test('Create an invitation on the dashboard goes to the designs first', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); go('dashboard'); });
  await page.getByRole('button', { name: /Create an invitation/ }).click();
  await expect.poll(() => page.evaluate(() => state.page)).toBe('templates');
});
