// The owner's overview (/admin): closed to everyone but the signed-in owner, counts replies without exposing guests.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';
async function dbQuery(sql, params) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try { return (await db.query(sql, params)).rows; } finally { await db.end(); }
}

const SECRET = 'test-only-admin-session-secret-0123456789';
async function sessionCookie(email) {
  const { signSession } = await import('../../functions/_shared/admin.js');
  return `is_admin=${await signSession(SECRET, email)}`;
}

async function liveSiteWithReplies(request, title) {
  const slug = `adm-${randomUUID().slice(0, 8)}`;
  const created = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `adm-${randomUUID()}` },
    data: { templateId: 'eternal', title, date: '2027-01-20', location: 'Kochi', functions: [{ id: randomUUID(), title: 'Wedding', date: '2027-01-20', time: '10:00', venue: 'Garden', visible: true }] }
  });
  const draft = await created.json();
  const published = await request.post(`/api/weddings/${draft.wedding.id}/publish`, {
    headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' }, data: { version: 1, slug }
  });
  expect(published.status()).toBe(200);
  for (const [name, attending, party] of [['Secret Guest One', true, 3], ['Secret Guest Two', false, 0]]) {
    const reply = await request.post(`/api/public-weddings/${slug}/rsvp`, { headers: { 'Content-Type': 'application/json' }, data: { name, attending, party, events: {}, needs: 'private note', message: 'private message', website: '' } });
    expect([200, 201]).toContain(reply.status());
  }
  return { slug, id: draft.wedding.id };
}

test('the overview is closed without a sign-in, and for a signed-in email that is not on the list', async ({ request }) => {
  const none = await request.get('/api/admin/overview');
  expect(none.status()).toBe(401);
  expect(none.headers()['cache-control']).toBe('no-store');
  const other = await request.get('/api/admin/overview', { headers: { Cookie: await sessionCookie('stranger@example.test') } });
  expect(other.status()).toBe(401);
  const forged = await request.get('/api/admin/overview', { headers: { Cookie: 'is_admin=eyJlbWFpbCI6Im93bmVyQGV4YW1wbGUudGVzdCIsImV4cCI6OTk5OTk5OTk5OTk5OX0.bad' } });
  expect(forged.status()).toBe(401);
});

test('the owner sees the counts and each website\'s reply numbers, and never a guest\'s details', async ({ request }) => {
  const { slug } = await liveSiteWithReplies(request, 'Admin Test Couple');
  const response = await request.get('/api/admin/overview', { headers: { Cookie: await sessionCookie('owner@example.test') } });
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).not.toMatch(/Secret Guest|private note|private message|token|owner_id/i);
  const data = JSON.parse(text);
  expect(data.admin).toBe('owner@example.test');
  expect(data.totals.live).toBeGreaterThanOrEqual(1);
  expect(data.daily).toHaveLength(30);
  const site = data.sites.find(s => s.slug === slug);
  expect(site).toMatchObject({ title: 'Admin Test Couple', status: 'published', replies: 2, attending: 1, guests: 3 });
  expect(data.totals.replies).toBeGreaterThanOrEqual(2);
});

test('the login address goes to Google, and the callback turns away a sign-in this browser did not start', async ({ request }) => {
  const login = await request.get('/api/admin/login', { maxRedirects: 0 });
  expect(login.status()).toBe(302);
  expect(login.headers()['location']).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  expect(login.headers()['set-cookie']).toMatch(/is_admin_state=/);
  const callback = await request.get('/api/admin/callback?code=abc&state=forged', { maxRedirects: 0 });
  expect(callback.status()).toBe(302);
  expect(callback.headers()['location']).toBe('/admin?denied=1');
  expect(callback.headers()['set-cookie'] || '').not.toMatch(/is_admin=[^;]/);
});

test('the admin page asks for a sign-in, then shows the overview to the owner', async ({ page, context }) => {
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
  await context.addCookies([{ name: 'is_admin', value: (await sessionCookie('owner@example.test')).split('=')[1], url: 'http://127.0.0.1:8788' }]);
  await page.goto('/admin');
  await expect(page.getByText('Live websites')).toBeVisible();
  await expect(page.locator('#who')).toHaveText('owner@example.test');
  await expect(page.locator('table').last()).toBeVisible();
});

test('the owner can create a private editing link for a website: closed to others, recorded, and it opens that website only', async ({ request }) => {
  const { id } = await liveSiteWithReplies(request, 'Private Link Couple');
  const other = await liveSiteWithReplies(request, 'Other Couple');
  const owner = { Cookie: await sessionCookie('owner@example.test'), 'Content-Type': 'application/json' };

  expect((await request.post('/api/admin/private-link', { headers: { 'Content-Type': 'application/json' }, data: { id } })).status()).toBe(401);
  expect((await request.post('/api/admin/private-link', { headers: { Cookie: await sessionCookie('stranger@example.test'), 'Content-Type': 'application/json' }, data: { id } })).status()).toBe(401);
  expect((await request.post('/api/admin/private-link', { headers: { ...owner, Origin: 'https://evil.example' }, data: { id } })).status()).toBe(403);
  expect((await request.post('/api/admin/private-link', { headers: owner, data: { id: 'not-an-id' } })).status()).toBe(400);
  expect((await request.post('/api/admin/private-link', { headers: owner, data: { id: randomUUID() } })).status()).toBe(404);

  const response = await request.post('/api/admin/private-link', { headers: owner, data: { id } });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const { link, expiresAt } = await response.json();
  expect(link).toMatch(/\/edit#[A-Za-z0-9_-]{40,}$/);
  expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

  // The link's token opens that website, and no other.
  const token = decodeURIComponent(link.split('#')[1]);
  const mine = await request.get(`/api/weddings/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(mine.status()).toBe(200);
  const theirs = await request.get(`/api/weddings/${other.id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(theirs.status()).toBeGreaterThanOrEqual(401);
});

test('on the admin page, Create link shows a private editing link for that website', async ({ page, context, request }) => {
  const { id } = await liveSiteWithReplies(request, 'Button Couple');
  await context.addCookies([{ name: 'is_admin', value: (await sessionCookie('owner@example.test')).split('=')[1], url: 'http://127.0.0.1:8788' }]);
  await page.goto('/admin');
  const row = page.locator('tr', { hasText: 'Button Couple' });
  await row.getByRole('button', { name: 'Create link' }).click();
  const box = row.getByLabel('Private link for Button Couple');
  await expect(box).toHaveValue(/\/edit#[A-Za-z0-9_-]{40,}$/);
  await expect(row).toContainText('see its guest replies');
  const token = decodeURIComponent((await box.inputValue()).split('#')[1]);
  expect((await request.get(`/api/weddings/${id}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
});

test('the overview says how far along each website is, and counts idle drafts and events that are close but not live', async ({ request }) => {
  const { slug } = await liveSiteWithReplies(request, 'Progress Couple');
  const data = await (await request.get('/api/admin/overview', { headers: { Cookie: await sessionCookie('owner@example.test') } })).json();
  expect(data.totals).toMatchObject({ idleDrafts7d: expect.any(Number), eventSoonNotLive: expect.any(Number) });
  const site = data.sites.find(s => s.slug === slug);
  expect(site).toMatchObject({ events: 1, photos: 0, has_story: false });
});

test('the admin page has the idle and event-soon filters and a sort', async ({ page, context }) => {
  await context.addCookies([{ name: 'is_admin', value: (await sessionCookie('owner@example.test')).split('=')[1], url: 'http://127.0.0.1:8788' }]);
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Idle 7+ days' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Event within 30 days' })).toBeVisible();
  await expect(page.getByLabel('Sort websites')).toBeVisible();
  await expect(page.getByText('Idle private drafts')).toBeVisible();
  await page.getByRole('button', { name: 'Idle 7+ days' }).click();
  await expect(page.getByRole('button', { name: 'Idle 7+ days' })).toHaveAttribute('aria-pressed', 'true');
});

test('the owner can see a buyer\'s contact details on request: closed to others, none shown when there are none, and every look is logged', async ({ request }) => {
  const { id } = await liveSiteWithReplies(request, 'Contact Couple');
  const owner = { Cookie: await sessionCookie('owner@example.test'), 'Content-Type': 'application/json' };
  const ask = (headers, data) => request.post('/api/admin/contact', { headers, data });

  expect((await ask({ 'Content-Type': 'application/json' }, { id })).status()).toBe(401);
  expect((await ask({ Cookie: await sessionCookie('stranger@example.test'), 'Content-Type': 'application/json' }, { id })).status()).toBe(401);
  expect((await ask({ ...owner, Origin: 'https://evil.example' }, { id })).status()).toBe(403);
  expect((await ask(owner, { id: 'nope' })).status()).toBe(400);

  // A website whose owner never reached payment has no details.
  const none = await ask(owner, { id });
  expect(none.status()).toBe(200);
  expect((await none.json()).contact).toBeNull();

  await dbQuery(`select save_customer_contact($1, 'Mira Nair', 'mira@example.com', '+919567882568', true)`, [id]);
  const shown = await ask(owner, { id });
  expect(shown.headers()['cache-control']).toBe('no-store');
  expect((await shown.json()).contact).toMatchObject({ name: 'Mira Nair', email: 'mira@example.com', phone: '+919567882568', marketing: true });

  // The overview (the list) never carries them.
  const overview = await (await request.get('/api/admin/overview', { headers: owner })).text();
  expect(overview).not.toMatch(/mira@example\.com|Mira Nair|9567882568/);

  const log = await dbQuery(`select admin_email, action from admin_access_log where wedding_id = $1 order by at`, [id]);
  expect(log).toEqual([{ admin_email: 'owner@example.test', action: 'view_contact' }, { admin_email: 'owner@example.test', action: 'view_contact' }]);
});

test('the contact details are deleted with the website, and the database refuses malformed ones', async ({ request }) => {
  const { id } = await liveSiteWithReplies(request, 'Delete Couple');
  await dbQuery(`select save_customer_contact($1, 'A B', 'a@example.com', '', false)`, [id]);
  await expect(dbQuery(`select save_customer_contact($1, 'A B', 'not-an-email', '', false)`, [id])).rejects.toThrow();
  await expect(dbQuery(`select save_customer_contact($1, 'A B', 'a@example.com', 'call me', false)`, [id])).rejects.toThrow();
  await dbQuery('delete from weddings where id = $1', [id]);
  expect(await dbQuery('select 1 from customer_contacts where wedding_id = $1', [id])).toEqual([]);
});

test('on the admin page, Show contact shows a buyer\'s details, and says so when there are none', async ({ page, context, request }) => {
  const paid = await liveSiteWithReplies(request, 'Buyer Couple');
  const unpaid = await liveSiteWithReplies(request, 'Lurker Couple');
  await dbQuery(`select save_customer_contact($1, 'Mira Nair', 'mira@example.com', '+919567882568', false)`, [paid.id]);
  await context.addCookies([{ name: 'is_admin', value: (await sessionCookie('owner@example.test')).split('=')[1], url: 'http://127.0.0.1:8788' }]);
  await page.goto('/admin');
  const paidRow = page.locator('tr', { hasText: 'Buyer Couple' });
  await expect(paidRow).not.toContainText('mira@example.com');
  await paidRow.getByRole('button', { name: 'Show contact' }).click();
  await expect(paidRow).toContainText('Mira Nair');
  await expect(paidRow.getByRole('link', { name: 'mira@example.com' })).toBeVisible();
  await expect(paidRow.getByRole('link', { name: '+919567882568' })).toHaveAttribute('href', 'https://wa.me/919567882568');
  await expect(paidRow).toContainText('No reminders');
  const unpaidRow = page.locator('tr', { hasText: 'Lurker Couple' });
  await unpaidRow.getByRole('button', { name: 'Show contact' }).click();
  await expect(unpaidRow).toContainText('None yet');
});
