import {
  ApiError,
  assertUuid,
  db,
  fail,
  getWedding,
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
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
      throw new ApiError('Choose a URL slug using lowercase letters, numbers and hyphens.', 422, 'VALIDATION_ERROR', {
        slug: 'Invalid slug format.'
      });
    }
    const current = await getWedding(env, params.id);
    if (!current.title?.trim()) {
      throw new ApiError('Add a title before publishing.', 422, 'VALIDATION_ERROR', {
        title: 'Required before publishing.'
      });
    }
    const slugQuery = new URLSearchParams({
      select: 'id',
      slug: `eq.${slug}`,
      id: `neq.${params.id}`,
      limit: '1'
    });
    const slugMatches = await db(env, `weddings?${slugQuery}`);
    if (slugMatches?.length) {
      throw new ApiError('That public URL is already in use.', 409, 'SLUG_CONFLICT', {
        slug: 'Choose another slug.'
      });
    }
    const rows = await db(env, `weddings?id=eq.${params.id}&version=eq.${body.version}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        slug,
        status: 'published',
        visibility: 'public',
        published_at: new Date().toISOString()
      })
    });
    if (!rows?.[0]) {
      throw new ApiError('That slug may already be in use or the draft changed. Reload and try again.', 409, 'PUBLISH_CONFLICT');
    }
    return success(request, env, {
      wedding: rows[0],
      publicUrl: `/s/${slug}`
    });
  } catch (error) {
    return fail(request, env, error);
  }
}
