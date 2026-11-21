import { ApiError, fail, rpc, success } from '../../_shared/api.js';
import { deleteWeddingMedia } from '../../_shared/media.js';
import { sameSecret } from './retention-sweep.js';

// The daily cleanup of idle drafts (docs/RETENTION_PLAN.md, "Idle drafts"). This is the only address that deletes a website.
//
// A draft that was never published is deleted once its end date plus the grace period has passed. Every guard below has to
// agree before anything is deleted:
//   1. the secret in RETENTION_SWEEP_TOKEN (the same one as the report address);
//   2. the body {"confirm":"delete-idle-drafts"}: a call without it cannot delete, whatever else is set;
//   3. the master switch retention_settings.draft_deletion_enabled, which starts OFF (off = report only);
//   4. the safety brake: a run that would delete more than brake_limit drafts stops and reports instead;
//   5. the database re-checks each draft at the moment of deleting (with the row locked), so one saved a second ago stays.
// Each deletion removes the database row first (the one that matters), then the stored photos. A photo clean-up that fails
// is reported by id so the files can be removed by hand. Only ids, dates and counts are recorded: no names, replies or photos.

export const CONFIRMATION = 'delete-idle-drafts';
const MAX_CONSECUTIVE_ERRORS = 3;

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const expected = typeof env.RETENTION_SWEEP_TOKEN === 'string' ? env.RETENTION_SWEEP_TOKEN.trim() : '';
    if (expected.length < 32) throw new ApiError('The cleanup is not set up.', 503, 'RETENTION_NOT_CONFIGURED');
    const given = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!given || !(await sameSecret(given, expected))) throw new ApiError('Not allowed.', 401, 'UNAUTHORIZED');

    let body = null;
    try { body = await request.json(); } catch { body = null; }
    if (!body || body.confirm !== CONFIRMATION) {
      throw new ApiError('Send {"confirm":"delete-idle-drafts"} to run the cleanup.', 422, 'CONFIRMATION_REQUIRED');
    }

    const plan = await rpc(env, 'retention_draft_plan', {});
    const summary = { asOf: plan.asOf, eligible: plan.eligible, deleted: 0, skipped: 0, errors: 0, mediaFailed: [] };

    if (!plan.enabled) {
      await rpc(env, 'retention_record_run', { p_dry_run: true, p_summary: { ...summary, draftDeletion: 'off' } });
      return success(request, env, { enabled: false, braked: false, ...summary });
    }

    // The brake counts what this run would delete, not everything that is due.
    const wouldDelete = Math.min(plan.eligible, plan.batchLimit);
    if (wouldDelete > plan.brakeLimit) {
      await rpc(env, 'retention_record_run', { p_dry_run: true, p_summary: { ...summary, draftDeletion: 'braked', wouldDelete, brakeLimit: plan.brakeLimit } });
      return success(request, env, { enabled: true, braked: true, wouldDelete, brakeLimit: plan.brakeLimit, ...summary });
    }

    let consecutiveErrors = 0;
    for (const id of plan.ids) {
      let deleted;
      try {
        deleted = await rpc(env, 'retention_delete_draft', { p_wedding_id: id });
        consecutiveErrors = 0;
      } catch (error) {
        summary.errors += 1;
        consecutiveErrors += 1;
        console.error('InviteStudio draft cleanup failed for one draft', error?.code || error?.message);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
        continue;
      }
      if (deleted !== true) { summary.skipped += 1; continue; }
      summary.deleted += 1;
      try {
        await deleteWeddingMedia(env, id);
      } catch (error) {
        summary.mediaFailed.push(id);
        console.error('InviteStudio draft photo cleanup failed', error?.message);
      }
    }

    await rpc(env, 'retention_record_run', { p_dry_run: false, p_summary: { ...summary, draftDeletion: 'on' } });
    return success(request, env, { enabled: true, braked: false, ...summary });
  } catch (error) {
    return fail(request, env, error);
  }
}
