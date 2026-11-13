// POST /api/weddings/<id>/checkout: start the one-time payment that unlocks publishing.
//
// Authorised by the private edit token, like publishing. The browser sends no amount: the server works out the price for this
// wedding's design and the visitor's region (functions/_shared/pricing.js), writes a `payments` row with that amount LOCKED, and
// creates a Razorpay Payment Link for exactly it. The browser is sent to the link's page to pay.
import { ApiError, assertUuid, db, fail, getWedding, optionsResponse, requireEditAccess, success } from '../../../_shared/api.js';
import { isLaunchTemplate } from '../../../_shared/templates.js';
import { normalRegion, quote, regionForCountry, TIERS } from '../../../_shared/pricing.js';
import { createPaymentLink, paymentsLive, razorpayConfig } from '../../../_shared/razorpay.js';
import { countryOf } from '../../pricing.js';

const REUSE_WINDOW_MS = 30 * 60 * 1000;

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    assertUuid(params.id);
    await requireEditAccess(request, env, params.id);
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    // Nothing can be charged until payments are switched on (and, in the meantime, keys can be tested on a preview site).
    if (!paymentsLive(env)) throw new ApiError('Payments are not open yet.', 409, 'PAYMENTS_NOT_LIVE');
    razorpayConfig(env);

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const wedding = await getWedding(env, params.id);
    if (!isLaunchTemplate(wedding.template_id)) {
      throw new ApiError('This design is no longer available. Choose another template before publishing.', 422, 'TEMPLATE_UNAVAILABLE');
    }
    if (wedding.publish_unlocked_at) return success(request, env, { alreadyUnlocked: true });

    // The region the visitor picked on the page (a hint they may change), else the one their country belongs to.
    const country = countryOf(request);
    const region = normalRegion(body?.region) || regionForCountry(country);
    const price = quote(wedding.template_id, region);

    // One link per wedding and price: pressing the button twice, or coming back, reuses the open link instead of making more.
    const since = new Date(Date.now() - REUSE_WINDOW_MS).toISOString();
    const open = await db(env, `payments?${new URLSearchParams({
      select: 'id,provider_payment_id,amount_minor,currency,metadata',
      wedding_id: `eq.${params.id}`,
      provider: 'eq.razorpay',
      status: 'eq.pending',
      created_at: `gte.${since}`,
      order: 'created_at.desc',
      limit: '5'
    })}`);
    const reusable = (open || []).find(row => row.amount_minor === price.amountMinor && row.currency === price.currency && row.metadata?.templateId === price.templateId && row.metadata?.shortUrl);
    if (reusable) {
      return success(request, env, { paymentId: reusable.id, url: reusable.metadata.shortUrl, amountMinor: reusable.amount_minor, currency: reusable.currency, tier: price.tier, region: price.region, reused: true });
    }

    const tierName = TIERS.find(tier => tier.id === price.tier)?.name || price.tier;
    const description = `InviteStudio ${tierName} invitation: publish your wedding website`;
    const created = await db(env, 'payments', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        wedding_id: params.id,
        provider: 'razorpay',
        status: 'pending',
        amount_minor: price.amountMinor,
        currency: price.currency,
        description,
        metadata: { templateId: price.templateId, tier: price.tier, region: price.region, country }
      })
    });
    const payment = created?.[0];
    if (!payment?.id) throw new ApiError('Could not start the payment.', 502, 'DATABASE_ERROR');

    const origin = String(env.PUBLIC_ORIGIN || '').replace(/\/$/, '') || new URL(request.url).origin;
    let link;
    try {
      link = await createPaymentLink(env, {
        amount: price.amountMinor,
        currency: price.currency,
        referenceId: payment.id,
        description,
        callbackUrl: `${origin}/?payment=${payment.id}`,
        notes: { payment_id: payment.id, wedding_id: params.id, template: price.templateId, tier: price.tier, region: price.region }
      });
    } catch (error) {
      await db(env, `payments?id=eq.${payment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed' }) }).catch(() => null);
      throw error;
    }
    if (!link?.id || !/^https:\/\//.test(String(link.short_url || ''))) {
      await db(env, `payments?id=eq.${payment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed' }) }).catch(() => null);
      throw new ApiError('The payment service gave an unexpected answer.', 502, 'PAYMENT_PROVIDER_ERROR');
    }
    await db(env, `payments?id=eq.${payment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ provider_payment_id: link.id, metadata: { ...payment.metadata, shortUrl: link.short_url } })
    });
    return success(request, env, { paymentId: payment.id, url: link.short_url, amountMinor: price.amountMinor, currency: price.currency, tier: price.tier, region: price.region });
  } catch (error) {
    return fail(request, env, error);
  }
}
