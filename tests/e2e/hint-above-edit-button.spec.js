// On a phone, tapping the preview selects a section and shows a floating "Edit ..." button above the tab bar. A message in the preview
// (the black line, e.g. "Photos need your invitation to be saved online") must sit ABOVE that button. They used to be drawn on top of
// each other, so neither could be read.
const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('the preview message does not overlap the floating Edit button', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    const project = {
      id: 'e2e-hint', name: 'Ava and Ben', category: 'Wedding', templateId: 'minimalist', status: 'Draft', updated: 'Just now',
      title: 'Ava & Ben', date: '2027-06-19', location: 'The Garden Estate, Kent', message: 'Please join us', hosts: 'Mr and Mrs Shah',
      story: 'We met in March.', photos: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }, published: false, functions: []
    };
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    localStorage.setItem('invitestudio-projects', JSON.stringify([project]));
    // eslint-disable-next-line no-undef
    state.projects = [project]; state.currentId = project.id; state.page = 'editor'; render();
  });
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
  // A tap on a photo spot selects its section (the Edit button appears) and, with no online storage here, shows a message.
  await page.locator('[data-photo-add]').first().click();
  const button = page.locator('.mobile-edit-pill');
  const message = page.locator('.edit-hint-pill');
  await expect(button).toBeVisible();
  await expect(message).toContainText('saved online');
  const b = await button.boundingBox();
  const m = await message.boundingBox();
  expect(m.y + m.height, 'the message ends above the Edit button').toBeLessThanOrEqual(b.y);
  // When the button goes away (a tap on a tab clears it), the message drops back to its usual place above the tab bar.
});
