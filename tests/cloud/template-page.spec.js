// The design's own page: one clear next step, with a plain line about what comes next and no second path.
const { test, expect } = require('@playwright/test');

test('the template page has one clear next step and no "quick start" second path', async ({ page }) => {
  await page.goto('/templates/14');
  await expect(page.getByRole('button', { name: 'Start with this design' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Next: your names, date and place. It takes about a minute, and you can edit your details afterwards.')).toBeVisible();
  await expect(page.getByRole('button', { name: /quick start/i })).toHaveCount(0);
  await expect(page.getByText(/skip setup|guided setup/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Start with this design' }).click();
  await expect(page.getByRole('heading', { name: /create your invitation/i })).toBeVisible();
});
