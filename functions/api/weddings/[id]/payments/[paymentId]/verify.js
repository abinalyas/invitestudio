// POST /api/weddings/<id>/payments/<paymentId>/verify: the page asks "is this payment done?" after the guest comes back from Razorpay.
//
// Nothing the browser says is believed. The server finds ITS OWN payment row, asks Razorpay for the link it created, and only when
// Razorpay says the link is paid for exactly the amount and currency that were locked does it unlock publishing (through the one
// database function that may do so). The signed webhook does the same independently, so a guest who never comes back is still unlocked.
import { ApiError, assertUuid, db, fail, optionsResponse, requireEditAccess, rpc, success } from '../../../../../_shared/api.js';
import { fetchPaymentLink, paymentsLive, razorpayConfig } from '../../../../../_shared/razorpay.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    assertUuid(params.paymentId);
    await requireEditAccess(request, env, params.id);
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    if (!paymentsLive(env)) throw new ApiError('Payments are not open yet.', 409, 'PAYMENTS_NOT_LIVE');
    razorpayConfig(env);

    // The payment must belong to THIS wedding (the token is bound to it), never just any payment id.
    const rows = await db(env, `payments?${new URLSearchParams({
      select: 'id,wedding_id,status,amount_minor,currency,provider_payment_id',
      id: `eq.${params.paymentId}`,
      wedding_id: `eq.${params.id}`,
      provider: 'eq.razorpay',
      limit: '1'
    })}`);
    const payment = rows?.[0];
    if (!payment) throw new ApiError('Payment not found.', 404, 'NOT_FOUND');
    if (payment.status === 'paid') return success(request, env, { unlocked: true, status: 'paid' });
    if (!payment.provider_payment_id) return success(request, env, { unlocked: false, status: 'pending' });

    const link = await fetchPaymentLink(env, payment.provider_payment_id);
    const paidAmount = Number(link?.amount_paid ?? link?.amount);
    if (link?.status === 'paid' && !(link.reference_id === payment.id && paidAmount === payment.amount_minor && link.currency === payment.currency)) {
      console.error('Payment did not match what was created', payment.id);
      throw new ApiError('This payment could not be confirmed. Please contact us with your payment details.', 409, 'PAYMENT_MISMATCH');
    }
    if (link?.status === 'paid') {
      try {
        await rpc(env, 'mark_payment_paid', {
          p_payment_id: payment.id,
          p_provider_ref: link.id,
          p_amount: paidAmount,
          p_currency: link.currency,
          p_provider_payment_id: link.payments?.[0]?.payment_id || null
        });
      } catch (error) {
        const message = error.databaseMessage || '';
        if (/PAYMENT_(AMOUNT|REFERENCE)_MISMATCH/.test(message)) {
          console.error('Payment did not match what was created', payment.id);
          throw new ApiError('This payment could not be confirmed. Please contact us with your payment details.', 409, 'PAYMENT_MISMATCH');
        }
        throw error;
      }
      return success(request, env, { unlocked: true, status: 'paid' });
    }
    if (link?.status === 'expired' || link?.status === 'cancelled') {
      await db(env, `payments?id=eq.${payment.id}&status=eq.pending`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }).catch(() => null);
    }
    return success(request, env, { unlocked: false, status: String(link?.status || 'pending') });
  } catch (error) {
    return fail(request, env, error);
  }
}
