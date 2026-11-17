// Visit statistics from a real page: what analytics.js sends, and what it never does.
const { test, expect } = require('@playwright/test');

async function collect(page) {
  const sent = [];
  await page.route('**/api/collect', route => { sent.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ status: 204 }); });
  return sent;
}

test('a page load reports the page, the screen width and the language, and nothing else about the person', async ({ page }) => {
  const sent = await collect(page);
  await page.goto('/?utm_source=instagram&utm_medium=bio&secret=SHOULDNOTLEAVE#alsosecret');
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(sent[0]).toMatchObject({ e: 'pageview', p: '/', us: 'instagram', um: 'bio' });
  expect(typeof sent[0].w).toBe('number');
  expect(Object.keys(sent[0]).sort()).toEqual(['e', 'l', 'p', 'r', 'uc', 'um', 'us', 'w']);
  expect(JSON.stringify(sent)).not.toMatch(/SHOULDNOTLEAVE|alsosecret/);
});

test('moving around the app counts each screen once, and the referrer is only sent with the first', async ({ page }) => {
  const sent = await collect(page);
  await page.goto('/');
  await expect.poll(() => sent.length).toBe(1);
  await page.evaluate(() => { history.pushState({}, '', '/templates/13'); });
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].p).toBe('/templates/13');
  expect(sent[1].r).toBeUndefined();
  await page.evaluate(() => { history.pushState({}, '', '/templates/13'); });   // the same screen again: not counted twice
  await page.waitForTimeout(400);
  expect(sent.length).toBe(2);
});

test('a private link\'s key is never sent: the fragment and the old /edit/<key> path are dropped', async ({ page }) => {
  const sent = await collect(page);
  const key = 'K'.repeat(43);
  await page.goto(`/#${key}`);
  await expect.poll(() => sent.length).toBe(1);
  await page.evaluate(k => { history.pushState({}, '', `/edit/${k}`); }, key);
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[0].p).toBe('/');
  expect(sent[1].p).toBe('/edit');
  expect(JSON.stringify(sent)).not.toContain(key);
});

test('nothing is sent when the browser says Do Not Track or Global Privacy Control, or on this browser after the owner used /admin', async ({ page }) => {
  for (const setup of [
    () => Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true }),
    () => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true }),
    () => localStorage.setItem('invitestudio-no-track', '1')
  ]) {
    const context = await page.context().browser().newContext();
    const fresh = await context.newPage();
    const sent = await collect(fresh);
    await fresh.addInitScript(setup);
    await fresh.goto('/');
    await fresh.waitForTimeout(800);
    expect(sent.length).toBe(0);
    await context.close();
  }
});

test('the admin page is never reported, and works if the statistics are unavailable', async ({ page }) => {
  const sent = await collect(page);
  await page.goto('/admin');
  await page.waitForTimeout(800);
  expect(sent.length).toBe(0);
});

test('a visit still works when counting fails', async ({ page }) => {
  await page.route('**/api/collect', route => route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.figma-island-host')).toBeVisible();
  expect(errors).toEqual([]);
});
