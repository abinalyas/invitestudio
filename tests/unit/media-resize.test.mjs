// The browser-side photo shrinking: it must lower quality, then size, until the picture fits what the server accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import media from '../../media-resize.js';

const { fitToBytes } = media;
// A fake canvas: the file size depends on pixels and quality, like a real encoder.
const renderer = (bytesPerPixelAtFull, canWebp = true) => (w, h) => Promise.resolve((format, quality) =>
  Promise.resolve(format === 'webp' && !canWebp ? null : { size: Math.round(w * h * bytesPerPixelAtFull * quality), type: 'x' }));

test('a picture that already fits keeps the highest quality and its size', async () => {
  const r = await fitToBytes(renderer(0.05), 1600, 1200, ['webp', 'jpeg'], 570 * 1024);
  assert.equal(r.format, 'webp'); assert.equal(r.width, 1600); assert.equal(r.height, 1200);
});

test('a picture that is too big has its quality lowered before its size', async () => {
  // 1600x1200 at quality 0.82 is about 787 KB; at 0.52 it fits.
  const r = await fitToBytes(renderer(0.5), 1600, 1200, ['webp', 'jpeg'], 570 * 1024);
  assert.equal(r.width, 1600);
  assert.ok(r.blob.size <= 570 * 1024);
});

test('a very detailed picture is made smaller when lower quality is not enough', async () => {
  const r = await fitToBytes(renderer(1.2), 1600, 1200, ['webp', 'jpeg'], 570 * 1024);
  assert.ok(r.width < 1600);
  assert.ok(r.blob.size <= 570 * 1024);
});

test('falls back to JPEG when WebP cannot be written', async () => {
  const r = await fitToBytes(renderer(0.05, false), 1600, 1200, ['webp', 'jpeg'], 570 * 1024);
  assert.equal(r.format, 'jpeg');
});

test('gives a clear error only when nothing can make it fit', async () => {
  await assert.rejects(() => fitToBytes(renderer(500), 1600, 1200, ['webp', 'jpeg'], 570 * 1024), e => e.code === 'OVER_LIMIT' && /smaller or simpler/.test(e.message));
});
