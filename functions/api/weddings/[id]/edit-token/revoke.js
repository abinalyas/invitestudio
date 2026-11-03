import {
  ApiError,
  assertUuid,
  fail,
  optionsResponse,
  requireEditAccess,
  revokeEditTokens,
  success
} from '../../../../_shared/api.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'POST') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    const id = params.id;
    assertUuid(id);
    await requireEditAccess(request, env, id);
    const revoked = await revokeEditTokens(env, id);
    return success(request, env, { revoked, message: 'All private edit links have been revoked.' });
  } catch (error) {
    return fail(request, env, error);
  }
}
