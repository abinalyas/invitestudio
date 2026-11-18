// Drives the three-step setup wizard (Essentials, Events, Ready)
// the way a couple does. Names are required; every later step is optional.
const { expect } = require('@playwright/test');

async function completeSetupSteps(page) {
  const next = () => page.getByRole('button', { name: /^Continue/ });
  await next().click(); // Essentials -> Events
  await next().click(); // Events -> Ready
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

// Opens the editor straight on a design, skipping the setup steps (the template page no longer offers this to customers). `number` is the
// design's number in its address (/templates/13); its backend id is read from the design list in figma/islands/shared.tsx.
function backendIdOf(number) {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../figma/islands/shared.tsx'), 'utf8');
  const match = new RegExp(`id:\\s*${number},\\s*backendId:\\s*"([^"]+)"`).exec(source);
  if (!match) throw new Error(`No design number ${number} in shared.tsx`);
  return match[1];
}

async function quickStart(page, number) {
  await page.evaluate(([backendId, n]) => window.InviteStudioBridge.createDraft(backendId, n, ''), [backendIdOf(number), Number(number)]);
}

module.exports = { completeSetupSteps, openLatestDraft, quickStart };
