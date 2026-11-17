// Session recordings (replay.js): offered only when the server added the meta tag, never loaded for opted-out browsers, and switched
// OFF (and the page masked) on every screen that can hold personal details. Clarity itself is replaced by a stand-in that records calls.
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

const ID = 'testproj01';
const STAND_IN = `
  window.__clarity = window.__clarity || [];
  (function () {
    var queued = (window.clarity && window.clarity.q) || [];
    window.__clarityLoaded = true;
    window.clarity = function () { window.__clarity.push([].slice.call(arguments)[0]); };
    queued.forEach(function (args) { window.clarity.apply(null, args); });
  })();`;

// The static test server does not run the middleware, so the page is served with the meta tag the server would add.
async function serveWithMeta(page, meta = `<meta name="invitestudio-replay" content="${ID}">`) {
  const requested = [];
  await page.route('https://www.clarity.ms/**', route => { requested.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/javascript', body: STAND_IN }); });
  await page.route(url => new URL(url).pathname === '/', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<head>', `<head>${meta}`);
    return route.fulfill({ response, body: html });
  });
  return requested;
}
const calls = page => page.evaluate(() => window.__clarity || []);
const mask = page => page.evaluate(() => document.body.getAttribute('data-clarity-mask'));

test('with the server\'s meta tag on a marketing page, Clarity is loaded, and the page is not masked', async ({ page }) => {
  const requested = await serveWithMeta(page);
  await page.goto('/');
  await expect.poll(() => requested.length).toBe(1);
  expect(requested[0]).toBe(`https://www.clarity.ms/tag/${ID}`);
  expect(await mask(page)).toBeNull();
  expect(await calls(page)).not.toContain('stop');
});

test('nothing is loaded without the meta tag, with a bad project id, or for opted-out browsers', async ({ page, browser }) => {
  let requested = await serveWithMeta(page, '');
  await page.goto('/');
  await page.waitForTimeout(800);
  expect(requested).toEqual([]);

  const bad = await browser.newContext();
  const badPage = await bad.newPage();
  requested = await serveWithMeta(badPage, '<meta name="invitestudio-replay" content="<script>x</script>">');
  await badPage.goto('/');
  await badPage.waitForTimeout(800);
  expect(requested).toEqual([]);
  await bad.close();

  for (const setup of [
    () => Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true }),
    () => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true }),
    () => localStorage.setItem('invitestudio-no-track', '1')
  ]) {
    const context = await browser.newContext();
    const fresh = await context.newPage();
    const seen = await serveWithMeta(fresh);
    await fresh.addInitScript(setup);
    await fresh.goto('/');
    await fresh.waitForTimeout(800);
    expect(seen).toEqual([]);
    await context.close();
  }
});

test('entering setup switches recording off and masks the page; coming back to the home page switches it on again', async ({ page }) => {
  const requested = await serveWithMeta(page);
  await page.goto('/');
  await expect.poll(() => requested.length).toBe(1);
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await expect(page.locator('#projectTitle')).toBeVisible();
  await expect.poll(() => calls(page)).toContain('stop');
  expect(await mask(page)).toBe('True');
  // Names typed here are never inside a recording.
  await page.locator('#projectTitle').fill('Private Couple');
  expect(await calls(page)).not.toContain('start');
  await page.evaluate(() => go('home'));
  await expect.poll(() => calls(page)).toContain('start');
  expect(await mask(page)).toBeNull();
});

test('the editor, the preview, the dashboard and every dialog are private screens', async ({ page }) => {
  const requested = await serveWithMeta(page);
  await page.goto('/');
  await expect.poll(() => requested.length).toBe(1);
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Private Couple');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  expect(await mask(page)).toBe('True');
  await page.evaluate(() => go('preview'));
  await expect(page.locator('#preview-frame')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await mask(page)).toBe('True');
  await page.evaluate(() => go('dashboard'));
  await page.waitForTimeout(300);
  expect(await mask(page)).toBe('True');
  // A dialog over an otherwise public screen (here: the pricing information) is private too, and leaving it resumes recording.
  await page.evaluate(() => go('home'));
  await expect.poll(() => mask(page)).toBeNull();
  await page.evaluate(() => openInfo('pricing'));
  await expect.poll(() => mask(page)).toBe('True');
  await page.evaluate(() => closeModal());
  await expect.poll(() => mask(page)).toBeNull();
  const order = await calls(page);
  expect(order.filter(c => c === 'stop').length).toBeGreaterThanOrEqual(2);
  expect(order[order.length - 1]).toBe('start');
});

test('if Clarity cannot load, the page works normally', async ({ page }) => {
  await page.route('https://www.clarity.ms/**', route => route.abort());
  await page.route(url => new URL(url).pathname === '/', async route => {
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace('<head>', `<head><meta name="invitestudio-replay" content="${ID}">`) });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.figma-island-host')).toBeVisible();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await expect(page.locator('#projectTitle')).toBeVisible();
  expect(errors).toEqual([]);
});
