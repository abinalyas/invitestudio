import {
  ApiError,
  assertUuid,
  fail,
  normaliseSlug,
  optionsResponse,
  requireEditAccess,
  slugAvailability,
  success
} from '../../../_shared/api.js';

// GET /api/weddings/:id/slug-availability?slug=... (edit token required).
// Returns whether the address is free for this website, with alternatives if it is taken.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'GET') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    assertUuid(params.id);
    await requireEditAccess(request, env, params.id);
    const slug = normaliseSlug(new URL(request.url).searchParams.get('slug') || '');
    return success(request, env, await slugAvailability(env, params.id, slug));
  } catch (error) {
    return fail(request, env, error);
  }
}
