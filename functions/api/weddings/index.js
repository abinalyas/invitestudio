import {
  ApiError,
  db,
  fail,
  issueEditToken,
  optionsResponse,
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

    try {
      const issued = await issueEditToken(env, wedding.id);
      return success(request, env, {
        wedding,
        editToken: issued.editToken,
        editTokenExpiresAt: issued.editTokenExpiresAt,
        warning: 'Store this edit token securely. It is returned only once.'
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
