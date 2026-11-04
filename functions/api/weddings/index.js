import {
  ApiError,
  CREATE_REPLAY_WINDOW_MS,
  db,
  fail,
  findCreateReplay,
  getWedding,
  hashEditToken,
  idempotencyKeyFromRequest,
  issueEditToken,
  optionsResponse,
  readJson,
  requireSupabase,
  revokeEditTokens,
  success,
  validateWeddingInput
} from '../../_shared/api.js';

const CREATE_WARNING = 'Store this edit token securely. It is returned only once.';

async function assertActiveTemplate(env, templateId) {
  const templateQuery = new URLSearchParams({
    select: 'id',
    id: `eq.${templateId}`,
    is_active: 'eq.true',
    limit: '1'
  });
  const templates = await db(env, `templates?${templateQuery}`);
  if (!templates?.[0]) {
    throw new ApiError('Selected template is not available.', 422, 'VALIDATION_ERROR', {
      templateId: 'Choose an active template.'
    });
  }
}

// A repeated create with the same key is the same draft. The first response was
// presumably lost, so the latest validated payload is applied to that draft (the
// client may have edited while it was retrying), older tokens are revoked, and a
// fresh token is returned to the caller.
async function replayCreate(request, env, existing, keyHash, weddingInput) {
  if (Date.now() - Date.parse(existing.created_at) > CREATE_REPLAY_WINDOW_MS) {
    throw new ApiError('This draft creation can no longer be repeated. Start a new website.', 409, 'CREATE_REPLAY_EXPIRED');
  }
  const current = await getWedding(env, existing.wedding_id);
  const rows = await db(env, `weddings?id=eq.${current.id}&version=eq.${current.version}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(weddingInput)
  });
  if (!rows?.[0]) {
    throw new ApiError('The draft changed while it was being created. Reload before continuing.', 409, 'VERSION_CONFLICT');
  }
  await revokeEditTokens(env, current.id);
  const issued = await issueEditToken(env, current.id, { createRequestHash: keyHash, replayed: true });
  return success(request, env, {
    wedding: rows[0],
    editToken: issued.editToken,
    editTokenExpiresAt: issued.editTokenExpiresAt,
    replayed: true,
    warning: CREATE_WARNING
  }, 200);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    requireSupabase(env);
    if (request.method !== 'POST') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }

    const idempotencyKey = idempotencyKeyFromRequest(request);
    const keyHash = idempotencyKey ? await hashEditToken(idempotencyKey) : null;
    const body = await readJson(request);
    const weddingInput = validateWeddingInput(body, { create: true });
    await assertActiveTemplate(env, weddingInput.template_id);

    if (keyHash) {
      const existing = await findCreateReplay(env, keyHash);
      if (existing) return await replayCreate(request, env, existing, keyHash, weddingInput);
    }

    const rows = await db(env, 'weddings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ...weddingInput,
        owner_id: null,
        ownership_mode: 'anonymous',
        status: 'draft',
        visibility: 'private'
      })
    });
    const wedding = rows?.[0];
    if (!wedding) throw new ApiError('Wedding draft could not be created.', 502, 'CREATE_FAILED');

    try {
      const issued = await issueEditToken(env, wedding.id, keyHash ? { createRequestHash: keyHash } : {});
      return success(request, env, {
        wedding,
        editToken: issued.editToken,
        editTokenExpiresAt: issued.editTokenExpiresAt,
        warning: CREATE_WARNING
      }, 201);
    } catch (error) {
      await db(env, `weddings?id=eq.${wedding.id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      throw error;
    }
  } catch (error) {
    return fail(request, env, error);
  }
}
