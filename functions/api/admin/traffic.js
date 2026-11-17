import { ApiError, fail, rpc, success } from '../../_shared/api.js';
import { currentAdmin, requireAdminSettings } from '../../_shared/admin.js';

// The Visitors section: visit statistics for the last 7, 30 or 90 days (supabase/migrations/202611170001_analytics.sql).
// Anonymous counts only. Opening it also removes rows older than 400 days.
export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'GET') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    requireAdminSettings(env);
    const admin = await currentAdmin(request, env);
    if (!admin) throw new ApiError('Sign in to see this.', 401, 'UNAUTHORIZED');
    const asked = Number(new URL(request.url).searchParams.get('days'));
    const days = [7, 30, 90].includes(asked) ? asked : 30;
    const answer = await rpc(env, 'analytics_overview', { p_days: days });
    // PostgREST answers with the JSON itself; the local test stand-in wraps it as [{ analytics_overview: ... }].
    const data = Array.isArray(answer) ? answer[0]?.analytics_overview : answer;
    if (!data || !data.totals) throw new ApiError('Database operation failed.', 502, 'DATABASE_ERROR');
    await rpc(env, 'analytics_purge', { p_keep_days: 400 }).catch(() => null);
    return success(request, env, data);
  } catch (error) {
    return fail(request, env, error);
  }
}
