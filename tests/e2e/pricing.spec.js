// Prices follow the visitor's country (decided on the server, never chosen on the page), and are never shown wrong.
const { test, expect } = require('@playwright/test');

// The real pricing module answers, as the server would, for the country the test pretends to be in.
async function pricesFor(page, country, { fail = false } = {}) {
  const { pricingFor, regionForCountry } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing**', route => {
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"DOWN"}}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pricingFor(regionForCountry(country)), country, mode: 'early-access' }) });
  });
}
const plans = page => page.locator('.plans .plan');

test('home: the three tiers show this country\'s price, with no country or currency to choose', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'IN');
  await page.goto('/');
  await expect(plans(page)).toHaveCount(3);
  await expect(plans(page).nth(0)).toContainText('Classic');
  await expect(plans(page).nth(0)).toContainText('₹999');
  await expect(plans(page).nth(1)).toContainText('₹1,999');
  await expect(plans(page).nth(2)).toContainText('₹2,999');
  await expect(plans(page).nth(2)).toContainText('one-time');
  await expect(page.getByText('Publishing is free during early access')).toBeVisible();
  // Each tier says which designs belong to it.
  await expect(plans(page).nth(2)).toContainText('5 designs');
  await expect(plans(page).nth(2)).toContainText('Velvet Reveal');
  // The price follows where the visitor is: there is nothing to pick.
  await expect(page.locator('.pricing select')).toHaveCount(0);
  await expect(page.getByLabel('Show prices for')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('invitestudio-region'))).toBeNull();
});

test('home: visitors in other countries see their own currency, and the old placeholder plans are gone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'GB');
  await page.goto('/');
  await expect(plans(page).nth(1)).toContainText('£29');
  await expect(page.locator('.pricing')).not.toContainText('Pro+');
  await expect(page.locator('.pricing select')).toHaveCount(0);
  await expect(page.locator('.pricing')).not.toContainText('Yearly');
  await expect(page.locator('.pricing')).not.toContainText('/month');
});

test('home: if the prices cannot be loaded, no numbers are shown (never a wrong price)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'IN', { fail: true });
  await page.goto('/');
  await expect(page.getByText('Prices are shown when you choose a design.')).toBeVisible();
  await expect(plans(page)).toHaveCount(0);
  await expect(page.locator('.pricing')).not.toContainText('₹');
});

test('template page and gallery: each design shows its tier and the price for this country', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'IN');
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/templates/19'); state.page = 'home'; render(); });
  await expect(page.getByTestId('detail-price')).toContainText('₹2,999');
  await expect(page.getByTestId('detail-price')).toContainText('Signature');
  await expect(page.getByTestId('detail-price')).toContainText('Free during early access');
  await page.evaluate(() => { history.pushState({}, '', '/templates/6'); state.page = 'home'; render(); });
  await expect(page.getByTestId('detail-price')).toContainText('₹999');
  await expect(page.getByTestId('detail-price')).toContainText('Classic');
  await page.evaluate(() => { history.pushState({}, '', '/templates'); state.page = 'home'; render(); });
  await expect(page.locator('.gallery-card').filter({ hasText: 'Velvet Reveal' }).locator('.gallery-price')).toContainText('Signature');
  await expect(page.locator('.gallery-card').filter({ hasText: 'Velvet Reveal' }).locator('.gallery-price')).toContainText('₹2,999');
});

// "See <tier> designs" on the home page shows only that tier's designs in the gallery.
// The test server is a plain static one, where /templates is a folder. The real site serves the application there, so do the same.
const fs = require('node:fs');
const path = require('node:path');
async function serveAppAtTemplates(page) {
  const shell = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  await page.route(url => url.pathname === '/templates', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: shell }));
}
const galleryTitles = page => page.locator('.gallery-card .gallery-card-title h2');

test('home: each tier\'s "See designs" button opens the gallery with only that tier\'s designs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'IN');
  await serveAppAtTemplates(page);
  await page.goto('/');
  const expected = { classic: ['Modern Heritage', 'Minimalist'], premium: ['Cinematic', 'Fairy Tale', 'Bloom Reveal'], signature: ['Velvet Reveal', 'Under the Same Moon', 'Golden Butterfly', 'Cherry Blossom', 'Lantern Night'] };
  const buttons = plans(page).locator('a[href^="/templates"]');
  await expect(buttons).toHaveCount(3);
  for (const [index, tier] of ['classic', 'premium', 'signature'].entries()) {
    await expect(buttons.nth(index)).toHaveAttribute('href', `/templates?tier=${tier}`);
  }
  for (const [index, tier] of ['classic', 'premium', 'signature'].entries()) {
    await page.goto('/');
    await plans(page).nth(index).locator('a[href^="/templates"]').click();
    await expect(page).toHaveURL(new RegExp(`/templates\\?tier=${tier}$`));
    await expect(galleryTitles(page)).toHaveCount(expected[tier].length);
    expect((await galleryTitles(page).allTextContents()).sort()).toEqual([...expected[tier]].sort());
    // The page says which tier it is showing, and the Price filter shows the same choice.
    await expect(page.locator('[data-tier-note]')).toBeVisible();
    await expect(page.locator('[data-tier-note]')).toContainText(`Showing ${expected[tier].length} ${tier[0].toUpperCase()}${tier.slice(1)} design`);
    await expect(page.locator('[data-tier-filter] input:checked')).toHaveCount(1);
  }
});

test('gallery: the Price filter changes the designs, clears, and keeps the address in step', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'IN');
  await serveAppAtTemplates(page);
  await page.goto('/templates?tier=premium');
  await expect(galleryTitles(page)).toHaveCount(3);
  const filter = page.locator('[data-tier-filter]');
  await expect(filter.locator('label')).toHaveCount(3);
  await expect(filter.locator('label').nth(2)).toContainText('5');
  await filter.getByText('Signature').click();
  await expect(galleryTitles(page)).toHaveCount(5);
  await expect(page).toHaveURL(/\/templates\?tier=signature$/);
  await filter.getByText('Signature').click();
  await expect(galleryTitles(page)).toHaveCount(10);
  await expect(page).toHaveURL(/\/templates$/);
  // "Show all designs" in the note clears it too.
  await page.goto('/templates?tier=classic');
  await expect(galleryTitles(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Show all designs' }).click();
  await expect(galleryTitles(page)).toHaveCount(10);
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator('[data-tier-note]')).toHaveCount(0);
  // On a narrow screen the results line shows, and its Clear filters clears the tier as well.
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/templates?tier=premium');
  await expect(galleryTitles(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(galleryTitles(page)).toHaveCount(10);
});

test('gallery: an unknown tier, or prices that did not load, show every design rather than an empty page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'IN');
  await serveAppAtTemplates(page);
  await page.goto('/templates?tier=platinum');
  await expect(galleryTitles(page)).toHaveCount(10);
  await expect(page.locator('[data-tier-note]')).toHaveCount(0);
  await page.unroute('**/api/pricing**');
  await pricesFor(page, 'IN', { fail: true });
  await page.goto('/templates?tier=premium');
  await expect(galleryTitles(page)).toHaveCount(10);
  await expect(page.locator('[data-tier-filter]')).toHaveCount(0);
});

// The template page keeps to what helps a visitor decide: no "Opening" or colours sections.
test('template page: no Opening or colours sections, and the way back to all designs stays', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'IN');
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/templates/16'); state.page = 'home'; render(); });
  const info = page.locator('.figma-island-host .detail-info');
  await expect(info).toBeVisible();
  await expect(info.getByRole('heading', { name: 'What you can edit' })).toBeVisible();
  await expect(info.getByRole('heading', { name: 'What your guests see' })).toBeVisible();
  const text = await info.innerText();
  expect(text).not.toMatch(/\bOpening\b/);
  expect(text).not.toMatch(/colours/i);
  await expect(info.locator('.swatches')).toHaveCount(0);
  await expect(page.locator('.figma-island-host').getByRole('link', { name: 'Templates' }).first()).toBeVisible();
});
