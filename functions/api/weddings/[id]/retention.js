import { ApiError, assertUuid, fail, optionsResponse, requireEditAccess, rpc, success } from '../../../_shared/api.js';

// GET /api/weddings/:id/retention: when this website is kept until, for the editor's notice. Edit token required.
// Asking also records the date the couple is shown, so a later change to the rules can never bring it forward
// (docs/RETENTION_PLAN.md). If the retention migration has not been run, it answers { available: false } and the editor
// simply shows no notice.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    await requireEditAccess(request, env, params.id);
    if (request.method !== 'GET') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    let retention;
    try {
      retention = await rpc(env, 'wedding_retention_shown', { p_wedding_id: params.id });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DATABASE_ERROR') return success(request, env, { available: false });
      throw error;
    }
    if (!retention) throw new ApiError('Wedding draft not found.', 404, 'NOT_FOUND');
    return success(request, env, { available: true, ...retention });
  } catch (error) {
    return fail(request, env, error);
  }
}
