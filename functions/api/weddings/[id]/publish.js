import {
  ApiError,
  assertUuid,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  db,
  fail,
  getWedding,
  optionsResponse,
  publishErrorFrom,
  requireEditAccess,
  readJson,
  rpc,
  success
} from '../../../_shared/api.js';
import { isLaunchTemplate } from '../../../_shared/templates.js';
import { paymentsLive } from '../../../_shared/razorpay.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    // Authorization first: the edit token must be valid and bound to this wedding. Nothing below runs otherwise.
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
    // Once payments are live, publishing a website for the first time needs the one-time payment (docs/PRICING_PLAN.md). A website that
    // is live, or was unlocked before (paid, early access or complimentary), is never asked again.
    const live = paymentsLive(env);
    if (live && !current.publish_unlocked_at && current.status !== 'published') {
      throw new ApiError('Publishing needs a one-time payment.', 402, 'PAYMENT_REQUIRED');
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

    // The database is the authority for the change: version, availability, reservations (historical addresses),
    // the confirmation, the ten-change limit and the atomic claim. The wedding id comes from the verified route,
    // never from the body. The direct PATCH of weddings.slug is no longer used.
    let data;
    try {
      data = await rpc(env, 'publish_wedding_slug', {
        p_wedding_id: params.id,
        p_version: body.version,
        p_slug: slug,
        p_confirm_slug_change: body.confirmSlugChange === true
      });
    } catch (error) {
      throw publishErrorFrom(error);
    }
    const wedding = Array.isArray(data) ? data[0] : data;
    if (!wedding?.id) {
      throw new ApiError('That slug may already be in use or the draft changed. Reload and try again.', 409, 'PUBLISH_CONFLICT');
    }
    // While payments are not live, publishing counts as early access: the website stays unlocked after payments open.
    if (!live && !current.publish_unlocked_at) {
      await db(env, `weddings?id=eq.${params.id}&publish_unlocked_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ publish_unlocked_at: new Date().toISOString(), publish_unlock_reason: 'early-access' })
      }).catch(() => console.error('Could not record the early access unlock'));
    }
    return success(request, env, {
      wedding,
      publicUrl: `/s/${slug}`
    });
  } catch (error) {
    return fail(request, env, error);
  }
}
