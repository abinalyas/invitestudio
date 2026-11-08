import { MEDIA_KEY } from '../_shared/media.js';

// Serves stored photos from this site's own /media/ address. Used when no separate media domain is configured
// (MEDIA_PUBLIC_URL); the file names are long random keys and never change, so Cloudflare keeps them for a year.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const key = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!env.MEDIA || !MEDIA_KEY.test(key)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const response = new Response(request.method === 'HEAD' ? null : object.body, {
    headers: {
      'Content-Type': key.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }
  });
  if (cache && request.method === 'GET') context.waitUntil?.(cache.put(request, response.clone()));
  return response;
}
