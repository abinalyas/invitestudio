import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICIES, REFUND_DAYS, CONTACT, BUSINESS, UPDATED } from '../../functions/_shared/policies.js';
import { POLICY_LINKS } from '../../functions/_shared/landing.js';
import { pageFor, policyDocument, headTags, sitemapXml } from '../../functions/_shared/seo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => readFileSync(join(root, file), 'utf8');
const ORIGIN = 'https://example.test';

test('the four policy pages exist and are the pages every footer links to', () => {
  assert.deepEqual(POLICIES.map(p => `/${p.slug}`).sort(), POLICY_LINKS.map(([, path]) => path).sort());
  assert.deepEqual(POLICY_LINKS.map(([, path]) => path).sort(), ['/contact', '/privacy', '/refund-policy', '/terms']);
});

test('each policy page has a title, a description, one h1, a canonical address, and is in the sitemap', () => {
  const sitemap = sitemapXml(ORIGIN);
  for (const policy of POLICIES) {
    const page = pageFor(`/${policy.slug}`);
    assert.equal(page.kind, 'policy');
    const doc = policyDocument(page, ORIGIN);
    assert.equal((doc.match(/<h1>/g) || []).length, 1, policy.slug);
    assert.ok(doc.includes(`<link rel="canonical" href="${ORIGIN}/${policy.slug}"/>`));
    assert.ok(policy.description.length >= 60 && policy.description.length <= 160, policy.slug);
    assert.ok(sitemap.includes(`<loc>${ORIGIN}/${policy.slug}</loc>`), policy.slug);
    assert.ok(/index,follow/.test(headTags(page, ORIGIN).html));
  }
});

test('the contact details match the ones in site-config.js, and the contact page links to them', () => {
  const config = read('site-config.js');
  assert.ok(config.includes(`email: '${CONTACT.email}'`));
  assert.ok(config.includes(`whatsapp: '${CONTACT.whatsapp}'`));
  const doc = policyDocument(pageFor('/contact'), ORIGIN);
  assert.ok(doc.includes(`mailto:${CONTACT.email}`));
  assert.ok(doc.includes(`https://wa.me/${CONTACT.whatsapp}`));
});

test('the seller details are shown on the contact page, and nothing prints as empty', () => {
  assert.ok(BUSINESS.legalName && BUSINESS.address);
  const doc = policyDocument(pageFor('/contact'), ORIGIN);
  assert.ok(doc.includes(BUSINESS.legalName) && doc.includes(BUSINESS.address));
  assert.ok(!/undefined|\[\]|null/.test(doc));
});

test('the refund page states the refund window, and the terms and privacy pages agree with the retention rules', () => {
  const refund = policyDocument(pageFor('/refund-policy'), ORIGIN);
  assert.ok(refund.includes(`within ${REFUND_DAYS} days of paying`));
  for (const slug of ['terms', 'privacy']) {
    const doc = policyDocument(pageFor(`/${slug}`), ORIGIN);
    assert.ok(doc.includes('at least until 2 months after your last event date') && doc.includes('8 months after they were first published'), slug);
    assert.ok(doc.includes('not switched on yet'), `${slug} must say that closing and deleting are not on yet (remove this check when they are)`);
  }
  assert.ok(UPDATED.length > 8);
});

test('the policy pages show no price and promise nothing the product does not do', () => {
  for (const policy of POLICIES) {
    const doc = policyDocument(pageFor(`/${policy.slug}`), ORIGIN);
    assert.ok(!/[₹$£€]\s?\d/.test(doc), `${policy.slug} shows a price`);
    assert.ok(!/auto-?renew|monthly|recurring|per month/i.test(doc), `${policy.slug} describes recurring charges`);
  }
});

test('every footer and the payment dialog link to the policies', () => {
  const home = read('figma/islands/Home.tsx');
  for (const [, path] of POLICY_LINKS) assert.ok(home.includes(`href="${path}"`), `Home.tsx ${path}`);
  const shell = read('index.html');
  for (const [, path] of POLICY_LINKS) assert.ok(shell.includes(`<a href="${path}">`), `index.html ${path}`);
  const cloud = read('cloud-sync.js');
  assert.ok(cloud.includes('href="/terms"') && cloud.includes('href="/refund-policy"'));
});
