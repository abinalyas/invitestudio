import {
  ApiError,
  assertUuid,
  db,
  fail,
  getWedding,
  getWeddingChildren,
  noContent,
  optionsResponse,
  requireEditAccess,
  readJson,
  success,
  validateWeddingInput
} from '../../_shared/api.js';
import { deleteWeddingMedia } from '../../_shared/media.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    const id = params.id;
    assertUuid(id);
    await requireEditAccess(request, env, id);

    if (request.method === 'GET') {
      const [wedding, children] = await Promise.all([
        getWedding(env, id),
        getWeddingChildren(env, id)
      ]);
      return success(request, env, { wedding, ...children });
    }

    if (request.method === 'DELETE') {
      // Permanent. The private links, photo records, events, payments and RSVPs of this
      // draft are removed by cascading foreign keys, and its public address stops working
      // at once. Its stored photos are removed first.
      await deleteWeddingMedia(env, id).catch(error => console.error('InviteStudio media cleanup failed', error?.message));
      await db(env, `weddings?id=eq.${id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      return noContent(request, env);
    }

    if (request.method !== 'PATCH') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }

    const body = await readJson(request);
    if (!Number.isInteger(body.version) || body.version < 1) {
      throw new ApiError('A current wedding version is required.', 422, 'VERSION_REQUIRED', {
        version: 'Send the version returned by the last successful save.'
      });
    }
    const patch = validateWeddingInput(body);
    if (!Object.keys(patch).length) {
      throw new ApiError('At least one wedding field is required.', 422, 'NO_CHANGES');
    }

    const rows = await db(env, `weddings?id=eq.${id}&version=eq.${body.version}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    if (!rows?.[0]) {
      throw new ApiError('The wedding changed elsewhere. Reload before saving.', 409, 'VERSION_CONFLICT');
    }
    return success(request, env, { wedding: rows[0] });
  } catch (error) {
    return fail(request, env, error);
  }
}
