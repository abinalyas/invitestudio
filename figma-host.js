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

  // The wording a packaged template lets the couple change (its manifest's copy keys), with their current values.
  function copyFieldsFor(p) {
    const t = p ? tpl(p.templateId) : null;
    const manifest = t && t.packaged && window.packagedTemplateManifest ? window.packagedTemplateManifest(t.packaged) : null;
    if (!manifest) return [];
    const copy = p.copy && typeof p.copy === 'object' ? p.copy : {};
    return Object.entries(manifest.copy).map(([key, def]) => ({
      key, label: def.label, section: def.section || 'home', max: def.max || 80, fallback: def.default,
      value: typeof copy[key] === 'string' ? copy[key] : ''
    }));
  }

  // The picture spots the open design defines (hero, story, venue ...). The first photos fill them, the rest form the gallery.
  function photoSlotsFor(p) {
    const t = p ? tpl(p.templateId) : null;
    const manifest = t && t.packaged && window.packagedTemplateManifest ? window.packagedTemplateManifest(t.packaged) : null;
    return manifest ? (manifest.photoSlots || (manifest.heroPhoto ? ['hero'] : [])).slice() : [];
  }

  function publicUrlFor(p) {
    return p && p.publishStatus === 'published' && p.publicSlug
      ? `${window.location.origin}/s/${p.publicSlug}`
      : null;
  }

  // The names shown on every template's cover until the couple adds their own. They are only ever a hint
  // (a grey placeholder and the preview), never a saved value.
  const SAMPLE_NAMES = 'Daniel & Amelia';

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
      time: window.InviteEventFields ? window.InviteEventFields.normalizeTime(f.time) : f.time || '',
      endTime: window.InviteEventFields ? window.InviteEventFields.normalizeTime(f.endTime) : f.endTime || '',
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
      draftId: p ? String(p.id || p.cloudId || '') : '',
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
      rsvpOpen: prefs.rsvpOpen !== false,
      rsvpReplyBy: /^\d{4}-\d{2}-\d{2}$/.test(prefs.rsvpReplyBy || '') ? prefs.rsvpReplyBy : '',
      rsvpMaxParty: Number.isInteger(prefs.rsvpMaxParty) ? Math.min(Math.max(prefs.rsvpMaxParty, 1), 20) : 10,
      rsvpContact: prefs.rsvpContact && typeof prefs.rsvpContact === 'object' ? { type: prefs.rsvpContact.type === 'phone' ? 'phone' : 'whatsapp', value: String(prefs.rsvpContact.value || '') } : { type: 'whatsapp', value: '' },
      galleryCount: (p?.photos || []).length,
      photos: (p?.photos || []).filter(photo => photo && photo.id).map(photo => ({
        id: photo.id, alt: photo.alt || '', thumb: photo.thumb || photo.data || '', width: photo.width || null, height: photo.height || null
      })),
      photoSlots: photoSlotsFor(p),
      media: {
        enabled: Boolean(p?.media?.enabled),
        reason: p?.media?.reason || '',
        error: p?.media?.error || '',
        loaded: Boolean(p?.media),
        limits: p?.media?.limits || { photos: 12, totalBytes: 8 * 1024 * 1024 },
        usage: p?.media?.usage || { count: 0, bytes: 0 }
      },
      copyFields: copyFieldsFor(p),
      hasPrivateLink: Boolean(p?.cloudId && window.inviteStudioApi?.enabled),
      // What the invitation shows while a field is empty, so the editor can show it as a hint.
      shown: {
        title: SAMPLE_NAMES,
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

  // Click-to-edit in the editor preview: the template marks the text the couple can change with data-edit
  // (see packaged-templates.js). Editing one saves through the same bridge.update the panel uses, so the panel
  // and the preview stay in step. Only the editor canvas gets these marks; the published page never does.
  const EDIT_STYLE = '<style>[data-edit]{cursor:text;outline:1px dashed rgba(20,92,55,.35);outline-offset:6px;border-radius:2px}' +
    '[data-edit]:hover{outline-color:#145c37}' +
    '[data-edit][contenteditable="true"]{outline:2px solid #145c37;background:rgba(255,255,255,.12)}</style>';

  function enableTextEditing(container) {
    container.querySelectorAll('[data-edit]').forEach(el => {
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.title = 'Click to edit';
    });
    if (container.dataset.editWired) return;
    container.dataset.editWired = '1';
    const fieldOf = event => {
      const el = event.target instanceof Element ? event.target.closest('[data-edit]') : null;
      return el && el.contentEditable !== 'true' ? el : null;
    };
    container.addEventListener('click', event => {
      const el = fieldOf(event);
      if (el) startEditing(el);
    });
    container.addEventListener('keydown', event => {
      const el = fieldOf(event);
      if (el && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        startEditing(el);
      }
    });
  }

  function startEditing(el) {
    const field = el.dataset.edit;
    const shown = el.innerHTML; // restored on cancel or when nothing changed
    const plain = el.dataset.raw !== undefined ? el.dataset.raw : el.textContent; // the value as typed, not uppercased
    let cancelled = false;
    el.textContent = plain;
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const onKeydown = event => {
      if (event.key === 'Enter') {
        event.preventDefault(); // one line: Enter saves
        el.blur();
      } else if (event.key === 'Escape') {
        cancelled = true;
        el.blur();
      }
    };
    // Pasted text keeps its words but not its formatting, and line breaks become spaces.
    const onPaste = event => {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\r?\n\s*/g, ' ');
      document.execCommand('insertText', false, text);
    };
    const onBlur = () => {
      el.removeEventListener('keydown', onKeydown);
      el.removeEventListener('paste', onPaste);
      el.removeEventListener('blur', onBlur);
      el.contentEditable = 'false';
      const value = el.textContent.trim();
      // Cancelled, unchanged, or a blank name (a blank name would fall back to the example names): keep what was there.
      if (cancelled || value === plain.trim() || (field === 'title' && !value)) {
        el.innerHTML = shown;
        return;
      }
      if (field.indexOf('copy:') === 0) bridge.setCopy(field.slice(5), value); // wording, as the panel saves it
      else bridge.update({ [field]: value }); // re-renders the preview and updates the panel field
    };
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('paste', onPaste);
    el.addEventListener('blur', onBlur);
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

    // The private link that opens this draft on another device (anyone with it can edit).
    copyPrivateLink() {
      if (typeof window.copyPrivateEditLink === 'function') window.copyPrivateEditLink();
    },

    // Wording on a packaged template. An empty text goes back to the template's own wording.
    setCopy(key, text) {
      const p = project();
      if (!p || typeof key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(key)) return;
      const copy = { ...(p.copy && typeof p.copy === 'object' ? p.copy : {}) };
      const value = String(text == null ? '' : text).slice(0, 300);
      if (value.trim()) copy[key] = value; else delete copy[key];
      p.copy = copy;
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
        item[key] = key === 'visible' ? Boolean(patch.visible)
          : (key === 'time' || key === 'endTime') && window.InviteEventFields ? window.InviteEventFields.normalizeTime(patch[key])
          : String(patch[key] ?? '');
      }
      p.updated = 'Just now';
      save();
      notify();
    },

    // Moves an event to a new position (0 = first) in the order guests see.
    moveEvent(eventId, toIndex) {
      const p = project();
      const list = p?.functions;
      if (!Array.isArray(list)) return;
      const from = list.findIndex(x => x.id === eventId);
      const to = Math.max(0, Math.min(list.length - 1, Number(toIndex)));
      if (from < 0 || !Number.isInteger(to) || to === from) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
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

    setRsvpOption(key, value) {
      const p = project();
      if (!p) return;
      let next;
      if (key === 'rsvpOpen') next = Boolean(value);
      else if (key === 'rsvpReplyBy') next = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
      else if (key === 'rsvpMaxParty') next = Math.min(Math.max(parseInt(value, 10) || 10, 1), 20);
      else return;
      p.preferences = { ...(p.preferences || {}), [key]: next };
      p.updated = 'Just now';
      save();
      notify();
    },

    // Retention: when the website is kept until, and the "Talk to us" links
    loadRetention() { return typeof window.loadRetention === 'function' ? window.loadRetention() : Promise.resolve({ available: false }); },
    contactLinks(topic, address) { return window.InviteContact ? window.InviteContact.links(topic, address) : { whatsapp: '', email: '' }; },

    // Photos
    mediaLoad() { return typeof window.loadMedia === 'function' ? window.loadMedia() : Promise.resolve(); },
    mediaUpload(files, onProgress) { return window.uploadMediaPhotos(files, onProgress); },
    mediaAlt(id, alt) { return window.setMediaAlt(id, alt); },
    mediaMove(id, delta) { return window.moveMediaPhoto(id, delta); },
    mediaRemove(id) { return window.deleteMediaPhoto(id); },

    loadReplies() {
      return typeof window.loadRsvpReplies === 'function' ? window.loadRsvpReplies() : Promise.reject(new Error('Not available.'));
    },

    // Saves the replies as a spreadsheet file on this device. Nothing is sent anywhere.
    downloadRepliesCsv(data, withCount) {
      if (!window.InviteRsvpCsv) return;
      const csv = window.InviteRsvpCsv.repliesCsv(data, { withCount: withCount !== false });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'wedding-replies.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    deleteReply(id) {
      return typeof window.deleteRsvpReply === 'function' ? window.deleteRsvpReply(id) : Promise.reject(new Error('Not available.'));
    },

    setRsvpContact(type, value) {
      const p = project();
      if (!p || !['whatsapp', 'phone'].includes(type)) return;
      const clean = String(value || '').replace(/[^\d+\s()-]/g, '').slice(0, 24);
      p.preferences = { ...(p.preferences || {}), rsvpContact: { type, value: clean } };
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
      // Until the couple adds their names, the preview shows the template's example names.
      const shown = String(p.title || '').trim() ? p : { ...p, title: SAMPLE_NAMES, name: SAMPLE_NAMES };
      container.innerHTML = sitePreview(shown, tpl(p.templateId), false, { editable: true }) + EDIT_STYLE;
      if (window.hydratePackagedTemplates) window.hydratePackagedTemplates(container);
      enableTextEditing(container);
    },

    createDraft(backendTemplateId, templateNumber, sampleNames) {
      // A new website: the existing creation path, then the designer for that template.
      state.currentId = null;
      state.selectedTemplate = backendTemplateId;
      state.category = 'Wedding';
      const p = ensureProject();
      p.templateId = backendTemplateId;
      // The names stay empty: the cover shows the template's example names as a preview and the field shows
      // them as a grey hint, so the couple's own names are never mixed up with the example.
      applyPreferences(p);
      save();
      if (window.inviteStudioApi?.enabled && typeof createCloudDraftForProject === 'function') {
        createCloudDraftForProject(p);
      }
      state.page = 'editor';
      history.pushState({}, '', `/editor/${templateNumber}`);
      render();
    },

    startCreate(category) {
      if (window.location.pathname !== '/') history.pushState({}, '', '/');
      startCreate(category);
    },

    // The guided setup (names, date, place, then the editor) with a design already chosen.
    startSetup(backendTemplateId) {
      if (window.location.pathname !== '/') history.pushState({}, '', '/');
      startCreate('Wedding', backendTemplateId);
    },

    openPreview() {
      state.page = 'preview';
      history.pushState({}, '', '/');
      render();
    },

    // The real template with example content, in the existing preview dialog.
    // The whole design with example names and content, for the template page's phone preview. Nothing is saved.
    renderTemplateDemo(host, backendTemplateId) {
      const t = tpl(offeredTemplateIds.includes(backendTemplateId) ? backendTemplateId : offeredTemplateIds[0]);
      const container = invitationShadow(host);
      container.style.width = '100%';
      container.style.maxWidth = '100%';
      container.innerHTML = sitePreview(templateDemoProject(t), t, false);
      if (window.hydratePackagedTemplates) window.hydratePackagedTemplates(container);
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
      if (window.hydratePackagedTemplates) window.hydratePackagedTemplates(container);
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
        access: typeof draftAccessNote === 'function' ? draftAccessNote() : '',
        error: state.recoveryError || ''
      };
    },

    continueDraft() {
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
    if (state.page === 'setup') {
      // Setup can start from any address (for example a template's page). Move to the home address first, so that
      // when it finishes the editor is not hidden behind that earlier page's route.
      if ((window.location.pathname.replace(/\/+$/, '') || '/') !== '/') history.pushState({}, '', '/');
      return { kind: 'setup' };
    }
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const editorMatch = path.match(/^\/editor\/(\d+)$/);
    if (editorMatch) {
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
    if (state.page === 'editor' && project()) return { kind: 'editor' };
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
    if (state.page === 'setup' && path !== '/') state.page = 'home'; // leaving the setup page by going back
    if (path === '/') {
      if (state.page !== 'home' && state.page !== 'editor' && state.page !== 'preview') state.page = 'home';
    } else if (path === '/templates') {
      state.page = 'home';
    }
    render();
  });
})();
