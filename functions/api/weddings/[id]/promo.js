// POST /api/weddings/<id>/promo { code }: unlock publishing with a promo code instead of a payment.
//
// Authorised by the private edit token, like publishing and checkout. The code is spent by one database function
// (redeem_promo_code), which checks it, counts a wrong guess, and unlocks this website as 'complimentary' in the same step.
// While payments are not open, publishing is free anyway, so a code is not spent and the page is told there is nothing to unlock.
import { ApiError, assertUuid, fail, getWedding, optionsResponse, readJson, requireEditAccess, rpc, success } from '../../../_shared/api.js';
import { normalizeCode, promoProblem, unwrap } from '../../../_shared/promo.js';
import { paymentsLive } from '../../../_shared/razorpay.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    await requireEditAccess(request, env, params.id);
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    if (!paymentsLive(env)) throw new ApiError('Publishing is free right now, so there is nothing to unlock.', 409, 'PAYMENTS_NOT_LIVE');
    const body = await readJson(request);
    const code = normalizeCode(body?.code);
    if (!code) throw new ApiError('That promo code is not valid. Check it and try again.', 422, 'PROMO_INVALID');

    const result = unwrap(await rpc(env, 'redeem_promo_code', { p_wedding_id: params.id, p_code: code }), 'redeem_promo_code');
    const status = String(result?.status || '');
    const problem = promoProblem(status);
    if (problem) throw problem;
    // Unlocking changes the website's record, which raises its version; the page needs the new number to publish next.
    const wedding = await getWedding(env, params.id);
    return success(request, env, { unlocked: true, already: status === 'already', version: Number(wedding.version) || undefined });
  } catch (error) {
    return fail(request, env, error);
  }
}
