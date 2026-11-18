// The event card in setup says it can be opened: what it is missing, an "Add details" button look, and a readable date.
const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['Pixel 5'] });

async function toEventsStep(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-28');
  await page.locator('#projectLocation').fill('Ernakulam');
  await page.getByRole('button', { name: /^Continue/ }).first().click();
  await expect(page.locator('#ceremonyNote')).toBeVisible();
}

test('the ceremony card shows a short date, what can be added, and an Add details cue; opening it hides the hint', async ({ page }) => {
  await toEventsStep(page);
  await expect(page.locator('#ceremonyNote')).toContainText('Tap it to add the time and venue');
  const card = page.locator('.event-item .event-toggle').first();
  await expect(card).toContainText('Wedding ceremony');
  await expect(card).toContainText('28 Jan 2027 · Ernakulam');
  await expect(card).not.toContainText('2027-01-28');
  await expect(card.locator('.event-hint')).toHaveText('Add time, dress code and directions');
  await expect(card.locator('.event-open')).toContainText('Add details');
  await card.click();
  await expect(card.locator('.event-hint')).toHaveCount(0);
  await expect(card.locator('.event-open')).toContainText('Close');
  await expect(page.getByText('Start time')).toBeVisible();
});

test('once the time and venue are set, the hint only offers the rest, and the card fits the phone', async ({ page }) => {
  await toEventsStep(page);
  const card = page.locator('.event-item .event-toggle').first();
  await card.click();
  await page.locator('.event-form input[type="time"]').first().fill('16:00');
  await card.click();
  await expect(card.locator('.event-hint')).toHaveText('Add dress code and directions');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.event-item').first().screenshot({ path: 'test-results/event-card.png' });
});
