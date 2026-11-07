import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EDIT_TOKEN_LIFETIME_DAYS,
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
  assert.deepEqual(projected.content.gallery.photos, [{ alt: 'Portrait', width: 1200, height: 800 }]);
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
});

test('marketing copy makes no photo gallery claim while photo storage does not exist', () => {
  const sources = ['figma/islands/shared.tsx', 'figma/islands/Home.tsx', 'figma/islands/TemplateDetail.tsx'].map(
    file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  ).join('\n');
  for (const pattern of [/photo gallery/i, /\bgalleries\b/i, /photo storage is (?:live|available now)/i]) {
    assert.equal(pattern.test(sources), false, `unsupported gallery copy matches ${pattern}`);
  }
});
