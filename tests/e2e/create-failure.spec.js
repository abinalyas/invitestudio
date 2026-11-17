// When a draft cannot be saved to the cloud, the message says why (it used to be the same sentence whatever the cause).
const { test, expect } = require('@playwright/test');

async function createWithServerAnswer(page, status, body) {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
  await page.route('**/api/weddings', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  // The draft is saved to the cloud as soon as the names are known; the Ready step stays locked while it cannot be.
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: /^Continue/ }).click();
}

test('a design the server does not have is named as the reason', async ({ page }) => {
  await createWithServerAnswer(page, 422, { error: { code: 'VALIDATION_ERROR', message: 'Selected template is not available.', fields: { templateId: 'Choose an active template.' } } });
  await expect(page.locator('.toast')).toContainText('Your draft could not be saved online: this design is not set up on the server yet. It is kept on this device.', { timeout: 20000 });
});

test('another refusal shows the server\'s own words', async ({ page }) => {
  await createWithServerAnswer(page, 409, { error: { code: 'CREATE_REPLAY_EXPIRED', message: 'This draft creation can no longer be repeated. Start a new invitation.' } });
  await expect(page.locator('.toast')).toContainText('Your draft could not be saved online: This draft creation can no longer be repeated. Start a new invitation', { timeout: 20000 });
});
