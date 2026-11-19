import {
  ApiError,
  fail,
  getWedding,
  optionsResponse,
  publicWeddingProjection,
  readJson,
  requirePreviewToken,
  success
} from '../../_shared/api.js';
import { safePhotoViews } from '../../_shared/media.js';

// Opens a draft by its preview link (docs/DRAFT_PREVIEW.md). The token is sent in the JSON body, never in the path, so it
// does not reach request logs. The answer is the same allowlisted projection a published page gets (no ids, tokens or
// private notes), taken from the latest saved draft, plus whether the invitation is already live and where.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'POST') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    const body = await readJson(request);
    const access = await requirePreviewToken(env, body.token);
    let wedding;
    try {
      wedding = await getWedding(env, access.wedding_id);
    } catch (error) {
      if (error.status === 404) throw new ApiError('This preview link is not valid.', 404, 'PREVIEW_NOT_FOUND');
      throw error;
    }
    // An invitation the cleanup has closed is closed for previews too.
    if (wedding.retention_hidden_at) throw new ApiError('This invitation has ended.', 410, 'ENDED');
    const live = wedding.status === 'published' && wedding.visibility === 'public' && wedding.slug ? wedding.slug : null;
    const projected = publicWeddingProjection(wedding);
    projected.slug = null;
    projected.published_at = null;
    return success(request, env, {
      wedding: projected,
      photos: await safePhotoViews(env, wedding.id),
      preview: { expiresAt: access.expires_at, liveSlug: live }
    });
  } catch (error) {
    return fail(request, env, error);
  }
}
