// Designs are fetched only when a page shows them (template-loader.js): nothing for the home page, one design for a template page,
// and a clear message with a retry when a design cannot be loaded.
const { test, expect } = require('@playwright/test');

const designFiles = path => /^\/(templates\/dist\/|packaged-templates\.js|template-widgets\.js|scene-templates\.(js|css))/.test(path);
const watch = page => { const seen = []; page.on('request', req => { const path = new URL(req.url()).pathname; if (designFiles(path)) seen.push(path); }); return seen; };
const openTemplatePage = (page, n) => page.evaluate(number => { history.pushState({}, '', `/templates/${number}`); state.page = 'home'; render(); }, n);

test('the home page and the template gallery download no design at all', async ({ page }) => {
  const seen = watch(page);
  await page.goto('/');
  await expect(page.locator('.figma-island-host').first()).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/templates'); state.page = 'home'; render(); });
  await expect(page.locator('.figma-island-host .gallery-grid')).toBeVisible();
  await page.waitForTimeout(500);
  expect(seen).toEqual([]);
});

test('a template page fetches the shared template code and that one design, and draws it with its own styles', async ({ page }) => {
  const seen = watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await openTemplatePage(page, 18); // Bloom Reveal
  const screen = page.locator('.figma-island-host .detail-screen');
  await expect(screen).toBeVisible();
  await expect.poll(() => screen.evaluate(el => Boolean(el.shadowRoot.querySelector('[data-packaged-template="bloom-reveal"]')))).toBe(true);
  expect(seen).toContain('/templates/dist/bloom-reveal.js');
  expect(seen).toContain('/packaged-templates.js');
  expect(seen.filter(path => path.startsWith('/templates/dist/'))).toEqual(['/templates/dist/bloom-reveal.js']);
  expect(seen).not.toContain('/scene-templates.js');
  // The design's own CSS reached the shadow root the phone is drawn in.
  const css = await screen.evaluate(el => (el.shadowRoot.querySelector('style[data-template-css]') || {}).textContent || '');
  expect(css.length).toBeGreaterThan(1000);
  expect(css).toContain('bloom');
});

test('a design that cannot be loaded shows a message, and Try again draws it once the network is back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/templates/dist/*.js', route => route.abort());
  await page.goto('/');
  await openTemplatePage(page, 18);
  const screen = page.locator('.figma-island-host .detail-screen');
  await expect(screen).toBeVisible();
  const retry = screen.locator('[data-retry-design]');
  await expect(retry).toBeVisible({ timeout: 15000 });
  await expect(screen.getByText('We could not load this design.')).toBeVisible();
  await page.unroute('**/templates/dist/*.js');
  await retry.click();
  await expect.poll(() => screen.evaluate(el => Boolean(el.shadowRoot.querySelector('[data-packaged-template="bloom-reveal"]'))), { timeout: 15000 }).toBe(true);
});
