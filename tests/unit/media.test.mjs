// Photos: file checks, limits, the endpoints and serving, against in-memory stand-ins for R2 and the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashEditToken } from '../../functions/_shared/api.js';
import { MEDIA_KEY, MEDIA_LIMITS, imageSize, mediaUrl, sniffImage } from '../../functions/_shared/media.js';
import { onRequest as mediaIndex } from '../../functions/api/weddings/[id]/media/index.js';
import { onRequest as mediaOne } from '../../functions/api/weddings/[id]/media/[photoId].js';
import { onRequest as weddingOne } from '../../functions/api/weddings/[id].js';
import { onRequest as publicWedding } from '../../functions/api/public-weddings/[slug].js';
import { onRequest as serve } from '../../functions/media/[[path]].js';

const WID = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const EDIT = 'e'.repeat(43);

// ---- picture fixtures ------------------------------------------------------------------------------------------
function webp(width, height, total = 2000) {
  const out = new Uint8Array(Math.max(total, 30));
  out.set([0x52, 0x49, 0x46, 0x46], 0); out.set([0x57, 0x45, 0x42, 0x50], 8); out.set([0x56, 0x50, 0x38, 0x58], 12);
  out[16] = 10;
  const w = width - 1, h = height - 1;
  out.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24);
  return out;
}
function jpeg(width, height, total = 2000) {
  const out = new Uint8Array(Math.max(total, 40));
  out.set([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10], 0); // SOI, APP0 (16 bytes of data after the marker)
  out.set([0xFF, 0xC0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03], 20);
  return out;
}
const blob = (bytes, type = 'image/webp') => new Blob([bytes], { type });
function form({ full = webp(1600, 1200), thumb = webp(480, 360), alt = 'A photo', omit } = {}) {
  const f = new FormData();
  if (omit !== 'full') f.set('full', blob(full), 'full.webp');
  if (omit !== 'thumb') f.set('thumb', blob(thumb), 'thumb.webp');
  if (alt !== undefined) f.set('alt', alt);
  return f;
}

// ---- stand-ins -------------------------------------------------------------------------------------------------
class FakeBucket {
  constructor() { this.objects = new Map(); }
  async put(key, body, options) { this.objects.set(key, { bytes: new Uint8Array(body), options }); }
  async get(key) { const o = this.objects.get(key); return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: o.options?.httpMetadata } : null; }
  async delete(keys) { for (const k of [].concat(keys)) this.objects.delete(k); }
  async list({ prefix = '' } = {}) { return { objects: [...this.objects.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; }
}

async function world({ bucket = new FakeBucket(), published = false } = {}) {
  const state = { photos: [], counters: new Map(), editHash: await hashEditToken(EDIT), failPhotos: false, bucket, deletedWeddings: [] };
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), path = u.pathname.replace('/rest/v1/', ''), q = u.searchParams, method = init.method || 'GET';
    const ok = data => new Response(JSON.stringify(data), { status: 200 });
    const eq = key => (q.get(key) || '').replace(/^eq\./, '');
    if (path === 'rpc/rsvp_rate_hit') {
      const { p_bucket } = JSON.parse(init.body);
      state.counters.set(p_bucket, (state.counters.get(p_bucket) || 0) + 1);
      return ok(state.counters.get(p_bucket));
    }
    if (path === 'edit_tokens') return method === 'PATCH' ? ok(null) : ok(q.get('token_hash') === `eq.${state.editHash}` ? [{ id: 't1', wedding_id: WID, expires_at: '2999-01-01T00:00:00Z' }] : []);
    if (path === 'weddings') {
      if (method === 'DELETE') { state.deletedWeddings.push(eq('id')); return ok(null); }
      const row = { id: WID, slug: 'asha-ravi', template_id: 'minimalist', title: 'Asha & Ravi', status: published ? 'published' : 'draft', visibility: 'public', content: {}, sections: [], preferences: {} };
      if (q.get('slug') && (!published || eq('slug') !== 'asha-ravi')) return ok([]);
      return ok([row]);
    }
    if (path === 'wedding_photos') {
      if (state.failPhotos) return new Response(JSON.stringify({ code: '42703', message: 'column does not exist' }), { status: 400 });
      if (method === 'POST') { const row = { created_at: 'now', ...JSON.parse(init.body) }; state.photos.push(row); return ok([row]); }
      let rows = state.photos.filter(r => (!eq('wedding_id') || r.wedding_id === eq('wedding_id')) && (!eq('id') || r.id === eq('id')));
      if (method === 'PATCH') { rows.forEach(r => Object.assign(r, JSON.parse(init.body))); return ok(rows); }
      if (method === 'DELETE') { state.photos = state.photos.filter(r => !rows.includes(r)); return ok(rows); }
      return ok([...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  state.restore = () => { globalThis.fetch = real; };
  state.env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k', MEDIA: bucket };
  return state;
}
const AUTH = { Authorization: `Bearer ${EDIT}` };
const call = (handler, env, method, params, body, headers = AUTH) => handler({
  env, params, request: new Request('https://x.test/api', { method, headers: { 'CF-Connecting-IP': '203.0.113.9', ...(body instanceof FormData || body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body)) })
});
const parse = async res => ({ status: res.status, body: await res.json() });
const upload = (w, f = form(), headers) => call(mediaIndex, w.env, 'POST', { id: WID }, f, headers);

// ---- tests -----------------------------------------------------------------------------------------------------
test('files are recognised by their first bytes, and their stated size is read', () => {
  assert.equal(sniffImage(webp(10, 10)), 'webp');
  assert.equal(sniffImage(jpeg(10, 10)), 'jpeg');
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])), null, 'PNG is not accepted');
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(new Uint8Array(4)), null);
  assert.deepEqual(imageSize(webp(1600, 1200), 'webp'), { width: 1600, height: 1200 });
  assert.deepEqual(imageSize(jpeg(1600, 1200), 'jpeg'), { width: 1600, height: 1200 });
  assert.deepEqual(imageSize(jpeg(480, 640), 'jpeg'), { width: 480, height: 640 });
  assert.equal(imageSize(new Uint8Array(40), 'webp'), null);
  // lossless WebP (VP8L): width and height are packed into 14 bits each
  const l = new Uint8Array(40); l.set([0x52, 0x49, 0x46, 0x46], 0); l.set([0x57, 0x45, 0x42, 0x50], 8); l.set([0x56, 0x50, 0x38, 0x4C], 12);
  const wm = 799, hm = 599; l[20] = 0x2F; l[21] = wm & 255; l[22] = ((wm >> 8) & 0x3F) | ((hm & 3) << 6); l[23] = (hm >> 2) & 255; l[24] = (hm >> 10) & 15;
  assert.deepEqual(imageSize(l, 'webp'), { width: 800, height: 600 });
});

test('storage keys are long random names; the media address can be a separate domain', () => {
  assert.match(`w/${WID}/${crypto.randomUUID()}-full.webp`, MEDIA_KEY);
  for (const bad of ['../etc/passwd', `w/${WID}/x-full.webp`, `w/${WID}/${crypto.randomUUID()}-full.png`, `x/${WID}/${crypto.randomUUID()}-full.webp`]) assert.doesNotMatch(bad, MEDIA_KEY);
  assert.equal(mediaUrl({}, 'w/a/b-full.webp'), '/media/w/a/b-full.webp');
  assert.equal(mediaUrl({ MEDIA_PUBLIC_URL: 'https://media.example.com/' }, 'w/a/b-full.webp'), 'https://media.example.com/w/a/b-full.webp');
  for (const bad of ['http://media.example.com', 'javascript:alert(1)', 'https://', 'media.example.com', 'https://a.com/"><script>']) assert.equal(mediaUrl({ MEDIA_PUBLIC_URL: bad }, 'k'), '/media/k', bad);
});

test('an upload stores both pictures with a year-long cache, and a row; the answer holds no storage path', async () => {
  const w = await world();
  try {
    const res = await parse(await upload(w));
    assert.equal(res.status, 201);
    const photo = res.body.photo;
    assert.match(photo.full, new RegExp(`^/media/w/${WID}/[0-9a-f-]{36}-full\\.webp$`));
    assert.match(photo.thumb, /-thumb\.webp$/);
    assert.deepEqual([photo.width, photo.height, photo.alt], [1600, 1200, 'A photo']);
    assert.equal(w.bucket.objects.size, 2);
    for (const o of w.bucket.objects.values()) {
      assert.equal(o.options.httpMetadata.contentType, 'image/webp');
      assert.match(o.options.httpMetadata.cacheControl, /immutable/);
    }
    assert.equal(w.photos.length, 1);
    assert.equal(JSON.stringify(res.body).includes('storage_path'), false);
    const listed = await parse(await call(mediaIndex, w.env, 'GET', { id: WID }));
    assert.deepEqual([listed.body.enabled, listed.body.usage.count, listed.body.limits.photos], [true, 1, 12]);
    // JPEG works too
    assert.equal((await upload(w, form({ full: jpeg(1600, 1200), thumb: jpeg(480, 360) }))).status, 201);
  } finally { w.restore(); }
});

test('uploads are refused without the edit token, for the wrong file type, size or shape, and nothing is stored', async () => {
  const w = await world();
  try {
    const refuse = async (f, status, code, headers) => {
      const res = await parse(await upload(w, f, headers));
      assert.equal(res.status, status, JSON.stringify(res.body));
      if (code) assert.equal(res.body.error.code, code);
    };
    await refuse(form(), 401, 'EDIT_TOKEN_REQUIRED', {});
    await refuse(form(), 403, 'EDIT_TOKEN_INVALID', { Authorization: `Bearer ${'f'.repeat(43)}` });
    await refuse(form({ full: new TextEncoder().encode('<svg onload="alert(1)"></svg>'.padEnd(2000)) }), 415, 'MEDIA_TYPE');
    await refuse(form({ full: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...new Array(200).fill(0)]) }), 415, 'MEDIA_TYPE');
    await refuse(form({ full: webp(1600, 1200, MEDIA_LIMITS.fullBytes + 1) }), 413, 'MEDIA_TOO_LARGE');
    await refuse(form({ thumb: webp(480, 360, MEDIA_LIMITS.thumbBytes + 1) }), 413, 'MEDIA_TOO_LARGE');
    await refuse(form({ full: webp(4000, 3000) }), 422, 'MEDIA_DIMENSIONS');
    await refuse(form({ thumb: webp(1600, 1200) }), 422, 'MEDIA_DIMENSIONS');
    await refuse(form({ full: jpeg(1600, 1200) }), 422, 'MEDIA_TYPE'); // formats must match
    await refuse(form({ omit: 'thumb' }), 422, 'VALIDATION_ERROR');
    await refuse(form({ alt: 'x'.repeat(301) }), 422, 'VALIDATION_ERROR');
    assert.equal(w.bucket.objects.size, 0);
    assert.equal(w.photos.length, 0);
  } finally { w.restore(); }
});

test('limits: 12 photos, 8 MB in total, and an hourly rate limit', async () => {
  const w = await world();
  try {
    for (let i = 0; i < 12; i += 1) assert.equal((await upload(w)).status, 201);
    const thirteenth = await parse(await upload(w));
    assert.equal(thirteenth.status, 403);
    assert.equal(thirteenth.body.error.code, 'MEDIA_LIMIT');
    assert.equal(w.photos.length, 12);
  } finally { w.restore(); }
  const heavy = await world();
  try {
    const big = () => form({ full: webp(1600, 1200, 590 * 1024), thumb: webp(480, 360, 95 * 1024) });
    for (let i = 0; i < 11; i += 1) assert.equal((await upload(heavy, big())).status, 201);
    const over = await parse(await upload(heavy, big()));
    assert.equal(over.status, 403, 'a 12th photo of this size would pass 8 MB in total');
    assert.equal(over.body.error.code, 'MEDIA_LIMIT');
    assert.equal(heavy.photos.length, 11);
  } finally { heavy.restore(); }
});

test('the rate limit counts attempts per device', async () => {
  const w = await world();
  try {
    let res;
    for (let i = 0; i < 61; i += 1) res = await upload(w, form({ omit: 'full' })); // each attempt is refused (422) but counted
    assert.equal(res.status, 429);
    assert.equal((await parse(res)).body.error.code, 'RATE_LIMITED');
  } finally { w.restore(); }
});

test('without a bucket or before the migration, the list says photos are off and nothing breaks', async () => {
  const noBucket = await world({ bucket: undefined });
  try {
    noBucket.env.MEDIA = undefined;
    const res = await parse(await call(mediaIndex, noBucket.env, 'GET', { id: WID }));
    assert.deepEqual([res.status, res.body.enabled, res.body.reason], [200, false, 'NO_STORAGE']);
    assert.equal((await upload(noBucket)).status, 503);
  } finally { noBucket.restore(); }
  const early = await world();
  try {
    early.failPhotos = true;
    const res = await parse(await call(mediaIndex, early.env, 'GET', { id: WID }));
    assert.deepEqual([res.body.enabled, res.body.reason], [false, 'MIGRATION_PENDING']);
  } finally { early.restore(); }
});

test('reorder, describe and delete; another wedding cannot touch these photos', async () => {
  const w = await world();
  try {
    const ids = [];
    for (let i = 0; i < 3; i += 1) ids.push((await parse(await upload(w, form({ alt: `p${i}` })))).body.photo.id);
    const bad = await parse(await call(mediaIndex, w.env, 'PATCH', { id: WID }, { order: [ids[0], ids[1]] }));
    assert.equal(bad.status, 422);
    assert.equal((await call(mediaIndex, w.env, 'PATCH', { id: WID }, { order: [ids[0], ids[0], ids[1]] })).status, 422);
    const ordered = await parse(await call(mediaIndex, w.env, 'PATCH', { id: WID }, { order: [ids[2], ids[0], ids[1]] }));
    assert.deepEqual(ordered.body.photos.map(p => p.alt), ['p2', 'p0', 'p1']);
    const renamed = await parse(await call(mediaOne, w.env, 'PATCH', { id: WID, photoId: ids[0] }, { alt: 'Our first trip' }));
    assert.equal(renamed.body.photo.alt, 'Our first trip');
    assert.equal((await call(mediaOne, w.env, 'PATCH', { id: WID, photoId: ids[0] }, { alt: 'x'.repeat(301) })).status, 422);
    assert.equal((await call(mediaOne, w.env, 'DELETE', { id: WID, photoId: OTHER })).status, 404);
    assert.equal((await call(mediaOne, w.env, 'DELETE', { id: WID, photoId: ids[1] }, undefined, {})).status, 401);
    const before = w.bucket.objects.size;
    assert.equal((await call(mediaOne, w.env, 'DELETE', { id: WID, photoId: ids[1] })).status, 200);
    assert.equal(w.bucket.objects.size, before - 2, 'both pictures are removed from storage');
    assert.equal(w.photos.length, 2);
  } finally { w.restore(); }
});

test('deleting the wedding removes every stored picture', async () => {
  const w = await world();
  try {
    await upload(w); await upload(w);
    w.bucket.objects.set(`w/${WID}/${crypto.randomUUID()}-full.webp`, { bytes: new Uint8Array(3) }); // left by a failed upload
    w.bucket.objects.set(`w/${OTHER}/${crypto.randomUUID()}-full.webp`, { bytes: new Uint8Array(3) }); // someone else's
    assert.equal((await call(weddingOne, w.env, 'DELETE', { id: WID })).status, 204);
    assert.deepEqual([...w.bucket.objects.keys()].map(k => k.split('/')[1]), [OTHER]);
    assert.deepEqual(w.deletedWeddings, [WID]);
  } finally { w.restore(); }
});

test('guests get photo addresses, never storage paths; a missing column cannot break the page', async () => {
  const w = await world({ published: true });
  try {
    await upload(w); await upload(w, form({ alt: 'Second' }));
    const res = await parse(await call(publicWedding, w.env, 'GET', { slug: 'asha-ravi' }, undefined, {}));
    assert.equal(res.status, 200);
    assert.equal(res.body.photos.length, 2);
    assert.match(res.body.photos[0].thumb, /^\/media\/w\//);
    const text = JSON.stringify(res.body);
    for (const leak of ['storage_path', 'full_key', 'thumb_key', 'wedding_id', EDIT]) assert.equal(text.includes(leak), false, leak);
    w.failPhotos = true;
    const early = await parse(await call(publicWedding, w.env, 'GET', { slug: 'asha-ravi' }, undefined, {}));
    assert.deepEqual([early.status, early.body.photos], [200, []]);
  } finally { w.restore(); }
});

test('the /media/ address serves stored pictures with a year-long cache, and only well-formed keys', async () => {
  const w = await world();
  try {
    const { body } = await parse(await upload(w));
    const path = body.photo.full.replace(/^\/media\//, '').split('/');
    const get = (pathParts, env = w.env, method = 'GET') => serve({ env, params: { path: pathParts }, request: new Request('https://x.test/media/' + pathParts.join('/'), { method }) });
    const ok = await get(path);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('Content-Type'), 'image/webp');
    assert.match(ok.headers.get('Cache-Control'), /immutable/);
    assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal((await ok.arrayBuffer()).byteLength, 2000);
    assert.equal((await get(['..', 'secret'])).status, 404);
    assert.equal((await get(['w', WID, 'nope.webp'])).status, 404);
    assert.equal((await get(path, { ...w.env, MEDIA: undefined })).status, 404);
    assert.equal((await get(path, w.env, 'POST')).status, 405);
    w.bucket.objects.clear();
    assert.equal((await get(path)).status, 404);
  } finally { w.restore(); }
});
