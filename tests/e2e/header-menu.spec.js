// The home page header: no "Features" link (it only scrolled to the designs), and on a phone the menu button sits at the far right.
const { test, expect } = require('@playwright/test');

test.describe('header menu', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const hasInvitation of [false, true]) {
    test(`on a phone the menu button is at the right ${hasInvitation ? 'with' : 'without'} a saved invitation`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate(has => {
        localStorage.clear();
        if (has) localStorage.setItem('invitestudio-projects', JSON.stringify([{ id: 'p1', name: 'Mira & Arun', title: 'Mira & Arun', category: 'Wedding', templateId: 'minimalist', status: 'Draft', functions: [], photos: [] }]));
      }, hasInvitation);
      await page.reload();
      const menu = page.getByRole('button', { name: 'Toggle menu' }).first();
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box.x + box.width).toBeGreaterThan(390 - 30); // within the right-hand gutter
      const logo = await page.locator('.site-header .logo').first().boundingBox();
      expect(logo.x).toBeLessThan(40);
      // Whatever sits between the logo and the menu button is to the left of the menu button, never to its right.
      const actions = await page.locator('.site-header .header-actions').first().boundingBox();
      expect(actions.x + actions.width).toBeLessThanOrEqual(box.x + 1);
    });
  }
});

test('the header menu has no Features link', async ({ page }) => {
  await page.goto('/');
  const links = await page.locator('.site-header .nav a').allTextContents();
  expect(links.map(t => t.trim())).toEqual(['Templates', 'How it works', 'Pricing']);
});
