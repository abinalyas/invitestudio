import {
  ApiError,
  fail,
  getWedding,
  getWeddingChildren,
  optionsResponse,
  readJson,
  requireEditToken,
  success
} from '../../_shared/api.js';

// Resolves a private edit link. The raw token is sent in the JSON body, never in
// the request path, so it does not reach request logs or URL history.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'POST') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    const body = await readJson(request);
    if (typeof body.token !== 'string') {
      throw new ApiError('An edit token is required.', 401, 'EDIT_TOKEN_REQUIRED');
    }
    const access = await requireEditToken(env, body.token);
    const [wedding, children] = await Promise.all([
      getWedding(env, access.wedding_id),
      getWeddingChildren(env, access.wedding_id)
    ]);
    return success(request, env, { wedding, ...children });
  } catch (error) {
    return fail(request, env, error);
  }
}
