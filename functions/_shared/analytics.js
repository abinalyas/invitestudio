// Visit statistics, first-party and anonymous (docs/ANALYTICS.md). Nothing here stores an address or a user-agent string: the
// browser kind is read from the user-agent on the server and the string is thrown away; the visitor is a hash (IP + browser + a
// salt that changes every day) that can count visitors within a day but cannot follow anyone across days or be reversed.

export const MAX_BODY = 2048;

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|phantom|python|curl|wget|java\/|okhttp|scrapy|httpclient/i;

// "Mobile Safari on an iPhone" -> { device, browser, os, bot }. A rough, honest classification, not a fingerprint.
export function classifyUserAgent(ua) {
  const text = String(ua || '');
  const bot = !text || BOT.test(text);
  let device = 'desktop';
  if (/iPad|Tablet|PlayBook|Silk/i.test(text) || (/Android/i.test(text) && !/Mobile/i.test(text))) device = 'tablet';
  else if (/Mobi|iPhone|iPod|Android/i.test(text)) device = 'mobile';
  let browser = 'Other';
  if (/Instagram/i.test(text)) browser = 'Instagram app';
  else if (/FBAN|FBAV|FB_IAB/i.test(text)) browser = 'Facebook app';
  else if (/Edg(e|A|iOS)?\//.test(text)) browser = 'Edge';
  else if (/SamsungBrowser/i.test(text)) browser = 'Samsung Internet';
  else if (/OPR\/|Opera/i.test(text)) browser = 'Opera';
  else if (/Firefox|FxiOS/i.test(text)) browser = 'Firefox';
  else if (/Chrome|CriOS|Chromium/i.test(text)) browser = 'Chrome';
  else if (/Safari/i.test(text)) browser = 'Safari';
  let os = 'Other';
  if (/iPhone|iPad|iPod/i.test(text)) os = 'iOS';
  else if (/Android/i.test(text)) os = 'Android';
  else if (/CrOS/i.test(text)) os = 'ChromeOS';
  else if (/Windows/i.test(text)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(text)) os = 'macOS';
  else if (/Linux|X11/i.test(text)) os = 'Linux';
  return { device, browser, os, bot };
}

export function screenBucket(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (w < 360) return 'under 360';
  if (w < 480) return '360-479';
  if (w < 768) return '480-767';
  if (w < 1024) return '768-1023';
  if (w < 1440) return '1024-1439';
  return '1440 and up';
}

// Only the page itself is kept: no query, no fragment (a private link lives in the fragment, an old one in /edit/<token>).
export function cleanPath(value) {
  let path = String(value || '').split('#')[0].split('?')[0].trim();
  if (!path.startsWith('/')) return null;
  path = path.replace(/\/+$/, '') || '/';
  if (/^\/edit(\/|$)/.test(path)) path = '/edit';
  if (/^\/admin(\/|$)/.test(path) || /^\/api(\/|$)/.test(path)) return null;
  if (!/^\/[A-Za-z0-9/_.-]{0,100}$/.test(path)) return null;
  return path;
}

export function slugOf(path) {
  const match = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path || '');
  return match && match[1].length <= 60 ? match[1] : null;
}

// The referring site's name only (never a full address), and nothing for our own pages.
export function referrerHost(value, ownHost) {
  try {
    const host = new URL(String(value || '')).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === String(ownHost || '').replace(/^www\./, '').toLowerCase()) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

function tag(value, max) {
  const text = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9 _.\-+]/g, '').slice(0, max);
  return text || null;
}

export function cleanLang(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(text) ? text.slice(0, 12) : null;
}

// A hash that changes every day: today's salt + the address + the browser. It is never stored with either.
export async function visitorId(env, ip, userAgent, now = new Date()) {
  const salt = String(env.ANALYTICS_SALT || env.ADMIN_SESSION_SECRET || 'invitestudio').trim();
  const day = now.toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${day}|${ip}|${userAgent}`));
  return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

// What the browser reports about a visit, checked and trimmed. Returns null for anything that should not be counted.
export function cleanEvent(input, { ownHost } = {}) {
  if (!input || typeof input !== 'object' || input.e !== 'pageview') return null;
  const path = cleanPath(input.p);
  if (!path) return null;
  return {
    kind: 'pageview',
    path,
    slug: slugOf(path),
    referrer: referrerHost(input.r, ownHost),
    utm_source: tag(input.us, 60), utm_medium: tag(input.um, 60), utm_campaign: tag(input.uc, 80),
    screen: screenBucket(input.w),
    lang: cleanLang(input.l)
  };
}
