/* Browser-safe client for the server-side wedding API.
 *
 * This file contains no Supabase secret and never calls the database directly.
 * The edit token is supplied at runtime by the create response or an edit
 * link; it is not embedded in the public frontend bundle.
 */
(function exposeInviteStudioApi() {
  const base = (window.INVITESTUDIO_API_BASE || '/api').replace(/\/$/, '');
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const enabled = !localHost || window.INVITESTUDIO_API_ENABLED === true;

  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error?.message || 'Request failed.');
      error.code = body?.error?.code;
      error.fields = body?.error?.fields;
      error.status = response.status;
      throw error;
    }
    return body;
  }

  window.inviteStudioApi = Object.freeze({
    enabled,
    createWedding(input, idempotencyKey) {
      const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
      return request('/weddings', { method: 'POST', headers, body: JSON.stringify(input) });
    },
    getWedding(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${editToken}` }
      });
    },
    getWeddingByEditToken(editToken) {
      return request('/edit-links', { method: 'POST', body: JSON.stringify({ token: editToken }) });
    },
    // keepalive lets a save started while the page is closing or hidden finish.
    updateWedding(id, editToken, patch, options = {}) {
      return request(`/weddings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${editToken}` },
        body: JSON.stringify(patch),
        keepalive: options.keepalive === true
      });
    },
    deleteWedding(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editToken}` }
      });
    },
    regenerateEditToken(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}/edit-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editToken}` }
      });
    },
    revokeEditTokens(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}/edit-token/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editToken}` }
      });
    },
    publishWedding(id, editToken, version, slug, options = {}) {
      const body = { version, slug, ...(options.confirmSlugChange ? { confirmSlugChange: true } : {}) };
      return request(`/weddings/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editToken}` },
        body: JSON.stringify(body)
      });
    },
    checkSlugAvailability(id, editToken, slug) {
      return request(`/weddings/${encodeURIComponent(id)}/slug-availability?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${editToken}` }
      });
    },
    unpublishWedding(id, editToken, version) {
      return request(`/weddings/${encodeURIComponent(id)}/unpublish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editToken}` },
        body: JSON.stringify({ version })
      });
    },
    getPublishedWedding(slug) {
      return request(`/public-weddings/${encodeURIComponent(slug)}`);
    },
    // Guest replies. The change token is the guest's private link; the edit token is the couple's.
    submitRsvp(slug, reply) {
      return request(`/public-weddings/${encodeURIComponent(slug)}/rsvp`, { method: 'POST', body: JSON.stringify(reply) });
    },
    getRsvp(slug, changeToken) {
      return request(`/public-weddings/${encodeURIComponent(slug)}/rsvp/${encodeURIComponent(changeToken)}`);
    },
    changeRsvp(slug, changeToken, reply) {
      return request(`/public-weddings/${encodeURIComponent(slug)}/rsvp/${encodeURIComponent(changeToken)}`, { method: 'PUT', body: JSON.stringify(reply) });
    },
    listRsvps(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}/rsvps`, { headers: { Authorization: `Bearer ${editToken}` } });
    },
    // When the website is kept until (the editor's notice). Asking also records the date the couple is shown.
    getRetention(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}/retention`, { headers: { Authorization: `Bearer ${editToken}` } });
    },
    // Photos. The upload is a multipart form (the browser sets its content type); the rest is JSON.
    listMedia(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}/media`, { headers: { Authorization: `Bearer ${editToken}` } });
    },
    async uploadMedia(id, editToken, form) {
      const response = await fetch(`${base}/weddings/${encodeURIComponent(id)}/media`, {
        method: 'POST', headers: { Authorization: `Bearer ${editToken}` }, body: form
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body?.error?.message || 'Upload failed.');
        error.code = body?.error?.code; error.fields = body?.error?.fields; error.status = response.status;
        throw error;
      }
      return body;
    },
    reorderMedia(id, editToken, order) {
      return request(`/weddings/${encodeURIComponent(id)}/media`, { method: 'PATCH', headers: { Authorization: `Bearer ${editToken}` }, body: JSON.stringify({ order }) });
    },
    updateMedia(id, editToken, photoId, patch) {
      return request(`/weddings/${encodeURIComponent(id)}/media/${encodeURIComponent(photoId)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${editToken}` }, body: JSON.stringify(patch) });
    },
    deleteMedia(id, editToken, photoId) {
      return request(`/weddings/${encodeURIComponent(id)}/media/${encodeURIComponent(photoId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${editToken}` } });
    },
    deleteRsvp(id, editToken, rsvpId) {
      return request(`/weddings/${encodeURIComponent(id)}/rsvps/${encodeURIComponent(rsvpId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${editToken}` } });
    }
  });
})();
