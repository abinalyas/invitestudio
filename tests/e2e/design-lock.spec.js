// After paying, the editor's design list locks designs above the paid price tier, and says why.
const { test, expect } = require('@playwright/test');

async function openEditor(page, project = {}) {
  const { pricingFor } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pricingFor('in'), country: 'IN', mode: 'live' }) }));
  await page.goto('/');
  await page.evaluate(project => {
    localStorage.clear();
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const p = {
      id: 'e1', name: 'Mira', category: 'Wedding', templateId: 'minimalist', status: 'Draft', title: 'Mira & Arun', date: '2027-06-19', location: 'Kochi',
      message: '', hosts: '', story: '', photos: [], functions: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }, ...project
    };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
  }, project);
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Change design/ }).click();
  await expect(page.getByRole('group', { name: 'Designs' })).toBeVisible();
}

const option = (page, name) => page.getByRole('group', { name: 'Designs' }).getByRole('button', { name: new RegExp(`^${name}`) });

test('after paying for Classic, Premium and Signature designs are locked and Classic ones can be chosen', async ({ page }) => {
  await openEditor(page, { paidTier: 'classic', publishUnlocked: true });
  await expect(page.locator('#designLockNote')).toContainText('You paid for the Classic tier');
  for (const locked of ['Cinematic', 'Fairy Tale', 'Velvet Reveal', 'Golden Butterfly']) await expect(option(page, locked)).toBeDisabled();
  await expect(option(page, 'Modern Heritage')).toBeEnabled();
  await option(page, 'Modern Heritage').click();
  await expect.poll(() => page.evaluate(() => state.projects[0].templateId)).toBe('modern-heritage');
});

test('after paying for Premium, Signature designs stay locked and Classic and Premium ones are open', async ({ page }) => {
  await openEditor(page, { templateId: 'cinematic', paidTier: 'premium', publishUnlocked: true });
  await expect(option(page, 'Golden Butterfly')).toBeDisabled();
  await expect(option(page, 'Fairy Tale')).toBeEnabled();
  await expect(option(page, 'Minimalist')).toBeEnabled();
});

test('before any payment no design is locked and there is no note', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('#designLockNote')).toHaveCount(0);
  await expect(option(page, 'Velvet Reveal')).toBeEnabled();
});
