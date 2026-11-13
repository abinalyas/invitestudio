// Razorpay (docs/PRICING_PLAN.md). Publishing is paid for through a Razorpay Payment Link: the server creates a link for an amount
// IT has worked out (functions/_shared/pricing.js), the guest pays on Razorpay's own page, and the server then learns the payment is
// real in two independent ways: it asks Razorpay for the link (verify route) and Razorpay tells it (signed webhook). The browser is
// never believed about money. No card or UPI details ever reach this site.
//
// Environment (Cloudflare Pages, as secrets): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, PAYMENTS_MODE=live,
// and optionally PUBLIC_ORIGIN (the site's address, for the page Razorpay sends the guest back to).
import { ApiError } from './api.js';

const API = 'https://api.razorpay.com/v1';
const encoder = new TextEncoder();

export function paymentsLive(env) {
  return env?.PAYMENTS_MODE === 'live';
}

export function razorpayConfig(env) {
  const keyId = String(env?.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env?.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) throw new ApiError('Payments are not set up yet.', 503, 'PAYMENTS_NOT_CONFIGURED');
  return { keyId, keySecret };
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return [...signature].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Compares two strings without stopping at the first difference.
export function timingSafeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) difference |= (left[i] || 0) ^ (right[i] || 0);
  return difference === 0;
}

// The webhook's signature is the HMAC-SHA256 of the exact body Razorpay sent, with the webhook secret (not the API key secret).
export async function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret || !signature || typeof signature !== 'string') return false;
  return timingSafeEqual(await hmacHex(secret, rawBody), signature.trim().toLowerCase());
}

async function razorpay(env, method, path, body) {
  const { keyId, keySecret } = razorpayConfig(env);
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    console.error('Razorpay request failed to complete', method, path.split('/')[1]);
    throw new ApiError('The payment service did not answer. Please try again in a moment.', 502, 'PAYMENT_PROVIDER_ERROR');
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    // The status and Razorpay's error code only: never the body, which can echo what was sent.
    console.error('Razorpay request refused', method, path.split('/')[1], response.status, data?.error?.code || '');
    throw new ApiError('The payment service could not start this payment. Please try again in a moment.', 502, 'PAYMENT_PROVIDER_ERROR');
  }
  return data;
}

// A payment link for exactly `amount` (minor units) in `currency`. reference_id is our own payment id, so the link can only ever be
// matched back to the payment row we created for it. expire_by must be at least 15 minutes away; two hours is used.
export function createPaymentLink(env, { amount, currency, referenceId, description, callbackUrl, notes }) {
  return razorpay(env, 'POST', '/payment_links', {
    amount,
    currency,
    accept_partial: false,
    reference_id: referenceId,
    description,
    notify: { sms: false, email: false },
    reminder_enable: false,
    callback_url: callbackUrl,
    callback_method: 'get',
    expire_by: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
    notes
  });
}

export function fetchPaymentLink(env, linkId) {
  if (!/^plink_[A-Za-z0-9]+$/.test(String(linkId || ''))) throw new ApiError('Unknown payment.', 404, 'NOT_FOUND');
  return razorpay(env, 'GET', `/payment_links/${linkId}`);
}
