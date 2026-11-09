import { ApiError, fail, rpc, success } from '../../_shared/api.js';

// The daily cleanup, step 1 of docs/RETENTION_PLAN.md: a DRY RUN. It reports which websites have ended, which are in the
// grace period and which would be deleted, records a one-line summary, and changes nothing. There is no code here that
// hides or deletes a website; that arrives in a later step, behind its own switch.
//
// Called by a scheduled job (and by hand) with the secret in RETENTION_SWEEP_TOKEN. Without the secret set, the address
// does nothing at all.

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// Compares two secrets without revealing, through timing, how much of a guess was right.
export async function sameSecret(given, expected) {
  const [a, b] = await Promise.all([sha256(String(given)), sha256(String(expected))]);
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const expected = typeof env.RETENTION_SWEEP_TOKEN === 'string' ? env.RETENTION_SWEEP_TOKEN.trim() : '';
    if (expected.length < 32) throw new ApiError('The cleanup is not set up.', 503, 'RETENTION_NOT_CONFIGURED');
    const given = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!given || !(await sameSecret(given, expected))) throw new ApiError('Not allowed.', 401, 'UNAUTHORIZED');

    const preview = await rpc(env, 'retention_preview', { p_limit: 200 });
    const summary = { asOf: preview.asOf, totals: preview.totals, publishLeadMonths: preview.publishLeadMonths };
    await rpc(env, 'retention_record_run', { p_dry_run: true, p_summary: summary });
    return success(request, env, { dryRun: true, ...preview });
  } catch (error) {
    return fail(request, env, error);
  }
}
