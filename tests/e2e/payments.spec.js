// Paying to publish: the dialog shows the price, takes the person to the payment page, brings them back, confirms with the server and
// carries on to publishing. The payment page itself is a stand-in (Razorpay is never contacted); the server is a small stand-in too.
const { completeSetupSteps } = require('../support/setup');
const { test, expect } = require('@playwright/test');

const WID = '88888888-8888-4888-8888-888888888888';
const PAYMENT = '99999999-9999-4999-8999-999999999999';
const TOKEN = 'p'.repeat(43);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function draftWithServer(page, { mode = 'live', country = 'IN', unlocked = false, paidOnReturn = true } = {}) {
  const { pricingFor, regionForCountry, normalRegion } = await import('../../functions/_shared/pricing.js');
  const server = { version: 1, unlocked, paid: false, checkouts: [], verifies: 0, publishes: [] };
  const wedding = () => ({
    id: WID, version: server.version, status: 'draft', visibility: 'private', slug: null, name: 'Mira & Arun', category: 'Wedding', template_id: 'velvet-reveal',
    title: 'Mira & Arun', event_date: '2027-01-20', location: '', message: '', story: '', hosts: '', locale: 'English', theme: {}, preferences: {},
    cultural_preferences: {}, sections: [], intro_settings: {}, animation_settings: {}, content: { functions: [], copy: {}, gallery: {} }, updated_at: '2026-11-13T10:00:00Z',
    publish_unlocked_at: server.unlocked ? '2026-11-13T10:00:00Z' : null
  });
  await page.route('**/api/**', route => route.abort());
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'velvet-reveal'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-20');
  await completeSetupSteps(page);
  await page.evaluate(({ wid, token }) => {
    const p = current();
    p.id = wid; p.cloudId = wid; p.cloudVersion = 1; p.cloudStatus = 'saved'; p.createRequestId = null; p.templateId = 'velvet-reveal';
    state.currentId = wid;
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ [wid]: token }));
    save();
    p.cloudStatus = 'saved';
    localStorage.setItem('invitestudio-projects', JSON.stringify(state.projects));
  }, { wid: WID, token: TOKEN });
  await page.unroute('**/api/**');
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
  // The payment page: "paying" there sends the person straight back with the payment id, as Razorpay's callback does.
  await page.route('https://rzp.io/**', route => {
    if (paidOnReturn) server.paid = true;
    return route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:4173/?payment=${PAYMENT}` } });
  });
  await page.route('**/api/**', route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/pricing') {
      const asked = normalRegion(url.searchParams.get('region'));
      return json({ ...pricingFor(asked || regionForCountry(country)), country, detected: !asked, mode });
    }
    if (url.pathname === `/api/weddings/${WID}` && method === 'GET') return json({ wedding: wedding(), photos: [] });
    if (url.pathname === `/api/weddings/${WID}/slug-availability`) return json({ available: true, slug: url.searchParams.get('slug'), suggestions: [] });
    if (url.pathname === `/api/weddings/${WID}/checkout` && method === 'POST') {
      server.checkouts.push(request.postDataJSON());
      return json({ paymentId: PAYMENT, url: 'https://rzp.io/i/test1', amountMinor: 299900, currency: 'INR', tier: 'signature', region: 'in' });
    }
    if (url.pathname === `/api/weddings/${WID}/payments/${PAYMENT}/verify` && method === 'POST') {
      server.verifies++;
      if (server.paid) server.unlocked = true;
      return json({ unlocked: server.paid, status: server.paid ? 'paid' : 'created' });
    }
    if (url.pathname === `/api/weddings/${WID}/publish` && method === 'POST') {
      const body = request.postDataJSON();
      server.publishes.push(body);
      if (mode === 'live' && !server.unlocked) return json({ error: { code: 'PAYMENT_REQUIRED', message: 'Publishing needs a one-time payment.' } }, 402);
      server.version += 1;
      return json({ wedding: { ...wedding(), status: 'published', visibility: 'public', slug: body.slug } });
    }
    if (url.pathname === '/api/edit-links') return json({ wedding: wedding(), photos: [] });
    return route.abort();
  });
  await page.reload();
  return server;
}

async function openShare(page) {
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
  return page.locator('#modal-root');
}

test('payments live: the dialog shows this design\'s price, and the main button takes a payment', async ({ page }) => {
  await draftWithServer(page, { country: 'IN' });
  const dialog = await openShare(page);
  await expect(dialog.locator('[data-price-note]')).toContainText('One-time price: ₹2,999');
  await expect(dialog.locator('[data-price-note]')).toContainText('Signature design');
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeEnabled({ timeout: 15000 });
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toHaveCount(0);
});

test('payments live: a visitor elsewhere sees their own currency', async ({ page }) => {
  await draftWithServer(page, { country: 'US' });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay $59 and continue' })).toBeEnabled({ timeout: 15000 });
});

test('pay, come back, get confirmed by the server, and go live', async ({ page }) => {
  const server = await draftWithServer(page);
  const dialog = await openShare(page);
  await dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  // Sent to the payment page and back; the dialog reopens by itself and confirms the payment with the server.
  await expect(dialog.locator('[data-payment-info]')).toContainText('Payment received', { timeout: 20000 });
  expect(server.checkouts).toEqual([{}], 'no amount is ever sent by the browser');
  expect(server.verifies).toBeGreaterThan(0);
  expect(page.url()).not.toContain('payment=');
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeEnabled({ timeout: 15000 });
  await expect(dialog.locator('[data-price-note]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Make it live' }).click();
  await expect(dialog.locator('h2')).toHaveText(/your invitation is live/i, { timeout: 15000 });
  expect(server.publishes.length).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('invitestudio-pending-payment'))).toBeNull();
});

test('back from the payment page but not confirmed yet: the person is told, and can check again', async ({ page }) => {
  const server = await draftWithServer(page, { paidOnReturn: false });
  const dialog = await openShare(page);
  await dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  await expect(dialog.locator('[data-payment-info]')).toContainText('have not heard back', { timeout: 40000 });
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toHaveCount(0);
  // The bank catches up; checking again unlocks it.
  server.paid = true;
  await dialog.getByRole('button', { name: 'Check again' }).click();
  await expect(dialog.locator('[data-payment-info]')).toContainText('Payment received', { timeout: 20000 });
});

test('early access: no payment is asked for, the price that will apply is shown, and Make it live just works', async ({ page }) => {
  const server = await draftWithServer(page, { mode: 'early-access' });
  const dialog = await openShare(page);
  await expect(dialog.locator('[data-price-note]')).toContainText('Free during early access');
  await expect(dialog.locator('[data-price-note]')).toContainText('₹2,999');
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeEnabled({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Make it live' }).click();
  await expect(dialog.locator('h2')).toHaveText(/your invitation is live/i, { timeout: 15000 });
  expect(server.checkouts.length).toBe(0);
});

test('a website that is already unlocked is never asked to pay', async ({ page }) => {
  await draftWithServer(page, { unlocked: true });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeEnabled({ timeout: 15000 });
  await expect(dialog.locator('[data-price-note]')).toHaveCount(0);
});

test('a payment id in the address that matches nothing on this device is not trusted', async ({ page }) => {
  await draftWithServer(page);
  await page.goto(`/?payment=${PAYMENT}`);
  await expect(page.locator('#toast, .toast').first()).toContainText('could not match that payment', { timeout: 15000 });
  expect(page.url()).not.toContain('payment=');
});
