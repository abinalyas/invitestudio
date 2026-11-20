// The promo codes panel on /admin: make a code, see it listed, switch it off. The server is a small stand-in.
const { test, expect } = require('@playwright/test');

const overview = { admin: 'owner@example.com', asOf: new Date().toISOString(), totals: { live: 0, liveSince7d: 0, private: 0, offline: 0, sites: 0, createdToday: 0, created7d: 0, created30d: 0, unlocked: 0, replies: 0, attendingReplies: 0, guestsComing: 0 }, revenue: [], daily: [], byDesign: [], sites: [] };

async function adminWithCodes(page, { listFails = false } = {}) {
  const server = { codes: [], posts: [] };
  await page.route('**/api/admin/**', route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/admin/overview') return json(overview);
    if (url.pathname === '/api/admin/traffic') return json({ error: { code: 'DATABASE_ERROR' } }, 502);
    if (url.pathname === '/api/admin/promo-codes' && method === 'GET') return listFails ? json({ error: { code: 'DATABASE_ERROR' } }, 502) : json({ codes: server.codes });
    if (url.pathname === '/api/admin/promo-codes' && method === 'POST') {
      const body = request.postDataJSON();
      server.posts.push(body);
      if (typeof body.active === 'boolean') {
        const row = server.codes.find(item => item.code === body.code);
        row.active = body.active;
        return json({ code: row });
      }
      const row = { code: 'IS-TEST-ABCD-2345', note: body.note, max_uses: Number(body.maxUses), used_count: 0, expires_at: body.days ? new Date(Date.now() + body.days * 86400000).toISOString() : null, active: true, created_at: new Date().toISOString() };
      server.codes.unshift(row);
      return json({ code: row }, 201);
    }
    return route.abort();
  });
  await page.goto('/admin.html');
  return server;
}

test('the owner makes a code, sees it listed with its limits, and switches it off and on', async ({ page }) => {
  const server = await adminWithCodes(page);
  const panel = page.locator('main').filter({ hasText: 'Promo codes' });
  await expect(page.getByRole('heading', { name: 'Promo codes' })).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('No codes yet.')).toBeVisible();
  await page.getByLabel('What the code is for').fill('tester Priya');
  await page.getByLabel('Number of uses').fill('3');
  await page.getByLabel(/Valid for this many days/).fill('7');
  await page.getByRole('button', { name: 'Make a code' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'New code: IS-TEST-ABCD-2345' })).toBeVisible();
  expect(server.posts[0]).toEqual({ note: 'tester Priya', maxUses: '3', days: '7' });
  const row = page.getByRole('row').filter({ hasText: 'IS-TEST-ABCD-2345' });
  await expect(row).toContainText('tester Priya');
  await expect(row).toContainText('0 of 3');
  await expect(row.locator('.badge')).toHaveText('active');
  await row.getByRole('button', { name: 'Switch off' }).click();
  await expect(row.locator('.badge')).toHaveText('switched off');
  expect(server.posts[1]).toEqual({ code: 'IS-TEST-ABCD-2345', active: false });
  await row.getByRole('button', { name: 'Switch on' }).click();
  await expect(row.locator('.badge')).toHaveText('active');
});

test('a code with no end date and one use is made from the empty form', async ({ page }) => {
  const server = await adminWithCodes(page);
  await expect(page.getByRole('heading', { name: 'Promo codes' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Make a code' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'IS-TEST-ABCD-2345' })).toContainText('no end date');
  expect(server.posts[0]).toEqual({ note: '', maxUses: '1', days: '' });
});

test('when the codes cannot be loaded the panel says so and the rest of the page still works', async ({ page }) => {
  await adminWithCodes(page, { listFails: true });
  await expect(page.getByText('Promo codes are not available yet')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Websites', exact: true })).toBeVisible();
});
