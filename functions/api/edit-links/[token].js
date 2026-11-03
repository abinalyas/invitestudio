import {
  ApiError,
  fail,
  getWedding,
  getWeddingChildren,
  optionsResponse,
  requireEditToken,
  success
} from '../../_shared/api.js';

// Resolves a passwordless private link when the wedding ID is not known to the
// browser. The token is still checked against its hash and scoped to the one
// wedding_id stored with that token.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'GET') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    const token = params.token;
    const access = await requireEditToken(env, token);
    const [wedding, children] = await Promise.all([
      getWedding(env, access.wedding_id),
      getWeddingChildren(env, access.wedding_id)
    ]);
    return success(request, env, { wedding, ...children });
  } catch (error) {
    return fail(request, env, error);
  }
}
