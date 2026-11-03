import {
  ApiError,
  assertUuid,
  fail,
  issueEditToken,
  optionsResponse,
  requireEditAccess,
  revokeEditTokens,
  success
} from '../../../_shared/api.js';

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
    const issued = await issueEditToken(env, id);
    await revokeEditTokens(env, id, issued.tokenHash);
    return success(request, env, {
      editToken: issued.editToken,
      editTokenExpiresAt: issued.editTokenExpiresAt,
      warning: 'The previous edit links have been revoked. Store this token securely; it is returned only once.'
    });
  } catch (error) {
    return fail(request, env, error);
  }
}
