import { ApiError, fail, optionsResponse, readJson, success } from '../../../../_shared/api.js';
import {
  RATE_CHANGES_PER_SOURCE_PER_HOUR,
  assertAccepting,
  assertChangeToken,
  enforceRateLimit,
  findReplyByToken,
  loadPublishedWedding,
  publicReply,
  updateReply,
  validateReply
} from '../../../../_shared/rsvp.js';

// GET reads the guest's own reply with their private link; PUT changes it. Only the link holder can do either.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'GET' && request.method !== 'PUT') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const token = assertChangeToken(params.token);
    const { wedding, settings, events } = await loadPublishedWedding(env, params.slug);
    await enforceRateLimit(request, env, wedding.id, { kind: 'change', perSource: RATE_CHANGES_PER_SOURCE_PER_HOUR });
    const row = await findReplyByToken(env, wedding.id, token);
    if (request.method === 'GET') {
      let closed = false;
      try { assertAccepting(settings); } catch { closed = true; }
      return success(request, env, { reply: publicReply(row), closed });
    }
    assertAccepting(settings);
    const checked = validateReply(await readJson(request), { settings, events });
    if (checked.fields) throw new ApiError('Please check your reply.', 422, 'VALIDATION_ERROR', checked.fields);
    return success(request, env, { reply: publicReply(await updateReply(env, row, checked.value)) });
  } catch (error) {
    return fail(request, env, error);
  }
}
