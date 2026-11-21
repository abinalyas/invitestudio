// Adding an event on the phone preview (it opens the new event's form on the Edit view) must not send the page back to the top. The slow first sync of saved invitations used to redraw
// the editor when it finished, which jumped it to the top (and threw away the new event box the person was about to type in).
const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['Pixel 5'] });

test('the first sync finishing late does not move the editor back to the top', async ({ page }) => {
  await page.addInitScript(() => {
    window.INVITESTUDIO_API_ENABLED = true;
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    localStorage.setItem('invitestudio-projects', JSON.stringify([{ id: 'p1', cloudId: 'w1', name: 'Ava and Ben', title: 'Ava & Ben', category: 'Wedding', templateId: 'minimalist', status: 'Draft', cloudStatus: 'saved', functions: [], photos: [], date: '2027-06-19', location: 'Kochi', message: '', story: '', hosts: '', theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' } }]));
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ w1: 'token-1' }));
  });
  await page.route('**/api/weddings/w1**', async route => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wedding: { id: 'w1', version: 2, status: 'draft' } }) });
    await new Promise(resolve => setTimeout(resolve, 3000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wedding: { id: 'w1', version: 1, status: 'draft', name: 'Ava and Ben', title: 'Ava & Ben', event_date: '2027-06-19', location: 'Kochi', template_id: 'minimalist', category: 'Wedding' }, events: [], photos: [] }) });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the scroll to the new event is instant, so the position can be compared exactly
  await page.goto('/');
  await page.evaluate(() => { state.currentId = 'p1'; state.page = 'editor'; state.device = 'mobile'; state.mobileEditorView = 'preview'; render(); }); // eslint-disable-line no-undef
  const add = page.locator('[data-add-event]').first();
  await expect(add).toBeVisible({ timeout: 15000 });
  await add.scrollIntoViewIfNeeded();
  await add.click();
  await page.getByRole('button', { name: 'Custom event' }).first().click();
  // On a phone a new custom event opens its form on the Edit view, name selected: the person types over "New event" straight away.
  const name = page.getByLabel(/Event name/);
  await expect(name).toBeFocused();
  await page.keyboard.type('Haldi');
  // The page settles for a moment after the jump to the new event; take the position once it has (still before the sync answers).
  let last = -1;
  await expect.poll(async () => { const y = await page.evaluate(() => window.scrollY); const same = y === last; last = y; return same; }, { intervals: [250] }).toBe(true);
  const marker = await page.evaluate(() => { document.querySelector('.figma-island-host').dataset.kept = '1'; return window.scrollY; });
  expect(marker).toBeGreaterThan(0); // brought down to the new event, not left at the top
  // Well after the sync has answered, the editor is the same one, still where the person was, and the name they typed is still there.
  await page.waitForTimeout(5000);
  expect(await page.evaluate(() => document.querySelector('.figma-island-host').dataset.kept), 'the editor was not drawn again').toBe('1');
  expect(Math.abs(await page.evaluate(() => window.scrollY) - marker), 'the page did not move').toBeLessThanOrEqual(2);
  await expect(name).toHaveValue('Haldi');
});

test('a change that really came from the server (another device) still shows in the editor', async ({ page }) => {
  await page.addInitScript(() => {
    window.INVITESTUDIO_API_ENABLED = true;
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    localStorage.setItem('invitestudio-projects', JSON.stringify([{ id: 'p1', cloudId: 'w1', name: 'Ava and Ben', title: 'Ava & Ben', category: 'Wedding', templateId: 'minimalist', status: 'Draft', cloudStatus: 'saved', functions: [], photos: [], date: '2027-06-19', location: 'Kochi', message: '', story: '', hosts: '', theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' } }]));
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ w1: 'token-1' }));
  });
  await page.route('**/api/weddings/w1**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wedding: { id: 'w1', version: 5, status: 'draft', name: 'Ava and Ben', title: 'Ava & Ben', event_date: '2027-06-19', location: 'Mumbai', template_id: 'minimalist', category: 'Wedding' }, events: [], photos: [] }) });
  });
  await page.goto('/');
  await page.evaluate(() => { state.currentId = 'p1'; state.page = 'editor'; render(); }); // eslint-disable-line no-undef
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.InviteStudioBridge.snapshot().location), { timeout: 15000 }).toBe('Mumbai');
});

test('the home page is not drawn again (and kept where it was scrolled) when the first sync changes nothing', async ({ page }) => {
  await page.addInitScript(() => {
    window.INVITESTUDIO_API_ENABLED = true;
    localStorage.setItem('invitestudio-projects', JSON.stringify([{ id: 'p1', cloudId: 'w1', name: 'Ava and Ben', title: 'Ava & Ben', category: 'Wedding', templateId: 'minimalist', status: 'Draft', cloudStatus: 'saved', functions: [], photos: [], date: '2027-06-19', location: 'Kochi', message: '', story: '', hosts: '', theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' } }]));
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ w1: 'token-1' }));
  });
  await page.route('**/api/weddings/w1**', async route => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wedding: { id: 'w1', version: 1, status: 'draft', name: 'Ava and Ben', title: 'Ava & Ben', event_date: '2027-06-19', location: 'Kochi', template_id: 'minimalist', category: 'Wedding' }, events: [], photos: [] }) });
  });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await expect(page.locator('.figma-island-host')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.scrollTo(0, 900); document.querySelector('.figma-island-host').dataset.kept = '1'; });
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(300);
  await page.waitForTimeout(5000);
  expect(await page.evaluate(() => document.querySelector('.figma-island-host')?.dataset.kept), 'the home page was not drawn again').toBe('1');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
});
