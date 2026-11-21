const { test, expect } = require('@playwright/test');

test('a draft with a real retention date shows when it expires even without a publish estimate', async ({ page }) => {
  const cloudId = '11111111-1111-4111-8111-111111111111';
  await page.addInitScript(id => {
    window.INVITESTUDIO_API_ENABLED = true;
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ [id]: 'a'.repeat(40) }));
    localStorage.setItem('invitestudio-projects', JSON.stringify([{
      id: 'undated-draft', cloudId: id, title: 'Undated draft', category: 'Wedding',
      templateId: 'minimalist', status: 'Draft', functions: [], photos: [],
    }]));
  }, cloudId);
  await page.route(`**/api/weddings/${cloudId}/retention`, route => route.fulfill({
    json: {
      available: true, hasClock: true, endsOn: '2027-02-18', estimatedEndsOn: null,
      source: 'no_date', stage: 'keep', daysLeft: 90, warnDays: 14,
    },
  }));
  await page.goto('/');
  await page.locator('.my-projects-link').click();
  const expiry = page.locator('.dash-card [data-kept]');
  await expect(expiry).toHaveText('Draft expires on 18 Feb 2027');
  await expect(expiry.locator('time')).toHaveAttribute('datetime', '2027-02-18');
});
