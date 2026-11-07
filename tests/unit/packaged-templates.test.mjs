// Quality gate for packaged templates (templates/<id>/): a template ships only if these pass.
// See docs/TEMPLATE_CONTRACT.md. The same checks run for every template folder, so a new template
// is held to the same bar without writing new tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { generatedJs, inlineBlock, currentBlock, loadTemplates, scopeCss } from '../../scripts/build-templates.mjs';
import { readCatalogue } from '../../scripts/template-catalogue.mjs';
import { LAUNCH_TEMPLATE_IDS } from '../../functions/_shared/templates.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const list = loadTemplates();
const html = readFileSync(join(root, 'index.html'), 'utf8');

function renderer() {
  const ctx = { Math, Date, String, Array, Object, encodeURIComponent, Intl };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, 'templates/templates.generated.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(root, 'packaged-templates.js'), 'utf8'), ctx);
  return ctx;
}
const sampleOf = id => JSON.parse(readFileSync(join(root, 'templates', id, 'sample.json'), 'utf8'));
const stripped = markup => markup.replace(/<!--[\s\S]*?-->/g, '');

test('the built files are current (npm run build:templates)', () => {
  assert.equal(readFileSync(join(root, 'templates/templates.generated.js'), 'utf8'), generatedJs(list));
  assert.equal(currentBlock(html), inlineBlock(list));
});

for (const { manifest, parts, css } of list) {
  const id = manifest.id;
  const dir = join(root, 'templates', id);
  const markup = Object.values(parts).join('\n');

  test(`${id}: registered in the catalogue, the server registry and a migration`, () => {
    const entry = readCatalogue().templates.find(t => t.id === id);
    assert.ok(entry && entry.packaged === id, 'catalogue entry with packaged key');
    assert.equal(entry.name, manifest.name);
    assert.ok(LAUNCH_TEMPLATE_IDS.includes(id));
    const sql = readdirSync(join(root, 'supabase/migrations')).map(f => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n');
    assert.match(sql, new RegExp(`'${id}', '${id}'`));
    for (const suffix of ['.png', '-wide.jpg', '-phone.jpg']) assert.ok(existsSync(join(root, 'assets/templates', id + suffix)), `thumbnail ${suffix} (npm run thumbs:scenes)`);
  });

  test(`${id}: every wording key is used, every used key exists, text fits`, () => {
    const engine = readFileSync(join(root, 'packaged-templates.js'), 'utf8');
    const used = new Set([...markup.matchAll(/copy:(\w+)/g), ...engine.matchAll(/copy\("(\w+)"\)/g)].map(m => m[1]));
    for (const key of [...markup.matchAll(/copy:(\w+)/g)].map(m => m[1])) assert.ok(manifest.copy[key], `${key} is used in the markup but not in the manifest`);
    for (const key of Object.keys(manifest.copy)) assert.ok(used.has(key) || engine.includes(`"${key}"`), `${key} is in the manifest but never used`);
    for (const [key, def] of Object.entries(manifest.copy)) {
      assert.ok(def.label && def.default && def.max > 0 && def.section, key);
      assert.ok(def.default.length <= def.max, `${key} default is longer than its limit`);
    }
  });

  test(`${id}: no one's real details are baked into the markup, no scripts, no external requests`, () => {
    const text = stripped(markup);
    const sample = sampleOf(id);
    for (const word of String(sample.title).split(/[^A-Za-z]+/).filter(w => w.length > 2)) assert.doesNotMatch(text, new RegExp(word, 'i'), `"${word}" must come from the couple's content`);
    assert.doesNotMatch(text, /\b20\d\d\b/, 'no hard-coded year');
    assert.doesNotMatch(text, /<script|\son[a-z]+=|javascript:/i);
    for (const url of text.match(/(?:src|href)="[^"{]*"/g) || []) assert.doesNotMatch(url, /https?:\/\//, url);
    assert.doesNotMatch(text, /href="#/, 'anchors would change the page address; use data-scroll-to');
  });

  test(`${id}: stylesheet is scoped, container based and self contained`, () => {
    for (const rule of css.split('\n')) {
      if (!rule.trim() || rule.startsWith('@font-face')) continue;
      assert.match(rule, /^(\.|@container|@media)/, rule.slice(0, 60));
    }
    assert.doesNotMatch(css, /\d(vw|vh|svh|dvh)\b/, 'size by the invitation (cqw), not the window');
    assert.doesNotMatch(css, /position:\s*fixed/);
    assert.doesNotMatch(css, /@media\s*\(\s*(max|min)-width/, 'viewport media queries do not match inside the editor frame; use @container');
    assert.doesNotMatch(css, /url\(["']?https?:/);
    assert.doesNotMatch(css, /@import/);
    for (const [, url] of css.matchAll(/url\("([^"]+)"\)/g)) assert.ok(existsSync(join(root, url)), `${url} exists`);
    for (const [, url] of markup.matchAll(/src="(\/[^"{]+)"/g)) assert.ok(existsSync(join(root, url)), `${url} exists`);
  });

  test(`${id}: renders a full sample without leftovers, and escapes everything`, () => {
    const { renderPackagedTemplate } = renderer();
    const t = { id, packaged: id };
    const photo = 'data:image/png;base64,iVBORw0KGgo=';
    const out = renderPackagedTemplate({ ...sampleOf(id), photos: [{ data: photo }, { data: photo }] }, t);
    assert.doesNotMatch(out, /\{\{|\}\}|<!--/);
    for (const section of manifest.sections) assert.ok(new RegExp(`data-section="${section === 'hero' ? 'hero' : section}"`).test(out), `${section} rendered`);
    for (const target of out.matchAll(/data-scroll-to="(\w+)"/g)) assert.ok(out.includes(`data-tpl-section="${target[1]}"`), `scroll target ${target[1]} exists`);
    const hostile = renderPackagedTemplate({ ...sampleOf(id), title: '<img src=x onerror=alert(1)> & "Q"', story: '<script>alert(1)</script>', hosts: '</p><b>', location: '"><i>x</i>, <u>y</u>', copy: { cta: '<svg onload=1>' } }, t);
    assert.doesNotMatch(hostile, /<img src=x|<script>alert|<b>|<svg onload|<i>x|<u>y/);
  });

  test(`${id}: looks complete with almost nothing entered`, () => {
    const { renderPackagedTemplate } = renderer();
    const out = renderPackagedTemplate({ title: 'Sam' }, { id, packaged: id });
    assert.doesNotMatch(out, /\{\{|<!--|undefined|null|NaN|\[object/);
    assert.match(out, /Date to be announced/);
    for (const hidden of ['story', 'functions', 'gallery']) assert.doesNotMatch(out, new RegExp(`data-section="${hidden}"`), `${hidden} is left out when empty`);
    assert.doesNotMatch(out, /data-countdown/, 'no countdown without a date');
    assert.doesNotMatch(out, /Get directions/, 'no directions without a place');
    assert.match(out, /Online replies are not open yet/, 'RSVP says it is not open');
    assert.doesNotMatch(out, /<form|<input/, 'no guest form until responses exist');
  });

  test(`${id}: long names, one name, no date and unicode names stay tidy`, () => {
    const { renderPackagedTemplate } = renderer();
    const t = { id, packaged: id };
    const long = renderPackagedTemplate({ title: 'Alexandria-Catherine & Maximilian-Bartholomew', date: '2027-01-21' }, t);
    assert.match(long, /<h1 data-long>/);
    const one = renderPackagedTemplate({ title: 'Anniversary party' }, t);
    assert.doesNotMatch(one, /<span>&amp;<\/span>/);
    const uni = renderPackagedTemplate({ title: 'ആരതി & Émile' }, t);
    assert.match(uni, /ആ/);
    assert.match(uni, /É/);
    const feb = renderPackagedTemplate({ title: 'A & B', date: '2027-02-31' }, t);
    assert.match(feb, /Date to be announced/, 'an impossible date is treated as no date');
  });

  test(`${id}: wording overrides apply, are trimmed, and fall back when empty`, () => {
    const { renderPackagedTemplate } = renderer();
    const t = { id, packaged: id };
    const base = { ...sampleOf(id) };
    const plain = Object.entries(manifest.copy).filter(([key, def]) => !def.default.includes('*') && !/\bupper:copy:\w*/.test('') && def.max >= 20).map(([key]) => key);
    const [first, second] = plain;
    const changed = renderPackagedTemplate({ ...base, copy: { [first]: '  Our own words  ', [second]: '   ' } }, t);
    assert.match(changed, /our own words/i);
    assert.match(changed, new RegExp(manifest.copy[second].default.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;'), 'i'), 'blank wording keeps the original');
    const title = Object.entries(manifest.copy).find(([, def]) => def.default.includes('*'))[0];
    assert.match(renderPackagedTemplate({ ...base, copy: { [title]: 'Our *Tale*' } }, t), /Our <em>Tale<\/em>/);
  });

  test(`${id}: sections the couple hides are not drawn, and navigation follows`, () => {
    const { renderPackagedTemplate } = renderer();
    const sections = manifest.sections.map(s => ({ id: s, visible: !['story', 'functions', 'welcome'].includes(s) }));
    const out = renderPackagedTemplate(sampleOf(id), { id, packaged: id }).length;
    const hidden = renderPackagedTemplate({ ...sampleOf(id), sections }, { id, packaged: id });
    assert.doesNotMatch(hidden, /data-section="(story|functions|welcome)"/);
    assert.doesNotMatch(hidden, /data-scroll-to="(story|details|schedule|venue|location|invitation)"/);
    assert.ok(hidden.length < out);
  });

  test(`${id}: text colours keep at least 4.5:1 against the backgrounds they sit on`, () => {
    const rgb = hex => hex.replace('#', '').match(/../g).map(h => parseInt(h, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const lum = hex => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const pairs = manifest.contrast;
    assert.ok(Array.isArray(pairs) && pairs.length >= 8, 'the manifest lists the text and background pairs to check');
    const inCss = new Set([...css.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)].map(m => '#' + (m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]).toLowerCase()));
    for (const [fg, bg, name] of pairs) assert.ok(inCss.has(fg.toLowerCase()) && inCss.has(bg.toLowerCase()), `${name}: colours must be ones the stylesheet uses`);
    for (const [fg, bg, name] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${name}: ${ratio(fg, bg).toFixed(2)}`);
  });
}

test('scopeCss prefixes every rule and keeps at-rules', () => {
  const out = scopeCss('a.k,b{color:red}@container (max-width:10px){p{x:y}}@font-face{font-family:F}body{margin:0}', 'tpl-x', 'z-');
  assert.equal(out, '.tpl-x a.z-k,.tpl-x b{color:red}\n@container (max-width:10px){.tpl-x p{x:y}}\n@font-face{font-family:F}\n.tpl-x{margin:0}');
});

test('countdown and menu behaviour is provided by the platform, not the template', () => {
  const widgets = readFileSync(join(root, 'template-widgets.js'), 'utf8');
  for (const marker of ['data-scroll-to', 'data-menu-toggle', 'data-countdown']) assert.ok(widgets.includes(marker), marker);
  assert.ok(html.includes('/template-widgets.js') && html.includes('/packaged-templates.js') && html.includes('/templates/templates.generated.js'));
});

test('wording is validated and stored by the server, and returned on the public page', async () => {
  const { validateWeddingInput, publicWeddingProjection } = await import('../../functions/_shared/api.js');
  const ok = validateWeddingInput({ title: 'A', templateId: LAUNCH_TEMPLATE_IDS[0], copy: { cta: '  Hello  ', story_lead: '' } }, { create: true });
  assert.deepEqual(ok.content.copy, { cta: 'Hello' });
  assert.throws(() => validateWeddingInput({ title: 'A', templateId: LAUNCH_TEMPLATE_IDS[0], copy: { 'bad key': 'x' } }, { create: true }));
  assert.throws(() => validateWeddingInput({ title: 'A', templateId: LAUNCH_TEMPLATE_IDS[0], copy: ['x'] }, { create: true }));
  assert.throws(() => validateWeddingInput({ title: 'A', templateId: LAUNCH_TEMPLATE_IDS[0], copy: { cta: 5 } }, { create: true }));
  const pub = publicWeddingProjection({ slug: 's', title: 'A', content: { copy: { cta: 'Hi', evil: 3, 'B x': 'y' }, secret: 'no' }, sections: [] });
  assert.deepEqual(pub.content.copy, { cta: 'Hi' });
  assert.equal(pub.content.secret, undefined);
});
