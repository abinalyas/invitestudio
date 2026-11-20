// The policy pages (functions/_shared/policies.js) as a browser shows them: one heading, the footer links to all the others, and nothing
// that scrolls sideways on a phone. The pages are built by the same code the server uses and loaded straight into the page.
// Set POLICY_SHOTS=<folder> to also save a picture of each page.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

for (const [name, width] of [['phone', 390], ['desktop', 1280]]) {
  test(`delivery policy (${name}): reads cleanly, links to every policy and does not scroll sideways`, async ({ page }) => {
    const { pageFor, policyDocument } = await import('../../functions/_shared/seo.js');
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(policyDocument(pageFor('/delivery-policy'), 'http://127.0.0.1:4173'), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delivery policy');
    await expect(page.getByText('Last updated: 20 November 2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What we deliver' })).toBeVisible();
    for (const [label, href] of [['Terms', '/terms'], ['Refund policy', '/refund-policy'], ['Delivery policy', '/delivery-policy'], ['Privacy', '/privacy'], ['Contact', '/contact']]) {
      await expect(page.locator(`footer a[href$="${href}"]`).first(), label).toBeAttached();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.POLICY_SHOTS) {
      fs.mkdirSync(process.env.POLICY_SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.POLICY_SHOTS, `delivery-${name}.png`), fullPage: true });
    }
  });
}
