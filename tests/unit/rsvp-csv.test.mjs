import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { repliesCsv } = createRequire(import.meta.url)('../../rsvp-csv.js');

const data = {
  replies: [
    { name: 'Meera Nair', attending: true, party: 3, events: { e1: true, e2: false }, needs: 'Vegetarian, "no nuts"', message: 'See you!\nSoon', updatedAt: '2027-01-02T10:00:00Z' },
    { name: '=HYPERLINK("http://x")', attending: false, party: 0, events: {}, needs: '', message: '+1 555', updatedAt: '2027-01-03T10:00:00Z' }
  ],
  totals: { byEvent: { e1: { title: 'Ceremony' }, e2: { title: 'Reception' } } }
};

test('csv: header, quoting, events by title, byte order mark, CRLF', () => {
  const csv = repliesCsv(data);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], '"Name","Attending","People","Events","Needs","Message","Replied at"');
  assert.equal(lines[1], '"Meera Nair","Yes","3","Ceremony","Vegetarian, ""no nuts""","See you!\nSoon","2027-01-02T10:00:00Z"'.replace('\n', '\n'));
  assert.equal(csv.endsWith('\r\n'), true);
});

test('csv: a typed formula cannot run in a spreadsheet', () => {
  const csv = repliesCsv(data);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.match(csv, /"'\+1 555"/);
  for (const trigger of ['=', '+', '-', '@']) assert.match(repliesCsv({ replies: [{ name: `${trigger}A`, attending: false, party: 0, events: {} }], totals: {} }), new RegExp(`"'\\${trigger}A"`));
});

test('csv: not attending counts as 0 people; the people column can be left out', () => {
  assert.match(repliesCsv(data).split('\r\n')[2], /,"No","0",/);
  const without = repliesCsv(data, { withCount: false }).split('\r\n');
  assert.equal(without[0].includes('People'), false);
  assert.equal(repliesCsv({ replies: [], totals: {} }).split('\r\n').length, 2, 'header only');
});
