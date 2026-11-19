// Add to calendar in the editor's preview: it appears once an event has a date, downloads the event, and does not disturb editing.
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

test('the editor preview shows Add to calendar for a dated event only, and using it changes nothing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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

  const canvas = page.locator('.invitation-canvas');
  // No date yet: nothing to add.
  await expect(canvas.locator('[data-cal]')).toHaveCount(0);

  await page.evaluate(() => { const item = current().functions[0]; window.InviteStudioBridge.updateEvent(item.id, { date: '2027-06-19', time: '16:00', venue: 'St. Mary’s Church' }); });
  const button = canvas.getByRole('link', { name: 'Add to calendar: Wedding ceremony' });
  await expect(canvas.locator('[data-cal]')).toHaveCount(1);
  await expect(button).toHaveCount(1);
  await button.scrollIntoViewIfNeeded();
  await expect(button).toHaveAttribute('download', 'wedding-ceremony.ics');
  const before = await page.evaluate(() => ({ url: location.href, active: state.page, events: current().functions.length }));
  // One tap downloads the event file, and the editor does not notice.
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toBe('wedding-ceremony.ics');
  const ics = require('node:fs').readFileSync(await download.path(), 'utf8');
  expect(ics).toContain('DTSTART:20270619T160000');
  expect(ics).toContain('DTEND:20270619T180000');
  expect(ics).toContain('SUMMARY:Wedding ceremony – Mira & Arun');
  expect(await page.evaluate(() => ({ url: location.href, active: state.page, events: current().functions.length }))).toEqual(before);
  await expect(page.locator('.event-form')).toBeVisible();
  // The editor's preview never draws it for an event the couple has hidden.
  await page.getByLabel('Show this event on the invitation').uncheck();
  await expect(canvas.locator('[data-cal]')).toHaveCount(0);
});
