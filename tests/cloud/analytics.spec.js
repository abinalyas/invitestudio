// Visit statistics against the real stack: events are saved without anything identifying, the Visitors section reads them,
// it is closed to everyone but the owner, and old rows are removed.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';
const SECRET = 'test-only-admin-session-secret-0123456789';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone14,5)';

async function dbQuery(sql, params) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try { return (await db.query(sql, params)).rows; } finally { await db.end(); }
}
async function sessionCookie(email) {
  const { signSession } = await import('../../functions/_shared/admin.js');
  return `is_admin=${await signSession(SECRET, email)}`;
}

const visit = (request, who, body) => request.post('/api/collect', {
  headers: { 'Content-Type': 'text/plain', 'User-Agent': who.ua, 'CF-Connecting-IP': who.ip, 'CF-IPCountry': who.country },
  data: JSON.stringify(body)
});

test('page views are saved with country, device, browser and system, and nothing identifying', async ({ request }) => {
  const slug = `an-${randomUUID().slice(0, 8)}`;
  const phone = { ua: IPHONE, ip: '203.0.113.77', country: 'IN' };
  const desktop = { ua: WINDOWS, ip: '198.51.100.23', country: 'US' };
  const insta = { ua: INSTAGRAM, ip: '203.0.113.88', country: 'IN' };
  for (const [who, body] of [
    [phone, { e: 'pageview', p: '/', w: 390, l: 'en-IN', r: 'https://l.instagram.com/?u=x', us: 'instagram', um: 'bio' }],
    [phone, { e: 'pageview', p: '/templates', w: 390, l: 'en-IN' }],
    [phone, { e: 'pageview', p: '/templates/13', w: 390, l: 'en-IN' }],
    [desktop, { e: 'pageview', p: '/templates/13', w: 1920, l: 'en-US' }],
    [insta, { e: 'pageview', p: `/s/${slug}`, w: 390, l: 'en-IN', r: 'https://www.instagram.com/' }]
  ]) expect((await visit(request, who, body)).status()).toBe(204);
  // Not counted: Do Not Track, a robot, a private link's key.
  expect((await request.post('/api/collect', { headers: { 'Content-Type': 'text/plain', 'User-Agent': IPHONE, DNT: '1' }, data: JSON.stringify({ e: 'pageview', p: '/dnt-visit' }) })).status()).toBe(204);
  expect((await visit(request, { ua: 'Googlebot/2.1', ip: '203.0.113.5', country: 'US' }, { e: 'pageview', p: '/robot-visit' })).status()).toBe(204);
  expect((await visit(request, phone, { e: 'pageview', p: '/edit/SECRETKEYSECRETKEYSECRETKEYSECRETKEY123', w: 390 })).status()).toBe(204);

  const rows = await dbQuery(`select * from analytics_events where path in ('/', '/templates', '/templates/13', $1, '/dnt-visit', '/robot-visit', '/edit') or path like '/edit%' order by id desc limit 40`, [`/s/${slug}`]);
  const paths = rows.map(r => r.path);
  expect(paths).not.toContain('/dnt-visit');
  expect(paths).not.toContain('/robot-visit');
  expect(paths.some(p => p.includes('SECRET'))).toBe(false);
  expect(paths).toContain('/edit');
  const home = rows.find(r => r.path === '/' && r.utm_source === 'instagram');
  expect(home).toMatchObject({ referrer: 'l.instagram.com', utm_medium: 'bio', device: 'mobile', browser: 'Safari', os: 'iOS', screen: '360-479', lang: 'en-in', slug: null });
  // The country comes from Cloudflare (the local test server supplies its own), so only its shape is checked here.
  expect(home.country).toMatch(/^[A-Z]{2}$/);
  const invitation = rows.find(r => r.path === `/s/${slug}`);
  expect(invitation).toMatchObject({ slug, browser: 'Instagram app', referrer: 'instagram.com' });
  // Nothing identifying anywhere in what was stored.
  const everything = JSON.stringify(rows);
  expect(everything).not.toMatch(/203\.0\.113|198\.51\.100|Mozilla|iPhone OS|SECRETKEY/);
  expect(rows.find(r => r.path === '/templates').vid).toBe(home.vid);   // same visitor, same day
  expect(rows.find(r => r.path === '/templates/13' && r.device === 'desktop').vid).not.toBe(home.vid);
});

test('the Visitors numbers are closed to everyone but the owner, and add up', async ({ request }) => {
  expect((await request.get('/api/admin/traffic')).status()).toBe(401);
  expect((await request.get('/api/admin/traffic', { headers: { Cookie: await sessionCookie('stranger@example.test') } })).status()).toBe(401);
  const owner = { Cookie: await sessionCookie('owner@example.test') };
  for (const [days, expected] of [[7, 7], [30, 30], [90, 90], [5, 30], [undefined, 30]]) {
    const response = await request.get('/api/admin/traffic' + (days ? `?days=${days}` : ''), { headers: owner });
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    const data = await response.json();
    expect(data.days).toBe(expected);
    expect(data.daily).toHaveLength(expected);
    expect(data.totals.pageviews).toBeGreaterThanOrEqual(data.totals.visitors);
    expect(data.daily.reduce((n, d) => n + d.pageviews, 0)).toBe(data.totals.pageviews);
  }
  const data = await (await request.get('/api/admin/traffic?days=30', { headers: owner })).json();
  expect(data.devices.map(d => d.name)).toEqual(expect.arrayContaining(['mobile', 'desktop']));
  expect(data.browsers.map(d => d.name)).toEqual(expect.arrayContaining(['Safari', 'Chrome', 'Instagram app']));
  expect(data.systems.map(d => d.name)).toEqual(expect.arrayContaining(['iOS', 'Windows']));
  expect(data.countries.length).toBeGreaterThan(0);
  expect(data.countries[0].name).toMatch(/^[A-Z]{2}$/);
  expect(data.referrers.map(d => d.name)).toEqual(expect.arrayContaining(['instagram.com']));
  expect(data.campaigns).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'instagram', medium: 'bio' })]));
  expect(data.designs).toEqual(expect.arrayContaining([expect.objectContaining({ number: '13' })]));
  expect(data.invitations.length).toBeGreaterThan(0);
  expect(data.totals.invitationViews).toBeGreaterThan(0);
  expect(Object.keys(data.funnel).sort()).toEqual(['draftsCreated', 'paid', 'viewedADesign', 'visitors', 'wentLive']);
  expect(data.funnel.viewedADesign).toBeLessThanOrEqual(data.funnel.visitors);
  expect(JSON.stringify(data)).not.toMatch(/203\.0\.113|Mozilla|vid/);
});

test('rows older than 400 days are removed when the owner opens the Visitors numbers', async ({ request }) => {
  await dbQuery(`insert into analytics_events (at, path, vid) values (now() - interval '401 days', '/old-visit', 'oldvisitor0001'), (now() - interval '399 days', '/recent-visit', 'oldvisitor0002')`);
  await request.get('/api/admin/traffic', { headers: { Cookie: await sessionCookie('owner@example.test') } });
  const left = (await dbQuery(`select path from analytics_events where path in ('/old-visit', '/recent-visit')`)).map(r => r.path);
  expect(left).toEqual(['/recent-visit']);
});

test('on the admin page, the Visitors section shows the numbers and the owner\'s browser stops being counted', async ({ page, context }) => {
  await context.addCookies([{ name: 'is_admin', value: (await sessionCookie('owner@example.test')).split('=')[1], url: 'http://127.0.0.1:8788' }]);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Visitors' })).toBeVisible();
  await expect(page.getByText('Page views', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Visits and publishing activity' })).toBeVisible();
  await expect(page.getByText('Publishing unlocked', { exact: true })).toBeVisible();
  await expect(page.getByText('Where visitors come from')).toBeVisible();
  await expect(page.getByText('instagram.com').first()).toBeVisible();
  await expect(page.getByText('Modern Heritage').first()).toBeVisible();   // design 13, by name
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('invitestudio-no-track'))).toBe('1');
});
