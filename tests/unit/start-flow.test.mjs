// The first steps of the product: the big home button, example names that stay hints, and no silent stand-in names.
// Source-level checks, like the other regression tests, plus the behaviour of the stand-in rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(join(root, path), 'utf8');

test('the big "Start your invitation" button on the home page is a link to /templates', () => {
  const home = read('figma/islands/Home.tsx');
  assert.match(home, /<a className="button" href="\/templates">\s*Start your invitation/);
  assert.doesNotMatch(home, /onClick=\{\(\) => bridge\.startCreate\("Wedding"\)\}>\s*Start your invitation/);
});

test('a new draft does not copy the template example names into the couple\'s names', () => {
  const host = read('figma-host.js');
  const create = host.slice(host.indexOf('createDraft(backendTemplateId'), host.indexOf('startCreate(category)'));
  assert.doesNotMatch(create, /p\.title\s*=/);
  assert.match(host, /const SAMPLE_NAMES = 'Daniel & Amelia'/);
  assert.match(host, /title: SAMPLE_NAMES,/); // the hint under the names field
  assert.match(host, /\{ \.\.\.p, title: SAMPLE_NAMES, name: SAMPLE_NAMES \}/); // the preview while the field is empty
});

test('the stored stand-in title never comes back as the couple\'s names', () => {
  const sync = read('cloud-sync.js');
  assert.match(sync, /wedding\.title === 'Our wedding' \|\| wedding\.title === 'Our celebration'/);
  assert.match(sync, /standIn && !String\(project\.title \|\| ''\)\.trim\(\) \? ''/);
});

test('publishing needs real names: the editor asks for them and the dialog refuses without them', () => {
  const editor = read('figma/islands/Editor.tsx');
  assert.match(editor, /if \(snap\.title\.trim\(\)\) \{\s*bridge\.openPublish\(\)/);
  assert.match(editor, /Add your names to publish/);
  assert.match(read('cloud-sync.js'), /Add your names first/);
});

test('the template preview popup fits a phone and shows the visitor\'s names when they have them', () => {
  const html = read('index.html');
  assert.match(html, /\.template-preview-shell\{width:min\(1080px,94vw\);max-height:92vh;padding:0/);
  assert.match(html, /content\.includes\('full-template-preview'\)\?'template-preview-shell'/);
  assert.match(html, /const ownNames=String\(mine&&mine\.title\|\|''\)\.trim\(\)/);
  assert.doesNotMatch(html.slice(html.indexOf('function previewTemplate')).slice(0, 400), /const title=demoTitle\(t\.category\);/);
});

test('the countdown widget does not rewrite unchanged text (that retriggered its own DOM observer and froze the page)', () => {
  const vm = require_vm();
  let writes = 0, observerCallback = null;
  const cells = {};
  const cellFor = key => (cells[key] ||= { _t: '—', get textContent() { return this._t; }, set textContent(v) { writes += 1; this._t = v; if (observerCallback) observerCallback(); } });
  const countdown = { getAttribute: () => '2999-01-01', querySelector: selector => cellFor(selector), isConnected: true };
  const doc = {
    documentElement: {}, addEventListener() {},
    querySelectorAll: selector => (selector === '[data-countdown]' ? [countdown] : [])
  };
  const win = { matchMedia: () => ({ matches: false }), setInterval: () => 1, clearInterval() {} };
  class FakeObserver { constructor(cb) { observerCallback = cb; } observe() {} }
  const source = readFileSync(join(root, 'template-widgets.js'), 'utf8');
  vm.runInNewContext(source, { window: win, document: doc, MutationObserver: FakeObserver, Date, Math, String, isNaN });
  // Booting wrote the first value, and the observer firing again afterwards must not write again.
  const afterBoot = writes;
  for (let i = 0; i < 5; i++) observerCallback();
  assert.equal(writes, afterBoot);
  assert.ok(afterBoot <= 4);
});

import vmModule from 'node:vm';
function require_vm() { return vmModule; }
