// Prices for publishing an invitation: the single place that says what a design costs, and where.
//
// - Every design belongs to a tier (Classic, Premium, Signature); the price depends on the tier and on where the visitor is.
// - Prices are set by hand for each region (not converted from one currency), so they read naturally (999 rupees, 19 dollars) and do
//   not move with exchange rates. Amounts are in the currency's minor unit (paise, cents, pence), always whole numbers.
// - The visitor's country comes from Cloudflare (see functions/api/pricing.js). A region not listed here gets the "rest of world" price.
// - The server is the only place a price is decided. A checkout (not built yet, see docs/PRICING_PLAN.md) recomputes it here and locks it;
//   the browser's copy is only for showing.
//
// THE AMOUNTS BELOW ARE PLACEHOLDERS until the product owner confirms them. Change them here, nowhere else.

export const TIERS = Object.freeze([
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'A beautifully designed invitation, ready to share.',
    features: [
      'Your names, date, story, photos and events',
      'A shareable link and guest replies (RSVP)',
      'Gentle motion and a live countdown',
      'Kept online until 2 months after your event'
    ]
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Designs that open with motion and music.',
    features: [
      'Everything in Classic',
      'Animated opening and scroll reveals',
      'Background music with an on/off button',
      'Richer artwork and layouts'
    ]
  },
  {
    id: 'signature',
    name: 'Signature',
    tagline: 'Our most cinematic designs, with a film to open them.',
    features: [
      'Everything in Premium',
      'A short film opening your guests see first',
      'Interactive touches, such as a date to scratch or tap open',
      'Our most detailed artwork'
    ]
  }
]);

// Which tier each design is in. A design not listed here is Classic, so a new design can never be free by accident.
export const TEMPLATE_TIERS = Object.freeze({
  'savanna-sunset': 'classic',
  'palmera-beach': 'classic',
  'curtain-call': 'classic',
  'lunaria-moon': 'classic',
  'modern-heritage': 'classic',
  'minimalist': 'classic',
  'cinematic': 'premium',
  'fairy-tale': 'premium',
  'blue-hydrangea': 'premium',
  'bloom-reveal': 'premium',
  'velvet-reveal': 'signature',
  'under-the-same-moon': 'signature',
  'golden-butterfly': 'signature',
  'cherry-blossom': 'signature'
});

export const DEFAULT_TIER = 'classic';
export const DEFAULT_REGION = 'row';

// One price for each tier in each region, in minor units. `locale` only decides how the number is written.
export const REGIONS = Object.freeze({
  in: { id: 'in', name: 'India', currency: 'INR', locale: 'en-IN', prices: { classic: 99900, premium: 199900, signature: 299900 } },
  us: { id: 'us', name: 'United States', currency: 'USD', locale: 'en-US', prices: { classic: 1900, premium: 3900, signature: 5900 } },
  gb: { id: 'gb', name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', prices: { classic: 1500, premium: 2900, signature: 4500 } },
  eu: { id: 'eu', name: 'Europe', currency: 'EUR', locale: 'en-IE', prices: { classic: 1700, premium: 3500, signature: 5500 } },
  gulf: { id: 'gulf', name: 'Gulf countries', currency: 'AED', locale: 'en-AE', prices: { classic: 6900, premium: 13900, signature: 21900 } },
  row: { id: 'row', name: 'Rest of the world', currency: 'USD', locale: 'en-US', prices: { classic: 1900, premium: 3900, signature: 5900 } }
});

const EU_COUNTRIES = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
const GULF_COUNTRIES = 'AE SA QA KW OM BH'.split(' ');
const COUNTRY_REGION = Object.freeze({
  IN: 'in',
  US: 'us',
  GB: 'gb',
  ...Object.fromEntries(EU_COUNTRIES.map(code => [code, 'eu'])),
  ...Object.fromEntries(GULF_COUNTRIES.map(code => [code, 'gulf']))
});

export function regionIds() {
  return Object.keys(REGIONS);
}

// "in", "IN" or " in " all mean India. Anything that is not a listed region is not accepted (callers fall back to the country).
export function normalRegion(value) {
  const id = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(REGIONS, id) ? id : null;
}

// Cloudflare gives a two letter country code (and "XX" or "T1" for an unknown place or Tor). Anything unknown is "rest of world".
export function regionForCountry(country) {
  const code = String(country || '').trim().toUpperCase();
  return COUNTRY_REGION[code] || DEFAULT_REGION;
}

export function tierFor(templateId) {
  const tier = TEMPLATE_TIERS[String(templateId || '')];
  return TIERS.some(item => item.id === tier) ? tier : DEFAULT_TIER;
}

// What publishing one design costs in one region. This is what a checkout charges.
export function quote(templateId, regionId) {
  const region = REGIONS[normalRegion(regionId) || DEFAULT_REGION];
  const tier = tierFor(templateId);
  return { templateId: String(templateId || ''), tier, region: region.id, currency: region.currency, amountMinor: region.prices[tier] };
}

// Everything the pages need to show prices for one region.
export function pricingFor(regionId) {
  const region = REGIONS[normalRegion(regionId) || DEFAULT_REGION];
  return {
    region: region.id,
    currency: region.currency,
    locale: region.locale,
    tiers: TIERS.map(tier => ({ id: tier.id, name: tier.name, tagline: tier.tagline, features: [...tier.features], amountMinor: region.prices[tier.id] })),
    templates: { ...TEMPLATE_TIERS }
  };
}
