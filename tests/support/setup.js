// Drives the four-step setup wizard (Essentials, Template, Story and details, Ready)
// the way a couple does. Names are required; every later step is optional.
const { expect } = require('@playwright/test');

async function completeSetupSteps(page) {
  const next = () => page.getByRole('button', { name: /^Continue/ });
  await next().click(); // Essentials -> Template
  await next().click(); // Template -> Story and details
  await next().click(); // Story and details -> Ready
  const open = page.getByRole('button', { name: /open editor/i });
  // With the API enabled, the Ready step only unlocks once the server confirms the draft.
  await expect(open).toBeEnabled({ timeout: 15000 });
  await open.click();
}

// A returning visitor with a saved draft: the welcome-back card has one button, "My invitations"; the list shows each invitation with
// an Edit button. This does what "Continue editing" used to do: open the (most recent) saved draft in the editor.
async function openLatestDraft(page) {
  await page.locator('section[aria-label="Continue your draft"]').getByRole('button', { name: 'My invitations' }).click();
  await expect(page.getByRole('heading', { name: 'My invitations' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
}

module.exports = { completeSetupSteps, openLatestDraft };
