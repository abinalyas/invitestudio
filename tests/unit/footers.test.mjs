// The footers on the guide and policy pages match the home page footer, and stay in step with it and with site-config.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FOOTER_LINKS, LANDING, copyright, renderFooter, talkLinks } from '../../functions/_shared/landing.js';
import { CONTACT, POLICIES, SOCIAL } from '../../functions/_shared/policies.js';
import { landingDocument, pageFor, policyDocument } from '../../functions/_shared/seo.js';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const ORIGIN = 'https://invitestudio.co';

function siteConfig() {
  const ctx = { globalThis: null, window: null };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.Object = Object;
  vm.createContext(ctx);
  vm.runInContext(read('site-config.js'), ctx);
  return ctx.INVITESTUDIO_SITE;
}

test('every guide and policy page has the shared footer: a brand column and three labelled link columns', () => {
  const docs = [...LANDING.map(l => landingDocument(pageFor(`/${l.slug}`), ORIGIN)), ...POLICIES.map(p => policyDocument(pageFor(`/${p.slug}`), ORIGIN))];
  assert.ok(docs.length >= 8);
  for (const doc of docs) {
    assert.equal((doc.match(/<footer class="site-footer">/g) || []).length, 1);
    assert.doesNotMatch(doc, /Weddings only for now/, 'the old one-line footer is gone');
    for (const [id, title] of [['footer-product', 'Product'], ['footer-guides', 'Guides'], ['footer-company', 'Company']]) {
      assert.match(doc, new RegExp(`<nav class="footer-col" aria-labelledby="${id}"><h3 id="${id}">${title}</h3>`));
    }
    assert.match(doc, /<p class="footer-tag">/);
    assert.match(doc, /<p class="copy">© \d{4} InviteStudio\. The templates and designs on this site are protected by copyright\.<\/p>/);
  }
});

test('the footer links point at real pages: the guides exist, the company links are the policy pages, nothing is invented', () => {
  const guideSlugs = new Set(LANDING.map(l => `/${l.slug}`));
  for (const [, path] of FOOTER_LINKS.guides) assert.ok(guideSlugs.has(path), path);
  const policyPaths = new Set(POLICIES.map(p => `/${p.slug}`));
  for (const [, path] of FOOTER_LINKS.company) assert.ok(policyPaths.has(path), path);
  assert.deepEqual(FOOTER_LINKS.product.map(l => l[1]), ['/templates', '/#features', '/#how', '/#pricing', '/#faq-list']);
});

test('the home page footer and the server footers list the same links', () => {
  const home = read('figma/islands/Home.tsx');
  const footer = home.slice(home.indexOf('<footer className="footer shell"'), home.indexOf('</footer>'));
  for (const [name, path] of [...FOOTER_LINKS.product, ...FOOTER_LINKS.guides, ...FOOTER_LINKS.company]) {
    const homePath = path.replace(/^\/#/, '#');   // on the home page itself, the sections are on the same page
    assert.ok(footer.includes(`<a href="${homePath}">${name}</a>`), `Home.tsx: ${name} -> ${homePath}`);
  }
});

test('the server footers use the same contact details, the same Instagram page and the same message as site-config.js and the home page', () => {
  const site = siteConfig();
  assert.equal(CONTACT.email, site.contact.email);
  assert.equal(CONTACT.whatsapp, site.contact.whatsapp);
  assert.equal(SOCIAL.instagram, site.social.instagram);
  // the "Talk to us" links are the ones contact-links.js builds for the same topic
  const ctx = { encodeURIComponent, String, Object, globalThis: null };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('site-config.js'), ctx);
  vm.runInContext(read('contact-links.js'), ctx);
  const client = ctx.InviteContact.links('custom');
  assert.deepEqual(talkLinks(CONTACT), { whatsapp: client.whatsapp, email: client.email });
});

test('renderFooter leaves out what is not set (no contact, no Instagram) instead of printing broken links', () => {
  const bare = renderFooter();
  assert.doesNotMatch(bare, /footer-talk|class="insta"|wa\.me|mailto:/);
  assert.match(bare, /<nav class="footer-col"/);
  const full = renderFooter({ contact: CONTACT, social: SOCIAL });
  assert.match(full, /<strong>Want something unique\?<\/strong>/);
  assert.match(full, /aria-label="InviteStudio on Instagram"/);
  assert.doesNotMatch(renderFooter({ social: { instagram: 'javascript:alert(1)' } }), /javascript:/);
  assert.doesNotMatch(renderFooter({ social: { instagram: 'https://evil.example/' } }), /evil\.example/, 'only an Instagram address is accepted');
});

test('the copyright year is worked out when a page is drawn, never when the file loads (Cloudflare freezes the clock at 1970 until a request arrives)', () => {
  assert.equal(copyright(2031), '© 2031 InviteStudio. The templates and designs on this site are protected by copyright.');
  assert.match(copyright(), new RegExp(`^© ${new Date().getFullYear()} `));
  for (const file of ['functions/_shared/landing.js', 'functions/_shared/policies.js', 'functions/_shared/seo.js']) {
    const topLevel = read(file).split('\n').filter(line => /^(export )?(const|let|var) /.test(line) && /new Date|Date\.now/.test(line));
    assert.deepEqual(topLevel, [], `${file} computes a date when it loads`);
  }
});
