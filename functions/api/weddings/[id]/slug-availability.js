import {
  ApiError,
  SLUG_CHANGE_LIMIT,
  assertUuid,
  fail,
  getWedding,
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
    const result = await slugAvailability(env, params.id, slug);
    // The address-change allowance of this wedding, so the editor can warn before the limit is reached.
    const wedding = await getWedding(env, params.id);
    const used = Number(wedding.slug_change_count) || 0;
    result.change_limit = { used, max: SLUG_CHANGE_LIMIT, remaining: Math.max(0, SLUG_CHANGE_LIMIT - used) };
    return success(request, env, result);
  } catch (error) {
    return fail(request, env, error);
  }
}
