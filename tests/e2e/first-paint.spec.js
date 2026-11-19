// While the scripts that draw the page are still arriving, visitors must not see the plain-HTML copy of the page that the server
// puts inside #app for search engines (it showed as bare links and lists, and looked broken). It stays in the page for crawlers.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('a slow first load never shows the plain-HTML copy of the page, which stays in the page for crawlers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { pageFor, staticContent } = await import('../../functions/_shared/seo.js');
  const shell = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  // What the server sends: the shell with the plain copy placed inside #app.
  const sent = shell.replace('<div id="app" class="app">', '<div id="app" class="app">' + staticContent(pageFor('/templates'), 'https://invitestudio.co'));
  expect(sent).toContain('id="seo-static"');
  await page.route(url => url.pathname === '/templates', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: sent }));
  // The scripts that draw the real page are slow to arrive.
  await page.route(url => /\.js$/.test(url.pathname), async route => { await new Promise(resolve => setTimeout(resolve, 2500)); await route.continue(); });
  page.goto('/templates', { waitUntil: 'commit' }).catch(() => {});

  const plain = page.locator('#seo-static');
  await expect(plain).toBeAttached({ timeout: 10000 });
  // Still there for crawlers and link readers...
  await expect(plain.locator('h1')).toHaveCount(1);
  expect(await plain.locator('a').count()).toBeGreaterThan(3);
  // ...but not shown: it takes up no room and nothing of it is drawn.
  const box = await plain.boundingBox();
  expect(box.width).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(1);
  const shown = await page.evaluate(() => {
    const links = [...document.querySelectorAll('#seo-static a')];
    return links.some(link => { const r = link.getBoundingClientRect(); const s = getComputedStyle(link); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && !link.closest('#seo-static').style.clip && getComputedStyle(link.closest('#seo-static')).clipPath === 'none'; });
  });
  expect(shown).toBe(false);

  // Once the page has drawn, the real gallery replaces it.
  await expect(page.locator('.figma-island-host')).toBeAttached({ timeout: 20000 });
  await expect(page.locator('#seo-static')).toHaveCount(0);
});

test('while the page is being drawn there is only a neutral spinner: no brand name, shown after a short wait', async ({ page }) => {
  const shell = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const app = shell.slice(shell.indexOf('<div id="app"'), shell.indexOf('<div id="modal-root">'));
  expect(app).toContain('class="boot-spin"');
  expect(app).not.toMatch(/InviteStudio/);
  const css = shell.slice(0, shell.indexOf('</style></head>'));
  expect(css).toMatch(/\.boot-spin\{[^}]*animation:boot-in [^;]*\.9s/);
  expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)\{\.boot-spin\{animation:boot-in/);
  expect(css).toMatch(/#seo-static\{[^}]*clip-path:inset\(50%\)/);
});
