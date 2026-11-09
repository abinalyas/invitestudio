import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(contact) {
  const ctx = { encodeURIComponent, String, Object };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (contact !== undefined) vm.runInContext(`globalThis.INVITESTUDIO_SITE = ${JSON.stringify({ contact })};`, ctx);
  vm.runInContext(readFileSync(new URL('../../contact-links.js', import.meta.url), 'utf8'), ctx);
  return ctx.InviteContact;
}
const GOOD = { email: 'hello@example.com', whatsapp: '919876543210' };

test('each link says what it is about, and which website when one is given', () => {
  const l = load(GOOD).links('extend', 'https://site.test/s/asha-ravi');
  assert.match(l.whatsapp, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.match(decodeURIComponent(l.whatsapp), /keep my InviteStudio website online for longer/);
  assert.match(decodeURIComponent(l.whatsapp), /Its address: https:\/\/site\.test\/s\/asha-ravi/);
  assert.match(l.email, /^mailto:hello@example\.com\?subject=Keep%20my%20InviteStudio%20website%20longer&body=/);
  assert.match(decodeURIComponent(l.email), /Its address: https:\/\/site\.test\/s\/asha-ravi/);
  assert.match(decodeURIComponent(load(GOOD).links('restore').whatsapp), /would like it back/);
  assert.match(decodeURIComponent(load(GOOD).links('custom').email), /made just for us/);
  assert.match(decodeURIComponent(load(GOOD).links('nonsense').email), /question about InviteStudio/, 'an unknown topic is a general question');
});

test('an address that is not a web address is left out, and nothing in a link can break out of it', () => {
  for (const bad of ['javascript:alert(1)', 'asha-ravi', '', undefined, 'https://a b', 'https://x.test/"><script>']) {
    assert.doesNotMatch(decodeURIComponent(load(GOOD).links('extend', bad).whatsapp), /Its address/, String(bad));
  }
  const l = load(GOOD).links('extend', 'https://site.test/s/x?a=1&b=2');
  assert.equal(l.whatsapp.includes('&b=2'), false, 'the address is encoded inside the message');
  assert.doesNotMatch(l.whatsapp + l.email, /["<>\s]/);
});

test('a missing or malformed contact detail gives an empty link, not a broken one', () => {
  assert.deepEqual({ ...load(undefined).links('extend') }, { whatsapp: '', email: '' });
  assert.deepEqual({ ...load({ email: 'not an email', whatsapp: '12' }).links('extend') }, { whatsapp: '', email: '' });
  assert.equal(load({ email: 'a@b.co', whatsapp: '+91 98765-43210' }).links('extend').whatsapp.startsWith('https://wa.me/919876543210?'), true, 'punctuation in the number is ignored');
});

test('the details shipped in site-config.js build working links', () => {
  const ctx = { encodeURIComponent, String, Object };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../../site-config.js', import.meta.url), 'utf8').replace(/window\./g, 'globalThis.'), ctx);
  vm.runInContext(readFileSync(new URL('../../contact-links.js', import.meta.url), 'utf8'), ctx);
  const l = ctx.InviteContact.links('general');
  assert.ok(l.whatsapp.startsWith('https://wa.me/'));
  assert.ok(l.email.startsWith('mailto:'));
});
