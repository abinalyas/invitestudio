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

// On a phone the hero's button scrolls away with the hero. The same button then waits at the bottom of the screen, so there is always a
// way to start, and steps aside at the closing section, which has its own. On a wide screen there is no bar.
test('phone: once the hero button has scrolled away, Choose your design stays at the bottom of the screen, except while the closing button is on screen', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await stubPrices(page, 'in');
  await page.goto('/');
  const bar = page.locator('.home-page .home-sticky');
  const barButton = bar.getByRole('link', { name: 'Choose your design' });
  await expect(page.locator('.home-page .hero').getByRole('link', { name: 'Choose your design' })).toBeInViewport();
  // At the top: the hero has the button, the bar is away (not visible, not reachable by keyboard).
  await expect(barButton).toBeHidden();
  // Scrolled into the middle of the page: the bar is there, with the button and the promise, inside the screen.
  for (const section of ['#designs', '#how', '#pricing']) {
    await page.locator(`.home-page ${section}`).scrollIntoViewIfNeeded();
    await expect(barButton).toBeVisible();
    await expect(barButton).toBeInViewport();
  }
  await expect(barButton).toHaveAttribute('href', '/templates');
  await expect(bar).toContainText('Free to build');
  await expect(bar).toContainText('Pay only to publish');
  // Nothing in the bar is cut off at phone width.
  expect(await bar.locator('strong, small').evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
  const box = await barButton.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeLessThanOrEqual(851);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The closing section has its own button: the bar steps aside while it is on screen, so the same button is not shown twice.
  await page.locator('.home-page #cta').getByRole('link', { name: 'Choose your design' }).scrollIntoViewIfNeeded();
  await expect(barButton).toBeHidden();
  // Below it, in the footer, the bar is back, and it covers none of the footer.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(barButton).toBeVisible();
  const barTop = (await bar.boundingBox()).y;
  const footerEnd = await page.locator('.home-page .footer').evaluate(el => el.getBoundingClientRect().bottom);
  expect(footerEnd).toBeLessThanOrEqual(barTop + 1);
  // Back at the top, the hero's button is the one.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(barButton).toBeHidden();
});

test('desktop: there is no bottom bar; the header and the hero carry the buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubPrices(page, 'gb');
  await page.goto('/');
  await page.locator('.home-page #pricing').scrollIntoViewIfNeeded();
  await expect(page.locator('.home-page .home-sticky')).toBeHidden();
});
