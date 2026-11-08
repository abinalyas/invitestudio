import { ApiError, assertUuid, db, fail, getWedding, optionsResponse, requireEditAccess, success } from '../../../../_shared/api.js';
import { RSVP_TOTAL_CAP, coupleReply, replyEvents, totalsFor } from '../../../../_shared/rsvp.js';

// GET /api/weddings/:id/rsvps: the couple's replies and totals. Edit token required.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    await requireEditAccess(request, env, params.id);
    if (request.method !== 'GET') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const wedding = await getWedding(env, params.id);
    const rows = await db(env, `wedding_rsvps?${new URLSearchParams({
      select: 'id,guest_name,attending,party_size,event_replies,needs,message,created_at,updated_at',
      wedding_id: `eq.${params.id}`, order: 'created_at.desc', limit: String(RSVP_TOTAL_CAP)
    })}`) || [];
    return success(request, env, { replies: rows.map(coupleReply), totals: totalsFor(rows, replyEvents(wedding?.content)) });
  } catch (error) {
    return fail(request, env, error);
  }
}
