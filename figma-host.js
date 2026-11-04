/* Host for the Figma Make islands (figma/dist/figma-islands.js).
 *
 * - Decides which island (if any) matches the current route and application state.
 * - Installs window.InviteStudioBridge, the only surface the islands use. Every action
 *   goes through the existing application: cloud-sync for saving, the existing publish
 *   dialog, the existing invitation renderer and the existing setup flow.
 *
 * Loaded after cloud-sync.js and before the inline application script. The globals it
 * reads (state, current, save, render, ensureProject, sitePreview, ...) are resolved
 * when called, so load order only matters for the functions that run immediately.
 */
(function installFigmaHost() {
  const listeners = new Set();
  let version = 0;
  let cachedVersion = -1;
  let cachedSnapshot = null;
  let activeIsland = null;
  let activeHost = null;
  let styleText = null;
  const photoUrl = /^https:\/\/images\.unsplash\.com\//;
  const defaultSectionIds = ['hero', 'welcome', 'story', 'functions', 'gallery', 'rsvp'];
  const defaultSections = () => [
    { id: 'hero', title: 'Hero', visible: true },
    { id: 'welcome', title: 'Welcome message', visible: true },
    { id: 'story', title: 'Our story', visible: true },
    { id: 'functions', title: 'Events / Functions', visible: true },
    { id: 'gallery', title: 'Gallery', visible: true },
    { id: 'rsvp', title: 'RSVP', visible: true }
  ];

  function project() {
    return typeof current === 'function' ? current() : null;
  }

  function publicUrlFor(p) {
    return p && p.publishStatus === 'published' && p.publicSlug
      ? `${window.location.origin}/s/${p.publicSlug}`
      : null;
  }

  function buildSnapshot() {
    const p = project();
    const prefs = (p && p.preferences) || {};
    const sections = {};
    for (const section of (p && p.sections) || []) {
      if (section && typeof section.id === 'string') sections[section.id] = section.visible !== false;
    }
    return {
      available: Boolean(p),
      title: p?.title || '',
      pretitle: prefs.pretitle || 'THE WEDDING OF',
      date: p?.date || '',
      location: p?.location || '',
      buttonLabel: prefs.buttonLabel || 'RSVP Now',
      storyTitle: prefs.storyTitle || 'Our Story',
      storyCopy: p?.story || '',
      heroImageUrl: prefs.heroImageUrl || '',
      templateId: p?.templateId || '',
      publishStatus: p?.publishStatus || 'draft',
      published: p?.publishStatus === 'published',
      publicSlug: p?.publicSlug || '',
      publicUrl: publicUrlFor(p),
      saveLabel: p ? (typeof cloudSaveLabel === 'function' ? cloudSaveLabel(p) : 'Saved on this device') : '',
      saveFailed: Boolean(state.saveFailed),
      sections
    };
  }

  function snapshot() {
    if (cachedVersion !== version) {
      cachedSnapshot = buildSnapshot();
      cachedVersion = version;
    }
    return cachedSnapshot;
  }

  function notify() {
    version += 1;
    for (const listener of [...listeners]) listener();
  }

  // Called by cloud-sync whenever save status or project data changes.
  window.notifyInviteStudioChange = notify;

  function invitationShadow(host) {
    if (!host.shadowRoot) {
      const shadow = host.attachShadow({ mode: 'open' });
      if (styleText === null) {
        // The existing application styles, copied so the invitation looks as it does
        // in the editor preview. Shadow DOM keeps them out of the island's design CSS.
        styleText = Array.from(document.querySelectorAll('style')).map(style => style.textContent).join('\n');
      }
      const style = document.createElement('style');
      style.textContent = `:host{display:block}${styleText}`;
      const container = document.createElement('div');
      container.className = 'invitation-canvas';
      shadow.append(style, container);
    }
    return host.shadowRoot.querySelector('.invitation-canvas');
  }

  const widths = { desktop: '100%', tablet: '768px', mobile: '390px' };

  const bridge = {
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,

    update(patch) {
      const p = project();
      if (!p) return;
      const prefs = { ...(p.preferences || {}) };
      if ('title' in patch) { p.title = patch.title; p.name = patch.title || p.name; }
      if ('pretitle' in patch) prefs.pretitle = patch.pretitle;
      if ('date' in patch) p.date = patch.date || '';
      if ('location' in patch) p.location = patch.location || '';
      if ('buttonLabel' in patch) prefs.buttonLabel = patch.buttonLabel;
      if ('storyTitle' in patch) prefs.storyTitle = patch.storyTitle;
      if ('storyCopy' in patch) p.story = patch.storyCopy;
      if ('heroImageUrl' in patch) {
        const value = (patch.heroImageUrl || '').trim();
        if (!value) delete prefs.heroImageUrl;
        else if (photoUrl.test(value)) prefs.heroImageUrl = value;
      }
      p.preferences = prefs;
      p.updated = 'Just now';
      save();
      notify();
    },

    setSectionVisible(sectionId, visible) {
      const p = project();
      if (!p) return;
      if (!Array.isArray(p.sections) || !p.sections.length) p.sections = defaultSections();
      const found = p.sections.find(section => section.id === sectionId);
      if (found) found.visible = visible;
      else if (defaultSectionIds.includes(sectionId)) {
        p.sections.push({ id: sectionId, title: sectionId, visible });
      }
      save();
      notify();
    },

    saveNow() {
      if (!project()) return;
      save();
      if (typeof window.flushInviteStudioSaves === 'function') window.flushInviteStudioSaves();
      notify();
    },

    renderInvitation(host, device) {
      const p = project();
      if (!p) return;
      const container = invitationShadow(host);
      container.style.width = widths[device] || '100%';
      container.style.maxWidth = '100%';
      container.style.margin = '0 auto';
      // full=false: the editor canvas shows the invitation without its intro overlay.
      container.innerHTML = sitePreview(p, tpl(p.templateId), false);
    },

    createDraft(backendTemplateId, templateNumber) {
      // A new website: the existing creation path, then the designer for that template.
      state.currentId = null;
      state.selectedTemplate = backendTemplateId;
      state.category = 'Wedding';
      const p = ensureProject();
      p.templateId = backendTemplateId;
      applyPreferences(p);
      save();
      if (window.inviteStudioApi?.enabled && typeof createCloudDraftForProject === 'function') {
        createCloudDraftForProject(p);
      }
      state.editorMode = 'designer';
      state.page = 'editor';
      history.pushState({}, '', `/editor/${templateNumber}`);
      render();
    },

    startCreate(category) {
      state.editorMode = 'designer';
      startCreate(category);
    },

    openPreview() {
      state.page = 'preview';
      history.pushState({}, '', '/');
      render();
    },

    openPublish() {
      openPublish();
    },

    openAdvanced() {
      state.editorMode = 'advanced';
      state.page = 'editor';
      render();
    },

    openLegacyTemplates() {
      state.page = 'templates';
      history.pushState({}, '', '/');
      render();
    },

    recovery() {
      const reference = (() => {
        try { return JSON.parse(localStorage.getItem('invitestudio-current-draft') || 'null'); } catch { return null; }
      })();
      if (!reference) return null;
      const p = state.projects.find(item =>
        (reference.localId && item.id === reference.localId) ||
        (reference.cloudId && (item.cloudId === reference.cloudId || item.id === reference.cloudId))
      );
      if (!p) return null;
      return {
        title: p.title || p.name || 'your invitation',
        status: typeof draftStorageNote === 'function' ? draftStorageNote() : '',
        error: state.recoveryError || ''
      };
    },

    continueDraft() {
      state.editorMode = 'designer';
      if (typeof continueLastDraft === 'function') continueLastDraft();
    },

    categories() {
      return categories.map(([name, emoji]) => [name, emoji]);
    }
  };

  window.InviteStudioBridge = Object.freeze(bridge);

  // Route matching. Returns the island kind and props, or null for the existing screens.
  window.inviteStudioIslandRoute = function inviteStudioIslandRoute() {
    if (!window.InviteStudioFigma) return null;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const editorMatch = path.match(/^\/editor\/(\d+)$/);
    if (editorMatch) {
      // Advanced editing is the existing full editor, which has no island.
      if (state.editorMode === 'advanced' && project()) return null;
      if (project()) return { kind: 'editor' };
      return { kind: 'detail', props: { templateId: Number(editorMatch[1]) } };
    }
    const detailMatch = path.match(/^\/templates\/(\d+)$/);
    if (detailMatch) return { kind: 'detail', props: { templateId: Number(detailMatch[1]) } };
    if (path === '/templates' && state.page !== 'templates') return { kind: 'templates' };
    if (state.page === 'home' && path === '/') return { kind: 'home' };
    if (state.page === 'editor' && state.editorMode !== 'advanced' && project()) return { kind: 'editor' };
    return null;
  };

  window.unmountInviteStudioIsland = function unmountInviteStudioIsland() {
    if (activeIsland) activeIsland.unmount();
    activeIsland = null;
    activeHost = null;
  };

  window.mountInviteStudioIsland = function mountInviteStudioIsland(route) {
    const host = document.querySelector('.figma-island-host');
    if (!host || !window.InviteStudioFigma) return;
    activeHost = host;
    activeIsland = window.InviteStudioFigma.mount(route.kind, host, route.props || {});
  };

  // Browser back and forward move between routes that the application state tracks.
  window.addEventListener('popstate', () => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/') {
      if (state.page !== 'home' && state.page !== 'editor' && state.page !== 'preview') state.page = 'home';
      if (state.page === 'home') state.editorMode = 'designer';
    } else if (path === '/templates') {
      state.page = 'home';
    }
    render();
  });
})();
