// End-to-end journey through the real UI and the real cloud stack:
// create -> edit -> save -> reload and continue -> preview -> publish -> share ->
// public page -> edit after publishing -> take offline.
const { completeSetupSteps } = require('../support/setup');
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

async function savedStatus(page, title) {
  return page.evaluate(projectTitle => {
    const projects = JSON.parse(localStorage.getItem('invitestudio-projects') || '[]');
    return projects.find(project => project.title === projectTitle || project.name === projectTitle) || null;
  }, title);
}

test('create, edit, save, publish, share, edit after publishing, and take offline', async ({ page, browser }) => {
  const token = randomUUID().slice(0, 6);
  const title = `Journey Couple ${token}`;
  const slug = `journey-${token}`;

  // 1. Create a website with the essentials.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  await page.locator('#projectDate').fill('2027-01-20');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  await expect.poll(async () => (await savedStatus(page, title))?.cloudStatus, { timeout: 20000 }).toBe('saved');

  // 2. Edit a detail and let autosave persist it. Wait for the save that carries it.
  const versionBefore = (await savedStatus(page, title)).cloudVersion;
  await page.evaluate(() => {
    const project = current();
    project.message = 'We cannot wait to celebrate with you.';
    save();
  });
  await expect.poll(async () => (await savedStatus(page, title))?.cloudVersion, { timeout: 20000 }).toBeGreaterThan(versionBefore);
  await expect.poll(async () => (await savedStatus(page, title))?.cloudStatus, { timeout: 20000 }).toBe('saved');

  // 3. Come back later: the draft is restored from the cloud on this browser.
  await page.reload();
  await expect(page.getByRole('region', { name: /continue your draft/i }).or(page.locator('section[aria-label="Continue your draft"]'))).toBeVisible();
  await page.getByRole('button', { name: /continue editing/i }).click();
  await expect(page.locator('body')).toContainText(title, { timeout: 15000 });

  // 4. Preview the website as guests will see it.
  await page.evaluate(() => go('preview'));
  await expect(page.getByText('Website preview')).toBeVisible();

  // 5. Publish with a web address.
  await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
  await expect(page.locator('#publishSlug')).toBeVisible();
  await page.locator('#publishSlug').fill(slug);
  await page.getByRole('button', { name: 'Make it live' }).click();
  await expect(page.locator('#modal-root h2')).toHaveText(/your invitation is live/i, { timeout: 20000 });
  await expect(page.locator('#modal-root')).toContainText(`/s/${slug}`);

  // 6. A guest opens the link in a fresh browser context, with no sign-in or local data.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`/s/${slug}`);
  await expect(guestPage.locator('[data-public-invitation]')).toContainText(title, { timeout: 15000 });
  await expect(guestPage.locator('[data-public-invitation]')).toContainText('We cannot wait to celebrate with you.');
  const guestHtml = await guestPage.content();
  expect(guestHtml).not.toMatch(/invitestudio-edit-tokens/);
  await guest.close();

  // 7. Edit after publishing: the public page keeps its address and shows the change.
  await page.evaluate(() => {
    current().title = current().title + ' (updated)';
    save();
  });
  const updatedTitle = `${title} (updated)`;
  await expect.poll(async () => (await savedStatus(page, updatedTitle))?.cloudStatus, { timeout: 20000 }).toBe('saved');
  const { Client } = require('pg');
  const db = new Client({ connectionString: 'postgres://postgres@127.0.0.1:54329/invitestudio' });
  await db.connect();
  try {
    await expect.poll(async () => (await db.query('select title from weddings where slug = $1', [slug])).rows[0]?.title ?? null, { timeout: 15000 }).toBe(updatedTitle);
  } finally {
    await db.end();
  }
  const after = await browser.newContext();
  const afterPage = await after.newPage();
  await afterPage.goto(`/s/${slug}`);
  await expect(afterPage.locator('[data-public-invitation]')).toContainText(updatedTitle, { timeout: 15000 });
  await after.close();

  // 8. Take the invitation offline: the public address stops working.
  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(() => openPublish());
  await page.getByRole('button', { name: 'Take offline' }).click();
  await expect(page.locator('#modal-root')).toContainText(/Publish your invitation|Share your invitation/i, { timeout: 15000 });
  const offline = await browser.newContext();
  const offlinePage = await offline.newPage();
  await offlinePage.goto(`/s/${slug}`);
  await expect(offlinePage.getByText('This invitation is not available.')).toBeVisible({ timeout: 15000 });
  await offline.close();
});
