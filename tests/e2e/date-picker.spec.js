// Date and time fields open their picker wherever they are clicked (not only on the small icon at the edge), and keyboard use is unchanged.
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

// Records every showPicker() call (which field, of what kind), so the test can see a click would open the picker.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__pickers = [];
    const original = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () {
      window.__pickers.push({ id: this.id || '', type: this.type });
      try { return original && original.apply(this, arguments); } catch (e) { /* headless browsers may refuse to draw it */ }
    };
  });
});

const opened = page => page.evaluate(() => window.__pickers.slice());
const reset = page => page.evaluate(() => { window.__pickers = []; });
// A click on the left part of the field (the day / hour part), well away from the icon at the right edge.
const clickOnText = async locator => {
  const box = await locator.boundingBox();
  await locator.click({ position: { x: Math.min(24, box.width / 4), y: box.height / 2 } });
};

test('setup: clicking anywhere on the event date field opens the picker', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  const date = page.locator('#projectDate');
  await expect(date).toBeVisible();
  await reset(page);
  await clickOnText(date);
  expect(await opened(page)).toEqual([{ id: 'projectDate', type: 'date' }]);
  // Typing still works, and tabbing into the field does not open the picker by itself.
  await date.fill('2027-02-14');
  await expect(date).toHaveValue('2027-02-14');
  await reset(page);
  await page.locator('#projectTitle').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await opened(page)).toEqual([]);
});

test('editor: the date field, and an event\'s date, start time and end time, open on a click anywhere on them', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Picker Test');
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');

  const mainDate = page.locator('.editor-controls input[type="date"]').first();
  await expect(mainDate).toBeVisible();
  await reset(page);
  await clickOnText(mainDate);
  expect((await opened(page)).map(p => p.type)).toEqual(['date']);

  await page.locator('.editor-pages').getByRole('button', { name: /^Events/ }).click();
  await page.getByLabel('Add an event').fill('Sangeet');
  await page.getByRole('button', { name: 'Add event' }).click();
  const eventDate = page.getByLabel(/^Date \(optional\)/);
  const start = page.getByLabel(/^Start time/);
  await expect(eventDate).toBeVisible();
  await reset(page);
  await clickOnText(eventDate);
  await clickOnText(start);
  await page.getByText(/^More details/).click();
  await clickOnText(page.getByLabel(/^End time/));
  expect((await opened(page)).map(p => p.type)).toEqual(['date', 'time', 'time']);
  // Values can still be typed.
  await start.fill('16:30');
  await expect(start).toHaveValue('16:30');
});
