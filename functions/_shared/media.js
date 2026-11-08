// Photos (see docs/MEDIA_PLAN.md). The files live in Cloudflare R2 (the MEDIA binding); the details of each photo are
// rows in wedding_photos. The browser resizes and re-encodes every photo before uploading, so the server never decodes
// an image: it only checks the file's first bytes, its size and its stated dimensions, which is cheap enough for the
// free plan's small processor-time allowance.
import { ApiError, db } from './api.js';

export const MEDIA_LIMITS = Object.freeze({
  photos: 12,
  totalBytes: 8 * 1024 * 1024,
  fullBytes: 600 * 1024,
  thumbBytes: 100 * 1024,
  fullEdge: 1800,
  thumbEdge: 600,
  requestBytes: 800 * 1024,
  perHourPerSource: 60,
  perHourPerWedding: 300
});

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const MEDIA_KEY = new RegExp(`^w/${UUID}/${UUID}-(?:full|thumb)\\.(?:webp|jpg)$`);

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

// What the file is, from its first bytes (never from its name or the type the browser claims).
export function sniffImage(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
  return null;
}

function webpSize(bytes) {
  const kind = ascii(bytes, 12, 4);
  if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9D && bytes[24] === 0x01 && bytes[25] === 0x2A) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3FFF, height: (bytes[28] | (bytes[29] << 8)) & 0x3FFF };
  }
  if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2F) {
    return {
      width: 1 + (((bytes[22] & 0x3F) << 8) | bytes[21]),
      height: 1 + (((bytes[24] & 0x0F) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xC0) >> 6))
    };
  }
  if (kind === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    };
  }
  return null;
}

function jpegSize(bytes) {
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xFF) return null;
    while (bytes[i] === 0xFF && i + 1 < bytes.length) i += 1;
    const marker = bytes[i];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 1; continue; }
    if (marker === 0xD9 || marker === 0xDA) return null;
    const length = (bytes[i + 1] << 8) | bytes[i + 2];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      if (i + 7 >= bytes.length) return null;
      return { height: (bytes[i + 4] << 8) | bytes[i + 5], width: (bytes[i + 6] << 8) | bytes[i + 7] };
    }
    if (length < 2) return null;
    i += 1 + length;
  }
  return null;
}

export function imageSize(bytes, format) {
  const size = format === 'webp' ? webpSize(bytes) : format === 'jpeg' ? jpegSize(bytes) : null;
  return size && size.width > 0 && size.height > 0 ? size : null;
}

export const mediaKey = (weddingId, photoId, variant, format) =>
  `w/${weddingId}/${photoId}-${variant}.${format === 'webp' ? 'webp' : 'jpg'}`;

// Photos are served from a media address on a Cloudflare domain when MEDIA_PUBLIC_URL is set (cached by Cloudflare,
// no function request per photo); otherwise through this site's own /media/ address (functions/media/[[path]].js).
export function mediaUrl(env, key) {
  const configured = typeof env.MEDIA_PUBLIC_URL === 'string' ? env.MEDIA_PUBLIC_URL.trim().replace(/\/+$/, '') : '';
  const base = /^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9._~-]+)*$/i.test(configured) ? configured : '';
  return base ? `${base}/${key}` : `/media/${key}`;
}

const PHOTO_COLUMNS = 'id,alt,width,height,sort_order,full_key,thumb_key,full_bytes,thumb_bytes,format';

// The shape guests and the editor receive. Never the storage path.
export function photoView(env, row) {
  return {
    id: row.id,
    alt: row.alt || '',
    width: row.width || null,
    height: row.height || null,
    full: mediaUrl(env, row.full_key),
    thumb: mediaUrl(env, row.thumb_key || row.full_key),
    bytes: (row.full_bytes || 0) + (row.thumb_bytes || 0)
  };
}

export async function listPhotoRows(env, weddingId) {
  const rows = await db(env, `wedding_photos?${new URLSearchParams({
    select: PHOTO_COLUMNS,
    wedding_id: `eq.${weddingId}`,
    full_key: 'not.is.null',
    order: 'sort_order.asc,created_at.asc'
  })}`);
  return rows || [];
}

// For published pages and recovery: a missing column (the migration not run yet) must never break the page.
export async function safePhotoViews(env, weddingId) {
  try {
    return (await listPhotoRows(env, weddingId)).map(row => photoView(env, row));
  } catch {
    return [];
  }
}

export function requireBucket(env) {
  if (!env.MEDIA || typeof env.MEDIA.put !== 'function') {
    throw new ApiError('Photo storage is not set up yet.', 503, 'MEDIA_NOT_CONFIGURED');
  }
  return env.MEDIA;
}

// Removes every stored file of a wedding (including any left by a failed upload).
export async function deleteWeddingMedia(env, weddingId) {
  if (!env.MEDIA || typeof env.MEDIA.list !== 'function') return;
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: `w/${weddingId}/`, cursor });
    const keys = (page.objects || []).map(object => object.key);
    if (keys.length) await env.MEDIA.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export function cleanAlt(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return text.length > 300 ? null : text;
}
