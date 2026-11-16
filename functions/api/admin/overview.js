import { ApiError, fail, rpc, success } from '../../_shared/api.js';
import { currentAdmin, requireAdminSettings } from '../../_shared/admin.js';

// What the admin page shows: counts, revenue, designs, a 30 day chart and the list of websites (supabase/migrations/
// 202611160003_admin_overview.sql). Guest replies are counted there; no guest's name or details are in this answer.
export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'GET') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    requireAdminSettings(env);
    const admin = await currentAdmin(request, env);
    if (!admin) throw new ApiError('Sign in to see this.', 401, 'UNAUTHORIZED');
    const answer = await rpc(env, 'admin_overview', { p_limit: 500 });
    // PostgREST answers with the JSON itself; the local test stand-in wraps it as [{ admin_overview: ... }].
    const overview = Array.isArray(answer) ? answer[0]?.admin_overview : answer;
    if (!overview || !overview.totals) throw new ApiError('Database operation failed.', 502, 'DATABASE_ERROR');
    return success(request, env, { admin: admin.email, ...overview });
  } catch (error) {
    return fail(request, env, error);
  }
}
