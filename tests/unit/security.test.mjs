import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from '../../functions/_shared/security.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const headersFile = readFileSync(join(root, '_headers'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

function headerValue(name) {
  const line = headersFile.split('\n').find(row => row.trim().startsWith(`${name}:`));
  return line ? line.trim().slice(name.length + 1).trim() : undefined;
}

test('_headers carries the same CSP as the Pages Functions', () => {
  assert.equal(headerValue('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
});

test('_headers and the functions agree on the other security headers', () => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name === 'Content-Security-Policy') continue;
    assert.equal(headerValue(name), value, name);
  }
});

test('the policy blocks framing, plugins, eval and plain-HTTP third-party sources', () => {
  const directives = Object.fromEntries(
    CONTENT_SECURITY_POLICY.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values])
  );
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  // eval() and new Function() stay blocked. 'wasm-unsafe-eval' (WebAssembly only, for the HEIC photo decoder) is allowed.
  const tokens = CONTENT_SECURITY_POLICY.split(/[\s;]+/);
  assert.ok(!tokens.includes("'unsafe-eval'"));
  assert.deepEqual(directives['script-src'], ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]);
  assert.ok(!/\bhttp:\/\//.test(CONTENT_SECURITY_POLICY));
});

test('every script on the page is same-origin', () => {
  const sources = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(match => match[1]);
  assert.ok(sources.length > 0);
  for (const src of sources) {
    assert.ok(src.startsWith('/') && !src.startsWith('//'), `not a same-origin absolute path: ${src}`);
  }
});

test('the page loads no third-party scripts, analytics or trackers', () => {
  assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\(|hotjar|sentry|plausible|cdn\.jsdelivr/i);
});
