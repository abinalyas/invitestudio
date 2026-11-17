// A photo remembers where it was added (cover, story, venue or gallery). Real API, real storage, real database.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

async function draft(request) {
  const response = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `key-${randomUUID()}` },
    data: { templateId: 'minimalist', title: 'Slots' }
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return { id: body.wedding.id, token: body.editToken };
}

// Uploads one small picture from the page (a canvas gives real JPEG bytes), the way the editor does.
async function upload(page, { id, token }, fields = {}) {
  return page.evaluate(async ({ id, token, fields }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    canvas.getContext('2d').fillRect(0, 0, 64, 48);
    const blob = () => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    const form = new FormData();
    form.set('full', await blob(), 'full.jpg');
    form.set('thumb', await blob(), 'thumb.jpg');
    form.set('alt', '');
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const response = await fetch(`/api/weddings/${id}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: response.status, body: await response.json() };
  }, { id, token, fields });
}

test.describe('photo places', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('a photo uploaded with a place comes back with it, in the upload answer and in the list', async ({ page, request }) => {
    const wedding = await draft(request);
    const cover = await upload(page, wedding, { slot: 'hero' });
    expect(cover.status).toBe(201);
    expect(cover.body.photo.slot).toBe('hero');
    const gallery = await upload(page, wedding, { slot: 'gallery' });
    expect(gallery.body.photo.slot).toBe('gallery');
    const listed = await (await request.get(`/api/weddings/${wedding.id}/media`, { headers: { Authorization: `Bearer ${wedding.token}` } })).json();
    expect(listed.photos.map(photo => photo.slot)).toEqual(['hero', 'gallery']);
  });

  test('a photo uploaded without a place has none (older behaviour), and an unknown place is refused', async ({ page, request }) => {
    const wedding = await draft(request);
    const plain = await upload(page, wedding);
    expect(plain.status).toBe(201);
    expect(plain.body.photo.slot).toBe('');
    const refused = await upload(page, wedding, { slot: 'banner' });
    expect(refused.status).toBe(422);
    expect(refused.body.error.fields.slot).toBeTruthy();
    const listed = await (await request.get(`/api/weddings/${wedding.id}/media`, { headers: { Authorization: `Bearer ${wedding.token}` } })).json();
    expect(listed.photos).toHaveLength(1); // the refused one was not stored
  });

  test('the place can be changed, a description change keeps it, and an empty change is refused', async ({ page, request }) => {
    const wedding = await draft(request);
    const { body } = await upload(page, wedding, { slot: 'gallery' });
    const id = body.photo.id;
    const url = `/api/weddings/${wedding.id}/media/${id}`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${wedding.token}` };
    const moved = await request.patch(url, { headers, data: { slot: 'story' } });
    expect(moved.status()).toBe(200);
    expect((await moved.json()).photo.slot).toBe('story');
    const described = await request.patch(url, { headers, data: { alt: 'Two of us' } });
    const after = (await described.json()).photo;
    expect(after.alt).toBe('Two of us');
    expect(after.slot).toBe('story');
    expect((await request.patch(url, { headers, data: { slot: 'nowhere' } })).status()).toBe(422);
    expect((await request.patch(url, { headers, data: {} })).status()).toBe(422);
  });
});
