import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDING, smallImage } from '../../functions/_shared/landing.js';
import { landingDocument, SITE_ORIGIN, originFor, isPrivateHost, TEMPLATES, pageFor, describe, headTags, staticContent, robotsTxt, sitemapXml, llmsTxt } from '../../functions/_shared/seo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'https://example.test';
const shared = readFileSync(join(root, 'figma', 'islands', 'shared.tsx'), 'utf8');

test('the template list matches the gallery on the home page', () => {
  const gallery = [...shared.matchAll(/^\s+id: (\d+),\n\s+backendId: "[^"]+",\n\s+title: "([^"]+)"/gm)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(TEMPLATES.map(t => [t.id, t.title]), gallery);
});

test('template images that the pages point at exist, each with its small version', () => {
  for (const t of TEMPLATES) {
    assert.ok(existsSync(join(root, t.image.slice(1))), t.image);
    assert.ok(existsSync(join(root, smallImage(t.image).slice(1))), smallImage(t.image));
  }
});

test('the favicon files exist and every page head points at them', () => {
  for (const file of ['favicon.ico', 'assets/favicon.svg', 'assets/apple-touch-icon.png']) assert.ok(existsSync(join(root, file)), file);
  const shell = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(shell.includes('href="/assets/favicon.svg"') && shell.includes('href="/favicon.ico"'));
  assert.ok(landingDocument(pageFor('/' + LANDING[0].slug), ORIGIN).includes('href="/assets/favicon.svg"'));
});

test('the home page preloads its hero picture, and no other page does', () => {
  assert.ok(headTags(pageFor('/'), ORIGIN).html.includes('rel="preload" as="image" href="/assets/hero/hero-envelope-invitation.webp"'));
  assert.ok(!headTags(pageFor('/templates'), ORIGIN).html.includes('rel="preload"'));
  assert.ok(existsSync(join(root, 'assets/hero/hero-envelope-invitation.webp')));
});

test('only the public marketing pages are described', () => {
  assert.equal(pageFor('/').kind, 'home');
  assert.equal(pageFor('/templates/').kind, 'templates');
  assert.equal(pageFor('/templates/9').kind, 'detail');
  for (const path of ['/templates/999', '/editor/9', '/edit/abc', '/s/slug', '/api/pricing', '/templates/templates.generated.js']) assert.equal(pageFor(path), null, path);
});

test('every page has a distinct title and description, a canonical address, and valid structured data', () => {
  const pages = ['/', '/templates', ...LANDING.map(l => `/${l.slug}`), ...TEMPLATES.map(t => `/templates/${t.id}`)].map(pageFor);
  const titles = new Set();
  for (const page of pages) {
    const info = describe(page, ORIGIN);
    assert.ok(info.title.length <= 75, info.title);
    assert.ok(info.description.length >= 60 && info.description.length <= 160, `${info.title}: ${info.description.length}`);
    titles.add(info.title);
    const { html } = headTags(page, ORIGIN);
    assert.ok(html.includes(`<link rel="canonical" href="${info.canonical}"/>`));
    const json = /<script type="application\/ld\+json">(.*)<\/script>/s.exec(html)[1];
    assert.ok(JSON.parse(json)['@graph'].length >= 2);
    assert.ok(page.kind === 'landing' ? landingDocument(page, ORIGIN).includes('<h1>') : staticContent(page, ORIGIN).includes('<h1>'));
  }
  assert.equal(titles.size, pages.length);
});

test('structured data never states a price (prices differ by country and are placeholders)', () => {
  const all = ['/', '/templates', '/templates/9'].map(p => headTags(pageFor(p), ORIGIN).html + staticContent(pageFor(p), ORIGIN)).join('') + LANDING.map(l => landingDocument(pageFor(`/${l.slug}`), ORIGIN)).join('');
  assert.ok(!/["'>][^<"']*[₹$£€]\s?\d|"price"|priceCurrency/i.test(all));
});

test('robots.txt blocks private paths, welcomes AI crawlers and names the sitemap', () => {
  const robots = robotsTxt(ORIGIN);
  for (const agent of ['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.ok(robots.includes(`User-agent: ${agent}\n`), agent);
  for (const path of ['/api/', '/edit', '/editor/']) assert.ok(robots.includes(`Disallow: ${path}`), path);
  assert.ok(robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
});

test('sitemap and llms.txt list every public page', () => {
  const sitemap = sitemapXml(ORIGIN);
  const llms = llmsTxt(ORIGIN);
  for (const path of ['/', '/templates', ...LANDING.map(l => `/${l.slug}`), ...TEMPLATES.map(t => `/templates/${t.id}`)]) {
    assert.ok(sitemap.includes(`<loc>${ORIGIN}${path}</loc>`), path);
  }
  for (const t of TEMPLATES) assert.ok(llms.includes(`${ORIGIN}/templates/${t.id}`), t.title);
});

test('the public address is invitestudio.co unless PUBLIC_ORIGIN says otherwise; pages.dev is kept out of search', () => {
  assert.equal(originFor({}), 'https://invitestudio.co');
  assert.equal(SITE_ORIGIN, 'https://invitestudio.co');
  assert.equal(originFor({ PUBLIC_ORIGIN: 'https://example.test/' }), 'https://example.test');
  assert.ok(isPrivateHost('invitestudio-a3r.pages.dev') && isPrivateHost('553e4bee.invitestudio-a3r.pages.dev'));
  assert.ok(!isPrivateHost('invitestudio.co') && !isPrivateHost('www.invitestudio.co'));
  assert.equal(robotsTxt(ORIGIN, { blockAll: true }), 'User-agent: *\nDisallow: /\n');
});

test('invitations are never indexed', () => {
  assert.ok(!/index,follow/.test(readFileSync(join(root, 'functions', 's', '[slug].js'), 'utf8')));
});

test('the default social card exists and is 1200x630', () => {
  const png = readFileSync(join(root, 'assets', 'og-image.png'));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test('landing pages: unique content, real templates, working internal links, one h1', () => {
  const slugs = new Set(LANDING.map(l => l.slug));
  assert.equal(slugs.size, LANDING.length);
  const ids = new Set(TEMPLATES.map(t => t.id));
  const lead = new Set();
  for (const l of LANDING) {
    for (const id of l.picks) assert.ok(ids.has(id), `${l.slug}: template ${id}`);
    assert.ok(l.faq.length >= 3 && l.sections.length >= 3, l.slug);
    lead.add(l.lead);
    const doc = landingDocument(pageFor(`/${l.slug}`), ORIGIN);
    assert.equal((doc.match(/<h1>/g) || []).length, 1, l.slug);
    assert.ok(doc.includes(`<link rel="canonical" href="${ORIGIN}/${l.slug}"/>`));
    for (const [, path] of doc.matchAll(/<a [^>]*href="(?:https:\/\/example\.test)?(\/[^"#]*)/g)) {
      const p = pageFor(path);
      assert.ok(p || path === '/' || path === '/templates', `${l.slug}: broken link ${path}`);
    }
    for (const [, src] of doc.matchAll(/src="(\/assets[^"]+)"/g)) assert.ok(existsSync(join(root, src.slice(1))), src);
  }
  assert.equal(lead.size, LANDING.length);
});

test('each template page uses the same opening name and style tags as the gallery', () => {
  const blocks = shared.split(/\n  \{\n    id: /).slice(1);
  assert.equal(blocks.length, TEMPLATES.length);
  for (const block of blocks) {
    const t = TEMPLATES.find(item => item.id === Number(/^(\d+)/.exec(block)[1]));
    assert.ok(t, 'template listed');
    assert.ok(block.includes(`tags: [${t.tags.map(tag => `"${tag}"`).join(', ')}]`), `${t.title} tags`);
    assert.ok(block.includes(`name: "${t.opening}"`), `${t.title} opening`);
    assert.ok(t.openingText.length > 40);
  }
});

test('a template page links to similar templates and guides, and shows its image', () => {
  const html = staticContent(pageFor('/templates/19'), ORIGIN);
  assert.ok(/<img src="\/assets\/templates\/velvet-reveal-phone\.jpg" srcset="\/assets\/templates\/velvet-reveal-phone-sm\.webp 320w, [^"]+ 720w"[^>]* alt="Velvet Reveal/.test(html));
  assert.ok(/Similar templates/.test(html) && /Guides/.test(html));
  assert.ok(!html.includes('/templates/19">'), 'does not link to itself');
});
