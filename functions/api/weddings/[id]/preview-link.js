import {
  ApiError,
  assertUuid,
  fail,
  issuePreviewToken,
  optionsResponse,
  requireEditAccess,
  revokePreviewTokens,
  success
} from '../../../_shared/api.js';

// The couple's draft preview link (docs/DRAFT_PREVIEW.md). POST makes a new link and turns off any earlier one,
// so there is only ever one working preview link per draft. DELETE turns it off ("Stop sharing").
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'POST' && request.method !== 'DELETE') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    const id = params.id;
    assertUuid(id);
    await requireEditAccess(request, env, id);
    if (request.method === 'DELETE') {
      return success(request, env, { revoked: await revokePreviewTokens(env, id) });
    }
    const issued = await issuePreviewToken(env, id);
    await revokePreviewTokens(env, id, issued.tokenHash);
    return success(request, env, { previewToken: issued.previewToken, previewExpiresAt: issued.previewExpiresAt });
  } catch (error) {
    return fail(request, env, error);
  }
}
