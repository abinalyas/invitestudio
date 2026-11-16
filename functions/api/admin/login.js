import { adminSettings, loginAddress, randomState, setCookie } from '../../_shared/admin.js';

// Sends the visitor to Google. A random "state" goes in a short-lived cookie and comes back from Google, so only a
// sign-in that this browser started can finish.
export async function onRequest({ request, env }) {
  const settings = adminSettings(env);
  if (!settings) return new Response('The admin page is not set up yet.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const state = randomState();
  return new Response(null, {
    status: 302,
    headers: { Location: loginAddress(request, settings, state), 'Set-Cookie': setCookie(request.url, 'is_admin_state', state, 600), 'Cache-Control': 'no-store' }
  });
}
