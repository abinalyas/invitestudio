import {
  ApiError,
  assertUuid,
  db,
  fail,
  optionsResponse,
  requireEditAccess,
  readJson,
  success
} from '../../../_shared/api.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    await requireEditAccess(request, env, params.id);
    if (request.method !== 'POST') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    const body = await readJson(request);
    if (!Number.isInteger(body.version) || body.version < 1) {
      throw new ApiError('A current wedding version is required.', 422, 'VERSION_REQUIRED');
    }
    const rows = await db(env, `weddings?id=eq.${params.id}&version=eq.${body.version}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'unpublished', visibility: 'private' })
    });
    if (!rows?.[0]) {
      throw new ApiError('The wedding changed elsewhere. Reload before unpublishing.', 409, 'VERSION_CONFLICT');
    }
    return success(request, env, { wedding: rows[0] });
  } catch (error) {
    return fail(request, env, error);
  }
}
