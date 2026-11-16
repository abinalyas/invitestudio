// The owner's overview (/admin): closed to everyone but the signed-in owner, counts replies without exposing guests.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

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
