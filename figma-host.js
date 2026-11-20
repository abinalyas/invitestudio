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

  // The story the open design shows while the couple has not written one (its manifest's example), so the form can show the same words.
  function exampleStoryFor(p) {
    const t = p ? tpl(p.templateId) : null;
    const manifest = t && t.packaged && window.packagedTemplateManifest ? window.packagedTemplateManifest(t.packaged) : null;
    return manifest && manifest.example && typeof manifest.example.story === 'string' ? manifest.example.story : '';
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
  // The wording an invitation shows while a field is empty (the same words every design falls back to).
  const EMPTY_HINTS = Object.freeze({ message: 'Together with our favourite people, for a day to remember.', hosts: 'Together with their families', date: 'Date to be announced' });
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

  // The wedding date from the first setup step becomes a "Wedding ceremony" event, added once and only when the invitation has no
  // events yet. Until the person edits that event, it follows the date and location they typed in step 1. Once they change it, or
  // delete it, it is left alone and never added back. No time is guessed.
  function syncCeremonyEvent(p) {
    if (!Array.isArray(p.functions)) p.functions = [];
    const date = String(p.date || '');
    const venue = String(p.location || '');
    if (p.ceremonyEventId) {
      const item = p.functions.find(x => x.id === p.ceremonyEventId);
      const last = p.ceremonyAuto || {};
      if (item && item.date === (last.date || '') && item.venue === (last.venue || '')) {
        item.date = date;
        item.venue = venue;
        p.ceremonyAuto = { date, venue };
      }
      return;
    }
    if (!date || p.functions.length) return;
    const id = crypto.randomUUID();
    p.functions.push({
      id, title: 'Wedding ceremony', date, time: '', endTime: '', venue,
      description: '', dressCode: '', directionsUrl: '', parking: '', accommodation: '', accessibility: '', visible: true
    });
    p.ceremonyEventId = id;
    p.ceremonyAuto = { date, venue };
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
      ceremonyEventId: p?.ceremonyEventId || '',
      paidTier: p?.paidTier || '',
      rsvp: prefs.rsvp || 'count',
      rsvpOpen: prefs.rsvpOpen !== false,
      rsvpReplyBy: /^\d{4}-\d{2}-\d{2}$/.test(prefs.rsvpReplyBy || '') ? prefs.rsvpReplyBy : '',
      rsvpMaxParty: Number.isInteger(prefs.rsvpMaxParty) ? Math.min(Math.max(prefs.rsvpMaxParty, 1), 20) : 10,
      rsvpContact: prefs.rsvpContact && typeof prefs.rsvpContact === 'object' ? { type: prefs.rsvpContact.type === 'phone' ? 'phone' : 'whatsapp', value: String(prefs.rsvpContact.value || '') } : { type: 'whatsapp', value: '' },
      galleryCount: (p?.photos || []).length,
      photos: (p?.photos || []).filter(photo => photo && photo.id).map(photo => ({
        id: photo.id, alt: photo.alt || '', thumb: photo.thumb || photo.data || '', width: photo.width || null, height: photo.height || null, slot: photo.slot || ''
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
        message: EMPTY_HINTS.message,
        hosts: EMPTY_HINTS.hosts,
        date: EMPTY_HINTS.date,
        story: exampleStoryFor(p)
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
  // The wording fields and picture spots come from the open design's manifest, which exists once the design has loaded.
  document.addEventListener('invitestudio:template-ready', () => notify());
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

  // A design's own CSS inside the shadow root. The page's styles are copied into the shadow root once, before later designs have
  // loaded, so each design's CSS is added here when it is drawn (template-loader.js keeps the text).
  function useTemplateCss(host, t) {
    const shadow = host.shadowRoot;
    if (!shadow) return;
    const css = window.InviteTemplates ? window.InviteTemplates.cssFor(t) : '';
    let style = shadow.querySelector('style[data-template-css]');
    if (!style) {
      style = document.createElement('style');
      style.setAttribute('data-template-css', '');
      shadow.insertBefore(style, shadow.firstChild);
    }
    if (style.dataset.design !== t.id) { style.textContent = css; style.dataset.design = t.id; }
  }

  // Draws `draw()` once the design is available. Designs load on demand, so a screen that is switched quickly keeps only its latest request.
  function withTemplate(host, container, t, draw) {
    const loader = window.InviteTemplates;
    const token = (container.__drawToken = (container.__drawToken || 0) + 1);
    const run = () => { if (container.__drawToken !== token) return; useTemplateCss(host, t); draw(); };
    if (!loader || loader.ready(t)) { run(); return; }
    container.innerHTML = '<div class="tpl-loading" role="status">Loading design…</div>';
    loader.need(t).then(run, () => {
      if (container.__drawToken !== token) return;
      container.innerHTML = '<div class="tpl-loading" role="alert">We could not load this design. <button class="pv-btn small" type="button" data-retry-design>Try again</button></div>';
      const button = container.querySelector('[data-retry-design]');
      if (button) button.addEventListener('click', () => withTemplate(host, container, t, draw));
    });
  }

  // Click-to-edit in the editor preview: the template marks the text the couple can change with data-edit
  // (see packaged-templates.js). Editing one saves through the same bridge.update the panel uses, so the panel
  // and the preview stay in step. Only the editor canvas gets these marks; the published page never does.
  // The outlines follow each design's own text colour (currentColor), so they show on dark designs as well as light ones.
  // The first declaration of each pair is a fallback for browsers without color-mix.
  const EDIT_STYLE = '<style>[data-edit]{cursor:text;border-radius:2px;outline:1px dashed rgba(128,128,128,.7);outline-offset:2px;' +
    'outline:1px dashed color-mix(in srgb,currentColor 38%,transparent);transition:outline-color .15s,background-color .15s}' +
    '[data-edit]:hover{outline:1.5px solid rgba(128,128,128,.95);outline:1.5px solid color-mix(in srgb,currentColor 85%,transparent);' +
    'background:rgba(128,128,128,.12);background:color-mix(in srgb,currentColor 9%,transparent)}' +
    '[data-edit]:focus-visible{outline:2px solid currentColor}' +
    '[data-edit][contenteditable="true"]{outline:2px solid currentColor;background:rgba(128,128,128,.18);background:color-mix(in srgb,currentColor 12%,transparent)}' +
    '[data-multiline]{display:block}' +
    // A small tip pinned to the bottom of the preview. It takes no space in the layout.
    '.edit-hint{position:sticky;bottom:0;height:0;z-index:50}' +
    '.edit-hint-pill{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;' +
    'width:max-content;max-width:calc(100% - 24px);padding:8px 8px 8px 14px;border-radius:999px;background:#1d1f1c;color:#fff;' +
    'font:500 12px/1.3 var(--sans,system-ui,sans-serif);letter-spacing:0;text-transform:none;box-shadow:0 6px 20px rgba(0,0,0,.25)}' +
    '.edit-hint-pill button{all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;text-align:center;font-size:15px;line-height:22px;color:#fff}' +
    '.edit-hint-pill button:hover,.edit-hint-pill button:focus-visible{background:rgba(255,255,255,.2)}' +
    '.edit-hint-pill[data-kind="error"]{background:#8a1c1c}' +
    // Photo placeholders open the file picker; the add-event button and its choices sit under the events list.
    '[data-photo-add]{cursor:pointer;outline:1px dashed rgba(128,128,128,.7);outline:1px dashed color-mix(in srgb,currentColor 45%,transparent);outline-offset:-6px}' +
    '[data-photo-add]:hover,[data-photo-add]:focus-visible{outline-style:solid;background:rgba(128,128,128,.14);background:color-mix(in srgb,currentColor 10%,transparent)}' +
    // A placeholder button for the cover, story or venue picture sits over the design's own artwork (or, with data-photo-flow, takes its own line).
    'button[data-photo-add]{all:unset;box-sizing:border-box;cursor:pointer;position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:6;padding:10px 16px;' +
    'border-radius:999px;background:rgba(255,255,255,.94);color:#145c37;font:600 13px/1.2 var(--sans,system-ui,sans-serif);letter-spacing:0;text-transform:none;' +
    'white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.28);outline:1px dashed #145c37;outline-offset:3px}' +
    'button[data-photo-add]:hover,button[data-photo-add]:focus-visible{background:#fff;outline-style:solid}' +
    'button[data-photo-add][data-photo-top]{top:84px;bottom:auto}' +
    'button[data-photo-add][data-photo-mid]{top:50%;bottom:auto;transform:translate(-50%,-50%)}' +
    'button[data-photo-add][data-photo-flow]{position:static;transform:none;display:block;width:100%;margin:14px 0;text-align:center;border-radius:12px}' +
    '[data-add-wrap]{text-align:center;margin:20px 0 0;padding:0 12px}' +
    // !important: a design's own button styles must not turn these into plain text.
    '[data-add-event],.edit-chip{all:unset!important;box-sizing:border-box!important;cursor:pointer!important;display:inline-block!important;padding:9px 16px!important;border-radius:999px!important;' +
    'font:600 13px/1.2 var(--sans,system-ui,sans-serif)!important;letter-spacing:0!important;text-transform:none!important;color:inherit!important;' +
    'border:1px dashed rgba(128,128,128,.8)!important;border:1px dashed color-mix(in srgb,currentColor 55%,transparent)!important}' +
    '[data-add-event]:hover,[data-add-event]:focus-visible,.edit-chip:hover,.edit-chip:focus-visible{border-style:solid!important;background:rgba(128,128,128,.14)!important;background:color-mix(in srgb,currentColor 10%,transparent)!important}' +
    '.edit-menu{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px 0 0}' +
    // The small bar over an event: move up, move down, remove. The notice's action (Undo) is a link-style button.
    '.edit-event-bar{position:absolute;z-index:40;display:flex;gap:2px;padding:3px;border-radius:999px;background:#1d1f1c;box-shadow:0 4px 14px rgba(0,0,0,.25)}' +
    '.edit-event-bar button{all:unset!important;box-sizing:border-box!important;cursor:pointer!important;width:28px!important;height:28px!important;border-radius:50%!important;text-align:center!important;' +
    'font:600 15px/28px system-ui,sans-serif!important;color:#fff!important}' +
    '.edit-event-bar button:hover:not([disabled]),.edit-event-bar button:focus-visible{background:rgba(255,255,255,.22)!important}' +
    '.edit-event-bar button[disabled]{opacity:.35!important;cursor:default!important}' +
    // The bar over a photo has words, not symbols: Replace and Remove.
    '.edit-photo-bar button{width:auto!important;padding:0 14px!important;border-radius:999px!important;font:600 13px/28px system-ui,sans-serif!important;white-space:nowrap!important}' +
    'img[src*="/media/w/"]{cursor:pointer}' +
    '.edit-hint-action{all:unset;cursor:pointer;font-weight:700;text-decoration:underline;padding:0 2px}' +
    // On a phone the page scrolls, not the preview, so the pill is pinned to the screen, above the tab bar.
    '@media(max-width:767px){.edit-hint{position:fixed;left:0;right:0;bottom:var(--hint-bottom,84px);z-index:30}.edit-hint-pill{bottom:0}}' +
    // Bigger touch targets on touch screens.
    '@media(pointer:coarse){.edit-event-bar button{width:40px!important;height:40px!important;font-size:18px!important;line-height:40px!important}.edit-photo-bar button{width:auto!important;font-size:14px!important}' +
    '[data-add-event],.edit-chip{padding:12px 18px!important}button[data-photo-add]{min-height:44px}.edit-hint-pill button{position:relative;width:32px;height:32px;line-height:32px}' +
    // The visible button stays small; its tappable area grows to 44px.
    '.edit-hint-pill button::after{content:"";position:absolute;inset:-6px}}</style>';

  // The tip is shown until it is dismissed or the person makes their first edit, and then not again on this device.
  const HINT_KEY = 'invitestudio-edit-hint-seen';
  function hintSeen() {
    try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
  }
  function markHintSeen() {
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* the tip may come back; nothing else depends on it */ }
  }
  // One small pill at the bottom of the preview: the tip, or a short notice (photo progress, why photos are unavailable).
  let previewNotice = null; // { text, kind, until }
  function pillElement(text, kind, action) {
    const wrap = document.createElement('div');
    wrap.className = 'edit-hint';
    const pill = document.createElement('div');
    pill.className = 'edit-hint-pill';
    pill.dataset.kind = kind;
    pill.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const label = document.createElement('span');
    label.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('data-hint-close', '');
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '\u00d7';
    if (action) {
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'edit-hint-action';
      act.setAttribute('data-hint-action', '');
      act.textContent = action.label;
      pill.append(label, act, close);
    } else {
      pill.append(label, close);
    }
    wrap.append(pill);
    return wrap;
  }
  function showPill(container) {
    container.querySelector('.edit-hint')?.remove();
    const notice = previewNotice && previewNotice.until > Date.now() ? previewNotice : null;
    if (notice) container.append(pillElement(notice.text, notice.kind, notice.action));
    else if (!hintSeen() && container.querySelector('[data-edit]')) {
      const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      container.append(pillElement(`${touch ? 'Tap' : 'Click'} any outlined text to edit it`, 'tip'));
    }
    // Its height above the phone's tab bar is --hint-bottom (84px, set in the CSS above); the editor raises it above its floating
    // Edit button while that is showing. (Looking the button up here does not work: it lives in the editor's shadow tree.)
  }
  function setNotice(container, text, kind = 'info', ms = 7000, action = null) {
    const notice = { text, kind, until: Date.now() + ms, action };
    previewNotice = notice;
    showPill(container);
    window.setTimeout(() => {
      if (previewNotice !== notice) return;
      previewNotice = null;
      if (container.isConnected) showPill(container);
    }, ms + 50);
  }

  // ---- Photos: a placeholder in the gallery opens the file picker and uploads the way the Photos panel does.
  const SLOT_NAMES = { hero: 'cover picture', story: 'story picture', venue: 'venue picture' };
  const PHOTO_SPOT_LABELS = { hero: 'cover photo', story: 'story photo', venue: 'venue photo' };
  const PHOTO_OFF_NOTES = {
    NOT_SAVED_ONLINE: 'Photos need your invitation to be saved online. Open it with your private link, or wait until it finishes saving.',
    NO_STORAGE: "Photo storage is not set up yet. Until it is, your invitation uses the design's own pictures.",
    MIGRATION_PENDING: 'Photo storage is being set up. Please try again later.'
  };
  // `slot` is the place the photo goes: 'hero', 'story', 'venue' or 'gallery'. A placeholder in the design says which; the gallery's has none.
  function startPhotoAdd(container, slot = 'gallery') {
    const snap = bridge.snapshot();
    if (!snap.media.loaded) {
      void bridge.mediaLoad();
      setNotice(container, 'Checking photo storage. Try again in a moment.', 'info', 3500);
      return;
    }
    if (!snap.media.enabled) {
      setNotice(container, PHOTO_OFF_NOTES[snap.media.reason] || 'Photos are not available right now.', 'error', 10000);
      return;
    }
    if (snap.photos.length >= snap.media.limits.photos) {
      setNotice(container, `Photo limit reached (${snap.media.limits.photos}). Remove a photo in the Photos panel to add another.`, 'error', 9000);
      return;
    }
    container.querySelector('input[data-photo-input]')?.remove();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.heic,.heif';
    input.multiple = true;
    input.hidden = true;
    input.setAttribute('data-photo-input', '');
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (files.length) void addPhotos(container, files, slot);
    });
    container.append(input);
    input.click();
  }
  async function addPhotos(container, files, slot = 'gallery') {
    setNotice(container, `Adding photo 1 of ${files.length}\u2026`, 'info', 180000);
    let result;
    try {
      result = await bridge.mediaUpload(files, p => setNotice(container, `Adding photo ${p.index} of ${p.total}\u2026`, 'info', 180000), slot);
    } catch {
      setNotice(container, 'The photos could not be added. Check your connection and try again.', 'error', 9000);
      return;
    }
    const errors = (result && result.errors) || [];
    const added = (result && result.added) || 0;
    let text = '';
    if (added) {
      // Say where these went: the gallery, or the design's cover, story or venue picture.
      text = `Added ${added} ${added === 1 ? 'photo' : 'photos'} to the ${slot === 'gallery' ? 'gallery' : (SLOT_NAMES[slot] || 'gallery')}.`;
    }
    if (errors.length) {
      const problems = errors.slice(0, 2).map(error => (error.name ? `${error.name}: ${error.message}` : error.message)).join(' ');
      text = `${text} ${problems}${errors.length > 2 ? ' \u2026' : ''}`.trim();
    }
    if (text) setNotice(container, text, errors.length ? 'error' : 'info', errors.length ? 12000 : 8000);
    else showPill(container);
  }

  // ---- Photos in the preview: tap a photo to replace or remove it, without opening the Photos panel.
  const PHOTO_URL = /\/media\/w\/[^/]+\/([0-9a-f-]{36})-(?:thumb|full)\./i;
  function photoIdOf(img) {
    const match = PHOTO_URL.exec(img.currentSrc || img.getAttribute('src') || '');
    return match ? match[1] : '';
  }
  function hidePhotoBar(container) {
    container.querySelector('[data-photo-bar]')?.remove();
  }
  // Returns true when the picture is one of the couple's own photos (a bar was shown), false for the design's artwork.
  function showPhotoBar(container, img) {
    const id = photoIdOf(img);
    if (!id || !bridge.snapshot().photos.some(photo => photo.id === id)) return false;
    const existing = container.querySelector('[data-photo-bar]');
    if (existing && existing.dataset.id === id) { existing.remove(); return true; } // a second tap closes it
    hidePhotoBar(container);
    const bar = document.createElement('div');
    bar.className = 'edit-event-bar edit-photo-bar';
    bar.setAttribute('data-photo-bar', '');
    bar.dataset.id = id;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Photo actions');
    bar.append(barButton('Replace this photo', 'Replace', { 'data-photo-replace': '' }, false), barButton('Remove this photo', 'Remove', { 'data-photo-remove': '' }, false));
    container.append(bar);
    // Over the photo's top edge, kept inside the preview.
    const box = container.getBoundingClientRect();
    const rect = img.getBoundingClientRect();
    const left = Math.max(4, Math.min(rect.left - box.left + 8, box.width - bar.offsetWidth - 4));
    bar.style.left = left + 'px';
    bar.style.top = Math.max(4, rect.top - box.top + 8) + 'px';
    return true;
  }
  function startPhotoReplace(container, id) {
    hidePhotoBar(container);
    const snap = bridge.snapshot();
    if (!snap.media.enabled) {
      setNotice(container, PHOTO_OFF_NOTES[snap.media.reason] || 'Photos are not available right now.', 'error', 10000);
      return;
    }
    container.querySelector('input[data-photo-input]')?.remove();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.heic,.heif';
    input.hidden = true;
    input.setAttribute('data-photo-input', '');
    input.addEventListener('change', async () => {
      const file = (input.files || [])[0];
      input.remove();
      if (!file) return;
      setNotice(container, 'Replacing the photo\u2026', 'info', 180000);
      let result;
      try { result = await bridge.mediaReplace(id, file); } catch { result = null; }
      const errors = (result && result.errors) || [];
      if (result && result.added) setNotice(container, 'Photo replaced.', 'info', 5000);
      else setNotice(container, errors[0] ? errors[0].message : 'The photo could not be replaced. The old one is still there.', 'error', 10000);
    });
    container.append(input);
    input.click();
  }
  const askConfirm = options => (window.inviteConfirm ? window.inviteConfirm(options) : Promise.resolve(window.confirm(options.message || options.title)));
  async function removePhotoFromPreview(container, id) {
    hidePhotoBar(container);
    if (!await askConfirm({ title: 'Remove this photo?', message: 'It will disappear from your invitation.', confirmLabel: 'Remove photo', cancelLabel: 'Keep it', danger: true })) return;
    await bridge.mediaRemove(id);
    setNotice(container, 'Photo removed.', 'info', 5000);
  }

  // ---- Events: a small bar over the event being pointed at or edited moves it up or down, or removes it.
  let eventBarTimer = 0;
  function hideEventBar(container, delay) {
    window.clearTimeout(eventBarTimer);
    eventBarTimer = window.setTimeout(() => container.querySelector('[data-event-bar]')?.remove(), delay);
  }
  function barButton(label, text, attrs, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = text;
    for (const [name, value] of Object.entries(attrs)) button.setAttribute(name, value);
    if (disabled) button.disabled = true;
    return button;
  }
  function showEventBar(container, field) {
    const id = field.dataset.id;
    if (!id) return;
    window.clearTimeout(eventBarTimer);
    const existing = container.querySelector('[data-event-bar]');
    if (existing && existing.dataset.id === id) return;
    existing?.remove();
    const events = bridge.snapshot().events;
    const index = events.findIndex(event => event.id === id);
    if (index < 0) return;
    const bar = document.createElement('div');
    bar.className = 'edit-event-bar';
    bar.setAttribute('data-event-bar', '');
    bar.dataset.id = id;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Event actions');
    bar.append(
      barButton('Move event up', '\u2191', { 'data-event-move': '-1' }, index === 0),
      barButton('Move event down', '\u2193', { 'data-event-move': '1' }, index === events.length - 1),
      barButton('Remove event', '\u00d7', { 'data-event-remove': '' }, false)
    );
    container.append(bar);
    // Above the field, kept inside the preview; below it when there is no room above.
    const box = container.getBoundingClientRect();
    const rect = field.getBoundingClientRect();
    const left = Math.max(4, Math.min(rect.left - box.left, box.width - bar.offsetWidth - 4));
    let top = rect.top - box.top - bar.offsetHeight - 6;
    if (top < 4) top = rect.bottom - box.top + 6;
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }
  // The preview redraws after a change: wait for an element to appear again, then run fn on it.
  function whenFound(container, selector, fn) {
    let tries = 0;
    const find = () => {
      const el = container.querySelector(selector);
      if (el) fn(el);
      else if (tries++ < 40) window.setTimeout(find, 50);
    };
    window.setTimeout(find, 0);
  }
  function moveEventFromPreview(container, id, delta) {
    const events = bridge.snapshot().events;
    const index = events.findIndex(event => event.id === id);
    if (index < 0 || index + delta < 0 || index + delta >= events.length) return;
    bridge.moveEvent(id, index + delta);
    // Keep the event in view with its bar, so it can be moved again.
    whenFound(container, `[data-edit="event:title"][data-id="${id}"]`, el => {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      showEventBar(container, el);
    });
  }
  function removeEventFromPreview(container, id) {
    const removed = bridge.removeEvent(id);
    if (!removed) return;
    setNotice(container, `Removed "${removed.item.title || 'event'}".`, 'info', 9000, {
      label: 'Undo',
      run: () => bridge.restoreEvent(removed.item, removed.index)
    });
  }

  // ---- Events: "+ Add event" under the events list offers the quick-add choices and a custom event.
  function chip(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'edit-chip';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
  function toggleEventMenu(container, button) {
    const wrap = button.closest('[data-add-wrap]');
    if (!wrap) return;
    const open = wrap.querySelector('.edit-menu');
    if (open) {
      open.remove();
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    const menu = document.createElement('div');
    menu.className = 'edit-menu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Event choices');
    for (const title of bridge.eventPresets().slice(0, 6)) menu.append(chip(title, () => addEventFromPreview(container, title, false)));
    menu.append(chip('Custom event', () => addEventFromPreview(container, 'New event', true)));
    wrap.append(menu);
    button.setAttribute('aria-expanded', 'true');
  }
  // On a phone the invitation is only a preview: an event's time, venue, dress code and the rest are filled in on the Edit view, which
  // people do not think to open. So an event that is added, or tapped, in the preview opens its form there (the editor listens).
  function phoneLayout() { return Boolean(window.matchMedia && window.matchMedia('(max-width: 767px)').matches); }
  function openEventForm(id, rename) {
    window.dispatchEvent(new CustomEvent('invitestudio:open-event', { detail: { id, rename: Boolean(rename) } }));
  }
  function addEventFromPreview(container, title, rename) {
    const id = bridge.addEvent(title);
    if (!id) return;
    if (phoneLayout()) { openEventForm(id, rename); return; }
    // The preview redraws after the save: wait for the new event, bring it into view, and (custom) start renaming it.
    let tries = 0;
    const find = () => {
      const el = container.querySelector(`[data-edit="event:title"][data-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (rename) startEditing(el);
      } else if (tries++ < 40) {
        window.setTimeout(find, 50);
      }
    };
    window.setTimeout(find, 0);
  }

  function enableTextEditing(container) {
    // Editable text is a text box that is read-only until it is activated (a button would announce it as an action).
    container.querySelectorAll('[data-edit]').forEach(el => {
      el.tabIndex = 0;
      el.setAttribute('role', 'textbox');
      el.setAttribute('aria-readonly', 'true');
      el.title = 'Click to edit';
    });
    // The design's "Your photo" placeholders become buttons that add photos.
    container.querySelectorAll('[data-photo-add]').forEach(el => {
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      // Gallery tiles add to the gallery; a placeholder for the cover, story or venue picture says so and adds to that spot only.
      const place = el.getAttribute('data-photo-add');
      el.title = place && PHOTO_SPOT_LABELS[place] ? `Click to add the ${SLOT_NAMES[place]}` : 'Click to add photos';
      el.textContent = place && PHOTO_SPOT_LABELS[place] ? `+ Add ${PHOTO_SPOT_LABELS[place]}` : '+ Add photos';
    });
    if (container.dataset.editWired) return;
    container.dataset.editWired = '1';
    const fieldOf = event => {
      const el = event.target instanceof Element ? event.target.closest('[data-edit]') : null;
      return el && el.contentEditable !== 'true' ? el : null;
    };
    container.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && target.closest('[data-hint-close]')) {
        if (previewNotice) previewNotice = null;
        else markHintSeen();
        container.querySelector('.edit-hint')?.remove();
        return;
      }
      const action = target && target.closest('[data-hint-action]');
      if (action) {
        const run = previewNotice && previewNotice.action ? previewNotice.action.run : null;
        previewNotice = null;
        container.querySelector('.edit-hint')?.remove();
        if (run) run();
        return;
      }
      const bar = target && target.closest('[data-event-bar]');
      if (bar) {
        const move = target.closest('[data-event-move]');
        if (move) moveEventFromPreview(container, bar.dataset.id, Number(move.getAttribute('data-event-move')));
        else if (target.closest('[data-event-remove]')) removeEventFromPreview(container, bar.dataset.id);
        return;
      }
      const addEvent = target && target.closest('[data-add-event]');
      if (addEvent) {
        toggleEventMenu(container, addEvent);
        return;
      }
      if (target && target.closest('[data-photo-add]')) {
        startPhotoAdd(container, target.closest('[data-photo-add]').getAttribute('data-photo-add') || 'gallery');
        return;
      }
      const photoBar = target && target.closest('[data-photo-bar]');
      if (photoBar) {
        if (target.closest('[data-photo-replace]')) startPhotoReplace(container, photoBar.dataset.id);
        else if (target.closest('[data-photo-remove]')) void removePhotoFromPreview(container, photoBar.dataset.id);
        return;
      }
      const picture = target && target.closest('img');
      if (picture && showPhotoBar(container, picture)) return;
      hidePhotoBar(container);
      const el = fieldOf(event);
      if (el) {
        // On a phone, tapping an event's name or venue opens the whole event (not just that one line) on the Edit view.
        if (/^event:/.test(el.dataset.edit || '') && el.dataset.id && phoneLayout()) { openEventForm(el.dataset.id, false); return; }
        startEditing(el);
      }
    });
    // The event bar follows the pointer or focus; it stays while the pointer is on it.
    container.addEventListener('mouseover', event => {
      const target = event.target instanceof Element ? event.target : null;
      const field = target && target.closest('[data-edit^="event:"]');
      if (field) showEventBar(container, field);
      else if (target && target.closest('[data-event-bar]')) window.clearTimeout(eventBarTimer);
      else if (container.querySelector('[data-event-bar]')) hideEventBar(container, 350);
    });
    container.addEventListener('focusin', event => {
      const field = event.target instanceof Element ? event.target.closest('[data-edit^="event:"]') : null;
      if (field) showEventBar(container, field);
    });
    container.addEventListener('focusout', event => {
      if (event.target instanceof Element && event.target.closest('[data-edit^="event:"]')) hideEventBar(container, 600);
    });
    container.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const photo = event.target instanceof Element ? event.target.closest('[data-photo-add]') : null;
      if (photo) {
        event.preventDefault();
        startPhotoAdd(container, photo.getAttribute('data-photo-add') || 'gallery');
        return;
      }
      const el = fieldOf(event);
      if (el) {
        event.preventDefault();
        startEditing(el);
      }
    });
  }

  // The date opens the browser's own date picker; the choice is saved as the event date.
  function pickDate(el) {
    const root = el.getRootNode();
    const input = document.createElement('input');
    input.type = 'date';
    input.value = el.dataset.raw || '';
    input.setAttribute('aria-label', 'Date');
    const r = el.getBoundingClientRect();
    input.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${Math.max(r.width, 160)}px;height:${Math.max(r.height, 40)}px;opacity:0;border:0;padding:0;z-index:9999`;
    const done = () => input.remove();
    input.addEventListener('change', () => {
      if (input.value && input.value !== el.dataset.raw) bridge.update({ date: input.value });
      done();
    });
    input.addEventListener('keydown', event => { if (event.key === 'Escape') done(); });
    root.appendChild(input);
    input.focus();
    try { input.showPicker(); } catch { input.click(); }
  }

  function startEditing(el) {
    const field = el.dataset.edit;
    // Tell the panel which field is being edited, so it can show it too.
    try { window.dispatchEvent(new CustomEvent('invitestudio:edit-field', { detail: { field, id: el.dataset.id || '' } })); } catch (e) { /* no panel to tell */ }
    if (field === 'date') { pickDate(el); return; }
    const multiline = el.dataset.multiline === '1'; // the story: Enter starts a new paragraph, Ctrl/Cmd+Enter saves
    const shown = el.innerHTML; // restored on cancel or when nothing changed
    const plain = el.dataset.raw !== undefined ? el.dataset.raw : el.textContent; // the value as typed, not uppercased
    let cancelled = false;
    el.textContent = plain;
    el.contentEditable = 'true';
    el.removeAttribute('aria-readonly');
    el.spellcheck = false;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const onKeydown = event => {
      if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        el.blur();
      } else if (event.key === 'Escape') {
        cancelled = true;
        el.blur();
      }
    };
    // Pasted text keeps its words but not its formatting; one-line fields also turn line breaks into spaces.
    const onPaste = event => {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, multiline ? text : text.replace(/\s*\r?\n\s*/g, ' '));
    };
    const onBlur = () => {
      el.removeEventListener('keydown', onKeydown);
      el.removeEventListener('paste', onPaste);
      el.removeEventListener('blur', onBlur);
      el.contentEditable = 'false';
      el.setAttribute('aria-readonly', 'true');
      const value = multiline
        ? el.innerText.split(/\n+/).map(line => line.trim()).filter(Boolean).join('\n')
        : el.textContent.trim();
      const before = multiline ? plain.split(/\n+/).map(line => line.trim()).filter(Boolean).join('\n') : plain.trim();
      // Cancelled, unchanged, or a blank name (a blank name would fall back to the example names): keep what was there.
      if (cancelled || value === before || (field === 'title' && !value)) {
        el.innerHTML = shown;
        return;
      }
      // The names are one title: a half can be cleared, but not both halves together.
      if (field.indexOf('names:') === 0 && ![value, el.dataset.other].join('').trim()) {
        el.innerHTML = shown;
        return;
      }
      markHintSeen(); // they have found it, so the tip is not needed again
      saveField(el, field, value);
    };
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('paste', onPaste);
    el.addEventListener('blur', onBlur);
  }

  // Saves one edited value through the same calls the panel makes.
  function saveField(el, field, value) {
    if (field.indexOf('copy:') === 0) return bridge.setCopy(field.slice(5), value);
    if (field === 'location:venue') return bridge.update({ location: [value, el.dataset.other].filter(Boolean).join(', ') });
    if (field === 'location:place') return bridge.update({ location: [el.dataset.other, value].filter(Boolean).join(', ') });
    if (field === 'names:first') return bridge.update({ title: [value, el.dataset.other].filter(Boolean).join(' & ') });
    if (field === 'names:second') return bridge.update({ title: [el.dataset.other, value].filter(Boolean).join(' & ') });
    if (field === 'event:title') return bridge.updateEvent(el.dataset.id, { title: value });
    if (field === 'event:venue') return bridge.updateEvent(el.dataset.id, { venue: value });
    if (field === 'storyCopy') return bridge.update({ storyCopy: value });
    return bridge.update({ [field]: value }); // title, message, hosts: re-renders the preview and updates the panel field
  }

  const widths = { desktop: '100%', tablet: '768px', mobile: '390px' };
  const phoneWidths = { desktop: 1280, tablet: 768 };
  // The phone's Desktop and Tablet views lay the design out at its real width and scale it down with a transform. Not the CSS
  // zoom property: the designs use container query units, and iPhone Safari measures a zoomed container at its shrunken width,
  // which showed the phone layout with oversized text.
  const fitObservers = new WeakMap();
  function fitDeviceWidth(host, container, device) {
    const old = fitObservers.get(container);
    if (old) { old.disconnect(); fitObservers.delete(container); }
    container.style.zoom = '';
    const real = phoneWidths[device];
    if (real && host.clientWidth && window.matchMedia('(max-width: 767px)').matches) {
      container.style.width = real + 'px';
      container.style.maxWidth = 'none';
      container.style.margin = '0';
      container.style.transformOrigin = '0 0';
      const apply = () => {
        const k = Math.min(1, host.clientWidth / real);
        container.style.transform = k < 1 ? 'scale(' + k + ')' : '';
        container.style.marginBottom = k < 1 ? (-(container.offsetHeight * (1 - k))) + 'px' : '';
      };
      apply();
      if (window.ResizeObserver) {
        const observer = new ResizeObserver(apply);
        observer.observe(container);
        fitObservers.set(container, observer);
      }
    } else {
      container.style.transform = '';
      container.style.transformOrigin = '';
      container.style.marginBottom = '';
    }
  }

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

    // A read-only, watermarked link to the draft for family and friends. Resolves to whether it worked.
    copyPreviewLink() {
      return typeof window.copyDraftPreviewLink === 'function' ? window.copyDraftPreviewLink() : Promise.resolve(false);
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

    // Returns what was removed and where, so the caller can offer to undo it.
    removeEvent(eventId) {
      const p = project();
      if (!p) return null;
      const list = p.functions || [];
      const index = list.findIndex(x => x.id === eventId);
      const item = index >= 0 ? list[index] : null;
      p.functions = list.filter(x => x.id !== eventId);
      p.updated = 'Just now';
      save();
      notify();
      return item ? { item, index } : null;
    },

    // Puts a removed event back where it was, with all its details.
    restoreEvent(item, index) {
      const p = project();
      if (!p || !item || !item.id) return;
      if (!Array.isArray(p.functions)) p.functions = [];
      if (p.functions.some(x => x.id === item.id)) return;
      p.functions.splice(Math.max(0, Math.min(p.functions.length, Number(index) || 0)), 0, item);
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
    mediaUpload(files, onProgress, slot) { return window.uploadMediaPhotos(files, onProgress, slot || ''); },
    mediaAlt(id, alt) { return window.setMediaAlt(id, alt); },
    mediaMove(id, delta) { return window.moveMediaPhoto(id, delta); },
    mediaRemove(id) { return window.deleteMediaPhoto(id); },
    mediaReplace(id, file, onProgress) { return window.replaceMediaPhoto(id, file, onProgress); },

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

    // On a phone the page is the device, so Tablet and Desktop are shown at their real width, scaled down to fit the screen.
    fitDevice(host, device) {
      const container = host.shadowRoot && host.shadowRoot.querySelector('.invitation-canvas');
      if (container) fitDeviceWidth(host, container, device);
    },

    renderInvitation(host, device) {
      const p = project();
      if (!p) return;
      const container = invitationShadow(host);
      container.style.width = widths[device] || '100%';
      container.style.maxWidth = '100%';
      container.style.margin = '0 auto';
      fitDeviceWidth(host, container, device);
      container.style.position = 'relative'; // the event bar is placed inside it
      // full=false: the editor canvas shows the invitation without its intro overlay.
      // Until the couple adds their names, the preview shows the template's example names.
      const shown = String(p.title || '').trim() ? p : { ...p, title: SAMPLE_NAMES, name: SAMPLE_NAMES };
      const design = tpl(p.templateId);
      withTemplate(host, container, design, () => {
        container.innerHTML = sitePreview(shown, design, false, { editable: true }) + EDIT_STYLE;
        showPill(container);
        if (window.hydratePackagedTemplates) window.hydratePackagedTemplates(container);
        enableTextEditing(container);
      });
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
      // A design with an opening screen waits for a click in the phone, so a visitor starts it themselves.
      withTemplate(host, container, t, () => {
        container.innerHTML = sitePreview(templateDemoProject(t), t, false, { intro: 'wait', sound: true, showcase: true });
        if (window.hydratePackagedTemplates) window.hydratePackagedTemplates(container);
      });
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
      syncCeremonyEvent(p);
      const saved = save();
      notify();
      return saved;
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

    openShareCard() { if (typeof window.openShareCard === 'function') window.openShareCard(current()); },
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

    confirm(options) {
      return askConfirm(options);
    },

    continueDraft() {
      if (typeof continueLastDraft === 'function') continueLastDraft();
    },

    // People who have a saved draft on this device get a "My invitations" link in the header.
    hasProjects() {
      return Array.isArray(state.projects) && state.projects.length > 0;
    },

    openProjects() {
      state.page = 'dashboard'; // render() gives the page its own address
      render();
      window.scrollTo(0, 0);
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
    // An address the site does not know (a mistyped link) shows the home page, not the older fallback screen.
    if (state.page === 'home') return { kind: 'home' };
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

  // On a phone, the on-screen keyboard covers half the screen. While a field is being typed in, the pinned bars (Continue, the
  // editor tabs) are hidden so they do not take the little room left, and the field is scrolled into the middle of what remains.
  (function keyboardRoom() {
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
    const typingTarget = event => {
      const el = (event.composedPath && event.composedPath()[0]) || event.target;
      if (!el || el.nodeType !== 1) return null;
      if (el.isContentEditable) return el;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return el;
      if (tag === 'INPUT' && !/^(button|submit|checkbox|radio|file|range|color|reset|image)$/i.test(el.type)) return el;
      return null;
    };
    const reveal = el => {
      const run = () => { try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* older browser */ } };
      setTimeout(run, 120); setTimeout(run, 450); // once before and once after the keyboard has slid up
    };
    const setKeyboard = on => { // the island's root element sits inside the shadow root
      const host = document.querySelector('.figma-island-host');
      const root = host && host.shadowRoot && host.shadowRoot.querySelector('.figma-app');
      if (root) root.toggleAttribute('data-keyboard', on);
    };
    let hideTimer = 0;
    document.addEventListener('focusin', event => {
      const el = typingTarget(event); if (!el) return;
      clearTimeout(hideTimer);
      setKeyboard(true);
      reveal(el);
    });
    document.addEventListener('focusout', () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { // a short wait, so moving from one field to the next keeps the bars hidden
        setKeyboard(false);
      }, 200);
    });
  }());

  // The My invitations page has its own address, so refreshing the browser keeps the person on it (not the home page).
  window.syncMyInvitationsUrl = function syncMyInvitationsUrl() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    try {
      if (state.page === 'dashboard' && path !== '/my-invitations') history.pushState({}, '', '/my-invitations');
      else if (state.page !== 'dashboard' && path === '/my-invitations') history.replaceState({}, '', '/');
    } catch { /* history may be unavailable in an embedded preview */ }
  };

  // Browser back and forward move between routes that the application state tracks.
  window.addEventListener('popstate', () => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (state.page === 'setup' && path !== '/') state.page = 'home'; // leaving the setup page by going back
    if (path === '/my-invitations') {
      state.page = Array.isArray(state.projects) && state.projects.length ? 'dashboard' : 'home';
    } else if (path === '/') {
      if (state.page !== 'home' && state.page !== 'editor' && state.page !== 'preview') state.page = 'home';
    } else if (path === '/templates') {
      state.page = 'home';
    }
    render();
  });
})();
