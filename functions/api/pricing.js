// GET /api/pricing: the prices to show this visitor.
//
// The country comes from Cloudflare (request.cf.country, or the CF-IPCountry header), never from the page, and the visitor cannot choose
// another: the price simply follows where they are. This endpoint only SHOWS prices. A checkout recomputes the price on the server (functions/_shared/pricing.js quote()) and locks it.
import { optionsResponse, json, fail, ApiError } from '../_shared/api.js';
import { regionForCountry, pricingFor } from '../_shared/pricing.js';

export function countryOf(request) {
  const code = String(request.cf?.country || request.headers.get('CF-IPCountry') || '').trim().toUpperCase();
  // Cloudflare says XX when it does not know the place (and T1 for Tor, which is not two letters).
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : '';
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'GET') throw new ApiError('Prices are read-only.', 405, 'METHOD_NOT_ALLOWED');
    const country = countryOf(request);
    const region = regionForCountry(country);
    // "early-access" until payments are connected (set PAYMENTS_MODE=live then): the pages say publishing is free for now.
    const mode = env?.PAYMENTS_MODE === 'live' ? 'live' : 'early-access';
    return json(request, env, { ...pricingFor(region), country, mode });
  } catch (error) {
    return fail(request, env, error);
  }
}
