const { test, expect } = require('@playwright/test');

for (const [device, width, height] of [['desktop', 1280, 800], ['phone', 393, 851]]) {
  test(`${device}: the hero shows the demo, design CTA and India publishing price`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const hero = page.locator('.home-page .hero');
    const browse = hero.getByRole('link', { name: 'Browse wedding designs' });
    await expect(browse).toHaveAttribute('href', '/templates');
    await expect(browse).toBeInViewport();
    await expect(hero.locator('.hero-sub')).toHaveText('One InviteStudio link for your wedding schedule, photos, and RSVPs.');
    await expect(hero.locator('.hero-promise')).toContainText('Preview free.');
    await expect(hero.locator('.hero-promise')).toContainText('One-time publishing from ₹999 in India.');
    await expect(hero.locator('.hero-promise')).toBeInViewport();
    const sample = hero.getByRole('link', { name: 'See a sample invitation' });
    await expect(sample).toHaveAttribute('href', '/templates/18');
    await expect(sample).toBeInViewport();

    const demo = hero.locator('video');
    await expect(demo).toBeVisible();
    expect((await sample.boundingBox()).y).toBeLessThan((await demo.boundingBox()).y);
    await expect(demo).toHaveAccessibleName(/photo gallery/);
    await expect(demo).toHaveAttribute('preload', 'none');
    await expect(demo).toHaveJSProperty('paused', true);
    await demo.evaluate(video => video.play());
    await expect.poll(() => demo.evaluate(video => video.currentTime)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('features show a sample WhatsApp card and a host’s reply list', async ({ page }) => {
  await page.goto('/');
  const examples = page.locator('#features .feature-examples');
  await expect(examples.getByRole('figure')).toHaveCount(2);
  for (const image of await examples.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  }
});

test('three priced designs follow the hero, and pricing explains hosting and RSVP export', async ({ page }) => {
  const { pricingFor } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing', route => route.fulfill({ json: { ...pricingFor('us'), mode: 'early-access' } }));
  await page.goto('/');
  const featured = page.locator('.home-page .hero + .featured-designs');
  await expect(featured.getByRole('article')).toHaveCount(3);
  for (const [name, price, path] of [
    ['Minimalist', '₹999', '/templates/14'],
    ['Bloom Reveal', '₹1,999', '/templates/18'],
    ['Under the Same Moon', '₹2,999', '/templates/20'],
  ]) {
    const card = featured.getByRole('article').filter({ has: page.getByRole('heading', { name }) });
    await expect(card).toContainText(price);
    await expect(card.getByRole('link', { name: `Preview ${name}` })).toHaveAttribute('href', path);
  }
  await expect(featured).toContainText('One-time publishing prices in India after early access.');
  const pricing = page.locator('.home-page #pricing');
  await expect(pricing).toContainText('Publishing is free during early access.');
  await expect(pricing).toContainText('two months after your last event');
  await expect(pricing).toContainText('Export your RSVPs before your invitation expires.');
});
