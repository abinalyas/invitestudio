/*
 * Small browser integration boundary. The editor remains in local/demo mode
 * until repository methods are connected to authenticated Supabase queries.
 * Keeping client creation here prevents Supabase details spreading through the
 * view and rendering functions in index.html.
 */
(function initialiseInviteStudioBackend() {
  const config = window.INVITESTUDIO_SUPABASE_CONFIG || {};
  const sdk = window.supabase;
  const hasConfig = Boolean(config.url && config.publishableKey);

  if (!hasConfig || !sdk?.createClient) {
    window.inviteStudioBackend = Object.freeze({
      mode: 'local',
      configured: false,
      client: null,
      config: Object.freeze({ url: config.url || '' })
    });
    return;
  }

  const client = sdk.createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  window.inviteStudioBackend = Object.freeze({
    mode: 'supabase',
    configured: true,
    client,
    config: Object.freeze({ url: config.url })
  });
})();
