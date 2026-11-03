/* Browser-safe client for the server-side wedding API.
 *
 * This file contains no Supabase secret and never calls the database directly.
 * The edit token is supplied at runtime by the create response or an edit
 * link; it is not embedded in the public frontend bundle.
 */
(function exposeInviteStudioApi() {
  const base = (window.INVITESTUDIO_API_BASE || '/api').replace(/\/$/, '');

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
    createWedding(input) {
      return request('/weddings', { method: 'POST', body: JSON.stringify(input) });
    },
    getWedding(id, editToken) {
      return request(`/weddings/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${editToken}` }
      });
    },
    updateWedding(id, editToken, patch) {
      return request(`/weddings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${editToken}` },
        body: JSON.stringify(patch)
      });
    },
    publishWedding(id, editToken, version, slug) {
      return request(`/weddings/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${editToken}` },
        body: JSON.stringify({ version, slug })
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
    }
  });
})();
