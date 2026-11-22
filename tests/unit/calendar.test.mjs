// "Add to calendar" for events: one button per dated event that downloads a calendar file (packaged-templates.js calendarFor and the
// {{calendar}} marker in every design).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadTemplates } from '../../scripts/build-templates.mjs';
import { loadBundles } from '../support/templates-vm.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const list = loadTemplates();

function renderer(extra = {}) {
  const ctx = { Math, Date, String, Array, Object, JSON, Number, encodeURIComponent, unescape, Intl, ...extra };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  loadBundles(ctx);
  vm.runInContext(readFileSync(join(root, 'rsvp-view.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(root, 'packaged-templates.js'), 'utf8'), ctx);
  return ctx;
}
const { calendarFor } = createRequire();
function createRequire() {
  const module = { exports: {} };
  const ctx = { module, Math, Date, String, Array, Object, JSON, Number, encodeURIComponent, unescape, Intl };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, 'packaged-templates.js'), 'utf8'), ctx);
  return ctx.module.exports;
}

const decodeIcs = result => decodeURIComponent(result.ics.slice(result.ics.indexOf(',') + 1));
const unfold = text => text.replace(/\r\n /g, '');
const lines = text => unfold(text).split('\r\n').filter(Boolean);
const info = { couple: 'Ava & Ben', where: 'Kochi', invitation: 'https://invitestudio.co/s/ava-and-ben', index: 0 };

test('a timed event: start, the end it was given, its place, its id and the invitation address', () => {
  const r = calendarFor({ id: '11111111-2222-3333-4444-555555555555', title: 'Wedding ceremony', date: '2027-06-19', time: '16:00', endTime: '17:30', venue: 'St. Mary’s Church' }, info);
  const ics = lines(decodeIcs(r));
  assert.ok(ics.includes('DTSTART:20270619T160000'));
  assert.ok(ics.includes('DTEND:20270619T173000'));
  assert.ok(ics.includes('SUMMARY:Wedding ceremony – Ava & Ben'));
  assert.ok(ics.includes('LOCATION:St. Mary’s Church'));
  assert.ok(ics.includes('UID:11111111-2222-3333-4444-555555555555-20270619@invitestudio.co'), 'the same event keeps the same id, so adding it again updates it');
  assert.ok(ics.some(line => /^DTSTAMP:\d{8}T\d{6}Z$/.test(line)));
  assert.ok(ics.includes('URL:https://invitestudio.co/s/ava-and-ben'));
  assert.equal(ics[0], 'BEGIN:VCALENDAR'); assert.equal(ics.at(-1), 'END:VCALENDAR');
  assert.ok(decodeIcs(r).endsWith('\r\n') && !/[^\r]\n/.test(decodeIcs(r)), 'lines end in CRLF');
  assert.ok(r.ics.startsWith('data:text/calendar;charset=utf-8,'));
  assert.equal(r.title, 'Wedding ceremony');
  assert.equal(r.file, 'wedding-ceremony.ics');
});

test('no end time, or an end that is not after the start, means two hours; no time means an all-day event', () => {
  const noEnd = lines(decodeIcs(calendarFor({ title: 'Reception', date: '2027-06-19', time: '19:00' }, info)));
  assert.ok(noEnd.includes('DTEND:20270619T210000'));
  const overnight = calendarFor({ title: 'Sangeet', date: '2027-06-18', time: '22:00', endTime: '01:00' }, info);
  assert.ok(lines(decodeIcs(overnight)).includes('DTEND:20270619T000000'), 'two hours, over midnight');
  const allDay = calendarFor({ title: 'Mehendi', date: '2027-06-18' }, info);
  const ics = lines(decodeIcs(allDay));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270618') && ics.includes('DTEND;VALUE=DATE:20270619'));
});

test('an event with no real date has no calendar entry', () => {
  for (const f of [{ title: 'Reception', time: '19:00' }, { title: 'X', date: '' }, { title: 'X', date: '2027-02-31' }, { title: 'X', date: 'soon' }, { title: 'X', date: '19/06/2027' }]) assert.equal(calendarFor(f, info), null, JSON.stringify(f));
});

test('the place falls back to the wedding\'s, and the notes carry the description, dress code, directions and the invitation', () => {
  const noVenue = lines(decodeIcs(calendarFor({ title: 'Mehendi', date: '2027-06-18' }, info)));
  assert.ok(noVenue.includes('LOCATION:Kochi'));
  const full = calendarFor({ title: 'Dinner', date: '2027-06-18', time: '20:00', description: 'Please arrive early.', dressCode: 'Smart casual', directionsUrl: 'https://maps.example.com/x' }, info);
  const description = unfold(decodeIcs(full)).split('\r\n').find(line => line.startsWith('DESCRIPTION:'));
  assert.equal(description, 'DESCRIPTION:Please arrive early.\\n\\nDress code: Smart casual\\n\\nDirections: https://maps.example.com/x\\n\\nInvitation: https://invitestudio.co/s/ava-and-ben');
  // A directions link that is not a web address is left out, and with nothing else to say there are no notes at all.
  const bad = calendarFor({ title: 'Dinner', date: '2027-06-18', directionsUrl: 'javascript:alert(1)' }, { couple: 'A', index: 0 });
  assert.ok(!decodeIcs(bad).includes('DESCRIPTION') && !decodeIcs(bad).includes('javascript'));
});

test('text is escaped for a calendar file, long lines are folded without splitting a character, and nothing can add a field', () => {
  const r = calendarFor({ title: 'Mehendi, Sangeet; and more\nBEGIN:VEVENT', date: '2027-06-18', time: '10:00', description: 'क'.repeat(120) + ' a, b; c\\d' }, info);
  const raw = decodeIcs(r);
  assert.ok(unfold(raw).includes('SUMMARY:Mehendi\\, Sangeet\\; and more\\nBEGIN:VEVENT – Ava & Ben'), 'comma, semicolon and newline are escaped');
  assert.equal(lines(raw).filter(line => line === 'BEGIN:VEVENT').length, 1, 'a title cannot start a second event');
  for (const line of raw.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `a line is at most 75 bytes: ${line.length}`);
  assert.ok(unfold(raw).includes('क'.repeat(120)), 'every character survives the folding');
  assert.ok(unfold(raw).includes('a\\, b\\; c\\\\d'));
});

// ---- in every design ----
const event = (title, date, extra = {}) => ({ id: `e-${title}`.toLowerCase().replace(/\W+/g, '-'), title, date, visible: true, ...extra });
const project = {
  title: 'Ava & Ben', category: 'Wedding', date: '2027-06-19', location: 'The Garden Hall, Kochi', sections: [{ id: 'hero', visible: true }, { id: 'functions', visible: true }],
  functions: [event('Wedding ceremony', '2027-06-19', { time: '16:00', endTime: '17:30', venue: 'St. Mary’s Church' }), event('Reception', '2027-06-19', { time: '19:00' }), event('Welcome dinner', '')]
};

for (const { manifest, parts, css } of list) {
  const id = manifest.id;
  test(`${id}: every event with a date gets one Add to calendar button (a file, with Google's page for Android), and an undated one does not`, () => {
    const r = renderer();
    const html = r.renderPackagedTemplate(project, { id, packaged: id }, {});
    assert.equal((html.match(/<div data-cal>/g) || []).length, 2, 'one for each dated event');
    assert.equal((html.match(/<a href="data:text\/calendar;charset=utf-8,BEGIN%3AVCALENDAR[^"]*" download="[a-z0-9-]+\.ics" data-cal-google="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE[^"]*" aria-label="Add to calendar: [^"]+"><svg [^>]*>.*?<\/svg><span>Add to calendar<\/span><\/a>/g) || []).length, 2);
    assert.match(html, /aria-label="Add to calendar: Wedding ceremony"/);
    assert.match(html, /aria-label="Add to calendar: Reception"/);
    assert.ok(!/<details data-cal|Google Calendar|Apple, Outlook/.test(html), 'one button, not a menu of calendars');
    assert.ok(!html.includes('data-cal-apple'), 'outside a live invitation there is no served entry to open');
    const none = r.renderPackagedTemplate({ ...project, functions: [event('Welcome dinner', '')] }, { id, packaged: id }, {});
    assert.ok(!none.includes('data-cal'), 'no date, no button');
    // The design's own sample events have no date either.
    assert.ok(!r.renderPackagedTemplate({ title: 'A & B', category: 'Wedding' }, { id, packaged: id }, { sample: true }).includes('data-cal'));
  });

  test(`${id}: what a couple types cannot break out of the calendar button or file`, () => {
    const r = renderer();
    const nasty = '"><img src=x onerror=alert(1)><script>alert(2)</script>';
    const html = r.renderPackagedTemplate({ ...project, functions: [event(nasty, '2027-06-19', { time: '16:00', venue: nasty, description: nasty, directionsUrl: 'https://maps.example.com/?q="><b>' })] }, { id, packaged: id }, {});
    const cal = html.slice(html.indexOf('<div data-cal>'), html.indexOf('</a></div>', html.indexOf('<div data-cal>')) + 10);
    assert.ok(cal.startsWith('<div data-cal><a href="data:text/calendar'), 'the button is drawn');
    assert.ok(!/<img|<script/i.test(cal), 'nothing in the button is live markup');
    const label = cal.match(/aria-label="([^"]*)"/)[1];
    assert.ok(label.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;'), 'the title is only text inside its attribute');
    assert.equal((cal.match(/ aria-label=/g) || []).length, 1, 'it did not open another attribute');
    assert.ok(!/href="javascript:/i.test(html));
  });

  test(`${id}: the design places {{calendar}} in its events, and gets the control's styles`, () => {
    assert.equal((Object.values(parts).join('\n').match(/\{\{calendar\}\}/g) || []).length, 1, 'once, inside the events loop');
    const loop = Object.values(parts).join('\n').match(/<!--each events-->([\s\S]*?)<!--\/each-->/)[1];
    assert.ok(loop.includes('{{calendar}}'), 'inside the events loop');
    assert.ok(css.includes(`.${manifest.root} [data-cal]`), 'carries calendar.css');
  });
}

test('the button is one plain link: no script, a visible label, a name that says which event, and a download name', () => {
  const html = renderer().renderPackagedTemplate(project, { id: 'minimalist', packaged: 'minimalist' }, {});
  const one = html.slice(html.indexOf('<div data-cal>'), html.indexOf('</div>', html.indexOf('<div data-cal>')) + 6);
  assert.match(one, /^<div data-cal><a href="data:text\/calendar;charset=utf-8,[^"]+" download="wedding-ceremony\.ics" data-cal-google="[^"]+" aria-label="Add to calendar: Wedding ceremony"><svg [^>]*aria-hidden="true"[^>]*>.*<\/svg><span>Add to calendar<\/span><\/a><\/div>$/);
  assert.ok(!/<script|onclick|<button|<details/i.test(one));
});

test('Google Calendar gets the same event: floating times, the place, and the notes', () => {
  const r = calendarFor({ id: 'e1', title: 'Wedding ceremony', date: '2027-06-19', time: '16:00', endTime: '17:30', venue: 'St. Mary’s Church', description: 'Arrive early & smile' }, info);
  const url = new URL(r.google);
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Wedding ceremony – Ava & Ben');
  assert.equal(url.searchParams.get('dates'), '20270619T160000/20270619T173000', 'no Z: the guest\'s own clock time, like the file');
  assert.equal(url.searchParams.get('location'), 'St. Mary’s Church');
  assert.ok(url.searchParams.get('details').includes('Arrive early & smile'));
  const allDay = new URL(calendarFor({ title: 'Mehndi', date: '2027-06-18' }, info).google);
  assert.equal(allDay.searchParams.get('dates'), '20270618/20270619', 'an all-day event ends the next day');
});

test('on a live invitation each button also names the entry the site serves for iPhones, by the event\'s id or its place', () => {
  const live = renderer({ location: { origin: 'https://invitestudio.co', pathname: '/s/ava-and-ben' } });
  const html = live.renderPackagedTemplate({ ...project, functions: [{ ...project.functions[0], id: 'abc-123' }, { ...project.functions[1], id: undefined }] }, { id: 'minimalist', packaged: 'minimalist' }, {});
  const apple = [...html.matchAll(/data-cal-apple="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(apple, ['/api/public-weddings/ava-and-ben/calendar/abc-123.ics', '/api/public-weddings/ava-and-ben/calendar/event-1.ics']);
});

test('on a live invitation the calendar entry carries its address', () => {
  const html = renderer({ location: { origin: 'https://invitestudio.co', pathname: '/s/ava-and-ben' } }).renderPackagedTemplate(project, { id: 'minimalist', packaged: 'minimalist' }, {});
  const ics = decodeURIComponent(html.match(/href="(data:text\/calendar[^"]*)"/)[1].replace(/&amp;/g, '&').replace(/^data:[^,]*,/, ''));
  assert.ok(unfold(ics).includes('URL:https://invitestudio.co/s/ava-and-ben'));
  const editor = renderer({ location: { origin: 'https://invitestudio.co', pathname: '/' } }).renderPackagedTemplate(project, { id: 'minimalist', packaged: 'minimalist' }, {});
  const editorIcs = decodeURIComponent(editor.match(/href="(data:text\/calendar[^"]*)"/)[1].replace(/&amp;/g, '&').replace(/^data:[^,]*,/, ''));
  assert.ok(!editorIcs.includes('URL:') && !editorIcs.includes('Invitation:'), 'not from the editor or the home page');
});
