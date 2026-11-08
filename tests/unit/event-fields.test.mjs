// Event fields: whatever a couple types, what is sent to the cloud must be something the server accepts, or the whole
// draft stops saving ("when we enter the time of the wedding cloud saving is failing": the editor took free text like
// "4:00 PM" and the server only accepts HH:MM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { validateWeddingInput } from '../../functions/_shared/api.js';
import { LAUNCH_TEMPLATE_IDS } from '../../functions/_shared/templates.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { normalizeTime, formatTime, cloudEvent, cloudEvents, sameEvents } = require('../../event-fields.js');

test('times a couple might type become 24-hour HH:MM, and anything else is dropped', () => {
  const cases = { '16:00': '16:00', '4:00 PM': '16:00', '4:00pm': '16:00', '4pm': '16:00', '4 PM': '16:00', '4.30 p.m.': '16:30', '9am': '09:00', '12:00 AM': '00:00', '12 PM': '12:00', '0930': '09:30', '9:5': '', '25:00': '', '13pm': '', 'noon': '', 'around 4': '', '': '' };
  for (const [input, expected] of Object.entries(cases)) assert.equal(normalizeTime(input), expected, JSON.stringify(input));
  assert.equal(normalizeTime(null), '');
  assert.equal(normalizeTime(undefined), '');
});

test('times show as 4:00 PM, and older free text is shown as typed', () => {
  assert.equal(formatTime('16:00'), '4:00 PM');
  assert.equal(formatTime('00:05'), '12:05 AM');
  assert.equal(formatTime('12:30'), '12:30 PM');
  assert.equal(formatTime('around four'), 'around four');
  assert.equal(formatTime(''), '');
});

test('whatever is typed in an event, the cloud copy passes the server\'s validation', () => {
  const nasty = [
    { id: 'a', title: '', date: '24 Aug 2027', time: '4:00 PM', endTime: '3:00 PM', directionsUrl: 'maps.google.com/x', venue: 'v'.repeat(900), visible: true },
    { id: 'b', title: '   ', date: '', time: 'noon', endTime: '??', directionsUrl: 'not a link', description: 'd'.repeat(9000) },
    { title: 'Ok', date: '2027-08-24', time: '18:00', endTime: '20:00', directionsUrl: 'https://maps.example/x', visible: false },
    null
  ];
  const events = cloudEvents(nasty.filter(Boolean));
  const out = validateWeddingInput({ title: 'A & B', templateId: LAUNCH_TEMPLATE_IDS[0], functions: events }, { create: true });
  assert.equal(out.content.functions.length, 3);
  assert.deepEqual(events[0], { ...events[0], title: 'Untitled event', date: '', time: '16:00', endTime: '', directionsUrl: 'https://maps.google.com/x' });
  assert.equal(events[0].venue.length, 500);
  assert.equal(events[1].time, '');
  assert.equal(events[1].directionsUrl, '');
  assert.equal(events[1].description.length, 4000);
  assert.equal(events[2].visible, false);
});

test('without the clean-up the old editor values really were refused (the bug)', () => {
  assert.throws(() => validateWeddingInput({ title: 'A', templateId: LAUNCH_TEMPLATE_IDS[0], functions: [{ title: 'Ceremony', time: '4:00 PM' }] }, { create: true }));
});

test('what the server echoes back is recognised as what was sent, so typing is not overwritten', () => {
  const local = [{ id: 'x', title: 'Ceremony', time: '4:00 PM', directionsUrl: 'maps.google.com/x' }];
  const sent = cloudEvents(local);
  const echoed = sent.map(e => ({ ...e }));
  assert.equal(sameEvents(cloudEvents(local), echoed), true);
  assert.equal(sameEvents(cloudEvents(local), [{ ...echoed[0], title: 'Changed elsewhere' }]), false);
});

test('invitations show times as 4:00 PM, and keep showing older free text as typed', () => {
  const ctx = { Math, Date, String, Array, Object, encodeURIComponent, Intl };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, 'templates/templates.generated.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(root, 'packaged-templates.js'), 'utf8'), ctx);
  const project = fns => ({ title: 'A & B', date: '2027-08-24', location: 'Hall, Town', functions: fns });
  const event = (title, time) => ({ title, date: '2027-08-24', time, venue: 'Hall', visible: true });
  for (const id of ['modern-heritage', 'minimalist', 'cinematic']) {
    const clean = ctx.renderPackagedTemplate(project([event('Reception', '18:00')]), { packaged: id });
    assert.match(clean, /6:00 PM/, id);
    assert.doesNotMatch(clean, />18:00</, id);
    const old = ctx.renderPackagedTemplate(project([event('Reception', 'around six')]), { packaged: id });
    if (id !== 'cinematic') assert.match(old, /around six/, id);
  }
  const scene = {}; scene.window = scene;
  vm.runInNewContext(readFileSync(join(root, 'scene-templates.js'), 'utf8'), { window: scene, Math, Date, String, Array, Object, encodeURIComponent });
  const html = scene.renderSceneTemplate(project([event('Reception', '18:00')]), { id: 'savanna-sunset', scene: 'savanna' });
  assert.match(html, /6:00 PM/);
});

test('the editor offers real time fields and limits lengths', () => {
  const editor = readFileSync(join(root, 'figma/islands/Editor.tsx'), 'utf8');
  assert.match(editor, /<input type="time" value=\{item\.time\}/);
  assert.match(editor, /type="time"\s+value=\{item\.endTime\}/);
  assert.doesNotMatch(editor, /placeholder="4:00 PM"|placeholder="7:00 PM"/);
  assert.match(editor, /maxLength=\{500\}/);
  assert.match(readFileSync(join(root, 'cloud-sync.js'), 'utf8'), /functions: window\.InviteEventFields\.cloudEvents\(project\.functions\)/);
  assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /<script src="\/event-fields\.js"><\/script>\s*<script src="\/cloud-sync\.js">/);
});
