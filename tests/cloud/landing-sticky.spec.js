// The guide pages (functions/_shared/landing.js) on a phone: their buttons are at the top and in one box near the end, so once the top
// buttons have scrolled away "Choose a template" waits at the bottom of the screen, down to the footer. It steps aside while the box's
// own button is on screen. Wide screens have no bar.
const { test, expect } = require('@playwright/test');

const GUIDES = ['/wedding-invitation-website', '/digital-wedding-invitation', '/online-wedding-invitation-with-rsvp', '/animated-wedding-invitation', '/whatsapp-wedding-invitation'];

for (const path of GUIDES) {
  test(`phone ${path}: a way to start is on screen at every point of the page`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });   // no slide, so the bar is measured where it rests
    await page.goto(path);
    const bar = page.locator('[data-sticky-cta]');
    const barButton = bar.getByRole('link', { name: 'Choose a template' });
    // At the top the page's own buttons are on screen; the bar is away (not visible, not reachable by keyboard).
    await expect(page.locator('.hero-actions').getByRole('link', { name: 'Browse templates' })).toBeInViewport();
    await expect(barButton).toBeHidden();
    // Through the middle of the page (two screens above the box near the end), the bar is there.
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.cta').getBoundingClientRect().top + window.scrollY - 2 * innerHeight));
    await expect(barButton).toBeVisible();
    await expect(barButton).toHaveAttribute('href', '/templates');
    const box = await barButton.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    // The box near the end has its own button: the bar steps aside while it is on screen.
    await page.locator('.cta .btn').scrollIntoViewIfNeeded();
    await expect(barButton).toBeHidden();
    // In the footer the bar is back, and it covers none of the footer.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(barButton).toBeVisible();
    const footerEnd = await page.locator('.site-footer').evaluate(el => el.getBoundingClientRect().bottom);
    expect(footerEnd).toBeLessThanOrEqual((await bar.boundingBox()).y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('wide screen: the guide pages have no bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(GUIDES[0]);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.cta').getBoundingClientRect().top + window.scrollY - 2 * innerHeight));
  await expect(page.locator('[data-sticky-cta]')).toBeHidden();
});

test('the bar is allowed by the page\'s security rules: no script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /Content Security Policy|Refused/.test(m.text())) errors.push(m.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(GUIDES[1]);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.cta').getBoundingClientRect().top + window.scrollY - 2 * innerHeight));
  await expect(page.locator('[data-sticky-cta]').getByRole('link', { name: 'Choose a template' })).toBeVisible();
  expect(errors).toEqual([]);
});
