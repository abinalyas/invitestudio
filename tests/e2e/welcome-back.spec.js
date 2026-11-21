// The welcome-back card for a returning visitor: one button to "My invitations", the list page, and the same name in the header.
const { test, expect } = require('@playwright/test');
const { completeSetupSteps } = require('../support/setup');

async function withSavedDraft(page, title = 'Mira & Arun') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  await completeSetupSteps(page);
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
  await page.evaluate(() => { localStorage.setItem('invitestudio-current-draft', JSON.stringify({ localId: current().id })); save(); });
  await page.reload();
}

const banner = page => page.locator('section[aria-label="Continue your draft"]');

test('the welcome-back card is simple: a short message and one button, My invitations', async ({ page }) => {
  await withSavedDraft(page);
  await expect(banner(page)).toBeVisible({ timeout: 15000 });
  await expect(banner(page)).toContainText('Welcome back');
  await expect(banner(page)).toContainText('Pick up where you left off');
  await expect(banner(page).getByRole('button')).toHaveCount(1);
  await expect(banner(page).getByRole('button', { name: 'My invitations' })).toBeVisible();
  // The old wording and the second button are gone, and the long private-link paragraph is not on the card.
  await expect(banner(page)).not.toContainText(/continue editing|new website|website/i);
  await expect(banner(page)).not.toContainText('private link');
});

test('My invitations takes the visitor to the list, which says invitation (not project or website)', async ({ page }) => {
  await withSavedDraft(page, 'Priya & Dev');
  await banner(page).getByRole('button', { name: 'My invitations' }).click();
  await expect(page.getByRole('heading', { name: 'My invitations' })).toBeVisible();
  await expect(page.getByText('Priya & Dev')).toBeVisible();
  await expect(page.getByRole('button', { name: /Create an invitation/ })).toBeVisible();
  await expect(page.getByText('Start a new invitation')).toBeVisible();
  const text = await page.locator('main.dash').innerText();
  expect(text).not.toMatch(/My projects|Create a website|new project/i);
  // The page's own header says it too.
  await expect(page.locator('header.pv-top')).toContainText('My invitations');
  await expect(page.locator('header.pv-top')).not.toContainText('My projects');
  // Edit opens it in the editor.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => state.page)).toBe('editor');
});

test('the header link says My invitations too, and goes to the same list', async ({ page }) => {
  await withSavedDraft(page);
  const link = page.locator('.my-projects-link');
  await expect(link).toHaveText('My invitations', { timeout: 15000 });
  await link.click();
  await expect(page.getByRole('heading', { name: 'My invitations' })).toBeVisible();
});

test('deleting from the list talks about the invitation', async ({ page }) => {
  await withSavedDraft(page, 'Delete Me');
  await banner(page).getByRole('button', { name: 'My invitations' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  const dialog = page.locator('#modal-root');
  await expect(dialog).toContainText('Delete invitation');
  await expect(dialog).toContainText('Delete “Delete Me”?');
  await expect(dialog.locator('.eyebrow')).not.toContainText('website');
});

test('the header offers "Start creating" only to people with no invitation; returning people see "My invitations" and the hero button starts a new one', async ({ page }) => {
  await page.setViewportSize({ width: 411, height: 850 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const header = page.locator('.site-header .header-actions');
  await expect(header.getByRole('link', { name: 'Start creating' })).toBeVisible({ timeout: 15000 });
  await expect(header.getByRole('button', { name: 'My invitations' })).toHaveCount(0);

  await withSavedDraft(page);
  await expect(header.getByRole('button', { name: 'My invitations' })).toBeVisible({ timeout: 15000 });
  await expect(header.getByRole('link', { name: 'Start creating' })).toHaveCount(0);
  await expect(page.locator('.hero-buttons').getByRole('link', { name: 'Browse wedding designs' })).toBeVisible();
});
