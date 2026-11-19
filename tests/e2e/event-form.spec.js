// The event form: the Directions link sits with the venue (not tucked away), and the Travel details block is gone,
// except on an event that already has parking, travel or accessibility text (so that text can still be edited or cleared).
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

async function openNewEvent(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  await page.locator('.editor-pages').getByRole('button', { name: /^Events/ }).click();
  await page.getByRole('button', { name: /\+ Wedding ceremony/ }).click();
  await expect(page.locator('.event-form')).toBeVisible();
}

test('a new event shows the Directions link with the venue, and has no Travel details', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNewEvent(page);
  const more = page.locator('details.event-more');
  await expect(more).not.toHaveAttribute('open', '');

  // Directions is there without opening anything, and is not inside "More details".
  const directions = page.getByLabel('Directions link');
  await expect(directions).toBeVisible();
  await expect(more.getByLabel('Directions link')).toHaveCount(0);
  // It comes straight after the venue.
  const order = await page.locator('.event-form > label').evaluateAll(labels => labels.map(label => label.textContent.trim().split(/\s|\(/)[0]));
  expect(order.slice(order.indexOf('Venue'), order.indexOf('Venue') + 2)).toEqual(['Venue', 'Directions']);

  // The travel fields are gone, even with "More details" open.
  await more.locator('summary').click();
  await expect(page.getByLabel(/dress code/i)).toBeVisible();
  await expect(page.getByText('Travel details')).toHaveCount(0);
  await expect(page.getByLabel(/^Parking/)).toHaveCount(0);
  await expect(page.getByLabel(/^Travel and accommodation/)).toHaveCount(0);
  await expect(page.getByLabel(/^Accessibility/)).toHaveCount(0);

  // The link is saved on the event.
  await directions.fill('https://maps.example.com/garden-hall');
  await expect.poll(() => page.evaluate(() => current().functions[0].directionsUrl)).toBe('https://maps.example.com/garden-hall');
});

test('an event that already has parking or travel text keeps those fields, so the text can be edited or cleared', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNewEvent(page);
  await page.evaluate(() => { const item = current().functions[0]; window.InviteStudioBridge.updateEvent(item.id, { parking: 'Parking behind the hall', accessibility: 'Step-free entrance' }); });
  // Close the card and open it again: the form is built afresh from what the event holds.
  const toggle = page.locator('.event-item .event-toggle').first();
  await toggle.click();
  await toggle.click();
  const more = page.locator('details.event-more');
  await expect(more).toHaveAttribute('open', '');
  await expect(page.getByText('Travel details')).toBeVisible();
  await expect(page.getByLabel(/^Parking/)).toHaveValue('Parking behind the hall');
  await expect(page.getByLabel(/^Accessibility/)).toHaveValue('Step-free entrance');
  // Directions is still outside.
  await expect(more.getByLabel('Directions link')).toHaveCount(0);
  await expect(page.getByLabel('Directions link')).toBeVisible();
  // Clearing the text works, and the fields stay while the form is open.
  await page.getByLabel(/^Parking/).fill('');
  await expect.poll(() => page.evaluate(() => current().functions[0].parking)).toBe('');
  await expect(page.getByLabel(/^Parking/)).toBeVisible();
});
