import { sitemapXml } from './_shared/seo.js';

export function onRequestGet({ request, env }) {
  return new Response(sitemapXml(env.PUBLIC_ORIGIN || new URL(request.url).origin), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
}
