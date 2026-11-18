// The home page leads with the promise: preview your own invitation free, pay only when you make it live (and it is true to how the product works).
const { test, expect } = require('@playwright/test');

const PROMISE = 'Preview your own invitation free. Pay only when you make it live.';

test('desktop: the promise is under the headline and above the buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const promise = page.locator('.hero-promise');
  await expect(promise).toHaveText(PROMISE, { timeout: 15000 });
  const [p, button] = await Promise.all([promise.boundingBox(), page.locator('.hero-buttons .button').first().boundingBox()]);
  expect(p.y).toBeLessThan(button.y);
  expect(p.y + p.height).toBeLessThan(800); // in view without scrolling
});

test.describe('phone', () => {
  test('the promise is in view with the start button, and the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto('/');
    const promise = page.locator('.hero-promise');
    await expect(promise).toHaveText(PROMISE, { timeout: 15000 });
    await expect(promise).toBeInViewport();
    await expect(page.locator('.hero-buttons .button').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.trust-row')).toContainText('Free to build and preview');
  });
});
