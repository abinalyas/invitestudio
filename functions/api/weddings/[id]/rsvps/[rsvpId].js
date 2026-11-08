import { ApiError, assertUuid, db, fail, optionsResponse, requireEditAccess, success } from '../../../../_shared/api.js';

// DELETE /api/weddings/:id/rsvps/:rsvpId: the couple removes one reply. Edit token required.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    assertUuid(params.rsvpId);
    await requireEditAccess(request, env, params.id);
    if (request.method !== 'DELETE') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const rows = await db(env, `wedding_rsvps?id=eq.${params.rsvpId}&wedding_id=eq.${params.id}`, {
      method: 'DELETE', headers: { Prefer: 'return=representation' }
    });
    if (!rows?.[0]) throw new ApiError('Reply not found.', 404, 'NOT_FOUND');
    return success(request, env, { deleted: true });
  } catch (error) {
    return fail(request, env, error);
  }
}
