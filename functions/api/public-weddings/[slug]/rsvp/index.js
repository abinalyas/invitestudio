import { ApiError, fail, optionsResponse, readJson, success } from '../../../../_shared/api.js';
import {
  RATE_PER_SOURCE_PER_HOUR,
  RATE_PER_WEDDING_PER_HOUR,
  assertAccepting,
  createReply,
  enforceRateLimit,
  loadPublishedWedding,
  publicReply,
  validateReply
} from '../../../../_shared/rsvp.js';

// POST /api/public-weddings/:slug/rsvp: a guest sends a reply and gets a private link to change it later.
export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    const body = await readJson(request);
    const { wedding, settings, events } = await loadPublishedWedding(env, params.slug);
    // A filled hidden field means a bot. Answer as if it worked, and store nothing.
    if (typeof body.website === 'string' && body.website.trim()) {
      return success(request, env, { reply: { name: '', attending: false, party: 0, events: {}, needs: '', message: '' }, changeToken: 'x'.repeat(43) }, 201);
    }
    await enforceRateLimit(request, env, wedding.id, { kind: 'new', perSource: RATE_PER_SOURCE_PER_HOUR, perWedding: RATE_PER_WEDDING_PER_HOUR });
    assertAccepting(settings);
    const checked = validateReply(body, { settings, events });
    if (checked.fields) throw new ApiError('Please check your reply.', 422, 'VALIDATION_ERROR', checked.fields);
    const { row, token } = await createReply(env, wedding, checked.value);
    return success(request, env, { reply: publicReply(row), changeToken: token }, 201);
  } catch (error) {
    return fail(request, env, error);
  }
}
