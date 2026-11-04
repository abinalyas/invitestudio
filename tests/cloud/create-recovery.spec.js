// Browser test for the cloud create path. The first create response is dropped in
// transit after the server has committed it. The client must retry with the same
// Idempotency-Key, and exactly one draft must exist afterwards.
const { completeSetupSteps } = require('../support/setup');
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

test.beforeEach(async ({ page }) => {
  // The API is disabled on localhost by default. The test stack is local, so enable it.
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

test('a lost create response does not create a duplicate draft', async ({ page }) => {
  const title = `Lost Response ${Date.now()}`;
  let dropped = false;
  const keys = [];

  await page.route('**/api/weddings', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if (!dropped) {
      dropped = true;
      // Let the server commit the draft, then sever the connection before the body arrives.
      await route.fetch();
      return route.abort('connectionreset');
    }
    return route.continue();
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  await page.locator('#projectDate').fill('2027-01-20');
  await completeSetupSteps(page);

  await expect.poll(() => keys.length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
  expect(new Set(keys).size).toBe(1);
  await expect.poll(() => page.evaluate(projectTitle => {
    const projects = JSON.parse(localStorage.getItem('invitestudio-projects') || '[]');
    return projects.find(project => project.title === projectTitle)?.cloudStatus ?? null;
  }, title), { timeout: 20000 }).toBe('saved');

  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const rows = await db.query('select id from weddings where title = $1', [title]);
    expect(rows.rowCount).toBe(1);
  } finally {
    await db.end();
  }
});

test('text typed while a slow create is in flight is kept and saved', async ({ page }) => {
  const title = `Slow Create ${Date.now()}`;
  await page.route('**/api/weddings', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise(resolve => setTimeout(resolve, 2500));
    return route.continue();
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  // The create response lands while the form still holds the typed title.
  await page.waitForTimeout(3500);
  await expect(page.locator('#projectTitle')).toHaveValue(title);
  await page.locator('#projectDate').fill('2027-01-20');
  await completeSetupSteps(page);

  await expect.poll(() => page.evaluate(projectTitle => {
    const projects = JSON.parse(localStorage.getItem('invitestudio-projects') || '[]');
    return projects.find(project => project.title === projectTitle)?.cloudStatus ?? null;
  }, title), { timeout: 20000 }).toBe('saved');

  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    const rows = await db.query('select id from weddings where title = $1', [title]);
    expect(rows.rowCount).toBe(1);
  } finally {
    await db.end();
  }
});
