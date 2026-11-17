import { SECURITY_HEADERS } from './_shared/security.js';
import { replayFor, replayMeta, withReplayPolicy } from './_shared/replay.js';
import { headTags, isPrivateHost, landingDocument, originFor, pageFor, policyDocument, staticContent } from './_shared/seo.js';

// Gives each public marketing page (/, /templates, /templates/<id>) and serves the search-intent landing pages (functions/_shared/landing.js) its own title, description, canonical address, social card,
// structured data and plain-HTML content (functions/_shared/seo.js). Every other request passes straight through untouched.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();
  const url = new URL(request.url);
  const page = pageFor(url.pathname);
  if (!page) return context.next();

  if (page.kind === 'landing' || page.kind === 'policy') {
    // Landing and policy pages are complete server-rendered documents, so they do not go through the application shell.
    const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    if (isPrivateHost(url.hostname)) headers.set('X-Robots-Tag', 'noindex, nofollow');
    // Session recordings (docs/REPLAY.md) are offered on search landing pages only, never on the policy pages.
    const replay = replayFor(env, page.kind, request.cf?.country);
    if (replay && headers.get('Content-Security-Policy')) headers.set('Content-Security-Policy', withReplayPolicy(headers.get('Content-Security-Policy')));
    return new Response(request.method === 'HEAD' ? null : (page.kind === 'policy' ? policyDocument : landingDocument)(page, originFor(env), { replay }), { status: 200, headers });
  }

  const response = await context.next();
  if (response.status !== 200 || !(response.headers.get('Content-Type') || '').includes('text/html')) return response;

  const origin = originFor(env);
  const { title, html } = headTags(page, origin);
  const headers = new Headers(response.headers);
  if (isPrivateHost(url.hostname)) headers.set('X-Robots-Tag', 'noindex, nofollow');
  // The recording script is only offered on these marketing pages, and only where the visitor's country allows it (docs/REPLAY.md).
  const replay = replayFor(env, page.kind, request.cf?.country);
  if (replay && headers.get('Content-Security-Policy')) headers.set('Content-Security-Policy', withReplayPolicy(headers.get('Content-Security-Policy')));
  return new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('head', { element(element) { element.append(html + replayMeta(replay), { html: true }); } })
    .on('#app', { element(element) { element.append(staticContent(page, origin), { html: true }); } })
    .transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}
