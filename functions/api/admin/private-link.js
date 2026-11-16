import { ApiError, assertUuid, fail, getWedding, issueEditToken, readJson, success } from '../../_shared/api.js';
import { currentAdmin, requireAdminSettings } from '../../_shared/admin.js';

// Creates a NEW private editing link for one website, for the signed-in owner (support: opening a couple's draft).
//
// The couple's own links are stored only as hashes, so an existing link can never be shown: this makes an extra one.
// It does not replace or revoke the couple's link. It works for 90 days, and the database records that it was issued from
// the admin page and by whom (edit_tokens.metadata). Whoever holds the link can edit the website and see its guest replies.
export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    requireAdminSettings(env);
    const admin = await currentAdmin(request, env);
    if (!admin) throw new ApiError('Sign in to do this.', 401, 'UNAUTHORIZED');
    // Only this site's own page may ask (the admin cookie alone is not enough for a request made from another site).
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) throw new ApiError('Not allowed.', 403, 'FORBIDDEN');
    const body = await readJson(request);
    const id = String(body?.id || '');
    assertUuid(id);
    await getWedding(env, id);
    const issued = await issueEditToken(env, id, { issuedBy: 'admin', admin: admin.email, at: new Date().toISOString() });
    const link = `${new URL(request.url).origin}/edit#${encodeURIComponent(issued.editToken)}`;
    return success(request, env, { link, expiresAt: issued.editTokenExpiresAt });
  } catch (error) {
    return fail(request, env, error);
  }
}
