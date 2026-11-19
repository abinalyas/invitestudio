// Add to calendar in the editor's preview: it appears once an event has a date, opens in place, and does not disturb editing.
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

test('the editor preview shows Add to calendar for a dated event only, and opening it changes nothing', async ({ page }) => {
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
  await expect(canvas.locator('details[data-cal]')).toHaveCount(0);

  await page.evaluate(() => { const item = current().functions[0]; window.InviteStudioBridge.updateEvent(item.id, { date: '2027-06-19', time: '16:00', venue: 'St. Mary’s Church' }); });
  const control = canvas.locator('details[data-cal]');
  await expect(control).toHaveCount(1);
  await control.scrollIntoViewIfNeeded();
  await expect(control.getByRole('link', { name: 'Google Calendar' })).toBeHidden();
  const before = await page.evaluate(() => ({ url: location.href, active: state.page, events: current().functions.length }));
  await control.locator('summary').click();
  await expect(control.getByRole('link', { name: 'Google Calendar' })).toBeVisible();
  await expect(control.getByRole('link', { name: 'Apple, Outlook and others' })).toBeVisible();
  const href = await control.getByRole('link', { name: 'Google Calendar' }).getAttribute('href');
  expect(new URL(href).searchParams.get('dates')).toBe('20270619T160000/20270619T180000');
  // Nothing in the editor moved: same address, same page, same events, and the form is still open.
  expect(await page.evaluate(() => ({ url: location.href, active: state.page, events: current().functions.length }))).toEqual(before);
  await expect(page.locator('.event-form')).toBeVisible();
  // The editor's preview never draws it for an event the couple has hidden.
  await page.getByLabel('Show this event on the invitation').uncheck();
  await expect(canvas.locator('details[data-cal]')).toHaveCount(0);
});
