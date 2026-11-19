import { SECURITY_HEADERS } from './_shared/security.js';

// Draft preview entry point: /draft#<token> (docs/DRAFT_PREVIEW.md). The token is in the fragment, so the browser never
// sends it to this function, to Cloudflare logs or in a Referer. The page is never indexed, and its link preview names
// no couple: it only says it is a draft preview made with InviteStudio.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  const shell = new URL(request.url);
  shell.pathname = '/index.html';
  shell.search = '';
  const asset = await env.ASSETS.fetch(new Request(shell, { method: 'GET' }));
  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Cache-Control', 'no-cache');
  const title = 'Draft invitation preview — InviteStudio';
  const description = 'A wedding invitation still being made with InviteStudio. Free to build and preview your own.';
  const meta = [
    '<meta name="robots" content="noindex,nofollow"/>',
    `<meta name="description" content="${description}"/>`,
    '<meta property="og:type" content="website"/>',
    '<meta property="og:site_name" content="InviteStudio"/>',
    `<meta property="og:title" content="${title}"/>`,
    `<meta property="og:description" content="${description}"/>`,
    `<meta property="og:url" content="${url.origin}/draft"/>`,
    '<meta name="twitter:card" content="summary"/>'
  ].join('');
  return new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('head', { element(element) { element.append(meta, { html: true }); } })
    .transform(new Response(asset.body, { status: asset.status, headers }));
}
