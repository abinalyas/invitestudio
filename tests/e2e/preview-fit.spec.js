// The guest-view preview on a phone: the Desktop and Tablet views are the design at its real width, scaled down with a transform.
// (The CSS zoom property made iPhone Safari measure the design at its shrunken width: phone layout, oversized overlapping text.)
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openPreview(page, device, template = 'under-the-same-moon') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await completeSetupSteps(page);
  await page.evaluate(([d, id]) => { current().templateId = id; state.device = d; go('preview'); }, [device, template]);
  await expect(page.locator('#preview-frame')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
}

const measure = page => page.evaluate(() => {
  const frame = document.getElementById('preview-frame');
  const rect = frame.getBoundingClientRect(), style = getComputedStyle(frame);
  return {
    layoutWidth: frame.offsetWidth, shownWidth: Math.round(rect.width), left: Math.round(rect.left), zoom: style.zoom, transform: style.transform,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    below: Math.round(document.documentElement.scrollHeight - (rect.bottom + window.scrollY))
  };
});

for (const [device, width] of [['desktop', 1280], ['tablet', 768]]) {
  test(`${device} view on a phone: laid out at ${width}px, scaled with a transform to fit, no sideways scrolling, no blank space below`, async ({ page }) => {
    await openPreview(page, device);
    const m = await measure(page);
    expect(m.layoutWidth).toBe(width);
    expect(m.zoom).toBe('1');
    expect(m.transform).toMatch(/^matrix\(/);
    expect(m.shownWidth).toBeLessThanOrEqual(390);
    expect(m.shownWidth).toBeGreaterThan(330);
    expect(m.sideways).toBeLessThanOrEqual(0);
    expect(m.below, 'the page ends just below the scaled design').toBeLessThan(80);
  });
}

test('the desktop view of a design is the desktop layout (menu links, not the phone menu button)', async ({ page }) => {
  await openPreview(page, 'desktop', 'modern-heritage');
  const phoneMenu = await page.evaluate(() => [...document.querySelectorAll('#preview-frame *')].filter(e => /menu-toggle/.test(e.className || '') && getComputedStyle(e).display !== 'none').length);
  expect(phoneMenu).toBe(0);
  const links = await page.evaluate(() => [...document.querySelectorAll('#preview-frame .nav button, #preview-frame nav button')].filter(e => e.getBoundingClientRect().width > 0).length);
  expect(links).toBeGreaterThan(0);
});

test('the mobile view is laid out at 390px (only nudged to fit the page margins), and switching back from desktop leaves no leftover scaling', async ({ page }) => {
  await openPreview(page, 'desktop');
  await page.locator('.pv-pill', { hasText: 'Mobile' }).click();
  await page.waitForTimeout(800);
  const m = await measure(page);
  expect(m.layoutWidth).toBe(390);
  const scale = Number(/matrix\(([\d.]+)/.exec(m.transform)?.[1] ?? 1);
  expect(scale).toBeGreaterThan(0.9);
  expect(m.sideways).toBeLessThanOrEqual(0);
});
