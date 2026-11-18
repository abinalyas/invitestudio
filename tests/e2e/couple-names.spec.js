// "A weds B" (and the other ways of writing two names) is read as two names, the same as "A & B" and "A and B".
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

// The hosts suggestion lives in the editor (setup no longer asks for the hosts).
async function openStory(page, title) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startSetup('minimalist'));
  await page.locator('#projectTitle').fill(title);
  await completeSetupSteps(page);
  await expect(page.locator('[data-field="hosts"]')).toBeVisible({ timeout: 15000 });
}

for (const [typed, couple] of [['Anna weds Ben', 'Anna and Ben'], ['Anna and Ben', 'Anna and Ben'], ['Anna & Ben', 'Anna and Ben'], ['Anna marries Ben', 'Anna and Ben'], ['Anna x Ben', 'Anna and Ben']]) {
  test(`"${typed}" gives the hosts suggestion for ${couple}`, async ({ page }) => {
    await openStory(page, typed);
    const card = page.locator('.sample-chips.has-card').filter({ has: page.locator('.sample-card p', { hasText: 'Hosted by the families' }) });
    await expect(card.locator('.sample-card p')).toContainText(`Hosted by the families of ${couple}`);
  });
}

test('in the editor preview, "Anna weds Ben" is drawn as two names', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const p = { id: 'e1', name: 'x', category: 'Wedding', templateId: 'minimalist', status: 'Draft', title: 'Anna weds Ben', date: '2027-06-19', location: 'Kochi', message: '', hosts: '', story: '', photos: [], functions: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' } };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
  });
  await expect(page.locator('[data-edit="names:first"]').first()).toHaveText('Anna', { timeout: 15000 });
  await expect(page.locator('[data-edit="names:second"]').first()).toHaveText('Ben');
});
