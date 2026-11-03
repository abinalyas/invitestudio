import {
  ApiError,
  assertUuid,
  db,
  fail,
  getWedding,
  issueEditToken,
  maskEmailAddress,
  optionsResponse,
  readJson,
  requireEditAccess,
  revokeEditTokenHash,
  sendPrivateEditEmail,
  success,
  validateEmailAddress
} from '../../../../_shared/api.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return optionsResponse(request, env);
  try {
    if (request.method !== 'POST') {
      throw new ApiError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }
    const id = params.id;
    assertUuid(id);
    await requireEditAccess(request, env, id);
    const body = await readJson(request);
    const email = validateEmailAddress(body.email);
    const wedding = await getWedding(env, id);

    await db(env, `weddings?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ recovery_email: email })
    });

    const issued = await issueEditToken(env, id);
    try {
      await sendPrivateEditEmail(request, env, {
        to: email,
        title: wedding.title || wedding.name,
        token: issued.editToken
      });
    } catch (error) {
      await revokeEditTokenHash(env, issued.tokenHash);
      throw error;
    }

    return success(request, env, {
      sentTo: maskEmailAddress(email),
      editTokenExpiresAt: issued.editTokenExpiresAt,
      message: 'Your private editing link has been sent.'
    });
  } catch (error) {
    return fail(request, env, error);
  }
}
