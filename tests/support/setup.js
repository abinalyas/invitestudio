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

module.exports = { completeSetupSteps };
