const { test, expect } = require('@playwright/test');
const { join } = require('node:path');

// The static test server does not have Cloudflare Pages' application-shell fallback.
test.beforeEach(async ({ page }) => {
  await page.route(url => /^\/templates\/\d+$/.test(url.pathname), route =>
    route.fulfill({ path: join(__dirname, '../../index.html'), contentType: 'text/html' }));
});

test('a phone visitor can try the full-screen sample and start a clean draft with that design', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const changes = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/(weddings|public-weddings)(\/|$)/.test(request.url())) changes.push(request.url());
  });
  await page.goto('/templates/18?view=sample&utm_source=instagram&utm_medium=bio&utm_campaign=launch');
  const preview = page.getByRole('region', { name: 'Bloom Reveal sample invitation' });
  const useDesign = page.getByRole('button', { name: 'Use this design' });
  await expect(useDesign).toBeInViewport();
  await expect(preview.locator('[data-section="hero"]')).toContainText('Daniel');
  await expect(preview.locator('[data-section="functions"]')).toContainText('Dinner and dancing');
  await expect(preview.locator('[data-section="gallery"] img').first()).toBeAttached();
  expect(await preview.evaluate(el => el.clientWidth)).toBe(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);

  await preview.locator('[data-rsvp-open]').click();
  await expect(page.getByRole('button', { name: 'Send reply' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close' }).click();
  expect(changes).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('invitestudio-projects') || '[]'))).toEqual([]);

  await useDesign.click();
  await expect(page.locator('#projectTitle')).toBeVisible();
  await expect(page.locator('#projectTitle')).toHaveValue('');
  expect(await page.evaluate(() => state.selectedTemplate)).toBe('bloom-reveal');
});

test('design details lead to the matching full-screen sample on desktop', async ({ page }) => {
  await page.goto('/templates/14');
  await page.getByRole('link', { name: 'View full-screen sample' }).click();
  await expect(page.getByRole('heading', { name: 'Minimalist · Sample' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use this design' })).toBeInViewport();
  await page.getByRole('link', { name: 'Design details' }).click();
  await expect(page).toHaveURL(/\/templates\/14$/);
  await expect(page.getByRole('heading', { name: 'Minimalist', exact: true })).toBeVisible();
});
