// My invitations: each card says when the invitation stops being online (drafts: an estimate; published: the closing date,
// with the days left once inside the warning window). The dates come from GET /api/weddings/:id/retention.
const { test, expect } = require('@playwright/test');

const ID = {
  draft: '11111111-1111-4111-8111-111111111111',
  live: '22222222-2222-4222-8222-222222222222',
  soon: '33333333-3333-4333-8333-333333333333',
  off: '44444444-4444-4444-8444-444444444444',
  none: '55555555-5555-4555-8555-555555555555'
};
const TOKEN = 'a'.repeat(40);
const RETENTION = {
  [ID.draft]: { available: true, hasClock: false, endsOn: null, estimatedEndsOn: '2027-10-19', stage: 'no_clock', daysLeft: null, warnDays: 14 },
  [ID.live]: { available: true, hasClock: true, endsOn: '2027-03-14', stage: 'keep', daysLeft: 200, warnDays: 14 },
  [ID.soon]: { available: true, hasClock: true, endsOn: '2026-12-01', stage: 'keep', daysLeft: 10, warnDays: 14 },
  [ID.off]: { available: true, hasClock: true, endsOn: '2026-11-01', deleteOn: '2026-11-29', stage: 'hidden', daysLeft: -20, warnDays: 14, closed: true },
  [ID.none]: { available: false }
};

test('cards show when each invitation expires', async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
  await page.route('**/api/weddings/*/retention', route => {
    const id = route.request().url().match(/weddings\/([^/]+)\/retention/)[1];
    route.fulfill({ json: RETENTION[id] || { available: false } });
  });
  await page.goto('/');
  await page.evaluate(({ ID, TOKEN }) => {
    localStorage.clear();
    const mk = (key, name, status) => ({ id: 'p-' + key, cloudId: ID[key], name, title: name, category: 'Wedding', templateId: 'minimalist', status, publishStatus: status === 'Published' ? 'published' : '', published: status === 'Published', functions: [], photos: [], editedAt: Date.now() });
    const projects = [mk('draft', 'Draft one', 'Draft'), mk('live', 'Live one', 'Published'), mk('soon', 'Soon one', 'Published'), mk('off', 'Offline one', 'Draft'), mk('none', 'No info', 'Draft')];
    localStorage.setItem('invitestudio-projects', JSON.stringify(projects));
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify(Object.fromEntries(Object.values(ID).map(i => [i, TOKEN]))));
    // eslint-disable-next-line no-undef
    state.projects = projects; state.page = 'dashboard'; render();
  }, { ID, TOKEN });
  const card = name => page.locator('article.dash-card', { hasText: name });
  await expect(card('Draft one').locator('[data-kept]')).toContainText('Once live, online until 19 Oct 2027');
  await expect(card('Live one').locator('[data-kept]')).toContainText('Online until 14 Mar 2027');
  await expect(card('Soon one').locator('[data-kept]')).toContainText('(10 days left)');
  await expect(card('Soon one').locator('[data-kept]')).toHaveAttribute('data-tone', 'soon');
  await expect(card('Offline one').locator('[data-kept]')).toContainText('Can be restored until 29 Nov 2026');
  await expect(card('No info').locator('[data-kept]')).toHaveCount(0);
});

test('Create an invitation opens the new designs page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    const p = { id: 'a', name: 'A', title: 'A', category: 'Wedding', templateId: 'minimalist', status: 'Draft', functions: [], photos: [], editedAt: Date.now() };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.page = 'dashboard'; render();
  });
  await page.getByRole('button', { name: /Create an invitation/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator('.figma-island-host')).toBeVisible();
});
