// The home page (figma/islands/Home.tsx, launch rebuild): six short sections that lead with what the product looks like.
const { test, expect } = require('@playwright/test');

async function stubPrices(page, region, mode = 'live') {
  const { pricingFor } = await import('../../functions/_shared/pricing.js');
  await page.route('**/api/pricing**', route => route.fulfill({ json: { ...pricingFor(region), mode } }));
}

for (const [device, width, height] of [['desktop', 1280, 800], ['phone', 393, 851]]) {
  test(`${device}: the hero says what it is, offers one button and the price, and plays a sample invitation`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await stubPrices(page, device === 'phone' ? 'in' : 'gb');
    const startPrice = device === 'phone' ? '₹999' : '£15';
    await page.goto('/');
    const hero = page.locator('.home-page .hero');
    await expect(hero.locator('h1')).toHaveText(/Your wedding\s*invitation,\s*in one link/);
    await expect(hero.locator('.hero-sub')).toHaveText('It opens like a film. Then guests see every event, find the venue and tell you they’re coming.');
    const choose = hero.getByRole('link', { name: 'Choose your design' });
    await expect(choose).toHaveAttribute('href', '/templates');
    await expect(choose).toBeInViewport();
    await expect(hero.locator('.hero-promise')).toContainText('Free to build and preview.');
    await expect(hero.locator('.hero-promise')).toContainText(`Pay once to publish, from ${startPrice}.`);
    await expect(hero.locator('.hero-promise')).toBeInViewport();

    // The sample plays by itself, muted, with no player controls, and can be paused (it loops for longer than 5 seconds).
    const demo = hero.locator('video');
    await expect(demo).toBeVisible();
    await expect(demo).toHaveAccessibleName(/photo gallery/);
    await expect(demo).toHaveJSProperty('muted', true);
    await expect(demo).toHaveJSProperty('controls', false);
    await expect.poll(() => demo.evaluate(video => video.currentTime)).toBeGreaterThan(0);
    await hero.getByRole('button', { name: 'Pause the sample invitation' }).click();
    await expect(demo).toHaveJSProperty('paused', true);
    await expect(hero.getByRole('button', { name: 'Play the sample invitation' })).toBeVisible();
    await expect(hero.getByRole('link', { name: 'See a sample invitation' })).toHaveAttribute('href', '/templates/18?view=sample'); // the full-screen sample (tests/e2e/guest-sample.spec.js)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('people who ask for less motion get still pictures: nothing plays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubPrices(page, 'in');
  await page.goto('/');
  await expect(page.locator('.home-page .hero video')).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.locator('.home-page video').evaluateAll(videos => videos.filter(v => !v.paused).length)).toBe(0);
  await expect(page.locator('.home-page .play-toggle')).toHaveCount(0);
});

test('every design in the gallery is shown playing its own opening, with its tier and price, linking to its page', async ({ page }) => {
  await stubPrices(page, 'us');
  await page.goto('/');
  const cards = page.locator('#designs .opening-card');
  await expect(cards).toHaveCount(9);
  for (const [name, tier, path] of [
    ['Lantern Night', 'Signature · $59', '/templates/23'],
    ['Velvet Reveal', 'Signature · $59', '/templates/19'],
    ['Bloom Reveal', 'Premium · $39', '/templates/18'],
    ['Minimalist', 'Classic · $19', '/templates/14'],
  ]) {
    const card = cards.filter({ hasText: name });
    await expect(card).toHaveAttribute('href', path);
    await expect(card).toContainText(tier);
  }
  // Each opening is downloaded only when it comes into view, and its picture is shown until then.
  for (const video of await page.locator('#designs video').all()) {
    await expect(video).toHaveAttribute('preload', 'none');
    expect(await video.getAttribute('poster')).toMatch(/^\/assets\/home\/openings\/[a-z-]+\.webp$/);
  }
  // Every opening and picture exists.
  for (const src of await page.locator('#designs video source').evaluateAll(list => list.map(s => s.getAttribute('src')))) {
    expect((await page.request.get(src)).status(), src).toBe(200);
  }
  await page.locator('#designs').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('#designs video').evaluateAll(videos => videos.filter(v => v.currentTime > 0).length)).toBeGreaterThan(0);
});

test('why one link: three points and the two real screens (the WhatsApp card and the reply list)', async ({ page }) => {
  await page.goto('/');
  const why = page.locator('#features');
  await expect(why.locator('h2')).toHaveText('It opens like a video. Then it stays useful.');
  await expect(why.locator('.why-points li')).toHaveCount(3);
  for (const image of await why.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  }
});

test('three steps, paying only at the last; the "we build it for you" offer opens WhatsApp with what we need to start', async ({ page }) => {
  await page.goto('/');
  const steps = page.locator('#how .how-steps li');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(2)).toContainText('One-time payment');
  const offer = page.locator('[data-build-for-you]');
  await expect(offer).toContainText('You pay only if you publish.');
  const whatsapp = offer.getByRole('link', { name: 'WhatsApp us' });
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);
  expect(decodeURIComponent(await whatsapp.getAttribute('href'))).toContain('Wedding date:');
});

test('price: three tiers in this country’s currency, each linking to its designs; five questions, all answerable', async ({ page }) => {
  await stubPrices(page, 'in');
  await page.goto('/');
  const pricing = page.locator('.home-page #pricing');
  await expect(pricing.locator('h2')).toHaveText('One payment. No subscription.');
  await expect(pricing.locator('.plan')).toHaveCount(3);
  await expect(pricing.locator('.plan').nth(2)).toContainText('₹2,999');
  await expect(pricing.locator('.plan').nth(2)).toContainText('5 designs');
  const questions = page.locator('#faq-list .faq-item');
  await expect(questions).toHaveCount(5);
  // The answers that used to live in the plan section are still one tap away.
  await questions.filter({ hasText: 'Can I change my design later?' }).getByRole('button').click();
  await expect(questions.filter({ hasText: 'Can I change my design later?' })).toContainText('Signature covers every design');
  await questions.filter({ hasText: 'What happens after the wedding?' }).getByRole('button').click();
  await expect(questions.filter({ hasText: 'What happens after the wedding?' })).toContainText('2 months after your event');
});

test('the page stays short: no more than 7 phone screens, and none of the removed sections come back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubPrices(page, 'in');
  await page.goto('/');
  await expect(page.locator('#designs .opening-card')).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight)).toBeLessThanOrEqual(7);
  for (const gone of ['.switch-strip', '.what-assure', '.featured-designs', '.free-paid', '.steps.four']) {
    await expect(page.locator(gone)).toHaveCount(0);
  }
});
