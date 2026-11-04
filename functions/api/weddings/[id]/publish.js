import {
  ApiError,
  assertUuid,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  db,
  fail,
  getWedding,
  optionsResponse,
  requireEditAccess,
  readJson,
  success
} from '../../../_shared/api.js';
import { isLaunchTemplate } from '../../../_shared/templates.js';

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
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new ApiError('Choose a URL slug using lowercase letters, numbers and hyphens.', 422, 'VALIDATION_ERROR', {
        slug: 'Invalid slug format.'
      });
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new ApiError('That web address is reserved. Choose another.', 422, 'VALIDATION_ERROR', {
        slug: 'This address is reserved.'
      });
    }
    const current = await getWedding(env, params.id);
    // A live invitation may keep an address longer than the limit (set before it existed).
    // Only a new or moved address must respect the limit.
    if (slug !== current.slug && slug.length > SLUG_MAX_LENGTH) {
      throw new ApiError(`Keep the web address to ${SLUG_MAX_LENGTH} characters or fewer.`, 422, 'VALIDATION_ERROR', {
        slug: `Keep the web address to ${SLUG_MAX_LENGTH} characters or fewer.`
      });
    }
    if (!isLaunchTemplate(current.template_id)) {
      throw new ApiError('This design is no longer available. Choose another template before publishing.', 422, 'TEMPLATE_UNAVAILABLE');
    }
    if (!current.title?.trim()) {
      throw new ApiError('Add a title before publishing.', 422, 'VALIDATION_ERROR', {
        title: 'Required before publishing.'
      });
    }
    // Changing the address of a live invitation breaks the old link. Make the couple confirm it.
    if (current.status === 'published' && current.slug && current.slug !== slug && body.confirmSlugChange !== true) {
      throw new ApiError('Changing a live web address stops the old link working. Confirm the change to continue.', 409, 'SLUG_CHANGE_CONFIRMATION_REQUIRED', {
        slug: 'Confirm that the old address will stop working.'
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
    let rows;
    try {
      rows = await db(env, `weddings?id=eq.${params.id}&version=eq.${body.version}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          slug,
          status: 'published',
          visibility: 'public',
          published_at: new Date().toISOString()
        })
      });
    } catch (error) {
      // Two websites can pass the availability check at the same moment. The database
      // unique constraint decides the winner; the loser gets a conflict, not a server error.
      if (error?.databaseCode === '23505') {
        throw new ApiError('That public URL is already in use.', 409, 'SLUG_CONFLICT', {
          slug: 'Choose another slug.'
        });
      }
      throw error;
    }
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
