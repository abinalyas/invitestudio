// The owner's promo codes, on the admin page. GET lists them; POST makes one, or switches one off or on.
//
//   POST { note, maxUses, days }            a new random code (days is optional: it stops working after that many days)
//   POST { code, active: true | false }     switch a code off or on
//
// Codes are always made here (never typed in), so they are long and random. Same sign-in and same-origin rules as the other admin calls.
import { ApiError, db, fail, readJson, success } from '../../_shared/api.js';
import { currentAdmin, requireAdminSettings } from '../../_shared/admin.js';
import { generateCode, normalizeCode } from '../../_shared/promo.js';

const FIELDS = 'code,note,max_uses,used_count,expires_at,active,created_at';

export async function onRequest({ request, env }) {
  try {
    requireAdminSettings(env);
    const admin = await currentAdmin(request, env);
    if (!admin) throw new ApiError('Sign in to do this.', 401, 'UNAUTHORIZED');
    if (request.method === 'GET') {
      const rows = await db(env, `promo_codes?${new URLSearchParams({ select: FIELDS, order: 'created_at.desc', limit: '200' })}`);
      return success(request, env, { codes: rows || [] });
    }
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) throw new ApiError('Not allowed.', 403, 'FORBIDDEN');
    const body = await readJson(request);

    if (typeof body?.active === 'boolean') {
      const code = normalizeCode(body.code);
      if (!code) throw new ApiError('Choose a code.', 422, 'VALIDATION_ERROR', { code: 'Not a code.' });
      const rows = await db(env, `promo_codes?${new URLSearchParams({ code: `eq.${code}`, select: FIELDS })}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ active: body.active })
      });
      if (!rows?.[0]) throw new ApiError('Code not found.', 404, 'NOT_FOUND');
      return success(request, env, { code: rows[0] });
    }

    const note = String(body?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const maxUses = body?.maxUses == null || body.maxUses === '' ? 1 : Number(body.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000) throw new ApiError('Uses must be a whole number from 1 to 10000.', 422, 'VALIDATION_ERROR', { maxUses: 'From 1 to 10000.' });
    const days = body?.days == null || body.days === '' ? null : Number(body.days);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) throw new ApiError('Days must be a whole number from 1 to 365.', 422, 'VALIDATION_ERROR', { days: 'From 1 to 365.' });
    const expiresAt = days === null ? null : new Date(Date.now() + days * 86400000).toISOString();
    const created = await db(env, 'promo_codes', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ code: generateCode(), note, max_uses: maxUses, expires_at: expiresAt })
    });
    if (!created?.[0]?.code) throw new ApiError('Could not make the code.', 502, 'DATABASE_ERROR');
    return success(request, env, { code: created[0] }, 201);
  } catch (error) {
    return fail(request, env, error);
  }
}
