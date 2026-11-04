// A change made just before the page is reloaded or closed must reach the server.
// Autosave waits briefly before sending; the flush on page hide sends it immediately.
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

test('an edit made moments before reloading is saved, not lost', async ({ page }) => {
  const title = `Flush Couple ${Date.now()}`;
  const message = `Written just before reload ${Date.now()}`;
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  await page.locator('#projectDate').fill('2027-01-20');
  await page.getByRole('button', { name: /create my preview/i }).click();
  await expect.poll(() => page.evaluate(projectTitle => {
    const projects = JSON.parse(localStorage.getItem('invitestudio-projects') || '[]');
    return projects.find(project => project.title === projectTitle)?.cloudStatus ?? null;
  }, title), { timeout: 20000 }).toBe('saved');

  // Edit, then leave immediately: well inside the autosave delay.
  await page.evaluate(text => { current().message = text; save(); }, message);
  await page.reload();

  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await expect.poll(async () => {
      const rows = await db.query('select message from weddings where title = $1', [title]);
      return rows.rows[0]?.message ?? null;
    }, { timeout: 15000 }).toBe(message);
  } finally {
    await db.end();
  }
});
