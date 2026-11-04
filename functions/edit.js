import { SECURITY_HEADERS } from './_shared/security.js';

// Private editing entry point: /edit#<token>. The token is in the fragment, so the
// browser never sends it to this function, to Cloudflare logs or in a Referer. The
// function only serves the application shell; cloud-sync.js reads the fragment.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  url.pathname = '/index.html';
  url.search = '';
  const asset = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(asset.body, { status: asset.status, headers });
}
