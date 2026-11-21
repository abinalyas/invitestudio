// Paying to publish: the dialog shows the price, takes the person to the payment page, brings them back, confirms with the server and
// carries on to publishing. The payment page itself is a stand-in (Razorpay is never contacted); the server is a small stand-in too.
const { completeSetupSteps, openLatestDraft } = require('../support/setup');
const { test, expect } = require('@playwright/test');

const WID = '88888888-8888-4888-8888-888888888888';
const PAYMENT = '99999999-9999-4999-8999-999999999999';
const TOKEN = 'p'.repeat(43);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function draftWithServer(page, { mode = 'live', country = 'IN', unlocked = false, paidOnReturn = true, promoReply = null } = {}) {
  const { pricingFor, regionForCountry } = await import('../../functions/_shared/pricing.js');
  const server = { version: 1, unlocked, paid: false, checkouts: [], verifies: 0, publishes: [], publishConflict: false, promos: [], promoReply };
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
      return json({ ...pricingFor(regionForCountry(country)), country, mode });
    }
    if (url.pathname === `/api/weddings/${WID}` && method === 'GET') return json({ wedding: wedding(), photos: [] });
    if (url.pathname === `/api/weddings/${WID}/slug-availability`) return json({ available: true, slug: url.searchParams.get('slug'), suggestions: [] });
    if (url.pathname === `/api/weddings/${WID}/checkout` && method === 'POST') {
      server.checkouts.push(request.postDataJSON());
      return json({ paymentId: PAYMENT, url: 'https://rzp.io/i/test1', amountMinor: 299900, currency: 'INR', tier: 'signature', region: 'in' });
    }
    if (url.pathname === `/api/weddings/${WID}/promo` && method === 'POST') {
      server.promos.push(request.postDataJSON());
      if (server.promoReply) return json({ error: { code: server.promoReply, message: 'Server wording the page must not show.' } }, server.promoReply === 'PROMO_TOO_MANY' ? 429 : server.promoReply === 'PAYMENTS_NOT_LIVE' ? 409 : 422);
      server.unlocked = true;
      server.version += 1;
      return json({ unlocked: true, already: false, version: server.version });
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
      if (server.publishConflict) return json({ error: { code: 'SLUG_CONFLICT', message: 'That web address is already in use.' } }, 409);
      server.version += 1;
      return json({ wedding: { ...wedding(), status: 'published', visibility: 'public', slug: body.slug } });
    }
    if (url.pathname === '/api/edit-links') return json({ wedding: wedding(), photos: [] });
    return route.abort();
  });
  await page.reload();
  return server;
}

// The details asked for before paying: name and email are needed, the phone is optional, the reminders tick starts off.
async function fillDetails(dialog, { name = 'Mira Nair', email = 'mira@example.com', phone = '' } = {}) {
  await dialog.getByLabel('Your name').fill(name);
  await dialog.getByLabel('Email').fill(email);
  if (phone) await dialog.getByLabel(/^Phone or WhatsApp number/).fill(phone);
}

async function openShareAgain(page) {
  await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
  return page.locator('#modal-root');
}

async function openShare(page) {
  await openLatestDraft(page);
  await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
  return page.locator('#modal-root');
}

test('payments live: the dialog shows the publishing plan price, and the main button takes a payment', async ({ page }) => {
  await draftWithServer(page, { country: 'IN' });
  const dialog = await openShare(page);
  await expect(dialog.locator('[data-price-note]')).toContainText('By paying you agree to the Terms and Refund policy');
  await expect(dialog.locator('.pub-order .pub-line')).toContainText('Signature publishing plan');
  await expect(dialog.locator('.pub-order .pub-total')).toContainText('₹2,999');
  // Name and email come first: the button stays off until they are given.
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeDisabled({ timeout: 15000 });
  await fillDetails(dialog);
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toHaveCount(0);
});

test('payments live: a visitor elsewhere sees their own currency', async ({ page }) => {
  await draftWithServer(page, { country: 'US' });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay $59 and continue' })).toBeDisabled({ timeout: 15000 });
  await fillDetails(dialog);
  await expect(dialog.getByRole('button', { name: 'Pay $59 and continue' })).toBeEnabled();
});

test('pay, come back, get confirmed by the server, and the website goes live by itself', async ({ page }) => {
  const server = await draftWithServer(page);
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeDisabled({ timeout: 15000 });
  await fillDetails(dialog, { phone: '95678 82568' });
  await dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  // Sent to the payment page and back; the dialog reopens by itself, confirms the payment with the server, and goes live.
  await expect(dialog.locator('h2')).toHaveText('Payment received. Your website is live!', { timeout: 30000 });
  expect(server.checkouts).toEqual([{ name: 'Mira Nair', email: 'mira@example.com', phone: '95678 82568', marketing: false }], 'only the buyer\'s details are sent, never an amount');
  expect(server.verifies).toBeGreaterThan(0);
  expect(page.url()).not.toContain('payment=');
  // Nobody was asked to choose "Make it live": it was published once, at the address chosen before paying.
  expect(server.publishes.length).toBe(1);
  expect(server.publishes[0].slug).toBe('mira-and-arun');
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toHaveCount(0);
  // Only what is needed now: the link, with Copy link and the WhatsApp card as the two main actions.
  await expect(dialog.locator('.pub-live')).toContainText('/s/mira-and-arun');
  await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share card for WhatsApp' })).toBeVisible();
  // Changing the address and taking it offline are mentioned, not offered, on this screen; and nothing else crowds it.
  await expect(dialog.getByRole('button', { name: 'Change web address' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Take offline' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Update live page' })).toHaveCount(0);
  await expect(dialog.locator('[data-later-hint]')).toContainText('change your web address');
  await expect(dialog.locator('[data-later-hint]')).toContainText('take the website offline');
  await expect(dialog.locator('[data-edit-hint]')).toContainText('My invitations');
  await expect(dialog.locator('[data-edit-hint]')).toContainText('Edit');
  await expect(dialog.locator('.pub-design')).toHaveCount(0);
  await expect(dialog.getByText('Your order')).toHaveCount(0);
  await expect(dialog.locator('[data-price-note]')).toHaveCount(0);
  await expect(dialog.locator('.pub-benefits')).toHaveCount(0);
  await expect(dialog.locator('.pub-steps')).toHaveCount(0);
  await expect(dialog.locator('#publishSlug')).toHaveCount(0);
  // Copy link copies the live address.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}/s/mira-and-arun`);
  // The WhatsApp card opens from here.
  await dialog.getByRole('button', { name: 'Share card for WhatsApp' }).click();
  await expect(page.locator('#modal-root [data-sc-image], #modal-root [data-sc-locked], #modal-root [data-sc-empty]').first()).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => localStorage.getItem('invitestudio-pending-payment'))).toBeNull();
  expect(await page.evaluate(() => current().publishStatus)).toBe('published');
  // Later, opening Share invitation again has the full live dialog: change the address, take it offline.
  await page.evaluate(() => closeModal());
  const later = await openShareAgain(page);
  await expect(later.getByRole('heading', { name: 'Your invitation is live' })).toBeVisible();
  await expect(later.getByRole('button', { name: 'Change web address' })).toBeVisible();
  await expect(later.getByRole('button', { name: 'Take offline' })).toBeVisible();
});

test('on a phone, after paying, the live screen shows the link and both main buttons in view, with nothing sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await draftWithServer(page);
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeDisabled({ timeout: 15000 });
  await fillDetails(dialog);
  await dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  await expect(dialog.locator('h2')).toHaveText('Payment received. Your website is live!', { timeout: 30000 });
  const shell = page.locator('.modal.publish-shell');
  const sizes = await shell.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  for (const target of [dialog.locator('.pub-live a'), dialog.getByRole('button', { name: 'Copy link' }), dialog.getByRole('button', { name: 'Share card for WhatsApp' })]) {
    await expect(target).toBeVisible({ timeout: 15000 }); // the heading can show a moment before the rest of the screen is drawn
    const box = await target.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height, 'in view without scrolling').toBeLessThanOrEqual(780);
  }
});

test('after paying, if the chosen address was taken meanwhile, the last step is shown with the reason (one column on a phone), and it can be finished', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const server = await draftWithServer(page);
  server.publishConflict = true;
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeDisabled({ timeout: 15000 });
  await fillDetails(dialog);
  await dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  await expect(dialog.getByText('That web address is already in use.').first()).toBeVisible({ timeout: 30000 });
  await expect(dialog.locator('h2')).toHaveText('Payment received. Thank you!');
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeAttached();
  // The broken layout: two cramped columns on a phone. It is one column.
  const columns = await page.locator('.pub-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  const shell = page.locator('.modal.publish-shell');
  const sizes = await shell.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  // Another address, and it goes live.
  server.publishConflict = false;
  await dialog.locator('#publishSlug').fill('mira-and-arun-2027');
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeEnabled({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Make it live' }).click();
  await expect(dialog.locator('h2')).toHaveText('Payment received. Your website is live!', { timeout: 15000 });
  await expect(dialog.locator('.pub-live')).toContainText('/s/mira-and-arun-2027');
});

test('back from the payment page but not confirmed yet: the person is told, and can check again', async ({ page }) => {
  const server = await draftWithServer(page, { paidOnReturn: false });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeDisabled({ timeout: 15000 });
  await fillDetails(dialog);
  await dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  await expect(dialog.locator('[data-payment-info]')).toContainText('have not heard back', { timeout: 40000 });
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toHaveCount(0);
  // The bank catches up; checking again unlocks it.
  server.paid = true;
  await dialog.getByRole('button', { name: 'Check again' }).click();
  await expect(dialog.locator('h2')).toContainText('Payment received', { timeout: 30000 });
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

test('the details form: the email must look right, the phone is optional, there is no reminders tick, and what was typed is kept', async ({ page }) => {
  const server = await draftWithServer(page, { paidOnReturn: false });
  let finishAddressCheck;
  const addressCheck = new Promise(resolve => { finishAddressCheck = resolve; });
  await page.route('**/slug-availability?*', async route => {
    await addressCheck;
    await route.fallback();
  });
  const dialog = await openShare(page);
  const pay = dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' });
  await expect(pay).toBeDisabled({ timeout: 15000 });
  await expect(dialog.getByLabel(/Send me tips and reminders/)).toHaveCount(0);   // asking for marketing consent is not part of paying
  // Nothing is said about missing details until the person starts filling them in (the button just waits).
  await expect(dialog.locator('#contact-status')).toHaveText('');
  await dialog.getByLabel('Email').fill('m');
  await expect(dialog.locator('#contact-status')).toHaveText('Enter your name.');
  await dialog.getByLabel('Email').fill('');
  await expect(dialog.locator('#contact-status')).toHaveText('Enter your name.', { timeout: 2000 });   // once started, it stays
  await dialog.getByLabel('Your name').fill('Mira Nair');
  await expect(dialog.locator('#contact-status')).toHaveText('Enter a valid email address.');
  finishAddressCheck();
  await expect(dialog.locator('#slug-status')).toHaveText('This address is available.');
  await expect(dialog.getByLabel('Your name')).toBeFocused();
  await dialog.getByLabel('Email').fill('mira@example');
  await expect(pay).toBeDisabled();
  await dialog.getByLabel('Email').fill('mira@example.com');
  await expect(pay).toBeEnabled();
  await expect(dialog.locator('#contact-status')).toHaveText('');
  await dialog.getByLabel(/^Phone or WhatsApp number/).fill('call me');
  await expect(pay).toBeDisabled();
  await expect(dialog.locator('#contact-status')).toContainText('7 to 15 digits');
  await dialog.getByLabel(/^Phone or WhatsApp number/).fill('');
  await expect(pay).toBeEnabled();
  // Closing and opening the dialog again keeps what was typed (it is remembered on this device).
  await dialog.getByRole('button', { name: 'Close' }).click();
  const again = await openShareAgain(page);
  await expect(again.getByLabel('Your name')).toHaveValue('Mira Nair');
  await expect(again.getByLabel('Email')).toHaveValue('mira@example.com');
  await again.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  await expect.poll(() => server.checkouts.length).toBe(1);
  expect(server.checkouts[0]).toEqual({ name: 'Mira Nair', email: 'mira@example.com', phone: '', marketing: false });
});

test('early access and unlocked websites are never asked for these details', async ({ page }) => {
  await draftWithServer(page, { mode: 'early-access' });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeEnabled({ timeout: 15000 });
  await expect(dialog.getByLabel('Your name')).toHaveCount(0);
});

test('the dialog is a short purchase screen: your details, your link, the design and the order, with nothing else to read', async ({ page }) => {
  await draftWithServer(page, { country: 'IN' });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('heading', { name: 'Ready to go live?' })).toBeVisible();
  // Removed because they repeated the title, the order or the editor's own note: the steps strip, "what happens next", the
  // list of benefits, the "no recurring charges" pill and the long price paragraph.
  await expect(dialog.locator('.pub-steps')).toHaveCount(0);
  await expect(dialog.locator('.pub-explain')).toHaveCount(0);
  await expect(dialog.getByText('What happens next')).toHaveCount(0);
  await expect(dialog.locator('.pub-benefits')).toHaveCount(0);
  await expect(dialog.locator('.pub-pill')).toHaveCount(0);
  await expect(dialog.getByText('Switch designs within your plan')).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Your invitation link' })).toBeVisible();
  await expect(dialog.locator('.pub-design')).toContainText('Your selected design');
  await expect(dialog.locator('.pub-order')).toContainText('Your order');
  await expect(dialog.locator('.pub-order .pub-total')).toContainText('₹2,999');
  await expect(dialog.locator('.pub-order .pub-trust')).toContainText('Secure payment with Razorpay. No subscription.');
  await expect(dialog.locator('[data-draft-preview-share]')).toContainText('Not ready? Friends can see a draft preview.');
  await expect(dialog.getByRole('button', { name: 'Get preview link' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeVisible();
});

test('the dialog closes from the X and from the Close button', async ({ page }) => {
  await draftWithServer(page, { country: 'IN' });
  let dialog = await openShare(page);
  await dialog.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('#modal-root')).toBeEmpty();
  dialog = await openShareAgain(page);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#modal-root')).toBeEmpty();
});

test('on a phone the dialog is one column and does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await draftWithServer(page, { country: 'IN' });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeAttached({ timeout: 15000 });
  const shell = page.locator('.modal.publish-shell');
  const sizes = await shell.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  const main = await page.locator('.pub-main').boundingBox();
  const side = await page.locator('.pub-side').boundingBox();
  expect(side.y).toBeGreaterThan(main.y + main.height - 2); // the side column sits below, not beside
});

test('after going live the dialog shows the link, the design and the live-page actions, and no order', async ({ page }) => {
  await draftWithServer(page, { mode: 'free', country: 'IN' });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeEnabled({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Make it live' }).click();
  await expect(dialog.getByRole('heading', { name: 'Your invitation is live' })).toBeVisible();
  await expect(dialog.locator('.pub-live')).toContainText('Current public link');
  await expect(dialog.locator('.pub-design')).toContainText('Your selected design');
  await expect(dialog.getByRole('button', { name: 'Take offline' })).toBeVisible();
  await expect(dialog.getByText('Your order')).toHaveCount(0);
});

test('coming back from the payment page: a cover shows at once and the dialog does not wait for the other invitations', async ({ page }) => {
  const server = await draftWithServer(page);
  // Three other saved invitations whose server copies are slow to arrive (3 seconds each). They used to be fetched one after another
  // before the payment was even looked at, so the person waited nine seconds on the home page.
  await page.evaluate(() => {
    const tokens = JSON.parse(localStorage.getItem('invitestudio-edit-tokens') || '{}');
    const others = [1, 2, 3].map(n => {
      const id = `0000000${n}-0000-4000-8000-00000000000${n}`;
      tokens[id] = 't'.repeat(43);
      return { id, cloudId: id, cloudVersion: 1, cloudStatus: 'saved', name: `Other ${n}`, title: `Other ${n}`, category: 'Wedding', templateId: 'minimalist', status: 'Draft', functions: [], photos: [] };
    });
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify(tokens));
    const projects = JSON.parse(localStorage.getItem('invitestudio-projects') || '[]');
    localStorage.setItem('invitestudio-projects', JSON.stringify([...projects, ...others]));
  });
  await page.route(/\/api\/weddings\/0000000\d-/, async route => { await new Promise(resolve => setTimeout(resolve, 3000)); await route.abort(); });
  await page.addInitScript(() => {
    // Notes whether the "confirming your payment" cover was ever shown on this page (it is added by a script in the head).
    window.__coverAtStart = false;
    new MutationObserver(() => { if (document.documentElement.classList.contains('payment-return')) window.__coverAtStart = true; }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.reload();
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' })).toBeDisabled({ timeout: 15000 });
  await fillDetails(dialog);
  const started = Date.now();
  await dialog.getByRole('button', { name: 'Pay ₹2,999 and continue' }).click();
  await expect(dialog).toContainText(/Confirming your payment|Payment received/, { timeout: 20000 });
  expect(Date.now() - started).toBeLessThan(5000);
  expect(await page.evaluate(() => window.__coverAtStart)).toBe(true);
  await expect(page.locator('html.payment-return')).toHaveCount(0);
  await expect(dialog.locator('h2')).toContainText('Payment received', { timeout: 30000 });
  expect(server.verifies).toBeGreaterThan(0);
});

// ---- A promo code instead of a payment (functions/_shared/promo.js). The server decides; the page only shows its answer. ----

test('promo: a good code takes the payment step away, and the website goes live without a checkout', async ({ page }) => {
  const server = await draftWithServer(page);
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: /^Pay / })).toBeDisabled({ timeout: 15000 });
  await dialog.getByText('Have a promo code?').click();
  await dialog.getByLabel('Promo code').fill('is-abcd-efgh-2345');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog.locator('[data-payment-info]')).toContainText('Promo code applied');
  expect(server.promos).toEqual([{ code: 'is-abcd-efgh-2345' }]);
  // No name and email to give, no price, no payment: the main button just makes it live.
  await expect(dialog.locator('[data-buyer-contact]')).toHaveCount(0);
  await expect(dialog.locator('[data-promo]')).toHaveCount(0);
  await expect(dialog.locator('[data-price-note]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Make it live' }).click();
  await expect(dialog.getByText('Your invitation is live').first()).toBeVisible({ timeout: 15000 });
  expect(server.checkouts).toHaveLength(0);
  expect(server.publishes).toHaveLength(1);
});

test('promo: pressing Enter in the box applies the code too', async ({ page }) => {
  const server = await draftWithServer(page);
  const dialog = await openShare(page);
  await dialog.getByText('Have a promo code?').click();
  await dialog.getByLabel('Promo code').fill('IS-ABCD-EFGH-2345');
  await dialog.getByLabel('Promo code').press('Enter');
  await expect(dialog.locator('[data-payment-info]')).toContainText('Promo code applied');
  expect(server.promos).toHaveLength(1);
});

for (const [reply, wording] of [
  ['PROMO_INVALID', 'That promo code is not valid'],
  ['PROMO_EXPIRED', 'This promo code has expired'],
  ['PROMO_USED_UP', 'This promo code has already been used'],
  ['PROMO_TOO_MANY', 'Too many wrong codes']
]) {
  test(`promo: ${reply} says why, keeps the box open and keeps the payment step`, async ({ page }) => {
    await draftWithServer(page, { promoReply: reply });
    const dialog = await openShare(page);
    await dialog.getByText('Have a promo code?').click();
    await dialog.getByLabel('Promo code').fill('IS-ABCD-EFGH-2345');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog.locator('#promo-status')).toContainText(wording);
    await expect(dialog.locator('#promo-status')).not.toContainText('Server wording');
    await expect(dialog.getByLabel('Promo code')).toHaveValue('IS-ABCD-EFGH-2345');
    await expect(dialog.locator('[data-buyer-contact]')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Pay / })).toBeVisible();
  });
}

test('promo: an empty box asks for a code and sends nothing', async ({ page }) => {
  const server = await draftWithServer(page);
  const dialog = await openShare(page);
  await dialog.getByText('Have a promo code?').click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog.locator('#promo-status')).toContainText('Enter your promo code');
  expect(server.promos).toHaveLength(0);
});

test('promo: while payments are not open there is no promo box at all', async ({ page }) => {
  await draftWithServer(page, { mode: 'early-access' });
  const dialog = await openShare(page);
  await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeVisible({ timeout: 15000 });
  await expect(dialog.locator('[data-promo]')).toHaveCount(0);
});
