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

test('the last step says what it does before and inside the Share dialog', () => {
  const editor = read('figma/islands/Editor.tsx');
  assert.match(editor, /Share invitation <Icon/); // the header button
  assert.doesNotMatch(editor, /\{snap\.published \? "Published" : "Publish"\}/);
  assert.match(editor, /Right now only you can see your invitation\./);
  assert.match(editor, /anyone who has\s+the link can open it\. You can keep editing afterwards, or take it offline any time\./);
  assert.doesNotMatch(editor, /Nothing is public until you do/, 'one voice: private now, a link once live (no "nothing is public" next to "anyone can open it")');
  assert.match(editor, /Update live page/); // the live state explains how changes go live
  const sync = read('cloud-sync.js');
  for (const text of ['Right now it is private.', 'Only you can see your invitation.', 'Making it live gives it a web link.', 'Anyone who has the link can open it', 'Guests can reply from the live invitation.', 'You can change your mind.', 'Preview it first', 'Your link will be', 'Make it live']) {
    assert.ok(sync.includes(text), text);
  }
  // Replies are live, and the panel must never say they are not, or say nobody can see what a link makes visible.
  for (const stale of ['Guests can’t reply online yet.', 'Guest responses are not open', 'Nobody can see your invitation yet', 'Not public until you do this.']) {
    assert.equal(sync.includes(stale), false, `stale or contradictory wording: ${stale}`);
  }
  assert.match(sync, /data-preview-first/);
  assert.doesNotMatch(sync, /Publish invitation|Publish your invitation/);
  // The other places that start publishing use the same name.
  assert.doesNotMatch(read('index.html'), /onclick="openPublish\(\)">Publish</);
});

test('one clear creation path: the header starts creating, and the template page offers guided setup or a labelled quick start', () => {
  const home = read('figma/islands/Home.tsx');
  assert.match(home, /<a className="button small" href="\/templates">\s*Start creating/);
  assert.doesNotMatch(home, /Get started/);
  assert.match(home, /<a className="button outline" href="#how">\s*See how it works/); // not a second link to the same place
  for (const page of ['figma/islands/Templates.tsx', 'figma/islands/TemplateDetail.tsx']) assert.doesNotMatch(read(page), /Get started/);
  const detail = read('figma/islands/TemplateDetail.tsx');
  assert.match(detail, /bridge\.startSetup\(template\.backendId\)/);
  assert.match(detail, /Start with this design/);
  assert.match(detail, /Guided setup takes about a minute/);
  assert.match(detail, /Quick start: skip setup and open the editor/);
  // The chosen design is carried into setup (the preview popup's Choose this design too).
  const html = read('index.html');
  assert.match(html, /function startCreate\(cat,chosenId\)/);
  assert.match(html, /startCreate\(state\.category,id\)\}/);
  assert.match(read('cloud-sync.js'), /cloudAwareStartCreate\(category, templateId\)/);
});

test('the preview and the saved-draft banner say plainly who can see and edit', () => {
  const html = read('index.html');
  assert.match(html, /function previewNote\(p\)/);
  assert.match(html, /Only you can see this\. Choose Share invitation when you want a link guests can open\./);
  assert.doesNotMatch(html, /Public publishing and live guest RSVPs are not available yet/);
  const sync = read('cloud-sync.js');
  assert.match(sync, /Only you can see it, and it is not public until you share it\./);
  assert.match(sync, /Anyone with that link can edit/);
  assert.match(read('figma/islands/Editor.tsx'), /Your draft is private/);
});

test('long names are sized by their longest word in every template, so they fit instead of breaking mid-word', () => {
  for (const id of ['modern-heritage', 'minimalist', 'cinematic']) assert.match(read(`templates/${id}/template.css`), /--fit:calc\(/, id);
  assert.match(read('scene-templates.js'), /function longestWord\(a, b\)/);
  assert.match(read('scene-templates.css'), /\.sx-nm\{font-size:min\(58px,calc\(300px\/\(var\(--nl,10\)\*\.5\)\)\)\}/);
});

test('the template page shows the real design in a phone beside the details, with no Live preview button or popup', () => {
  const detail = read('figma/islands/TemplateDetail.tsx');
  assert.match(detail, /bridge\.renderTemplateDemo\(screenRef\.current, template\.backendId\)/);
  assert.match(detail, /className="detail-device"/);
  assert.match(detail, /scroll-cue detail-cue/); // the "Scroll" animation, as in the editor and setup previews
  assert.doesNotMatch(detail, /Live preview|previewTemplate/);
  assert.doesNotMatch(read('figma/islands/bridge.ts'), /previewTemplate/);
  assert.match(read('figma-host.js'), /renderTemplateDemo\(host, backendTemplateId\)/);
  assert.match(read('index.html'), /function templateDemoProject\(t\)/);
  const css = read('figma/islands/islands.css');
  assert.match(css, /@media \(min-width: 901px\) \{ \.detail-showcase \{ position: sticky;/); // stays in view while the details scroll
  assert.match(css, /\.detail-page \{ overflow: clip; \}/); // overflow hidden here would stop it sticking
});
