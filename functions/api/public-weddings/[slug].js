import {
  ApiError,
  db,
  fail,
  optionsResponse,
  publicWeddingProjection,
  success
} from '../../_shared/api.js';

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
      select: 'id,slug,template_id,name,category,title,event_date,location,message,story,hosts,locale,theme,content,sections,intro_settings,animation_settings,published_at',
      slug: `eq.${slug}`,
      status: 'eq.published',
      visibility: 'eq.public',
      limit: '1'
    });
    const weddings = await db(env, `weddings?${query}`);
    if (!weddings?.[0]) throw new ApiError('Invitation not found.', 404, 'NOT_FOUND');
    const wedding = weddings[0];

    const [events, photos] = await Promise.all([
      db(env, `wedding_events?${new URLSearchParams({
        select: 'id,title,event_date,start_time,end_time,venue,description,dress_code,directions_url,parking,accommodation,accessibility,sort_order',
        wedding_id: `eq.${wedding.id}`,
        visible: 'eq.true',
        order: 'sort_order.asc,event_date.asc,start_time.asc'
      })}`),
      db(env, `wedding_photos?${new URLSearchParams({
        select: 'id,alt,width,height,sort_order',
        wedding_id: `eq.${wedding.id}`,
        order: 'sort_order.asc,created_at.asc'
      })}`)
    ]);
    return success(request, env, {
      wedding: publicWeddingProjection(wedding),
      events: events || [],
      photos: photos || []
    });
  } catch (error) {
    return fail(request, env, error);
  }
}
