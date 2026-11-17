// "Start from an example": the welcome message is pre-filled, and the empty story and hosts fields show a full example with "Use this".
const { test, expect } = require('@playwright/test');

async function openStory(page, title = 'Mira & Arun') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.getByRole('heading', { name: /story and details/i })).toBeVisible();
}

test('the welcome message starts pre-filled and can be edited', async ({ page }) => {
  await openStory(page);
  const welcome = page.locator('#projectMessage');
  await expect(welcome).toHaveValue(/celebrate the beginning of our forever/);
  await welcome.fill('Our own words');
  await expect(welcome).toHaveValue('Our own words');
});

test('empty story and hosts show a full example, and Use this fills the field', async ({ page }) => {
  await openStory(page);
  const story = page.locator('.sample-chips.has-card').filter({ hasText: /example/i });
  await expect(story).toHaveCount(2); // story and hosts; the welcome message already has text
  await expect(page.locator('#projectStory')).toHaveValue('');
  const hostsCard = page.locator('.sample-chips.has-card').nth(1);
  await expect(hostsCard.locator('.sample-card p')).toContainText('Hosted by the families of Mira and Arun');
  await hostsCard.getByRole('button', { name: 'Simple' }).click(); // switches the example shown; does not fill the field yet
  await expect(hostsCard.locator('.sample-card p')).toContainText('With love, Mira & Arun');
  await expect(page.locator('#projectHosts')).toHaveValue('');
  await hostsCard.getByRole('button', { name: 'Use this' }).click();
  await expect(page.locator('#projectHosts')).toHaveValue('With love, Mira & Arun');
  await expect(page.locator('.sample-chips.has-card')).toHaveCount(1); // the hosts card goes away once it has text
});

test('chips on a filled field replace the text', async ({ page }) => {
  await openStory(page);
  await page.locator('.sample-chips').first().getByRole('button', { name: 'Short and simple' }).click();
  await expect(page.locator('#projectMessage')).toHaveValue(/Join us for our wedding/);
});
