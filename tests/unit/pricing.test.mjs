import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIERS, TEMPLATE_TIERS, REGIONS, DEFAULT_REGION, regionForCountry, normalRegion, tierFor, quote, pricingFor, regionIds } from '../../functions/_shared/pricing.js';
import { onRequest, countryOf } from '../../functions/api/pricing.js';

const offered = () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  return [...html.match(/const offeredTemplateIds=\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};
const get = (url, { country, headers = {} } = {}) => {
  const request = new Request(url, { headers });
  if (country !== undefined) Object.defineProperty(request, 'cf', { value: { country } });
  return onRequest({ request, env: {}, params: {} });
};

test('every design that is offered has a tier, and every tier has a whole-number price in every region', () => {
  for (const id of offered()) assert.ok(TEMPLATE_TIERS[id], `${id} has a tier`);
  assert.deepEqual(Object.keys(TEMPLATE_TIERS).filter(id => !offered().includes(id)), [], 'no tier is kept for a design that is not offered');
  for (const region of Object.values(REGIONS)) {
    assert.match(region.currency, /^[A-Z]{3}$/);
    for (const tier of TIERS) {
      const price = region.prices[tier.id];
      assert.ok(Number.isInteger(price) && price > 0, `${region.id} ${tier.id}`);
    }
    // A dearer tier never costs the same or less than a cheaper one.
    assert.ok(region.prices.classic < region.prices.premium && region.prices.premium < region.prices.signature, `${region.id} tiers rise`);
  }
});

test('a visitor\'s country maps to a region; anything unknown pays the rest-of-world price, never nothing', () => {
  assert.equal(regionForCountry('IN'), 'in');
  assert.equal(regionForCountry('in'), 'in');
  assert.equal(regionForCountry(' us '), 'us');
  assert.equal(regionForCountry('GB'), 'gb');
  assert.equal(regionForCountry('DE'), 'eu');
  assert.equal(regionForCountry('IE'), 'eu');
  assert.equal(regionForCountry('AE'), 'gulf');
  assert.equal(regionForCountry('SA'), 'gulf');
  for (const unknown of ['', undefined, null, 'XX', 'T1', 'ZZ', 'NOT A COUNTRY', '<script>']) assert.equal(regionForCountry(unknown), DEFAULT_REGION);
  assert.equal(normalRegion('IN'), 'in');
  assert.equal(normalRegion('__proto__'), null);
  assert.equal(normalRegion('toString'), null);
  assert.equal(normalRegion('mars'), null);
});

test('a design that is not listed is Classic, so a new design is never free by accident; a quote carries tier, currency and amount', () => {
  assert.equal(tierFor('brand-new-design'), 'classic');
  assert.equal(tierFor(undefined), 'classic');
  assert.equal(tierFor('__proto__'), 'classic');
  assert.deepEqual(quote('velvet-reveal', 'in'), { templateId: 'velvet-reveal', tier: 'signature', region: 'in', currency: 'INR', amountMinor: REGIONS.in.prices.signature });
  assert.deepEqual(quote('minimalist', 'us'), { templateId: 'minimalist', tier: 'classic', region: 'us', currency: 'USD', amountMinor: REGIONS.us.prices.classic });
  assert.equal(quote('cinematic', 'mars').region, DEFAULT_REGION, 'an unknown region is priced as rest of world');
});

test('the page payload has the tiers in order with this region\'s price, and the list of regions for the switcher', () => {
  const data = pricingFor('gb');
  assert.equal(data.currency, 'GBP');
  assert.deepEqual(data.tiers.map(t => t.id), ['classic', 'premium', 'signature']);
  assert.equal(data.tiers[1].amountMinor, REGIONS.gb.prices.premium);
  assert.ok(data.tiers.every(t => t.name && t.tagline && t.features.length >= 3));
  assert.deepEqual(data.regions.map(r => r.id), regionIds());
  assert.equal(data.templates['golden-butterfly'], 'signature');
});

test('GET /api/pricing: the price follows the country Cloudflare reports, and the visitor can pick another region', async () => {
  const india = await (await get('https://x.test/api/pricing', { country: 'IN' })).json();
  assert.equal(india.region, 'in'); assert.equal(india.currency, 'INR'); assert.equal(india.country, 'IN'); assert.equal(india.detected, true);
  const us = await (await get('https://x.test/api/pricing', { country: 'US' })).json();
  assert.equal(us.currency, 'USD');
  assert.notEqual(us.tiers[0].amountMinor, india.tiers[0].amountMinor);
  const header = await (await get('https://x.test/api/pricing', { headers: { 'CF-IPCountry': 'GB' } })).json();
  assert.equal(header.region, 'gb');
  const unknown = await (await get('https://x.test/api/pricing', { country: 'XX' })).json();
  assert.equal(unknown.region, DEFAULT_REGION); assert.equal(unknown.country, '');
  const picked = await (await get('https://x.test/api/pricing?region=EU', { country: 'IN' })).json();
  assert.equal(picked.region, 'eu'); assert.equal(picked.detected, false); assert.equal(picked.country, 'IN');
  assert.equal(countryOf(new Request('https://x.test/', { headers: { 'CF-IPCountry': '<b>' } })), '', 'a malformed country is ignored');
});

test('GET /api/pricing: prices are never cached or shared between visitors, bad input is refused, and it says whether payments are live', async () => {
  const response = await get('https://x.test/api/pricing', { country: 'IN' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal((await response.json()).mode, 'early-access');
  const live = await onRequest({ request: new Request('https://x.test/api/pricing'), env: { PAYMENTS_MODE: 'live' }, params: {} });
  assert.equal((await live.json()).mode, 'live');
  const bad = await get('https://x.test/api/pricing?region=mars');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'VALIDATION_ERROR');
  const post = await onRequest({ request: new Request('https://x.test/api/pricing', { method: 'POST' }), env: {}, params: {} });
  assert.equal(post.status, 405);
});
