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

  // A draft preview link: /draft#<token> (docs/DRAFT_PREVIEW.md). null: not a preview route. '' : a preview route with a malformed
  // token. The token stays in the address bar so the page can be reloaded; it is in the fragment, so it is never sent to a server.
  window.parseDraftPreviewToken = function parseDraftPreviewToken() {
    if (!/^\/draft\/?$/.test(window.location.pathname)) return null;
    let token = window.location.hash.replace(/^#/, '');
    try { token = decodeURIComponent(token); } catch { token = ''; }
    return /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : '';
  };

  // Maps the public projection onto the project shape the invitation renderer uses.
  function projectFromPublic(wedding, photos) {
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
      preferences: {
        gallery: (content.gallery && content.gallery.preference) || 'gallery',
        rsvp: (wedding.rsvp && wedding.rsvp.mode) || 'count',
        rsvpContact: (wedding.rsvp && wedding.rsvp.contact) || null,
        rsvpOpen: !(wedding.rsvp && wedding.rsvp.open === false),
        rsvpReplyBy: (wedding.rsvp && wedding.rsvp.replyBy) || '',
        rsvpMaxParty: wedding.rsvp && Number.isInteger(wedding.rsvp.maxParty) ? wedding.rsvp.maxParty : undefined
      },
      // An empty list means the couple has not customised sections: use the editor's defaults.
      sections: Array.isArray(wedding.sections) && wedding.sections.length ? wedding.sections : undefined,
      functions: Array.isArray(content.functions) ? content.functions : [],
      copy: content.copy && typeof content.copy === 'object' ? content.copy : {},
      photos: (Array.isArray(photos) ? photos : []).map(photo => ({ id: photo.id, alt: photo.alt || '', width: photo.width, height: photo.height, data: photo.full, thumb: photo.thumb, slot: photo.slot || '' })),
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
      // Fetch only the design this invitation uses (template-loader.js), then show the page.
      const project = projectFromPublic(data.wedding, data.photos);
      const design = typeof tpl === 'function' ? tpl(project.templateId) : null;
      if (design && window.InviteTemplates) await window.InviteTemplates.need(design);
      state.publicInvitation = { status: 'ready', slug, data };
    } catch (error) {
      state.publicInvitation = { status: error.status === 404 ? 'not-found' : error.status === 410 ? 'ended' : 'error', slug, data: null };
    }
    render();
  };

  window.loadDraftPreview = async function loadDraftPreview(token) {
    state.publicInvitation = { status: 'loading', preview: true, token, data: null };
    render();
    if (!token || !window.inviteStudioApi) {
      state.publicInvitation = { status: 'not-found', preview: true, token, data: null };
      render();
      return;
    }
    try {
      const data = await window.inviteStudioApi.getDraftPreview(token);
      const project = projectFromPublic(data.wedding, data.photos);
      const design = typeof tpl === 'function' ? tpl(project.templateId) : null;
      if (design && window.InviteTemplates) await window.InviteTemplates.need(design);
      state.publicInvitation = { status: 'ready', preview: true, token, data };
    } catch (error) {
      state.publicInvitation = { status: error.status === 404 ? 'not-found' : error.status === 410 ? 'ended' : 'error', preview: true, token, data: null };
    }
    render();
  };

  // What someone opening a draft preview sees around the invitation: a banner that says it is not the final invitation (and
  // invites them to make their own), and a watermark across the whole page, so a draft is never used as the real website.
  const PREVIEW_CTA = '/?utm_source=draft-preview&utm_medium=banner&utm_campaign=share-draft';
  function watermarkImage() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260" viewBox="0 0 420 260">'
      + '<g transform="rotate(-24 210 130)" font-family="Helvetica,Arial,sans-serif" font-weight="700" fill="#3a2a22" fill-opacity=".11" stroke="#fff" stroke-opacity=".16" stroke-width="1">'
      + '<text x="210" y="122" text-anchor="middle" font-size="30" letter-spacing="6">DRAFT PREVIEW</text>'
      + '<text x="210" y="156" text-anchor="middle" font-size="15" letter-spacing="4">MADE WITH INVITESTUDIO</text>'
      + '</g></svg>';
    // Dark letters with a faint light outline, so the mark shows on light and dark sections alike.
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  function previewChrome(view) {
    const live = view.data && view.data.preview && view.data.preview.liveSlug;
    const note = live
      ? `<strong>This is an old draft.</strong> <span class="dp-long">The invitation is live now:</span> <a class="dp-live" href="/s/${esc(live)}">open the invitation</a>`
      : '<strong>Not the final invitation.</strong> <span class="dp-long">Details may still change, and replies open once it is published.</span>';
    const css = `<style>
.dp-banner{position:sticky;top:0;z-index:2147482000;display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;justify-content:space-between;padding:10px max(16px,3vw);background:#1d2a22;color:#f4efe8;font:400 14px/1.4 "DM Sans",system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18)}
.dp-banner a{color:inherit}
.dp-left{display:flex;align-items:center;gap:10px;min-width:0;flex:1 1 320px}
.dp-tag{flex:none;padding:4px 10px;border-radius:999px;background:#e9c46a;color:#1d2a22;font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.dp-text{margin:0}
.dp-live{font-weight:700;text-decoration:underline;text-underline-offset:2px}
.dp-cta{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 16px;border-radius:999px;background:#fff;color:#14261c!important;font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap}
.dp-cta:hover{background:#f3faf5}
.dp-cta:focus-visible,.dp-live:focus-visible{outline:2px solid #e9c46a;outline-offset:2px}
.dp-brand{font-weight:400;color:#46584d}
.dp-watermark{position:fixed;inset:0;z-index:2147481000;pointer-events:none;background-image:${watermarkImage()};background-size:420px 260px;background-repeat:repeat}
@media print{.dp-watermark{position:absolute}}
@media(max-width:640px){.dp-banner{padding:8px 12px;font-size:13px}.dp-long{display:none}.dp-brand{display:none}.dp-cta{min-height:36px;padding:0 12px;font-size:12.5px}.dp-left{flex-basis:auto}}
</style>`;
    return css
      + `<div class="dp-banner" role="region" aria-label="Draft preview" data-draft-banner><div class="dp-left"><span class="dp-tag">Draft preview</span><p class="dp-text">${note}</p></div>`
      + `<a class="dp-cta" href="${PREVIEW_CTA}" data-draft-cta><span class="dp-brand">Made with InviteStudio ·</span> Create your own, free</a></div>`
      + '<div class="dp-watermark" aria-hidden="true" data-draft-watermark></div>';
  }

  // One quiet line below the end of a live invitation, after the couple's own footer: guests who are planning a wedding of their
  // own can find where it was made. It sits in the page flow (never fixed or over the design), is tagged so /admin shows the
  // visits it brings, and says nothing about price.
  const GUEST_CTA = '/?utm_source=invitation&utm_medium=credit&utm_campaign=guest';
  function guestCredit() {
    return '<style>.pv-credit{display:block;padding:18px 16px calc(18px + env(safe-area-inset-bottom));background:#fbf7f2;border-top:1px solid #e7e0d9;text-align:center;font:400 13px/1.5 "DM Sans",system-ui,sans-serif;color:#5f5b54}'
      + '.pv-credit a{color:#14261c;font-weight:600;text-decoration:underline;text-underline-offset:3px}.pv-credit a:focus-visible{outline:2px solid #b58c55;outline-offset:2px}</style>'
      + `<footer class="pv-credit" data-guest-credit>Invitation made with <a href="${GUEST_CTA}">InviteStudio</a> · Planning a wedding? Build and preview yours free</footer>`;
  }

  window.publicPageHtml = function publicPageHtml() {
    const view = state.publicInvitation || { status: 'loading' };
    const header = '<header class="pv-top topbar"><a class="brand pv-logo" href="/" aria-label="InviteStudio home"><span class="pv-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>InviteStudio</span></a></header>';
    const centred = inner => `<main class="pv-centred">${inner}</main>`;
    let body;
    if (view.status === 'ready' && view.preview) {
      const project = projectFromPublic(view.data.wedding, view.data.photos);
      project.status = 'Draft';
      project.published = false;
      // Not marked data-public-invitation: the reply form stays in its "preview only" mode and sends nothing.
      return previewChrome(view) + `<div class="published-page" data-draft-preview>${sitePreview(project, tpl(project.templateId), true)}</div>`;
    } else if (view.status === 'ready') {
      const project = projectFromPublic(view.data.wedding, view.data.photos);
      body = `<div class="published-page" data-public-invitation>${sitePreview(project, tpl(project.templateId), true)}</div>` + guestCredit();
    } else if (view.preview && view.status === 'loading') {
      body = centred('<p class="muted">Loading preview…</p>');
    } else if (view.preview && view.status === 'error') {
      body = centred('<h1 class="pv-h1">We could not load this preview.</h1><p class="muted">Check your connection and try again.</p><button class="pv-btn primary" onclick="loadDraftPreview(state.publicInvitation.token)">Try again</button>');
    } else if (view.preview) {
      body = centred(`<h1 class="pv-h1">This preview link is not working.</h1><p class="muted">It may have expired, or the couple may have stopped sharing it. Ask them for a new link.</p><p class="muted" style="margin-top:22px">Planning a celebration of your own? Build and preview your invitation for free.</p><a class="pv-btn primary" href="${PREVIEW_CTA}">Create your own invitation</a>`);
    } else if (view.status === 'loading') {
      body = centred('<p class="muted">Loading invitation…</p>');
    } else if (view.status === 'error') {
      body = centred('<h1 class="pv-h1">We could not load this invitation.</h1><p class="muted">Check your connection and try again.</p><button class="pv-btn primary" onclick="loadPublicInvitation(state.publicInvitation.slug)">Try again</button>');
    } else if (view.status === 'ended') {
      // The couple's own route back during the grace period (docs/RETENTION_PLAN.md): email or WhatsApp, with this
      // website's address already in the message.
      const links = window.InviteContact ? window.InviteContact.links('restore', `${window.location.origin}/s/${view.slug}`) : { whatsapp: '', email: '' };
      const way = [links.whatsapp ? `<a class="pv-btn small" href="${esc(links.whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp us</a>` : '', links.email ? `<a class="pv-btn small" href="${esc(links.email)}">Email us</a>` : ''].filter(Boolean).join(' ');
      body = centred('<h1 class="pv-h1">This invitation has ended.</h1><p class="muted">Invitations are online for a limited time after the celebration, and this one is no longer available.</p>' + (way ? `<p class="muted" style="margin-top:22px">Are you the couple? You may still be able to get it back.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap" data-ended-contact>${way}</div>` : '') + '<p style="margin-top:26px"><a class="pv-btn primary" href="/">Create your own invitation</a></p>');
    } else {
      body = centred('<h1 class="pv-h1">This invitation is not available.</h1><p class="muted">The link may be incorrect, or the invitation is not published right now.</p><a class="pv-btn primary" href="/">Create your own invitation</a>');
    }
    // The invitation itself carries no InviteStudio branding: guests see only the couple's page, then one quiet credit line after
    // its end (guestCredit), never over it.
    return view.status === 'ready' ? body : header + body;
  };
})();
