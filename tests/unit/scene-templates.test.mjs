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
  const ctx = { window, Math, Date, String, Array, Object, JSON, Number, encodeURIComponent };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, 'rsvp-view.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(root, 'scene-templates.js'), 'utf8'), ctx);
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

test('the closing scene offers a Reply button by default, and no form is drawn into the page itself', () => {
  const { renderSceneTemplate } = loadRenderer();
  for (const template of sceneTemplates) {
    const html = renderSceneTemplate(project, template);
    assert.doesNotMatch(html, /<form|<input|<textarea/i);
    assert.match(html, /data-rsvp-open/);
    assert.doesNotMatch(html, /not open yet/i);
    const none = renderSceneTemplate({ ...project, preferences: { rsvp: 'none' } }, template);
    assert.doesNotMatch(none, /data-rsvp-open|Replies are closed|contact the couple/);
    const closed = renderSceneTemplate({ ...project, preferences: { rsvpOpen: false, rsvpContact: { type: 'phone', value: '+91 98765 43210' } } }, template);
    assert.match(closed, /Replies are closed/);
    assert.match(closed, /href="tel:\+919876543210"/);
    assert.doesNotMatch(closed, /data-rsvp-open/);
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
  const designed = readCatalogue().templates.filter(template => template.scene || template.packaged).map(template => template.id).sort();
  assert.deepEqual(offered, designed);
});

test('the editor preview marks each scene template for click-to-edit and the published page has none', () => {
  for (const template of sceneTemplates) {
    const renderer = loadRenderer();
    const editor = renderer.renderSceneTemplate(project, template, { editable: true });
    const kinds = new Set([...editor.matchAll(/data-edit="([^"]+)"/g)].map(match => match[1]));
    for (const wanted of ['names:first', 'names:second', 'pretitle', 'date', 'hosts', 'message', 'storyCopy', 'storyTitle', 'event:title']) {
      assert.ok(kinds.has(wanted), `${template.id} should mark ${wanted}; found ${[...kinds].join(', ')}`);
    }
    assert.ok(kinds.has('location:venue') || kinds.has('location'), `${template.id} should mark the location`);
    assert.match(editor, /data-edit="date" data-raw="2027-08-24"/);
    assert.match(editor, /data-edit="event:title" data-raw="Welcome Dinner" data-id="1"/);
    assert.equal(editor.includes('Hidden event'), false);
    const published = renderer.renderSceneTemplate(project, template);
    for (const hook of ['data-edit', 'data-add-event', 'data-photo-add', 'data-multiline']) {
      assert.equal(published.includes(hook), false, `${template.id}: the published page contains ${hook}`);
    }
  }
});

test('the editor shows an empty schedule with "+ Add an event" and photo placeholders; the published page leaves them out', () => {
  for (const template of sceneTemplates) {
    const renderer = loadRenderer();
    const bare = { title: 'Ava & Ben', functions: [], photos: [] };
    const editor = renderer.renderSceneTemplate(bare, template, { editable: true });
    assert.equal((editor.match(/data-add-event/g) || []).length, 1, `${template.id} should offer "+ Add an event"`);
    assert.equal((editor.match(/data-photo-add/g) || []).length, 2, `${template.id} should offer photo placeholders`);
    const published = renderer.renderSceneTemplate(bare, template);
    assert.equal(published.includes('The celebrations'), false);
    assert.equal(published.includes('Gallery'), false);
  }
});

test('text typed into a scene template field is escaped in the editor preview', () => {
  const renderer = loadRenderer();
  const nasty = { ...project, title: '<img src=x onerror=alert(1)> & Ben', hosts: '"><script>alert(1)</script>' };
  for (const template of sceneTemplates) {
    const editor = renderer.renderSceneTemplate(nasty, template, { editable: true });
    assert.equal(/<img src=x/.test(editor), false, `${template.id}: markup was injected`);
    assert.equal(/<script>alert/.test(editor), false, `${template.id}: a script was injected`);
  }
});
