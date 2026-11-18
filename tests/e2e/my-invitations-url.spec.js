// The My invitations page has its own address, so refreshing the browser keeps the person on it instead of sending them home.
const path = require('path');
const { test, expect } = require('@playwright/test');

// The test server is a plain static one: serve the app for this address the way the real site does.
async function serveApp(page) {
  await page.route('**/my-invitations', route => route.fulfill({ path: path.join(__dirname, '..', '..', 'index.html'), contentType: 'text/html; charset=utf-8' }));
}

async function seed(page, count) {
  await page.goto('/');
  await page.evaluate(count => {
    localStorage.clear();
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const projects = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Couple ${i}`, title: `Couple ${i}`, category: 'Wedding', templateId: 'minimalist', status: 'Draft', functions: [], photos: [], editedAt: Date.now() - i * 1000 }));
    localStorage.setItem('invitestudio-projects', JSON.stringify(projects));
  }, count);
}

test('opening My invitations gives it an address, and a refresh stays on the page', async ({ page }) => {
  await serveApp(page);
  await seed(page, 2);
  await page.reload();
  await page.getByRole('button', { name: /my invitations/i }).first().click();
  await expect(page.locator('main.dash h1')).toHaveText('My invitations');
  expect(new URL(page.url()).pathname).toBe('/my-invitations');
  await page.reload();
  await expect(page.locator('main.dash h1')).toHaveText('My invitations', { timeout: 15000 });
  expect(new URL(page.url()).pathname).toBe('/my-invitations');
});

test('going back to the home page takes the My invitations address away', async ({ page }) => {
  await serveApp(page);
  await seed(page, 1);
  await page.evaluate(() => { state.page = 'dashboard'; render(); }); // eslint-disable-line no-undef
  expect(new URL(page.url()).pathname).toBe('/my-invitations');
  await page.evaluate(() => { go('home'); }); // eslint-disable-line no-undef
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
});

test('the address with no invitations on this device shows the home page', async ({ page }) => {
  await serveApp(page);
  await seed(page, 0);
  await page.goto('/my-invitations');
  await expect(page.locator('main.dash h1')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
});
