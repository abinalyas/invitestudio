import { robotsTxt } from './_shared/seo.js';

export function onRequestGet({ request, env }) {
  return new Response(robotsTxt(env.PUBLIC_ORIGIN || new URL(request.url).origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
}
