// On a phone, a newly added event opens as a form above the buttons that were tapped. It must be brought into view, otherwise
// the tap seems to have done nothing (the person is looking at the quick-add buttons, the new event is off the top of the screen).
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function toEventsStep(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the scroll is instant, so the check does not race an animation
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-20');
  await page.getByRole('button', { name: /^Continue/ }).first().click(); // Essentials -> Events
  await expect(page.getByRole('heading', { name: /your events/i })).toBeVisible();
}

const topOf = (page, title) => page.locator('.event-item', { hasText: title }).first().evaluate(el => Math.round(el.getBoundingClientRect().top));

test('quick-adding an event brings it into view and says so', async ({ page }) => {
  await toEventsStep(page);
  const chip = page.getByRole('button', { name: '+ Welcome gathering' });
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  const item = page.locator('.event-item', { hasText: 'Welcome gathering' }).first();
  await expect(item).toBeVisible();
  await expect.poll(async () => { const top = await topOf(page, 'Welcome gathering'); return top >= 0 && top < 400; }, { timeout: 5000 }).toBe(true);
  await expect(item).toHaveClass(/just-added/);                                   // it flashes once...
  await expect(page.locator('[role="status"]', { hasText: 'Welcome gathering added to your events.' })).toBeAttached(); // ...and is announced
  await expect(item).not.toHaveClass(/just-added/, { timeout: 5000 });             // the flash goes away
});

test('adding a typed event brings it into view too', async ({ page }) => {
  await toEventsStep(page);
  const field = page.getByLabel('Add an event');
  await field.scrollIntoViewIfNeeded();
  await field.fill('Sangeet');
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect.poll(async () => { const top = await topOf(page, 'Sangeet'); return top >= 0 && top < 400; }, { timeout: 5000 }).toBe(true);
});
