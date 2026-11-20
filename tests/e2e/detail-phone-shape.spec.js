// A design's page shows the invitation in a phone mock-up. It must look like a phone (tall and narrow) on a computer, and on a
// phone it must leave strips on both sides, so a finger there scrolls the page instead of the preview.
const { test, expect } = require('@playwright/test');

async function pricesFor(page) {
  const { pricingFor, regionForCountry } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pricingFor(regionForCountry('IN')), country: 'IN', mode: 'early-access' }) }));
}
async function openDesign(page) {
  await pricesFor(page);
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/templates/19'); state.page = 'home'; render(); });
  await expect(page.locator('.figma-island-host .detail-device')).toBeVisible({ timeout: 15000 });
}
const frame = page => page.locator('.figma-island-host .detail-device').evaluate(el => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, left: b.left, right: innerWidth - b.right }; });

for (const [width, height] of [[1372, 890], [1280, 720], [1920, 1080]]) {
  test(`on a ${width}x${height} computer screen the phone mock-up is phone-shaped`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openDesign(page);
    const f = await frame(page);
    expect(f.h / f.w).toBeGreaterThan(1.9);
    expect(f.h / f.w).toBeLessThan(2.3);
    expect(f.w).toBeLessThan(400);
  });
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the mock-up leaves strips on both sides, and a finger on a strip scrolls the page', async ({ page, context }) => {
    await openDesign(page);
    const f = await frame(page);
    expect(f.left).toBeGreaterThanOrEqual(40);
    expect(f.right).toBeGreaterThanOrEqual(40);
    expect(f.h / f.w).toBeGreaterThan(1.9);

    const cdp = await context.newCDPSession(page);
    const point = y => [{ x: 20, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(600) });
    for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(600 - 25 * i) }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBeGreaterThan(100);
  });
});
