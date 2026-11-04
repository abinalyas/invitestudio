// Catch-all for /api routes that do not exist. Without it, unknown API paths fall
// through to the HTML shell and return 200, which hides real errors from clients.
export async function onRequest() {
  return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
