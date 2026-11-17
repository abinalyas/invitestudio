import { db } from '../_shared/api.js';
import { MAX_BODY, classifyUserAgent, cleanEvent, visitorId } from '../_shared/analytics.js';

// POST /api/collect: one anonymous page view from the browser (analytics.js). See docs/ANALYTICS.md.
// It always answers 204 and never an error the page could show: counting visits must never get in a visitor's way.
// Not counted: Do Not Track and Global Privacy Control visitors, robots, requests from another site, and anything malformed.
export async function onRequest({ request, env }) {
  const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return done();
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return done();
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return done();
    const text = await request.text();
    if (text.length > MAX_BODY) return done();
    let body;
    try { body = JSON.parse(text); } catch { return done(); }
    const userAgent = request.headers.get('User-Agent') || '';
    const agent = classifyUserAgent(userAgent);
    if (agent.bot) return done();
    const event = cleanEvent(body, { ownHost: url.hostname });
    if (!event) return done();
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
    const country = String(request.cf?.country || request.headers.get('CF-IPCountry') || '').toUpperCase();
    await db(env, 'analytics_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        ...event,
        country: /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : null,
        device: agent.device, browser: agent.browser, os: agent.os,
        vid: await visitorId(env, ip, userAgent)
      })
    });
  } catch (error) {
    console.error('Visit statistics could not be saved', error?.code || error?.name || 'error');
  }
  return done();
}
