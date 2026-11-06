import { db, requireSupabase, rpc } from '../_shared/api.js';
import { SECURITY_HEADERS } from '../_shared/security.js';

// Public invitation entry point: /s/<slug>. Serves the application shell with
// per-invitation metadata, so link previews (WhatsApp, Facebook, iMessage) work
// without running JavaScript. Only published, public rows are described; anything
// else gets a 404 with noindex and the shell, which shows a "not available" message.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || '')) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

async function publishedSummary(env, slug) {
  if (!SLUG.test(slug)) return null;
  try {
    requireSupabase(env);
  } catch {
    return null;
  }
  const query = new URLSearchParams({
    select: 'title,event_date,location',
    slug: `eq.${slug}`,
    status: 'eq.published',
    visibility: 'eq.public',
    limit: '1'
  });
  const rows = await db(env, `weddings?${query}`);
  return rows?.[0] || null;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const slug = String(params.slug || '').toLowerCase();
  let summary = null;
  try {
    summary = await publishedSummary(env, slug);
  } catch {
    // A failed lookup must not break the page; serve the shell as not available.
    summary = null;
  }

  // A historical address (reserved to a wedding that is published under another address) redirects to the current
  // address with 302 Found, which is a TEMPORARY redirect. It is deliberately not 301: the same wedding may return
  // to one of its own earlier addresses, and a cached 301 would send visitors to the wrong one. Anything else is
  // served as before.
  if (!summary && SLUG.test(slug)) {
    let target = null;
    try {
      const rows = await rpc(env, 'resolve_public_slug', { p_slug: slug });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row?.kind === 'redirect' && row.target_slug && SLUG.test(row.target_slug)) target = row.target_slug;
    } catch {
      target = null;
    }
    if (target) {
      const redirectHeaders = new Headers({ Location: `/s/${target}`, 'Cache-Control': 'no-cache' });
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) redirectHeaders.set(name, value);
      return new Response(null, { status: 302, headers: redirectHeaders });
    }
  }

  const url = new URL(request.url);
  const shellUrl = new URL(request.url);
  shellUrl.pathname = '/index.html';
  shellUrl.search = '';
  const asset = await env.ASSETS.fetch(new Request(shellUrl, { method: 'GET' }));
  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');

  const title = summary ? `${summary.title} — InviteStudio` : 'Invitation not available — InviteStudio';
  const description = summary
    ? [formatDate(summary.event_date), summary.location].filter(Boolean).join(' · ') || 'You are invited.'
    : 'This invitation is not available.';
  const canonical = `${url.origin}/s/${slug}`;
  const metaTags = [
    `<meta name="robots" content="${summary ? 'index,follow' : 'noindex,nofollow'}"/>`,
    `<meta name="description" content="${escapeHtml(description)}"/>`,
    '<meta property="og:type" content="website"/>',
    '<meta property="og:site_name" content="InviteStudio"/>',
    `<meta property="og:title" content="${escapeHtml(title)}"/>`,
    `<meta property="og:description" content="${escapeHtml(description)}"/>`,
    `<meta property="og:url" content="${escapeHtml(canonical)}"/>`,
    '<meta name="twitter:card" content="summary"/>',
    `<link rel="canonical" href="${escapeHtml(canonical)}"/>`
  ].join('');

  const source = new Response(asset.body, { status: summary ? 200 : 404, headers });
  return new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('head', { element(element) { element.append(metaTags, { html: true }); } })
    .transform(source);
}
