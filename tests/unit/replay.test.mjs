// Session recordings: when the server may offer the script at all, what the security policy allows, and where it is never offered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPLAY_PAGES, replayFor, replayMeta, replayProjectId, withReplayPolicy } from '../../functions/_shared/replay.js';
import { CONTENT_SECURITY_POLICY } from '../../functions/_shared/security.js';
import { landingDocument, pageFor, policyDocument } from '../../functions/_shared/seo.js';
import { onRequest as middleware } from '../../functions/_middleware.js';

const ENV = { CLARITY_PROJECT_ID: 'abc123xyz9' };

test('replayFor: only a configured project, a marketing page and a known non-European country', () => {
  for (const kind of REPLAY_PAGES) assert.equal(replayFor(ENV, kind, 'IN'), 'abc123xyz9', kind);
  assert.deepEqual([...REPLAY_PAGES].sort(), ['detail', 'home', 'landing', 'templates']);
  // pages that hold personal details, or are not marketing pages, never
  for (const kind of ['policy', 'editor', 'setup', 'preview', 'invitation', 'admin', undefined]) assert.equal(replayFor(ENV, kind, 'IN'), '', String(kind));
  // not configured, or a bad id
  for (const env of [{}, { CLARITY_PROJECT_ID: '' }, { CLARITY_PROJECT_ID: 'short' }, { CLARITY_PROJECT_ID: 'has space!!' }, { CLARITY_PROJECT_ID: '<script>alert(1)</script>' }]) assert.equal(replayFor(env, 'home', 'IN'), '');
  assert.equal(replayProjectId({ CLARITY_PROJECT_ID: ' abc123xyz9 ' }), 'abc123xyz9');
});

test('replayFor: nobody in the European Economic Area, the UK or Switzerland, and nobody whose country is unknown', () => {
  for (const code of ['DE', 'FR', 'IT', 'ES', 'NL', 'IE', 'SE', 'PL', 'GR', 'AT', 'BE', 'PT', 'FI', 'DK', 'CZ', 'RO', 'HU', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'CY', 'LU', 'MT', 'NO', 'IS', 'LI', 'GB', 'CH', 'de', 'gb']) {
    assert.equal(replayFor(ENV, 'home', code), '', code);
  }
  for (const code of [undefined, null, '', 'XX', 'T1', 'ZZZ', '1', 'I']) assert.equal(replayFor(ENV, 'home', code), '', String(code));
  for (const code of ['IN', 'US', 'AE', 'SG', 'CA', 'AU', 'in', 'BR', 'JP']) assert.equal(replayFor(ENV, 'home', code), 'abc123xyz9', code);
});

test('withReplayPolicy: the three needed directives get Clarity\'s hosts, nothing else changes', () => {
  const wider = withReplayPolicy(CONTENT_SECURITY_POLICY);
  const parts = Object.fromEntries(wider.split('; ').map(part => [part.split(' ')[0], part]));
  for (const name of ['script-src', 'connect-src', 'img-src']) assert.match(parts[name], /https:\/\/\*\.clarity\.ms https:\/\/c\.bing\.com$/, name);
  const before = Object.fromEntries(CONTENT_SECURITY_POLICY.split('; ').map(part => [part.split(' ')[0], part]));
  for (const name of Object.keys(before)) if (!['script-src', 'connect-src', 'img-src'].includes(name)) assert.equal(parts[name], before[name], name);
  assert.match(parts['frame-ancestors'], /'none'/);
  assert.match(parts['object-src'], /'none'/);
  assert.ok(!CONTENT_SECURITY_POLICY.includes('clarity'), 'the everyday policy has no third party in it');
});

test('replayMeta and the landing page document', () => {
  assert.equal(replayMeta(''), '');
  assert.equal(replayMeta('abc123xyz9'), '<meta name="invitestudio-replay" content="abc123xyz9">');
  const landing = pageFor('/whatsapp-wedding-invitation');
  const on = landingDocument(landing, 'https://invitestudio.co', { replay: 'abc123xyz9' });
  assert.match(on, /<meta name="invitestudio-replay" content="abc123xyz9">/);
  assert.match(on, /<script src="\/replay\.js" defer><\/script>/);
  const off = landingDocument(landing, 'https://invitestudio.co');
  assert.doesNotMatch(off, /invitestudio-replay|replay\.js/);
  assert.doesNotMatch(policyDocument(pageFor('/privacy'), 'https://invitestudio.co'), /invitestudio-replay|replay\.js/);
});

// ---------------------------------------------------------------- the middleware, with a stand-in for Cloudflare's HTMLRewriter
class FakeRewriter {
  constructor() { this.handlers = {}; }
  on(selector, handler) { this.handlers[selector] = handler; return this; }
  transform(response) {
    const appended = [];
    this.handlers.title?.element({ setInnerContent() {} });
    this.handlers.head?.element({ append(html) { appended.push(html); } });
    this.handlers['#app']?.element({ append() {} });
    response.appended = appended.join('');
    return response;
  }
}

async function visit(path, { env = ENV, country = 'IN' } = {}) {
  globalThis.HTMLRewriter = FakeRewriter;
  const request = new Request(`https://invitestudio.co${path}`);
  Object.defineProperty(request, 'cf', { value: country ? { country } : undefined });   // null: Cloudflare did not say
  const next = async () => new Response('<html><head></head><body><div id="app"></div></body></html>', { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': CONTENT_SECURITY_POLICY } });
  const response = await middleware({ request, env, next });
  return { csp: response.headers.get('Content-Security-Policy'), appended: response.appended || '', body: response.status === 200 && !response.appended ? await response.text() : '' };
}

test('middleware: marketing pages offer the recording script only where allowed, with the wider policy only there', async () => {
  for (const path of ['/', '/templates', '/templates/14']) {
    const allowed = await visit(path, { country: 'IN' });
    assert.match(allowed.appended, /<meta name="invitestudio-replay" content="abc123xyz9">/, path);
    assert.match(allowed.csp, /script-src[^;]*https:\/\/\*\.clarity\.ms/, path);
    const europe = await visit(path, { country: 'DE' });
    assert.doesNotMatch(europe.appended, /invitestudio-replay/, `${path} in Germany`);
    assert.equal(europe.csp, CONTENT_SECURITY_POLICY);
    const unknown = await visit(path, { country: null });
    assert.doesNotMatch(unknown.appended, /invitestudio-replay/, `${path} country unknown`);
    const off = await visit(path, { env: {} });
    assert.doesNotMatch(off.appended, /invitestudio-replay/, `${path} not configured`);
    assert.equal(off.csp, CONTENT_SECURITY_POLICY);
  }
});

test('middleware: a search landing page gets the script and the wider policy; a policy page and every other screen never do', async () => {
  const landing = await visit('/whatsapp-wedding-invitation', { country: 'IN' });
  assert.match(landing.csp, /clarity\.ms/);
  const text = await landing.body;
  const direct = await visit('/privacy', { country: 'IN' });
  assert.equal(direct.csp, CONTENT_SECURITY_POLICY, 'the policy pages keep the strict policy');
  assert.doesNotMatch(direct.body, /replay/);
  for (const path of ['/editor/13', '/edit', '/s/some-invitation', '/admin', '/dashboard']) {
    const other = await visit(path, { country: 'IN' });
    assert.doesNotMatch(other.appended + other.body, /invitestudio-replay/, path);
    assert.ok(!(other.csp || '').includes('clarity'), path);
  }
  assert.equal(typeof text, 'string');
});
