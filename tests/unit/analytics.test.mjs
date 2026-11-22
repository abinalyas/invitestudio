// Visit statistics: what is classified, what is never kept, and when a visit is not counted at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { classifyUserAgent, cleanEvent, cleanLang, cleanPath, referrerHost, screenBucket, slugOf, visitorId } from '../../functions/_shared/analytics.js';
import { onRequest as collect } from '../../functions/api/collect.js';
import { landingDocument, pageFor, policyDocument } from '../../functions/_shared/seo.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone14,5)';
const FACEBOOK = 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0.0;]';

test('classifyUserAgent: device, browser and system, including the in-app browsers links are opened in', () => {
  const pick = ua => { const { device, browser, os, bot } = classifyUserAgent(ua); return { device, browser, os, bot }; };
  assert.deepEqual(pick(IPHONE), { device: 'mobile', browser: 'Safari', os: 'iOS', bot: false });
  assert.deepEqual(pick(PIXEL), { device: 'mobile', browser: 'Chrome', os: 'Android', bot: false });
  assert.deepEqual(pick(ANDROID_TABLET), { device: 'tablet', browser: 'Chrome', os: 'Android', bot: false });
  assert.deepEqual(pick(IPAD), { device: 'tablet', browser: 'Safari', os: 'iOS', bot: false });
  assert.deepEqual(pick(WINDOWS_CHROME), { device: 'desktop', browser: 'Chrome', os: 'Windows', bot: false });
  assert.deepEqual(pick(MAC_SAFARI), { device: 'desktop', browser: 'Safari', os: 'macOS', bot: false });
  assert.deepEqual(pick(EDGE), { device: 'desktop', browser: 'Edge', os: 'Windows', bot: false });
  assert.deepEqual(pick(FIREFOX), { device: 'desktop', browser: 'Firefox', os: 'Linux', bot: false });
  assert.deepEqual(pick(SAMSUNG), { device: 'mobile', browser: 'Samsung Internet', os: 'Android', bot: false });
  assert.deepEqual(pick(INSTAGRAM), { device: 'mobile', browser: 'Instagram app', os: 'iOS', bot: false });
  assert.deepEqual(pick(FACEBOOK), { device: 'mobile', browser: 'Facebook app', os: 'Android', bot: false });
});

test('classifyUserAgent: robots and empty agents are not visitors', () => {
  for (const ua of ['', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'curl/8.4.0', 'python-requests/2.31', 'WhatsApp link preview', 'Mozilla/5.0 HeadlessChrome/126', 'Lighthouse', 'facebookexternalhit/1.1']) {
    assert.equal(classifyUserAgent(ua).bot, true, ua);
  }
});

test('cleanPath: only the page is kept, never a query, a fragment or a private link key', () => {
  assert.equal(cleanPath('/templates/13?utm_source=x#frag'), '/templates/13');
  assert.equal(cleanPath('/templates/'), '/templates');
  assert.equal(cleanPath('/'), '/');
  assert.equal(cleanPath('/edit#SECRETTOKEN'), '/edit');
  assert.equal(cleanPath('/edit/SECRETTOKEN0123456789'), '/edit');
  assert.equal(cleanPath('/admin'), null);
  assert.equal(cleanPath('/admin/anything'), null);
  assert.equal(cleanPath('/api/weddings'), null);
  assert.equal(cleanPath('no-slash'), null);
  assert.equal(cleanPath('/with space'), null);
  assert.equal(cleanPath('/<script>'), null);
  assert.equal(cleanPath('/' + 'a'.repeat(200)), null);
});

test('slugOf, referrerHost, screenBucket and cleanLang', () => {
  assert.equal(slugOf('/s/mira-and-arun'), 'mira-and-arun');
  assert.equal(slugOf('/s/Bad_Slug'), null);
  assert.equal(slugOf('/templates/13'), null);
  assert.equal(referrerHost('https://www.instagram.com/tryinvitestudio?x=1', 'invitestudio.co'), 'instagram.com');
  assert.equal(referrerHost('https://invitestudio.co/templates', 'invitestudio.co'), null, 'our own pages are not a referrer');
  assert.equal(referrerHost('https://www.invitestudio.co/', 'invitestudio.co'), null);
  assert.equal(referrerHost('not a url', 'invitestudio.co'), null);
  assert.equal(referrerHost('', 'invitestudio.co'), null);
  assert.deepEqual([320, 390, 600, 768, 1024, 1920, 0, 'x'].map(screenBucket), ['under 360', '360-479', '480-767', '768-1023', '1024-1439', '1440 and up', null, null]);
  assert.deepEqual(['en', 'en-IN', 'hi', 'EN-us', 'x', '<script>', ''].map(cleanLang), ['en', 'en-in', 'hi', 'en-us', null, null, null]);
});

test('cleanEvent: only a page view with a clean page is counted, and campaign tags are tidied', () => {
  assert.equal(cleanEvent({ e: 'click', p: '/' }), null);
  assert.equal(cleanEvent({ e: 'pageview', p: '/admin' }), null);
  assert.equal(cleanEvent(null), null);
  const event = cleanEvent({ e: 'pageview', p: '/s/mira-arun?x=1', r: 'https://l.instagram.com/?u=secret', w: 390, l: 'en-IN', us: 'Instagram', um: 'bio<script>', uc: 'x'.repeat(200) }, { ownHost: 'invitestudio.co' });
  assert.deepEqual(event, { kind: 'pageview', path: '/s/mira-arun', slug: 'mira-arun', referrer: 'l.instagram.com', utm_source: 'instagram', utm_medium: 'bioscript', utm_campaign: 'x'.repeat(80), screen: '360-479', lang: 'en-in' });
  assert.ok(!JSON.stringify(event).includes('secret'), 'a referrer\'s query is dropped');
});

test('visitorId: the same person on the same day gives the same value, another day or another address gives another, and no address is in it', async () => {
  const env = { ANALYTICS_SALT: 'salt-one' };
  const a = await visitorId(env, '203.0.113.9', IPHONE, new Date('2026-11-17T10:00:00Z'));
  assert.equal(a, await visitorId(env, '203.0.113.9', IPHONE, new Date('2026-11-17T22:00:00Z')));
  assert.notEqual(a, await visitorId(env, '203.0.113.9', IPHONE, new Date('2026-11-18T01:00:00Z')), 'it changes every day');
  assert.notEqual(a, await visitorId(env, '203.0.113.10', IPHONE, new Date('2026-11-17T10:00:00Z')));
  assert.notEqual(a, await visitorId({ ANALYTICS_SALT: 'salt-two' }, '203.0.113.9', IPHONE, new Date('2026-11-17T10:00:00Z')));
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.ok(!a.includes('203') && !a.includes('Mozilla'));
});

// ---------------------------------------------------------------- the endpoint
const ENV = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key-test', ANALYTICS_SALT: 'test-salt' };
const realFetch = globalThis.fetch, realError = console.error;
async function post(body, { headers = {}, method = 'POST', env = ENV, dbFails = false, cf } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(typeof input === 'string' ? input : input.url), body: init.body ? JSON.parse(init.body) : null });
    return dbFails ? new Response('{"code":"XX000"}', { status: 500 }) : new Response(null, { status: 201 });
  };
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const init = { method, headers: { 'User-Agent': IPHONE, 'CF-Connecting-IP': '203.0.113.9', Origin: 'https://app.example.test', ...headers } };
    if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const request = new Request('https://app.example.test/api/collect', init);
    if (cf) Object.defineProperty(request, 'cf', { value: cf });
    const response = await collect({ request, env });
    return { status: response.status, calls, logged };
  } finally {
    globalThis.fetch = realFetch; console.error = realError;
  }
}

test('collect: a page view is saved with the country, device, browser and system, and no address and no user-agent text', async () => {
  const r = await post({ e: 'pageview', p: '/templates/13', r: 'https://www.instagram.com/', w: 390, l: 'en-IN', us: 'instagram', um: 'bio' }, { cf: { country: 'in' } });
  assert.equal(r.status, 204);
  assert.equal(r.calls.length, 1);
  assert.match(r.calls[0].url, /\/rest\/v1\/analytics_events$/);
  const row = r.calls[0].body;
  assert.deepEqual({ ...row, vid: undefined }, { kind: 'pageview', path: '/templates/13', slug: null, referrer: 'instagram.com', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: null, screen: '360-479', lang: 'en-in', country: 'IN', device: 'mobile', browser: 'Safari', os: 'iOS', vid: undefined });
  const text = JSON.stringify(row);
  assert.ok(!text.includes('203.0.113.9') && !text.includes('Mozilla') && !text.includes('iPhone'), 'no address and no user-agent text is stored');
  assert.match(row.vid, /^[0-9a-f]{24}$/);
});

test('collect: not counted: Do Not Track, Global Privacy Control, robots, another origin, a bad page, a bad or large body, a wrong method', async () => {
  const good = { e: 'pageview', p: '/' };
  for (const [name, r] of [
    ['DNT', await post(good, { headers: { DNT: '1' } })],
    ['GPC', await post(good, { headers: { 'Sec-GPC': '1' } })],
    ['bot', await post(good, { headers: { 'User-Agent': 'Googlebot/2.1' } })],
    ['no user agent', await post(good, { headers: { 'User-Agent': '' } })],
    ['other origin', await post(good, { headers: { Origin: 'https://evil.example' } })],
    ['admin page', await post({ e: 'pageview', p: '/admin' })],
    ['not json', await post('not json')],
    ['big body', await post({ e: 'pageview', p: '/', pad: 'x'.repeat(3000) })],
    ['wrong event', await post({ e: 'click', p: '/' })]
  ]) {
    assert.equal(r.status, 204, name);
    assert.equal(r.calls.length, 0, `${name} is not saved`);
  }
  assert.equal((await post(good, { method: 'GET' })).status, 405);
});

test('collect: a database failure is swallowed (a visitor is never shown an error), and logs no details', async () => {
  const r = await post({ e: 'pageview', p: '/' }, { dbFails: true });
  assert.equal(r.status, 204);
  assert.ok(r.logged.length >= 1);
  assert.ok(!r.logged.join(' ').includes('203.0.113.9'));
});

// ---------------------------------------------------------------- the browser script
function runClient({ dnt, gpc, noTrack, path = '/', search = '', referrer = '', visibility = 'visible' } = {}) {
  const sent = [], timers = [], listeners = {};
  const store = noTrack ? { 'invitestudio-no-track': '1' } : {};
  const location = { pathname: path, search };
  const history = { pushState() {} };
  const ctx = {
    location, history, Blob: class { constructor(parts) { this.text = parts.join(''); } }, URLSearchParams, JSON, Date, Math,
    setTimeout: fn => { timers.push(fn); return timers.length; },
    navigator: { doNotTrack: dnt ? '1' : null, globalPrivacyControl: gpc, language: 'en-IN', sendBeacon: (url, blob) => { sent.push({ url, ...JSON.parse(blob.text) }); return true; } },
    document: { referrer, visibilityState: visibility },
    window: { innerWidth: 390, localStorage: { getItem: k => store[k] ?? null }, addEventListener: (name, fn) => { listeners[name] = fn; } }
  };
  ctx.window.history = history; ctx.window.document = ctx.document; ctx.window.location = location;
  ctx.window.navigator = ctx.navigator; ctx.window.setTimeout = ctx.setTimeout;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../../analytics.js', import.meta.url), 'utf8'), ctx);
  const run = () => { while (timers.length) timers.shift()(); };
  return { sent, run, history, location, listeners };
}

test('analytics.js: reports the page, the referrer once, the campaign tags and the screen width; the app\'s screen changes count too', () => {
  const c = runClient({ path: '/templates/13/', search: '?utm_source=instagram&utm_medium=bio&token=SECRET', referrer: 'https://l.instagram.com/' });
  c.run();
  assert.equal(c.sent.length, 1);
  assert.deepEqual(c.sent[0], { url: '/api/collect', e: 'pageview', p: '/templates/13', w: 390, l: 'en-IN', r: 'https://l.instagram.com/', us: 'instagram', um: 'bio', uc: '' });
  assert.ok(!JSON.stringify(c.sent).includes('SECRET'), 'the query never leaves the page');
  c.location.pathname = '/editor/13'; c.history.pushState({}, '', '/editor/13'); c.run();
  assert.equal(c.sent.length, 2);
  assert.equal(c.sent[1].p, '/editor/13');
  assert.equal(c.sent[1].r, undefined, 'the referrer is only sent with the first view');
});

test('analytics.js: a private link\'s key is never sent, and the same page twice in a row is one view', () => {
  const c = runClient({ path: '/edit/SECRETTOKEN0123456789abcdefghijklmnopqrstuv' });
  c.run();
  assert.equal(c.sent[0].p, '/edit');
  assert.ok(!JSON.stringify(c.sent).includes('SECRET'));
  c.history.pushState({}, '', '/edit'); c.run();
  assert.equal(c.sent.length, 1, 'duplicate within a moment');
});

test('analytics.js: sends nothing for Do Not Track, Global Privacy Control, the owner\'s own browser, /admin, /api or a prerender', () => {
  for (const options of [{ dnt: true }, { gpc: true }, { noTrack: true }, { path: '/admin' }, { path: '/api/x' }, { visibility: 'prerender' }]) {
    const c = runClient(options); c.run();
    assert.equal(c.sent.length, 0, JSON.stringify(options));
  }
});

// ---------------------------------------------------------------- where it is loaded
test('the page, and the search landing and policy pages that do not load the app, all load analytics.js', () => {
  assert.match(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), /<script src="\/analytics\.js\?v=[0-9a-f]+"><\/script>/);
  const landing = pageFor('/whatsapp-wedding-invitation');
  assert.equal(landing.kind, 'landing');
  assert.match(landingDocument(landing, 'https://invitestudio.co'), /<script src="\/analytics\.js" defer><\/script>/);
  const policy = pageFor('/privacy');
  assert.equal(policy.kind, 'policy');
  assert.match(policyDocument(policy, 'https://invitestudio.co'), /<script src="\/analytics\.js" defer><\/script>/);
});

test('the privacy policy describes the visit statistics', () => {
  const text = policyDocument(pageFor('/privacy'), 'https://invitestudio.co');
  assert.match(text, /Anonymous visit statistics/);
  assert.match(text, /Do Not Track/);
  assert.match(text, /400 days/);
});
