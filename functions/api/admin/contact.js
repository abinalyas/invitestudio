import { ApiError, assertUuid, db, fail, readJson, success } from '../../_shared/api.js';
import { currentAdmin, requireAdminSettings } from '../../_shared/admin.js';

// A buyer's name, email and phone for one website (asked for before paying, kept in customer_contacts), shown to the signed-in
// owner on request. Each look is written to admin_access_log (who, what, when). Websites whose owner never paid have none.
export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    requireAdminSettings(env);
    const admin = await currentAdmin(request, env);
    if (!admin) throw new ApiError('Sign in to do this.', 401, 'UNAUTHORIZED');
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) throw new ApiError('Not allowed.', 403, 'FORBIDDEN');
    const body = await readJson(request);
    const id = String(body?.id || '');
    assertUuid(id);
    const rows = await db(env, `customer_contacts?${new URLSearchParams({ select: 'name,email,phone,marketing_opt_in,created_at', wedding_id: `eq.${id}`, limit: '1' })}`);
    await db(env, 'admin_access_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ admin_email: admin.email, action: 'view_contact', wedding_id: id })
    });
    const row = rows?.[0];
    return success(request, env, { contact: row ? { name: row.name, email: row.email, phone: row.phone || '', marketing: Boolean(row.marketing_opt_in), savedAt: row.created_at } : null });
  } catch (error) {
    return fail(request, env, error);
  }
}
