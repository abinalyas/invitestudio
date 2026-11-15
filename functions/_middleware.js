import { headTags, isPrivateHost, originFor, pageFor, staticContent } from './_shared/seo.js';

// Gives each public marketing page (/, /templates, /templates/<id>) its own title, description, canonical address, social card,
// structured data and plain-HTML content (functions/_shared/seo.js). Every other request passes straight through untouched.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();
  const url = new URL(request.url);
  const page = pageFor(url.pathname);
  if (!page) return context.next();

  const response = await context.next();
  if (response.status !== 200 || !(response.headers.get('Content-Type') || '').includes('text/html')) return response;

  const origin = originFor(env);
  const { title, html } = headTags(page, origin);
  const headers = new Headers(response.headers);
  if (isPrivateHost(url.hostname)) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('head', { element(element) { element.append(html, { html: true }); } })
    .on('#app', { element(element) { element.append(staticContent(page, origin), { html: true }); } })
    .transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}
