import { llmsTxt, originFor } from './_shared/seo.js';

export function onRequestGet({ request, env }) {
  return new Response(llmsTxt(originFor(env)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
}
