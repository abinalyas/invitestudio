import { setCookie } from '../../_shared/admin.js';

export async function onRequest({ request }) {
  return new Response(null, { status: 204, headers: { 'Set-Cookie': setCookie(request.url, 'is_admin', '', 0), 'Cache-Control': 'no-store' } });
}
