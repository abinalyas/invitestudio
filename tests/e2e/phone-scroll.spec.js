// On a phone the editor page must scroll when a finger drags on the invitation preview. The preview's own box used to be a
// (non-scrolling) scroller that kept every swipe to itself, so the page stayed still while the finger moved over it.
const { test, expect, devices } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

test.use({ ...devices['Pixel 7'], viewport: { width: 411, height: 850 } });

test('dragging a finger on the invitation preview scrolls the editor page', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('John doe');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  await expect(page.locator('.invitation-canvas')).toBeVisible();

  // The preview box must not be a scroller of its own on a phone.
  const box = await page.locator('.editor-site').first().evaluate(el => { const s = getComputedStyle(el); return { y: s.overflowY, chain: s.overscrollBehaviorY }; });
  expect(box).toEqual({ y: 'visible', chain: 'auto' });

  const cdp = await context.newCDPSession(page);
  const point = y => [{ x: 200, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(700) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(700 - 25 * i) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBeGreaterThan(150);
});
