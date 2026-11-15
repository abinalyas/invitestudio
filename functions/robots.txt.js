import { robotsTxt, isPrivateHost, originFor } from './_shared/seo.js';

export function onRequestGet({ request, env }) {
  return new Response(robotsTxt(originFor(env), { blockAll: isPrivateHost(new URL(request.url).hostname) }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
}
