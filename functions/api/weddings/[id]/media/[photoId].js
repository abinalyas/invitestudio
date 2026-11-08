import { ApiError, assertUuid, db, fail, optionsResponse, readJson, requireEditAccess, success } from '../../../../_shared/api.js';
import { cleanAlt, photoView } from '../../../../_shared/media.js';

const COLUMNS = 'id,alt,width,height,sort_order,full_key,thumb_key,full_bytes,thumb_bytes,format';

// PATCH changes a photo's description; DELETE removes the photo and its stored files. Edit token required.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    assertUuid(params.photoId);
    await requireEditAccess(request, env, params.id);
    const where = `wedding_photos?id=eq.${params.photoId}&wedding_id=eq.${params.id}`;
    if (request.method === 'PATCH') {
      const alt = cleanAlt((await readJson(request)).alt);
      if (alt === null) throw new ApiError('Please check the description.', 422, 'VALIDATION_ERROR', { alt: 'Keep this to 300 characters or fewer.' });
      const rows = await db(env, `${where}&select=${COLUMNS}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ alt }) });
      if (!rows?.[0]) throw new ApiError('Photo not found.', 404, 'NOT_FOUND');
      return success(request, env, { photo: photoView(env, rows[0]) });
    }
    if (request.method === 'DELETE') {
      const rows = await db(env, `${where}&select=${COLUMNS}`);
      const row = rows?.[0];
      if (!row) throw new ApiError('Photo not found.', 404, 'NOT_FOUND');
      if (env.MEDIA) await env.MEDIA.delete([row.full_key, row.thumb_key].filter(Boolean));
      await db(env, where, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return success(request, env, { deleted: true });
    }
    throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  } catch (error) {
    return fail(request, env, error);
  }
}
