import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, pageFor, describe, headTags, staticContent, robotsTxt, sitemapXml, llmsTxt } from '../../functions/_shared/seo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'https://example.test';
const shared = readFileSync(join(root, 'figma', 'islands', 'shared.tsx'), 'utf8');

test('the template list matches the gallery on the home page', () => {
  const gallery = [...shared.matchAll(/^\s+id: (\d+),\n\s+backendId: "[^"]+",\n\s+title: "([^"]+)"/gm)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(TEMPLATES.map(t => [t.id, t.title]), gallery);
});

test('template images that the pages point at exist', () => {
  for (const t of TEMPLATES) assert.ok(existsSync(join(root, t.image.slice(1))), t.image);
});

test('only the public marketing pages are described', () => {
  assert.equal(pageFor('/').kind, 'home');
  assert.equal(pageFor('/templates/').kind, 'templates');
  assert.equal(pageFor('/templates/9').kind, 'detail');
  for (const path of ['/templates/999', '/editor/9', '/edit/abc', '/s/slug', '/api/pricing', '/templates/templates.generated.js']) assert.equal(pageFor(path), null, path);
});

test('every page has a distinct title and description, a canonical address, and valid structured data', () => {
  const pages = ['/', '/templates', ...TEMPLATES.map(t => `/templates/${t.id}`)].map(pageFor);
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
    assert.ok(staticContent(page, ORIGIN).includes('<h1>'));
  }
  assert.equal(titles.size, pages.length);
});

test('structured data never states a price (prices differ by country and are placeholders)', () => {
  const all = ['/', '/templates', '/templates/9'].map(p => headTags(pageFor(p), ORIGIN).html + staticContent(pageFor(p), ORIGIN)).join('');
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
  for (const path of ['/', '/templates', ...TEMPLATES.map(t => `/templates/${t.id}`)]) {
    assert.ok(sitemap.includes(`<loc>${ORIGIN}${path}</loc>`), path);
  }
  for (const t of TEMPLATES) assert.ok(llms.includes(`${ORIGIN}/templates/${t.id}`), t.title);
});
