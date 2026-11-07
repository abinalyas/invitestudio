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

  const RSVP_OPTIONS = ['count', 'rsvp', 'contact', 'none'];
  const EVENT_FIELDS = ['title', 'date', 'time', 'endTime', 'venue', 'description', 'dressCode', 'directionsUrl', 'parking', 'accommodation', 'accessibility', 'visible'];

  // The designs offered for now (isOffered, index.html): the same list the setup wizard offers.
  function launchDesigns() {
    return templates
      .filter(t => t.category === 'Wedding' && !t.review && isOffered(t))
      .map(t => ({ id: t.id, name: t.name, style: t.style || '', image: t.image || '' }));
  }

  // Derived from the cloud status. "saved" appears only after the server confirms the change.
  function saveStateFor(p) {
    if (!navigator.onLine) return 'offline';
    if (!window.inviteStudioApi?.enabled) return 'local';
    const status = p.cloudStatus;
    if (status === 'creating') return 'creating';
    if (status === 'saving') return 'saving';
    if (status === 'pending') return 'pending';
    if (status === 'retrying') return 'retrying';
    if (status === 'saved') return 'saved';
    if (status === 'conflict') return 'conflict';
    if (status === 'error') return 'error';
    if (!p.cloudId && !status) return 'creating';
    return 'local';
  }

  function normaliseEvent(f) {
    return {
      id: f.id,
      title: f.title || '',
      date: f.date || '',
      time: f.time || '',
      endTime: f.endTime || '',
      venue: f.venue || '',
      description: f.description || '',
      dressCode: f.dressCode || '',
      directionsUrl: f.directionsUrl || '',
      parking: f.parking || '',
      accommodation: f.accommodation || '',
      accessibility: f.accessibility || '',
      visible: f.visible !== false
    };
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
      message: p?.message || '',
      hosts: p?.hosts || '',
      storyTitle: prefs.storyTitle || 'Our Story',
      storyCopy: p?.story || '',
      templateId: p?.templateId || '',
      templateName: p ? tpl(p.templateId).name : '',
      publishStatus: p?.publishStatus || 'draft',
      published: p?.publishStatus === 'published',
      publicSlug: p?.publicSlug || '',
      publicUrl: publicUrlFor(p),
      saveState: p ? saveStateFor(p) : 'local',
      saveLabel: p ? (typeof cloudSaveLabel === 'function' ? cloudSaveLabel(p) : 'Saved on this device') : '',
      saveFailed: Boolean(state.saveFailed),
      sections,
      events: (p?.functions || []).map(normaliseEvent),
      rsvp: prefs.rsvp || 'count',
      galleryCount: (p?.photos || []).length,
      // What the invitation shows while a field is empty, so the editor can show it as a hint.
      shown: {
        title: p ? (p.title || p.name || (window.sceneDefaults && window.sceneDefaults.title) || '') : '',
        message: (window.sceneDefaults && window.sceneDefaults.message) || '',
        hosts: (window.sceneDefaults && window.sceneDefaults.hosts) || '',
        date: (window.sceneDefaults && window.sceneDefaults.date) || ''
      }
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
  // Going offline or back online changes the save state shown to the couple.
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);

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
      if ('message' in patch) p.message = patch.message || '';
      if ('hosts' in patch) p.hosts = patch.hosts || '';
      if ('storyTitle' in patch) prefs.storyTitle = patch.storyTitle;
      if ('storyCopy' in patch) p.story = patch.storyCopy;
      p.preferences = prefs;
      p.updated = 'Just now';
      save();
      notify();
    },

    addEvent(title) {
      const p = project();
      if (!p) return '';
      if (!Array.isArray(p.functions)) p.functions = [];
      const id = crypto.randomUUID();
      p.functions.push({
        id, title: String(title || '').trim() || 'New event', date: '', time: '', endTime: '', venue: '',
        description: '', dressCode: '', directionsUrl: '', parking: '', accommodation: '', accessibility: '', visible: true
      });
      p.updated = 'Just now';
      save();
      notify();
      return id;
    },

    updateEvent(eventId, patch) {
      const p = project();
      const item = (p?.functions || []).find(x => x.id === eventId);
      if (!item) return;
      for (const key of EVENT_FIELDS) {
        if (!(key in patch)) continue;
        item[key] = key === 'visible' ? Boolean(patch.visible) : String(patch[key] ?? '');
      }
      p.updated = 'Just now';
      save();
      notify();
    },

    removeEvent(eventId) {
      const p = project();
      if (!p) return;
      p.functions = (p.functions || []).filter(x => x.id !== eventId);
      p.updated = 'Just now';
      save();
      notify();
    },

    setRsvp(value) {
      const p = project();
      if (!p || !RSVP_OPTIONS.includes(value)) return;
      p.preferences = { ...(p.preferences || {}), rsvp: value };
      p.updated = 'Just now';
      save();
      notify();
    },

    // Only the design changes. Names, dates, story, events and visibility are kept.
    setTemplate(templateId) {
      const p = project();
      if (!p || !launchDesigns().some(d => d.id === templateId)) return;
      p.templateId = templateId;
      state.selectedTemplate = templateId;
      p.updated = 'Just now';
      save();
      notify();
    },

    designs() {
      return launchDesigns();
    },

    // The same quick-add options as the setup step, minus the ones already on the schedule.
    eventPresets() {
      const p = project();
      if (!p || typeof eventPresetsFor !== 'function') return [];
      const added = new Set((p.functions || []).map(f => String(f.title || '').trim().toLowerCase()));
      return eventPresetsFor(p).filter(title => !added.has(title.toLowerCase()));
    },

    retrySave() {
      if (typeof window.retryCloudSave === 'function') window.retryCloudSave();
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

    createDraft(backendTemplateId, templateNumber, sampleNames) {
      // A new website: the existing creation path, then the designer for that template.
      state.currentId = null;
      state.selectedTemplate = backendTemplateId;
      state.category = 'Wedding';
      const p = ensureProject();
      p.templateId = backendTemplateId;
      // A new draft starts with the names on the template's cover, as real values the couple edits.
      if (typeof sampleNames === 'string' && sampleNames.trim()) {
        p.title = sampleNames.trim();
        p.name = p.title;
      }
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
      if (window.location.pathname !== '/') history.pushState({}, '', '/');
      startCreate(category);
    },

    openPreview() {
      state.page = 'preview';
      history.pushState({}, '', '/');
      render();
    },

    // The real template with example content, in the existing preview dialog.
    previewTemplate(backendTemplateId) {
      previewTemplate(backendTemplateId);
    },

    // ---- Setup wizard (figma/islands/Setup.tsx) ----
    setupDefaults() {
      const p = project();
      const known = id => offeredTemplateIds.includes(id);
      const templateId = p && known(p.templateId) ? p.templateId : known(state.selectedTemplate) ? state.selectedTemplate : offeredTemplateIds[0];
      return { templateId };
    },

    // Called when a step is finished: creates the draft the first time, then keeps it up to date.
    commitSetup(fields) {
      const templateId = offeredTemplateIds.includes(fields.templateId) ? fields.templateId : offeredTemplateIds[0];
      state.category = 'Wedding';
      state.selectedTemplate = templateId;
      const p = project() || ensureProject();
      p.category = 'Wedding';
      p.title = fields.title;
      p.date = fields.date;
      p.location = fields.location;
      p.message = fields.message;
      p.story = fields.story;
      p.hosts = fields.hosts;
      p.name = p.title || p.name;
      p.templateId = templateId;
      const saved = save();
      notify();
      return saved;
    },

    // The preview while setting up: the typed values on the chosen template, before a draft exists.
    // Names fall back to the template's example names, so the cover is never empty.
    renderDraft(host, fields, fallbackTitle) {
      const base = project() || {};
      const t = tpl(offeredTemplateIds.includes(fields.templateId) ? fields.templateId : offeredTemplateIds[0]);
      const title = String(fields.title || '').trim() || fallbackTitle || '';
      const draft = {
        ...base,
        category: 'Wedding',
        title,
        name: title,
        date: fields.date || '',
        location: fields.location || '',
        message: fields.message || '',
        story: fields.story || '',
        hosts: fields.hosts || '',
        templateId: t.id,
        functions: base.functions || [],
        photos: base.photos || []
      };
      const container = invitationShadow(host);
      container.style.width = '100%';
      container.style.maxWidth = '100%';
      container.innerHTML = sitePreview(draft, t, false);
    },

    setupStatus() {
      const p = project();
      return { canFinish: setupCanFinish(p), offer: setupLocalOffer(p), saveLine: setupSaveText(p) };
    },

    keepLocal() {
      state.setupLocalOnly = true;
      notify();
    },

    finishSetup() {
      finishSetup();
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

    // Launch scope is weddings only. Other occasions are held back until their designs exist.
    categories() {
      return categories.filter(([name]) => name === 'Wedding').map(([name, emoji]) => [name, emoji]);
    }
  };

  window.InviteStudioBridge = Object.freeze(bridge);

  // Route matching. Returns the island kind and props, or null for the existing screens.
  let restoreRequested = false;
  function hasCurrentDraft() {
    try { return Boolean(JSON.parse(localStorage.getItem('invitestudio-current-draft') || 'null')); } catch { return false; }
  }

  window.inviteStudioIslandRoute = function inviteStudioIslandRoute() {
    if (!window.InviteStudioFigma) return null;
    // The setup wizard is shown whatever the address says (it starts from any page).
    if (state.page === 'setup') return { kind: 'setup' };
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const editorMatch = path.match(/^\/editor\/(\d+)$/);
    if (editorMatch) {
      // Advanced editing is the existing full editor, which has no island.
      if (state.editorMode === 'advanced' && project()) return null;
      if (project()) return { kind: 'editor' };
      // A reload of the designer address reopens the draft this browser was editing.
      if (!restoreRequested && hasCurrentDraft() && typeof window.continueLastDraft === 'function') {
        restoreRequested = true;
        window.continueLastDraft();
        return null;
      }
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
    host.dataset.island = route.kind; // lets the page scale the editor differently from the marketing pages
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
