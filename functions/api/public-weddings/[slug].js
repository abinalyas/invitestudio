import {
  ApiError,
  db,
  fail,
  optionsResponse,
  publicWeddingProjection,
  success
} from '../../_shared/api.js';
import { safePhotoViews } from '../../_shared/media.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'GET') {
      throw new ApiError('Public invitations are read-only.', 405, 'METHOD_NOT_ALLOWED');
    }
    const slug = params.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) {
      throw new ApiError('Invitation not found.', 404, 'NOT_FOUND');
    }

    const query = new URLSearchParams({
      select: 'slug,template_id,name,category,title,event_date,location,message,story,hosts,locale,theme,content,sections,intro_settings,animation_settings,published_at,id',
      slug: `eq.${slug}`,
      status: 'eq.published',
      visibility: 'eq.public',
      limit: '1'
    });
    const weddings = await db(env, `weddings?${query}`);
    if (!weddings?.[0]) throw new ApiError('Invitation not found.', 404, 'NOT_FOUND');
    const wedding = weddings[0];

    // Events come from wedding.content.functions (the single event source). Photos
    // are metadata only; signed storage URLs are introduced with the media phase.
    return success(request, env, {
      wedding: publicWeddingProjection(wedding),
      photos: await safePhotoViews(env, wedding.id)
    });
  } catch (error) {
    return fail(request, env, error);
  }
}
