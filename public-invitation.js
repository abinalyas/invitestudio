/* Public invitation page (/s/<slug>).
 *
 * Read-only. It fetches the allowlisted public projection and renders it with the
 * same invitation design the editor previews use. It never reads localStorage
 * drafts, never sends an edit token, and shows no editing controls.
 */
(function installPublicInvitation() {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  // null: not a public route. A string: a /s/ route, valid or not (validated later).
  window.parsePublicSlug = function parsePublicSlug() {
    const match = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]).toLowerCase();
    } catch {
      return '';
    }
  };

  // Maps the public projection onto the project shape the invitation renderer uses.
  // Photos are not included: they are metadata only until the media phase.
  function projectFromPublic(wedding) {
    const content = wedding.content && typeof wedding.content === 'object' ? wedding.content : {};
    return {
      id: wedding.slug,
      name: wedding.name,
      category: wedding.category,
      templateId: wedding.template_id,
      title: wedding.title,
      date: wedding.event_date || '',
      location: wedding.location || '',
      message: wedding.message || '',
      story: wedding.story || '',
      hosts: wedding.hosts || '',
      locale: wedding.locale || 'English',
      theme: wedding.theme || {},
      preferences: { gallery: (content.gallery && content.gallery.preference) || 'gallery' },
      // An empty list means the couple has not customised sections: use the editor's defaults.
      sections: Array.isArray(wedding.sections) && wedding.sections.length ? wedding.sections : undefined,
      functions: Array.isArray(content.functions) ? content.functions : [],
      copy: content.copy && typeof content.copy === 'object' ? content.copy : {},
      photos: [],
      introSettings: wedding.intro_settings || {},
      animationSettings: wedding.animation_settings || {},
      status: 'Published',
      published: true,
      updated: wedding.published_at || ''
    };
  }

  window.loadPublicInvitation = async function loadPublicInvitation(slug) {
    state.publicInvitation = { status: 'loading', slug, data: null };
    render();
    if (!slugPattern.test(slug || '') || !window.inviteStudioApi) {
      state.publicInvitation = { status: 'not-found', slug, data: null };
      render();
      return;
    }
    try {
      const data = await window.inviteStudioApi.getPublishedWedding(slug);
      state.publicInvitation = { status: 'ready', slug, data };
    } catch (error) {
      state.publicInvitation = { status: error.status === 404 ? 'not-found' : 'error', slug, data: null };
    }
    render();
  };

  window.publicPageHtml = function publicPageHtml() {
    const view = state.publicInvitation || { status: 'loading' };
    const header = '<header class="topbar"><a class="brand" href="/" style="text-decoration:none">Invite<span>Studio</span></a></header>';
    const centred = inner => `<main class="container" style="padding:80px 0;text-align:center;max-width:620px">${inner}</main>`;
    let body;
    if (view.status === 'ready') {
      const project = projectFromPublic(view.data.wedding);
      body = `<div class="published-page" data-public-invitation>${sitePreview(project, tpl(project.templateId), true)}</div>`;
    } else if (view.status === 'loading') {
      body = centred('<p class="muted">Loading invitation…</p>');
    } else if (view.status === 'error') {
      body = centred('<h1 style="font-family:var(--serif);font-size:34px">We could not load this invitation.</h1><p class="muted">Check your connection and try again.</p><button class="btn dark" onclick="loadPublicInvitation(state.publicInvitation.slug)">Try again</button>');
    } else {
      body = centred('<h1 style="font-family:var(--serif);font-size:34px">This invitation is not available.</h1><p class="muted">The link may be incorrect, or the invitation is not published right now.</p><a class="btn dark" href="/">Create an InviteStudio website</a>');
    }
    return header + body;
  };
})();
