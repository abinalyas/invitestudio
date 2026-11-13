// POST /api/payments/razorpay-webhook: Razorpay tells us a payment link was paid (or a payment refunded).
//
// Configure in the Razorpay dashboard (Settings, Webhooks): this URL, a secret of your choosing (RAZORPAY_WEBHOOK_SECRET), and the
// events payment_link.paid and refund.processed. The signature is checked against the EXACT body Razorpay sent; anything else is refused.
// Idempotent: Razorpay may send an event more than once, or after the page has already confirmed the payment.
import { ApiError, db, fail, json, optionsResponse, rpc } from '../../_shared/api.js';
import { verifyWebhookSignature } from '../../_shared/razorpay.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY = 256 * 1024;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const secret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    if (!secret) throw new ApiError('Payments are not set up yet.', 503, 'PAYMENTS_NOT_CONFIGURED');
    const raw = await request.text();
    if (raw.length > MAX_BODY) throw new ApiError('Request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
    if (!(await verifyWebhookSignature(raw, request.headers.get('X-Razorpay-Signature'), secret))) {
      throw new ApiError('Invalid signature.', 400, 'INVALID_SIGNATURE');
    }
    let event;
    try { event = JSON.parse(raw); } catch { throw new ApiError('Request body must be valid JSON.', 400, 'INVALID_JSON'); }

    if (event?.event === 'payment_link.paid') {
      const link = event.payload?.payment_link?.entity;
      const reference = link?.reference_id;
      if (!link?.id || !UUID.test(String(reference || ''))) return json(request, env, { ok: true, ignored: true });
      try {
        await rpc(env, 'mark_payment_paid', {
          p_payment_id: reference,
          p_provider_ref: link.id,
          p_amount: Number(link.amount_paid ?? link.amount),
          p_currency: String(link.currency || ''),
          p_provider_payment_id: event.payload?.payment?.entity?.id || null
        });
      } catch (error) {
        const message = error.databaseMessage || '';
        // A payment that is not ours, or does not match what we created, is recorded in the log for a person to look at.
        // It is answered with 200 so Razorpay stops retrying something that can never succeed. A database failure is not: 5xx, so it retries.
        if (/PAYMENT_(NOT_FOUND|NOT_PENDING|AMOUNT_MISMATCH|REFERENCE_MISMATCH)/.test(message)) {
          console.error('Razorpay webhook: payment refused', reference, message.match(/PAYMENT_[A-Z_]+/)?.[0]);
          return json(request, env, { ok: false, refused: true });
        }
        throw error;
      }
      return json(request, env, { ok: true });
    }

    if (event?.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      const razorpayPaymentId = String(refund?.payment_id || '');
      if (/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId)) {
        const rows = await db(env, `payments?${new URLSearchParams({ select: 'id,amount_minor,status', provider: 'eq.razorpay', 'metadata->>razorpayPaymentId': `eq.${razorpayPaymentId}`, limit: '1' })}`);
        const payment = rows?.[0];
        // Only a refund of the whole amount closes the payment; a part refund leaves it paid. Publishing is NOT taken away here.
        if (payment && payment.status === 'paid' && Number(refund.amount) >= payment.amount_minor) {
          await db(env, `payments?id=eq.${payment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'refunded' }) });
        }
      }
      return json(request, env, { ok: true });
    }

    return json(request, env, { ok: true, ignored: true });
  } catch (error) {
    return fail(request, env, error);
  }
}
