import {
  ApiError,
  db,
  fail,
  optionsResponse,
  randomEditToken,
  hashEditToken,
  readJson,
  requireSupabase,
  success,
  validateWeddingInput
} from '../../_shared/api.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    requireSupabase(env);
    if (request.method !== 'POST') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }

    const body = await readJson(request);
    const weddingInput = validateWeddingInput(body, { create: true });
    const templateQuery = new URLSearchParams({
      select: 'id',
      id: `eq.${weddingInput.template_id}`,
      is_active: 'eq.true',
      limit: '1'
    });
    const templates = await db(env, `templates?${templateQuery}`);
    if (!templates?.[0]) {
      throw new ApiError('Selected template is not available.', 422, 'VALIDATION_ERROR', {
        templateId: 'Choose an active template.'
      });
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

    const editToken = randomEditToken();
    const tokenHash = await hashEditToken(editToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
    try {
      await db(env, 'edit_tokens', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          wedding_id: wedding.id,
          token_hash: tokenHash,
          token_hint: `${editToken.slice(0, 6)}…`,
          purpose: 'edit',
          expires_at: expiresAt
        })
      });
    } catch (error) {
      await db(env, `weddings?id=eq.${wedding.id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      throw error;
    }

    return success(request, env, {
      wedding,
      editToken,
      editTokenExpiresAt: expiresAt,
      warning: 'Store this edit token securely. It is returned only once.'
    }, 201);
  } catch (error) {
    return fail(request, env, error);
  }
}
