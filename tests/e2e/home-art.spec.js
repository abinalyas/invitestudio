// The home page's illustrations (assets/home/art): they load, they never push the page sideways, and decoration never covers text or takes clicks.
// Set HOME_SHOTS=<folder> to also save full-page pictures at each width to look at.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function stubPrices(page) {
  const { pricingFor } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pricingFor('in'), country: 'IN', mode: 'early-access' }) }));
}

for (const [name, width, height] of [['phone', 390, 844], ['tablet', 820, 1100], ['laptop', 1280, 800], ['wide', 1500, 900], ['xl', 1920, 1000]]) {
  test(`${name} (${width}px): illustrations load and the page does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await stubPrices(page);
    await page.goto('/');
    await expect(page.locator('.plans .plan')).toHaveCount(3, { timeout: 15000 });
    // Scroll through so lazy pictures load, then check every illustration that is shown has real pixels.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const root = [...document.querySelectorAll('*')].map(e => e.shadowRoot).find(r => r && r.querySelector('.home-page'));
      const imgs = [...root.querySelectorAll('img[src^="/assets/home/art/"]')];
      const shown = imgs.filter(i => i.getClientRects().length && getComputedStyle(i).display !== 'none');
      return { total: imgs.length, shown: shown.length, broken: shown.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')), sideways: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(result.total).toBeGreaterThan(15);
    expect(result.shown).toBeGreaterThan(8);
    expect(result.broken).toEqual([]);
    expect(result.sideways).toBe(false);
    // Decoration is for looking at: it takes no clicks and is hidden from screen readers.
    expect(await page.evaluate(() => {
      const root = [...document.querySelectorAll('*')].map(e => e.shadowRoot).find(r => r && r.querySelector('.home-page'));
      return [...root.querySelectorAll('img[src^="/assets/home/art/"]')].every(i => i.getAttribute('alt') === '' && i.getAttribute('aria-hidden') === 'true');
    })).toBe(true);
    expect(await page.evaluate(() => {
      const root = [...document.querySelectorAll('*')].map(e => e.shadowRoot).find(r => r && r.querySelector('.home-page'));
      return [...root.querySelectorAll('.deco, .cta-art, .switch-swoosh')].every(el => getComputedStyle(el).pointerEvents === 'none');
    })).toBe(true);
    if (process.env.HOME_SHOTS) {
      fs.mkdirSync(process.env.HOME_SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.HOME_SHOTS, `${name}.png`), fullPage: true });
    }
  });
}
