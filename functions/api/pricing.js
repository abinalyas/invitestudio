// GET /api/pricing: the prices to show this visitor.
//
// The country comes from Cloudflare (request.cf.country, or the CF-IPCountry header), never from the page. A visitor can pick another
// region with ?region=in|us|gb|eu|gulf|row (the pages remember the choice), because people travel and use VPNs. This endpoint only
// SHOWS prices. A checkout recomputes the price on the server (functions/_shared/pricing.js quote()) and locks it.
import { optionsResponse, json, fail, ApiError } from '../_shared/api.js';
import { normalRegion, regionForCountry, pricingFor } from '../_shared/pricing.js';

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
    const url = new URL(request.url);
    const asked = url.searchParams.get('region');
    if (asked && !normalRegion(asked)) throw new ApiError('Unknown region.', 400, 'VALIDATION_ERROR', { region: 'Choose one of the listed regions.' });
    const country = countryOf(request);
    const region = normalRegion(asked) || regionForCountry(country);
    // "early-access" until payments are connected (set PAYMENTS_MODE=live then): the pages say publishing is free for now.
    const mode = env?.PAYMENTS_MODE === 'live' ? 'live' : 'early-access';
    return json(request, env, { ...pricingFor(region), country, detected: !normalRegion(asked), mode });
  } catch (error) {
    return fail(request, env, error);
  }
}
