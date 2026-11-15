import { sitemapXml, originFor } from './_shared/seo.js';

export function onRequestGet({ request, env }) {
  return new Response(sitemapXml(originFor(env)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
}
