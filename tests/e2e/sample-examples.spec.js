// "Start from an example" in the editor: the welcome message is pre-filled by setup, and the empty hosts field shows a full example with
// "Use this". (Setup itself no longer asks for these; it only asks for the names, date, place and events.)
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

async function openEditorAfterSetup(page, title = 'Mira & Arun') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  await completeSetupSteps(page);
  await expect(page.locator('[data-field="message"]')).toBeVisible({ timeout: 15000 });
}

test('setup does not ask for the welcome message, story or hosts', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.getByRole('heading', { name: /your events/i })).toBeVisible();
  await expect(page.locator('#projectMessage, #projectStory, #projectHosts')).toHaveCount(0);
});

test('the welcome message starts pre-filled and can be edited', async ({ page }) => {
  await openEditorAfterSetup(page);
  const welcome = page.locator('[data-field="message"]');
  await expect(welcome).toHaveValue(/celebrate the beginning of our forever/);
  await welcome.fill('Our own words');
  await expect(welcome).toHaveValue('Our own words');
});

test('empty hosts show a full example, and Use this fills the field', async ({ page }) => {
  await openEditorAfterSetup(page);
  const hosts = page.locator('[data-field="hosts"]');
  await expect(hosts).toHaveValue('');
  const card = page.locator('label').filter({ has: hosts }).locator('.sample-chips');
  await expect(card.locator('.sample-card p')).toContainText('Hosted by the families of Mira and Arun');
  await card.getByRole('button', { name: 'Simple' }).click(); // switches the example shown; does not fill the field yet
  await expect(card.locator('.sample-card p')).toContainText('With love, Mira & Arun');
  await expect(hosts).toHaveValue('');
  await card.getByRole('button', { name: 'Use this' }).click();
  await expect(hosts).toHaveValue('With love, Mira & Arun');
});

test('chips on a filled welcome message replace the text', async ({ page }) => {
  await openEditorAfterSetup(page);
  await page.locator('.sample-chips').first().getByRole('button', { name: 'Short and simple' }).click();
  await expect(page.locator('[data-field="message"]')).toHaveValue(/Join us for our wedding/);
});
