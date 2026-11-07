// Unit tests for the scene templates (Savanna Sunset, Palmera Beach, Curtain Call, Lunaria).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readCatalogue } from '../../scripts/template-catalogue.mjs';
import { currentBlock, inlineBlock } from '../../scripts/inline-scene-css.mjs';
import { LAUNCH_TEMPLATE_IDS } from '../../functions/_shared/templates.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sceneTemplates = readCatalogue().templates.filter(template => template.scene);

function loadRenderer() {
  const window = {};
  vm.runInNewContext(readFileSync(join(root, 'scene-templates.js'), 'utf8'), { window, Math, Date, String, Array, Object, encodeURIComponent });
  return window;
}
const project = {
  title: 'Aarav & Meera', category: 'Wedding', hosts: 'With the blessings of their families', date: '2027-08-24',
  location: 'Grand Hyatt, Kochi, India', message: 'Join us as we begin our life together.', story: 'We met in a lift.',
  functions: [
    { id: '1', title: 'Welcome Dinner', date: '2027-08-23', time: '18:00', venue: 'Grand Hyatt, Kochi', visible: true },
    { id: '2', title: 'Ceremony', date: '2027-08-24', time: '10:00', venue: 'Kochi', visible: true, dressCode: 'Traditional' },
    { id: '3', title: 'Hidden event', date: '2027-08-25', visible: false }
  ]
};

test('all four scene templates are in the Wedding catalogue and registered', () => {
  assert.deepEqual(sceneTemplates.map(template => template.id).sort(), ['curtain-call', 'lunaria-moon', 'palmera-beach', 'savanna-sunset']);
  for (const template of sceneTemplates) {
    assert.equal(template.category, 'Wedding');
    assert.ok(LAUNCH_TEMPLATE_IDS.includes(template.id), `${template.id} must be in the server registry (npm run gen:templates)`);
    assert.ok(existsSync(join(root, template.image.replace(/^\//, ''))), `thumbnail missing for ${template.id} (npm run thumbs:scenes)`);
  }
});

test('the database migration registers every scene template id', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/202611070001_scene_templates.sql'), 'utf8');
  for (const template of sceneTemplates) assert.match(sql, new RegExp(`'${template.id}', '${template.id}'`));
});

test('the inline styles in index.html match scene-templates.css (npm run build:scene-css)', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.equal(currentBlock(html), inlineBlock());
});

test('every scene template renders the couple, the date, the venue and visible events', () => {
  const { renderSceneTemplate } = loadRenderer();
  for (const template of sceneTemplates) {
    const html = renderSceneTemplate(project, template);
    assert.match(html, /Aarav/);
    assert.match(html, /Meera/);
    assert.match(html, /2027/);
    assert.match(html, /Grand Hyatt/);
    assert.match(html, /Kochi, India|KOCHI, INDIA/);
    assert.match(html, /Welcome Dinner/);
    assert.doesNotMatch(html, /Hidden event/);
    assert.match(html, /Traditional/);
    assert.match(html, /<svg/);
  }
});

test('guest responses are not offered: no form, and the closing scene says so', () => {
  const { renderSceneTemplate } = loadRenderer();
  for (const template of sceneTemplates) {
    const html = renderSceneTemplate(project, template);
    assert.doesNotMatch(html, /<form|<input|<textarea/i);
    assert.match(html, /Guest responses are not open yet/);
  }
});

test('project text is escaped and unsafe links are dropped', () => {
  const { renderSceneTemplate } = loadRenderer();
  const hostile = {
    ...project, title: '<img src=x onerror=alert(1)> & "Meera"', message: '<script>alert(1)</script>',
    functions: [{ id: '1', title: '<b>x</b>', directionsUrl: 'javascript:alert(1)', visible: true }]
  };
  for (const template of sceneTemplates) {
    const html = renderSceneTemplate(hostile, template);
    assert.doesNotMatch(html, /<img src=x|<script>alert|<b>x/);
    assert.doesNotMatch(html, /href="javascript:/i);
  }
});

test('hidden sections are left out and custom sections are drawn', () => {
  const { renderSceneTemplate } = loadRenderer();
  const template = sceneTemplates[0];
  const html = renderSceneTemplate({
    ...project,
    sections: [{ id: 'hero', visible: true }, { id: 'story', visible: false }, { id: 'functions', visible: false }, { id: 'rsvp', visible: false }, { id: 'c1', custom: true, title: 'Travel notes', content: 'Fly into Kochi.', visible: true }]
  }, template);
  assert.doesNotMatch(html, /We met in a lift/);
  assert.doesNotMatch(html, /Welcome Dinner/);
  assert.doesNotMatch(html, /Guest responses/);
  assert.match(html, /Travel notes/);
  assert.match(html, /Fly into Kochi/);
});

test('a project with no date, location or events still renders', () => {
  const { renderSceneTemplate } = loadRenderer();
  for (const template of sceneTemplates) {
    const html = renderSceneTemplate({ title: 'Solo Name', category: 'Wedding' }, template);
    assert.match(html, /Solo Name/);
    assert.match(html, /DATE TO BE ANNOUNCED|Date to be announced/);
  }
});

test('a template without a scene key is not handled by this renderer', () => {
  const { renderSceneTemplate, isSceneTemplate } = loadRenderer();
  assert.equal(renderSceneTemplate(project, { id: 'eternal' }), '');
  assert.equal(isSceneTemplate({ id: 'eternal' }), false);
  assert.equal(isSceneTemplate(sceneTemplates[0]), true);
});

test('the template gallery lists every scene template with its artwork and phone cover', () => {
  const shared = readFileSync(join(root, 'figma/islands/shared.tsx'), 'utf8');
  const gallery = shared.slice(shared.indexOf('export const galleryTemplates'), shared.indexOf('export const editableItems'));
  for (const template of sceneTemplates) {
    const entry = gallery.match(new RegExp(`backendId: "${template.id}",[\\s\\S]*?image:\\s*"([^"]+)",\\s*phone:\\s*"([^"]+)"`));
    assert.ok(entry, `${template.id} must be in galleryTemplates (figma/islands/shared.tsx) with image and phone`);
    assert.ok(existsSync(join(root, entry[1].replace(/^\//, ''))), `gallery artwork missing for ${template.id}: ${entry[1]}`);
    assert.ok(existsSync(join(root, entry[2].replace(/^\//, ''))), `phone cover missing for ${template.id}: ${entry[2]} (npm run thumbs:scenes)`);
  }
});

test('the designs offered in the app (index.html) are the same ones the gallery lists (shared.tsx)', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const shared = readFileSync(join(root, 'figma/islands/shared.tsx'), 'utf8');
  const offered = [...html.match(/const offeredTemplateIds=\[([^\]]*)\]/)[1].matchAll(/'([a-z0-9-]+)'/g)].map(match => match[1]).sort();
  const listed = [...shared.matchAll(/^\s+backendId: "([^"]+)"/gm)].map(match => match[1]).sort();
  assert.deepEqual(offered, listed);
  assert.deepEqual(offered, sceneTemplates.map(template => template.id).sort());
});
