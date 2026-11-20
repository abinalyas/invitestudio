import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { TEMPLATE_TIERS } from '../../functions/_shared/pricing.js';
const card = createRequire(import.meta.url)('../../share-card.js');

const project = {
  title: 'Palash & Amruta', date: '2026-11-28', location: 'Govindmani Lawns, Thane',
  functions: [
    { id: 'a', title: 'Reception', date: '2026-11-28', time: '19:30', venue: 'Govindmani Lawns, Thane', directionsUrl: '', visible: true },
    { id: 'b', title: 'Hidden', date: '2026-11-27', visible: false }
  ]
};

test('dateLine reads a plain date and never shifts it', () => {
  assert.equal(card.dateLine('2026-11-28'), 'Saturday, 28 November 2026');
  assert.equal(card.dateLine('2026-02-30'), '');
  assert.equal(card.dateLine('soon'), '');
});

test('events: the visible ones, or one made from the main date and place', () => {
  assert.deepEqual(card.events(project).map(e => e.title), ['Reception']);
  assert.deepEqual(card.events({ date: '2026-12-01', location: 'Kochi' }).map(e => e.venue), ['Kochi']);
  assert.deepEqual(card.events({}), []);
});

test('mapsLink uses the couple\'s own link when it is a web address, otherwise searches the place', () => {
  assert.equal(card.mapsLink({ directionsUrl: 'https://maps.app.goo.gl/x', venue: 'V' }), 'https://maps.app.goo.gl/x');
  assert.equal(card.mapsLink({ directionsUrl: 'javascript:alert(1)', venue: 'Govindmani Lawns' }), 'https://www.google.com/maps/search/?api=1&query=Govindmani%20Lawns');
  assert.equal(card.mapsLink({}), '');
});

test('message: names, event, date and time, place, map link and the invitation link', () => {
  const text = card.message({ names: 'Palash & Amruta', event: card.events(project)[0], url: 'https://invitestudio.co/s/palash-amruta' });
  assert.match(text, /Please join us for the Reception of Palash & Amruta/);
  assert.match(text, /📅 Saturday, 28 November 2026, 7:30 PM/);
  assert.match(text, /📍 Govindmani Lawns, Thane/);
  assert.match(text, /🗺️ Venue location: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Govindmani%20Lawns%2C%20Thane/);
  assert.match(text, /💌 See the full invitation: https:\/\/invitestudio\.co\/s\/palash-amruta/);
  assert.match(text, /With love,\nPalash & Amruta 💞$/);
});

test('message stays within the caption limit even with a very long venue', () => {
  const text = card.message({ names: 'A & B', event: { title: 'Wedding', date: '2026-11-28', venue: 'x '.repeat(900) }, url: 'https://invitestudio.co/s/a' });
  assert.ok(text.length <= 1000, String(text.length));
});

test('message without an event title or url still reads well', () => {
  const text = card.message({ names: 'A & B', event: { date: '2026-11-28' } });
  assert.match(text, /Please join us as we celebrate A & B/);
  assert.doesNotMatch(text, /undefined|See the full invitation/);
});

test('splitNames reads two names, and keeps anything else whole', () => {
  assert.deepEqual(card.splitNames('Palash & Amruta'), { a: 'Palash', b: 'Amruta' });
  assert.deepEqual(card.splitNames('Anna and Rohit'), { a: 'Anna', b: 'Rohit' });
  assert.deepEqual(card.splitNames('Arjun+Meera'), { a: 'Arjun', b: 'Meera' });
  assert.deepEqual(card.splitNames('The Sharma Wedding'), { a: 'The Sharma Wedding', b: '' });
  assert.deepEqual(card.splitNames(''), { a: '', b: '' });
  assert.equal(card.initials({ a: 'Daniel', b: 'Amelia' }), 'D/A');
  assert.equal(card.initials({ a: 'meera', b: '' }), 'M');
});

test('cardData: the couple\'s words as the card shows them', () => {
  const d = card.cardData('Daniel & Amelia', { title: 'Reception', date: '2026-11-28', time: '19:30', venue: ' Govindmani  Lawns ' });
  assert.equal(d.title, 'Reception');
  assert.equal(d.wedding, false);
  assert.equal(d.when.one, 'Saturday, 28 November 2026 \u00B7 7:30 PM');
  assert.deepEqual(d.when.two, ['28 November 2026', 'Saturday \u00B7 7:30 PM']);
  assert.equal(d.venue, 'Govindmani Lawns');
  const bare = card.cardData('A & B', { date: '', venue: '' });
  assert.equal(bare.title, 'Wedding');
  assert.equal(bare.wedding, true);
  assert.equal(bare.when, null);
  assert.equal(card.cardData('A & B', { date: '2026-02-30' }).when, null);
});

test('every design that is offered has its own card, with its artwork on disk', () => {
  for (const id of Object.keys(TEMPLATE_TIERS)) {
    assert.ok(card.cards[id], `${id} has a card layout`);
    assert.equal(card.cardArt(id), `/assets/share-cards/${id}.webp`);
    assert.ok(existsSync(new URL(`../../assets/share-cards/${id}.webp`, import.meta.url)), `${id} artwork exists`);
  }
  assert.equal(card.cardArt('some-new-design'), '', 'a design without a card falls back to the generic one');
});
