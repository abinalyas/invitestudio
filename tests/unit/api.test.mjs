import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EDIT_TOKEN_LIFETIME_DAYS,
  PREVIEW_LINK_LIFETIME_DAYS,
  requirePreviewToken,
  SLUG_MAX_LENGTH,
  json,
  publicWeddingProjection,
  requireEditToken,
  slugFormatProblem,
  validateWeddingInput
} from '../../functions/_shared/api.js';

const TOKEN_LIKE_KEYS = /token|hash|owner|storage|secret|service/i;

function assertNoSensitiveKeys(value, path = '$') {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, TOKEN_LIKE_KEYS, `sensitive key "${key}" at ${path}`);
      assertNoSensitiveKeys(child, `${path}.${key}`);
    }
  }
}

const privateWedding = {
  id: '5f0c5a7e-1c4b-4e0a-9c3d-2b1a0f9e8d7c',
  owner_id: null,
  ownership_mode: 'anonymous',
  slug: 'mira-and-arun',
  template_id: 'eternal',
  name: 'Mira & Arun',
  category: 'Wedding',
  title: 'Mira & Arun',
  event_date: '2027-01-20',
  location: 'Kochi',
  message: 'Welcome',
  story: '',
  hosts: '',
  locale: 'English',
  theme: { accent: '#a77d4d' },
  preferences: { gallery: 'gallery', secretNote: 'do not publish' },
  content: {
    functions: [
      { id: 'f1', title: 'Ceremony', date: '2027-01-20', time: '10:00', venue: 'Garden', visible: true },
      { id: 'f2', title: 'Hidden event', date: '2027-01-21', visible: false, venue: 'Private' }
    ],
    gallery: {
      preference: 'gallery',
      photos: [{ alt: 'Portrait', storagePath: 'wedding-1/gallery-01.jpg', width: 1200, height: 800 }]
    }
  },
  sections: [
    { id: 'hero', title: 'Hero', visible: true },
    { id: 'draft', title: 'Draft note', visible: false, content: 'internal' }
  ],
  intro_settings: { enabled: true, style: 'floral', transition: 'floral', duration: 3, short: false, showDate: true, uploadedImage: 'data:image/png;base64,AAAA' },
  animation_settings: { enabled: true, effect: 'fade', speed: 'slow', private: 'x' },
  published_at: '2026-11-04T10:00:00.000Z',
  version: 4
};

test('public projection never exposes ids, owners, tokens or storage paths', () => {
  const projected = publicWeddingProjection(privateWedding);
  assertNoSensitiveKeys(projected);
  assert.equal(projected.id, undefined);
  assert.equal(projected.owner_id, undefined);
  assert.equal(projected.version, undefined);
  assert.equal(JSON.stringify(projected).includes('wedding-1/gallery-01.jpg'), false);
  assert.equal(JSON.stringify(projected).includes('do not publish'), false);
  assert.equal(JSON.stringify(projected).includes('data:image/png'), false);
});

test('public projection drops hidden events and hidden sections and the visible flag', () => {
  const projected = publicWeddingProjection(privateWedding);
  assert.deepEqual(projected.content.functions.map(f => f.title), ['Ceremony']);
  assert.equal(projected.content.functions[0].visible, undefined);
  assert.deepEqual(projected.sections.map(s => s.id), ['hero', 'draft']);
  assert.equal(projected.sections.find(s => s.id === 'draft').visible, false);
  assert.equal(projected.sections.find(s => s.id === 'draft').content, undefined);
  assert.deepEqual(projected.content.gallery.photos, [], 'photos come from the media table, never from the saved content');
});

test('public projection tolerates missing content without throwing', () => {
  const projected = publicWeddingProjection({ ...privateWedding, content: null, sections: null });
  assert.deepEqual(projected.content, { functions: [], copy: {}, gallery: { preference: '', photos: [] } });
  assert.deepEqual(projected.sections, []);
});

test('JSON responses are marked no-store and not sniffable', () => {
  const response = json({ headers: new Headers() }, {}, { ok: true });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
});

test('edit tokens shorter than the minimum are rejected before any database call', async () => {
  await assert.rejects(
    () => requireEditToken({}, 'short'),
    error => error.code === 'EDIT_TOKEN_REQUIRED' && error.status === 401
  );
});

test('validation rejects unsupported fields and malformed event dates', () => {
  assert.throws(
    () => validateWeddingInput({ title: 'Ok', templateId: 'eternal', ownerId: 'someone-else' }, { create: true }),
    error => error.code === 'VALIDATION_ERROR' && Boolean(error.fields._)
  );
  assert.throws(
    () => validateWeddingInput({ title: 'Ok', templateId: 'eternal', functions: [{ title: 'Bad', date: '20-01-2027' }] }, { create: true }),
    error => error.code === 'VALIDATION_ERROR' && Boolean(error.fields['functions[0].date'])
  );
});

test('one address limit of 60 characters, enforced by the server', () => {
  assert.equal(SLUG_MAX_LENGTH, 60);
  assert.equal(slugFormatProblem('a'.repeat(60)), null);
  assert.match(slugFormatProblem('a'.repeat(61)), /60 characters or fewer/);
});

test('the editor uses the same 60-character limit as the server', () => {
  const client = readFileSync(new URL('../../cloud-sync.js', import.meta.url), 'utf8');
  assert.match(client, /const SLUG_MAX_LENGTH = 60;/);
  assert.doesNotMatch(client, /slug\.length > 60/);
});

test('edit links last 90 days', () => {
  assert.equal(EDIT_TOKEN_LIFETIME_DAYS, 90);
});

test('marketing copy makes no RSVP claim the product does not yet support, and no testimonial', () => {
  const sources = ['figma/islands/shared.tsx', 'figma/islands/Home.tsx', 'figma/islands/TemplateDetail.tsx'].map(
    file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  ).join('\n');
  for (const claim of ['Collect RSVPs', 'Guests can RSVP online', 'RSVP & guest management', 'choose meals', 'RSVP experience', 'Neha']) {
    assert.equal(sources.includes(claim), false, `unsupported copy remains: ${claim}`);
  }
  // The design-review placeholders were once left switched on. Only real, permitted quotes may go in this list.
  // (Meera & Abin are also the labelled sample couple in design previews, so the quotes are checked, not the names.)
  for (const quote of ['ready in one evening', 'we never had to chase anyone', 'We changed the design twice']) {
    assert.equal(sources.includes(quote), false, `placeholder testimonial remains: ${quote}`);
  }
});

test('public projection carries only how replies work and a valid contact number', () => {
  const rsvp = prefs => publicWeddingProjection({ ...privateWedding, preferences: prefs }).rsvp;
  const number = { type: 'whatsapp', value: '+91 98765 43210' };
  assert.deepEqual(rsvp({ rsvp: 'contact', rsvpContact: number }), { mode: 'contact', open: true, maxParty: null, replyBy: '', contact: number });
  assert.equal(rsvp({ rsvp: 'count', rsvpContact: number }).contact, null, 'the number stays hidden while replies are open');
  assert.equal(rsvp({ rsvp: 'contact', rsvpContact: { type: 'email', value: 'a@b.co' } }).contact, null);
  assert.equal(rsvp({ rsvp: 'contact', rsvpContact: { type: 'phone', value: '12' } }).contact, null);
  assert.equal(rsvp({ rsvp: 'bogus' }).mode, 'count');
  assert.equal(rsvp(null).mode, 'count');
  assert.equal(JSON.stringify(publicWeddingProjection(privateWedding)).includes('do not publish'), false);
});

// Draft preview links (docs/DRAFT_PREVIEW.md).
test('a malformed preview link is refused before any database call, with the same answer as an unknown one', async () => {
  for (const token of [undefined, '', 'short', 'x'.repeat(300), 'not a token with spaces at all, not one at all']) {
    await assert.rejects(() => requirePreviewToken({}, token), error => error.code === 'PREVIEW_NOT_FOUND' && error.status === 404);
  }
});

test('preview links last 30 days and can never pass as edit links', () => {
  assert.equal(PREVIEW_LINK_LIFETIME_DAYS, 30);
  const source = readFileSync(new URL('../../functions/_shared/api.js', import.meta.url), 'utf8');
  const editCheck = source.slice(source.indexOf('export async function requireEditToken'), source.indexOf('export async function requireEditAccess'));
  assert.match(editCheck, /purpose: 'eq\.edit'/, 'edit access looks up edit tokens only');
  const previewCheck = source.slice(source.indexOf('export async function requirePreviewToken'), source.indexOf('export async function getWedding'));
  assert.match(previewCheck, /purpose: 'eq\.preview'/);
});

test('the draft preview page marks itself as a draft, never names the couple in its link preview, and is never indexed', () => {
  const page = readFileSync(new URL('../../functions/draft.js', import.meta.url), 'utf8');
  assert.match(page, /X-Robots-Tag', 'noindex, nofollow'/);
  assert.match(page, /Referrer-Policy', 'no-referrer'/);
  assert.doesNotMatch(page, /db\(|rpc\(/, 'the page never looks up the draft: the token is only in the fragment');
  const view = readFileSync(new URL('../../public-invitation.js', import.meta.url), 'utf8');
  assert.match(view, /data-draft-watermark/);
  assert.match(view, /data-draft-banner/);
  assert.match(view, /utm_source=draft-preview/);
  assert.doesNotMatch(view.slice(view.indexOf("view.status === 'ready' && view.preview")), /^[^\n]*data-public-invitation>/, 'a draft is never marked as a live invitation, so replies cannot be sent');
});
