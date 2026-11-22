// People who want something made just for them need an obvious way to ask: a card with real WhatsApp and email buttons on the
// gallery, on a design's page and on the home page.
const { test, expect } = require('@playwright/test');

async function pricesFor(page) {
  const { pricingFor, regionForCountry } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pricingFor(regionForCountry('IN')), country: 'IN', mode: 'early-access' }) }));
}

async function expectCard(page) {
  const card = page.locator('[data-custom-card]');
  await expect(card).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText('Want something made just for you?');
  const whatsapp = card.getByRole('link', { name: 'Chat on WhatsApp' });
  await expect(whatsapp).toBeVisible();
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/\d{7,15}\?text=.*design%20made%20just%20for%20us/);
  await expect(whatsapp).toHaveAttribute('target', '_blank');
  await expect(card.getByRole('link', { name: 'Email us' })).toHaveAttribute('href', /^mailto:.+@.+\?subject=/);
  // Big enough for a thumb, and inside the screen.
  for (const link of [whatsapp, card.getByRole('link', { name: 'Email us' })]) {
    const box = await link.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
}

test('the gallery and a design page offer a custom design card; the home page offers it in its footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await pricesFor(page);
  await page.goto('/');
  // The home page leads with "we build it for you" instead (launch rebuild); a custom design is the footer's "Want something unique?".
  const unique = page.locator('.footer-talk');
  await expect(unique).toContainText('Want something unique?');
  expect(decodeURIComponent(await unique.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'))).toContain('made just for us');

  await page.evaluate(() => { history.pushState({}, '', '/templates'); state.page = 'home'; render(); });
  await expect(page.locator('.gallery-card').first()).toBeVisible({ timeout: 15000 });
  await expectCard(page);

  await page.evaluate(() => { history.pushState({}, '', '/templates/6'); state.page = 'home'; render(); });
  await expect(page.getByTestId('detail-price')).toBeVisible({ timeout: 15000 });
  await expectCard(page);
});
