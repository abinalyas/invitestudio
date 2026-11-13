// Prices follow the visitor's country (decided on the server), can be switched, and are never shown wrong.
const { test, expect } = require('@playwright/test');

// The real pricing module answers, as the server would, for the country the test pretends to be in.
async function pricesFor(page, country, { fail = false } = {}) {
  const { pricingFor, regionForCountry, normalRegion } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing**', route => {
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"DOWN"}}' });
    const asked = normalRegion(new URL(route.request().url()).searchParams.get('region'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pricingFor(asked || regionForCountry(country)), country, detected: !asked, mode: 'early-access' }) });
  });
}
const plans = page => page.locator('.plans .plan');

test('home: the three tiers show this country\'s price, and switching the region changes the currency', async ({ page }) => {
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
  await expect(plans(page).nth(2)).toContainText('4 designs');
  await expect(plans(page).nth(2)).toContainText('Velvet Reveal');
  // A traveller or someone on a VPN can pick another region; it is remembered.
  await page.getByLabel('Show prices for').selectOption('us');
  await expect(plans(page).nth(0)).toContainText('$19');
  await expect(plans(page).nth(2)).toContainText('$59');
  expect(await page.evaluate(() => localStorage.getItem('invitestudio-region'))).toBe('us');
  await page.reload();
  await expect(plans(page).nth(0)).toContainText('$19');
});

test('home: a visitor in the UK sees pounds, and the old placeholder plans are gone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await pricesFor(page, 'GB');
  await page.goto('/');
  await expect(plans(page).nth(1)).toContainText('£29');
  await expect(page.locator('.pricing')).not.toContainText('Pro+');
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
