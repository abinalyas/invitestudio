// My invitations: each card says when the invitation stops being online (drafts: an estimate; published: the closing date,
// with the days left once inside the warning window). The dates come from GET /api/weddings/:id/retention.
const { test, expect } = require('@playwright/test');

const ID = {
  draft: '11111111-1111-4111-8111-111111111111',
  live: '22222222-2222-4222-8222-222222222222',
  soon: '33333333-3333-4333-8333-333333333333',
  off: '44444444-4444-4444-8444-444444444444',
  none: '55555555-5555-4555-8555-555555555555',
  idle: '66666666-6666-4666-8666-666666666666',
  idleSoon: '77777777-7777-4777-8777-777777777777',
  idleGone: '88888888-8888-4888-8888-888888888888'
};
const TOKEN = 'a'.repeat(40);
const RETENTION = {
  [ID.draft]: { available: true, hasClock: false, endsOn: null, estimatedEndsOn: '2027-10-19', stage: 'no_clock', daysLeft: null, warnDays: 14 },
  [ID.live]: { available: true, hasClock: true, endsOn: '2027-03-14', stage: 'keep', daysLeft: 200, warnDays: 14 },
  [ID.soon]: { available: true, hasClock: true, endsOn: '2026-12-01', stage: 'keep', daysLeft: 10, warnDays: 14 },
  [ID.off]: { available: true, hasClock: true, endsOn: '2026-11-01', deleteOn: '2026-11-29', stage: 'hidden', daysLeft: -20, warnDays: 14, closed: true },
  [ID.none]: { available: false },
  // Drafts that were never published: removed after 30 days without a change (warned in the last 7, then a grace period).
  [ID.idle]: { available: true, draft: true, hasClock: true, endsOn: '2027-02-09', deleteOn: '2027-02-23', stage: 'keep', daysLeft: 25, warnDays: 7, estimatedEndsOn: '2027-08-15' },
  [ID.idleSoon]: { available: true, draft: true, hasClock: true, endsOn: '2026-11-25', deleteOn: '2026-12-09', stage: 'keep', daysLeft: 4, warnDays: 7 },
  [ID.idleGone]: { available: true, draft: true, hasClock: true, endsOn: '2026-11-10', deleteOn: '2026-11-24', stage: 'hidden', daysLeft: -11, warnDays: 7 }
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
    const projects = [mk('draft', 'Draft one', 'Draft'), mk('live', 'Live one', 'Published'), mk('soon', 'Soon one', 'Published'), mk('off', 'Offline one', 'Draft'), mk('none', 'No info', 'Draft'), mk('idle', 'Idle one', 'Draft'), mk('idleSoon', 'Idle soon', 'Draft'), mk('idleGone', 'Idle gone', 'Draft')];
    localStorage.setItem('invitestudio-projects', JSON.stringify(projects));
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify(Object.fromEntries(Object.values(ID).map(i => [i, TOKEN]))));
    // eslint-disable-next-line no-undef
    state.projects = projects; state.page = 'dashboard'; render();
  }, { ID, TOKEN });
  const card = name => page.locator('article.dash-card', { hasText: name });
  // A server that has not been updated for drafts still answers with the old shape: the estimate is shown.
  await expect(card('Draft one').locator('[data-kept]')).toContainText('Once live, online until 19 Oct 2027');
  await expect(card('Live one').locator('[data-kept]')).toContainText('Online until 14 Mar 2027');
  await expect(card('Soon one').locator('[data-kept]')).toContainText('(10 days left)');
  await expect(card('Soon one').locator('[data-kept]')).toHaveAttribute('data-tone', 'soon');
  await expect(card('Offline one').locator('[data-kept]')).toContainText('Can be restored until 29 Nov 2026');
  await expect(card('No info').locator('[data-kept]')).toHaveCount(0);
  // A draft says when it is removed if nobody changes it (not when an invitation would close).
  await expect(card('Idle one').locator('[data-kept]')).toContainText('Removed on 9 Feb 2027 if not edited');
  await expect(card('Idle one').locator('[data-kept]')).not.toContainText('days left');
  await expect(card('Idle soon').locator('[data-kept]')).toContainText('Removed on 25 Nov 2026 if not edited (4 days left)');
  await expect(card('Idle soon').locator('[data-kept]')).toHaveAttribute('data-tone', 'soon');
  await expect(card('Idle gone').locator('[data-kept]')).toContainText('Draft expired. Make a change by 24 Nov 2026 to keep it');
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
