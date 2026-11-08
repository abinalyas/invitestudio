import {
  ApiError,
  assertUuid,
  db,
  fail,
  getWedding,
  optionsResponse,
  readJson,
  requireEditAccess,
  success
} from '../../../../_shared/api.js';
import {
  MEDIA_LIMITS,
  cleanAlt,
  imageSize,
  listPhotoRows,
  mediaKey,
  photoView,
  requireBucket,
  sniffImage
} from '../../../../_shared/media.js';
import { enforceRateLimit } from '../../../../_shared/rsvp.js';

const listing = (env, rows, enabled, reason) => ({
  enabled,
  reason: reason || '',
  limits: { photos: MEDIA_LIMITS.photos, totalBytes: MEDIA_LIMITS.totalBytes },
  usage: { count: rows.length, bytes: rows.reduce((sum, row) => sum + (row.full_bytes || 0) + (row.thumb_bytes || 0), 0) },
  photos: rows.map(row => photoView(env, row))
});

async function readPart(form, name, max, edge) {
  const file = form.get(name);
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    throw new ApiError(`The ${name} picture is missing.`, 422, 'VALIDATION_ERROR', { [name]: 'A picture is required.' });
  }
  if (file.size > max) {
    throw new ApiError('This picture is too large.', 413, 'MEDIA_TOO_LARGE', { [name]: `Must be at most ${Math.round(max / 1024)} KB.` });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffImage(bytes);
  if (!format) {
    throw new ApiError('Only WebP and JPEG pictures are accepted.', 415, 'MEDIA_TYPE', { [name]: 'Must be a WebP or JPEG picture.' });
  }
  const size = imageSize(bytes, format);
  if (!size || size.width > edge || size.height > edge) {
    throw new ApiError('This picture is the wrong size.', 422, 'MEDIA_DIMENSIONS', { [name]: `Must be at most ${edge} pixels on its longest side.` });
  }
  return { bytes, format, ...size };
}

// GET lists the photos and what is left; POST uploads one (a full and a thumbnail picture); PATCH reorders.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    await requireEditAccess(request, env, params.id);

    if (request.method === 'GET') {
      if (!env.MEDIA) return success(request, env, listing(env, [], false, 'NO_STORAGE'));
      try {
        return success(request, env, listing(env, await listPhotoRows(env, params.id), true));
      } catch (error) {
        if (error instanceof ApiError && error.code === 'DATABASE_ERROR') return success(request, env, listing(env, [], false, 'MIGRATION_PENDING'));
        throw error;
      }
    }

    if (request.method === 'POST') {
      const bucket = requireBucket(env);
      const declared = Number(request.headers.get('Content-Length') || 0);
      if (declared > MEDIA_LIMITS.requestBytes) throw new ApiError('This upload is too large.', 413, 'MEDIA_TOO_LARGE');
      await getWedding(env, params.id);
      await enforceRateLimit(request, env, params.id, {
        kind: 'media', perSource: MEDIA_LIMITS.perHourPerSource, perWedding: MEDIA_LIMITS.perHourPerWedding
      });
      let form;
      try { form = await request.formData(); } catch { throw new ApiError('The upload could not be read.', 400, 'BAD_UPLOAD'); }
      const alt = cleanAlt(form.get('alt'));
      if (alt === null) throw new ApiError('Please check the description.', 422, 'VALIDATION_ERROR', { alt: 'Keep this to 300 characters or fewer.' });
      const full = await readPart(form, 'full', MEDIA_LIMITS.fullBytes, MEDIA_LIMITS.fullEdge);
      const thumb = await readPart(form, 'thumb', MEDIA_LIMITS.thumbBytes, MEDIA_LIMITS.thumbEdge);
      if (full.format !== thumb.format) throw new ApiError('Both pictures must use the same format.', 422, 'MEDIA_TYPE');

      const rows = await listPhotoRows(env, params.id);
      const used = rows.reduce((sum, row) => sum + (row.full_bytes || 0) + (row.thumb_bytes || 0), 0);
      if (rows.length >= MEDIA_LIMITS.photos) {
        throw new ApiError(`You can add up to ${MEDIA_LIMITS.photos} photos.`, 403, 'MEDIA_LIMIT', { photos: `Remove a photo to add another.` });
      }
      if (used + full.bytes.length + thumb.bytes.length > MEDIA_LIMITS.totalBytes) {
        throw new ApiError('Your photos have reached the size limit.', 403, 'MEDIA_LIMIT', { photos: 'Remove a photo to add another.' });
      }

      const photoId = crypto.randomUUID();
      const fullKey = mediaKey(params.id, photoId, 'full', full.format);
      const thumbKey = mediaKey(params.id, photoId, 'thumb', thumb.format);
      const contentType = full.format === 'webp' ? 'image/webp' : 'image/jpeg';
      const httpMetadata = { contentType, cacheControl: 'public, max-age=31536000, immutable' };
      await bucket.put(fullKey, full.bytes, { httpMetadata });
      await bucket.put(thumbKey, thumb.bytes, { httpMetadata });
      let saved;
      try {
        const sortOrder = rows.length ? Math.max(...rows.map(row => row.sort_order || 0)) + 1 : 0;
        saved = await db(env, 'wedding_photos', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            id: photoId, wedding_id: params.id, storage_path: fullKey, full_key: fullKey, thumb_key: thumbKey,
            full_bytes: full.bytes.length, thumb_bytes: thumb.bytes.length, format: full.format,
            alt, width: full.width, height: full.height, sort_order: sortOrder
          })
        });
      } catch (error) {
        await bucket.delete([fullKey, thumbKey]).catch(() => {});
        throw error;
      }
      return success(request, env, { photo: photoView(env, saved[0]) }, 201);
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      const rows = await listPhotoRows(env, params.id);
      const ids = rows.map(row => row.id);
      const order = body.order;
      if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || !order.every(id => ids.includes(id))) {
        throw new ApiError('Send every photo once, in the new order.', 422, 'VALIDATION_ERROR', { order: 'Must list every photo once.' });
      }
      await Promise.all(order.map((id, index) => db(env, `wedding_photos?id=eq.${id}&wedding_id=eq.${params.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sort_order: index })
      })));
      const next = await listPhotoRows(env, params.id);
      return success(request, env, listing(env, next, true));
    }

    throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  } catch (error) {
    return fail(request, env, error);
  }
}
