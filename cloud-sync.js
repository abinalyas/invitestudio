/* Phase 2 cloud draft adapter.
 *
 * The current editor still renders from its local project object. This adapter
 * mirrors that object to the server API, keeps the one-time edit token in a
 * browser-only session map, and hydrates cloud drafts when the browser opens
 * again. No Supabase credential is used here.
 */
(function installCloudDraftSync() {
  const tokenStorageKey = 'invitestudio-edit-tokens';
  const draftReferenceKey = 'invitestudio-current-draft';
  const projectMeta = new WeakMap();
  const maxRetries = 5;
  const PUBLISH_LABELS = { draft: 'Draft', published: 'Published', unpublished: 'Unpublished', archived: 'Archived' };

  function metaFor(project) {
    let meta = projectMeta.get(project);
    if (!meta) {
      meta = { timer: null, retryTimer: null, inFlight: false, revision: 0, retryCount: 0 };
      projectMeta.set(project, meta);
    }
    return meta;
  }

  function tokenMap() {
    try { return JSON.parse(localStorage.getItem(tokenStorageKey) || '{}'); } catch { return {}; }
  }

  function tokenFor(id) {
    return tokenMap()[id] || '';
  }

  function rememberToken(id, token) {
    try {
      const tokens = tokenMap();
      tokens[id] = token;
      localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
    } catch {
      // The local project remains usable even when browser storage is full.
    }
  }

  function forgetToken(id) {
    try {
      const tokens = tokenMap();
      delete tokens[id];
      localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
    } catch { /* best effort cleanup */ }
  }

  function draftReference() {
    try {
      const value = JSON.parse(localStorage.getItem(draftReferenceKey) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch { return null; }
  }

  function rememberDraftReference(project) {
    if (!project?.id) return;
    try {
      localStorage.setItem(draftReferenceKey, JSON.stringify({
        localId: project.id,
        cloudId: project.cloudId || null,
        updatedAt: Date.now()
      }));
    } catch { /* local project data is still retained when possible */ }
  }

  function projectForReference(reference = draftReference()) {
    if (!reference) return null;
    return state.projects.find(project =>
      (reference.localId && project.id === reference.localId) ||
      (reference.cloudId && project.cloudId === reference.cloudId) ||
      (reference.cloudId && project.id === reference.cloudId)
    ) || null;
  }

  function privateEditLink(project) {
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!project?.cloudId || !token || !window.location?.origin) return '';
    return `${window.location.origin}/edit#${encodeURIComponent(token)}`;
  }

  const editTokenPattern = /^[A-Za-z0-9_-]{32,256}$/;

  // Accepts the canonical fragment form (/edit#<token>) and the legacy path form
  // (/edit/<token>). Query-string forms are not accepted. The address bar is
  // cleaned before anything else runs, and a malformed value returns null
  // instead of throwing, so the app always boots.
  function parsePrivateEditLink() {
    if (!window.location) return null;
    const url = new URL(window.location.href);
    const legacy = url.pathname.match(/^\/edit\/([^/]+)\/?$/i);
    const atEditPath = /^\/edit\/?$/i.test(url.pathname);
    if (!legacy && !atEditPath) return null;
    let token = url.hash.replace(/^#/, '');
    if (legacy) {
      try { token = decodeURIComponent(legacy[1]); } catch { token = ''; }
    }
    try {
      window.history.replaceState({}, document.title, '/');
    } catch { /* history may be unavailable in an embedded preview */ }
    return editTokenPattern.test(token) ? { token } : null;
  }

  function recoveredProject(id) {
    return state.projects.find(project => project.cloudId === id || project.id === id) || {
      id,
      cloudId: id,
      name: 'Loading invitation draft…',
      category: 'Wedding',
      templateId: 'eternal',
      status: 'Draft',
      updated: 'Just now',
      title: '',
      date: '',
      location: '',
      message: '',
      story: '',
      functions: [],
      theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' },
      sections: [],
      photos: [],
      published: false
    };
  }

  // Events are restored from wedding.content.functions by mergeServerWedding().
  // Only photo metadata is merged here.
  function mergeRecoveredChildren(project, result) {
    if (Array.isArray(result?.photos)) project.galleryMetadata = result.photos;
  }

  async function recoverFromPrivateLink(link) {
    state.recoveryStatus = 'loading';
    state.recoveryError = '';
    state.page = 'home';
    render();
    if (!window.inviteStudioApi?.enabled) {
      state.recoveryStatus = 'error';
      state.recoveryError = 'Cloud recovery is unavailable in this environment.';
      render();
      return;
    }
    try {
      const result = await window.inviteStudioApi.getWeddingByEditToken(link.token);
      const id = result.wedding.id;
      rememberToken(id, link.token);
      const project = recoveredProject(id);
      if (!state.projects.includes(project)) state.projects.unshift(project);
      state.currentId = project.id;
      state.page = 'editor';
      rememberDraftReference(project);
      // Keep any same-browser photo bytes; cloud recovery currently restores
      // gallery metadata, while binary media is handled by the media phase.
      mergeServerWedding(project, result.wedding, true);
      mergeRecoveredChildren(project, result);
      project.cloudStatus = 'saved';
      project.cloudSavedAt = Date.now();
      state.recoveryStatus = 'ready';
      state.recoveryError = '';
      localSave();
      render();
      toast('Private draft recovered — continue editing where you left off.');
    } catch (error) {
      state.recoveryStatus = 'error';
      state.recoveryError = error.message || 'This private edit link is no longer available.';
      render();
      toast('We could not recover that private draft.');
    }
  }

  function recoveryCard() {
    const project = projectForReference();
    if (!project) return '';
    const cloud = Boolean(project.cloudId);
    const title = project.name || project.title || 'Your invitation draft';
    const status = project.cloudStatus === 'error'
      ? 'Your local copy is safe. Check your connection and try again.'
      : cloud ? 'Your latest changes are saved securely in the cloud.' : 'Your draft is saved on this device.';
    return `<section class="container" aria-label="Continue your draft" style="margin-top:18px"><div style="display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#f3eee5;border:1px solid #dfd4c5;border-radius:12px;padding:18px 20px"><div><div class="eyebrow">Welcome back</div><strong style="font-family:var(--serif);font-size:22px">Continue ${esc(title)}</strong><p class="tiny muted" style="margin:5px 0 0">${esc(status)}</p>${state.recoveryError?`<p class="tiny" role="alert" style="color:#9b5147;margin:5px 0 0">${esc(state.recoveryError)}</p>`:''}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn dark" onclick="continueLastDraft()">Continue editing</button><button class="btn" onclick="startCreate()">＋ New website</button></div></div></section>`;
  }

  window.copyPrivateEditLink = async function copyPrivateEditLink() {
    const link = privateEditLink(typeof current === 'function' ? current() : null);
    if (!link) { toast('A private edit link is available after cloud draft creation.'); return; }
    try {
      await navigator.clipboard.writeText(link);
      toast('Private edit link copied. Keep it safe.');
    } catch {
      window.prompt('Copy your private edit link:', link);
    }
  };

  // The couple's replies (private: needs the edit token this device holds).
  window.loadRsvpReplies = async function loadRsvpReplies() {
    const project = typeof currentProject === 'function' ? currentProject() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!token || !window.inviteStudioApi?.enabled) throw Object.assign(new Error('Replies are saved with your invitation online.'), { code: 'NOT_SAVED_ONLINE' });
    return window.inviteStudioApi.listRsvps(project.cloudId, token);
  };
  window.deleteRsvpReply = async function deleteRsvpReply(replyId) {
    const project = typeof currentProject === 'function' ? currentProject() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!token || !window.inviteStudioApi?.enabled) throw new Error('Not saved online.');
    return window.inviteStudioApi.deleteRsvp(project.cloudId, token, replyId);
  };
  window.regeneratePrivateEditLink = async function regeneratePrivateEditLink() {
    const project = typeof current === 'function' ? current() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!project?.cloudId || !token || !window.inviteStudioApi?.enabled) {
      toast('An active private edit link is required to regenerate access.');
      return;
    }
    if (!window.confirm('Regenerate this private edit link? The previous link will stop working.')) return;
    try {
      const result = await window.inviteStudioApi.regenerateEditToken(project.cloudId, token);
      rememberToken(project.cloudId, result.editToken);
      project.editTokenExpiresAt = result.editTokenExpiresAt;
      project.cloudStatus = 'saved';
      localSave();
      decorateRecoveryUi(project);
      toast('Private edit link regenerated. The previous link is revoked.');
    } catch (error) {
      toast(error.message || 'The private edit link could not be regenerated.');
    }
  };

  window.revokePrivateEditLinks = async function revokePrivateEditLinks() {
    const project = typeof current === 'function' ? current() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!project?.cloudId || !token || !window.inviteStudioApi?.enabled) {
      toast('No active private edit link is available.');
      return;
    }
    if (!window.confirm('Revoke every private edit link for this draft? This cannot be undone.')) return;
    try {
      await window.inviteStudioApi.revokeEditTokens(project.cloudId, token);
      forgetToken(project.cloudId);
      project.cloudStatus = 'token-missing';
      project.cloudError = 'Private edit links have been revoked.';
      localSave();
      render();
      toast('All private edit links have been revoked.');
    } catch (error) {
      toast(error.message || 'The private edit links could not be revoked.');
    }
  };

  window.continueLastDraft = async function continueLastDraft() {
    const project = projectForReference();
    const reference = draftReference();
    if (!project && reference?.cloudId && tokenFor(reference.cloudId)) {
      await recoverFromPrivateLink({ id: reference.cloudId, token: tokenFor(reference.cloudId) });
      return;
    }
    if (!project) { toast('This draft is no longer available on this device.'); return; }
    state.currentId = project.id;
    state.page = 'editor';
    state.editorTab = 'Sections';
    state.recoveryError = '';
    rememberDraftReference(project);
    render();
    if (project.cloudId && tokenFor(project.cloudId) && window.inviteStudioApi?.enabled) {
      try {
        const result = await window.inviteStudioApi.getWedding(project.cloudId, tokenFor(project.cloudId));
        mergeServerWedding(project, result.wedding, true);
        mergeRecoveredChildren(project, result);
        project.cloudStatus = 'saved';
        project.cloudSavedAt = Date.now();
        localSave();
        render();
      } catch (error) {
        project.cloudStatus = 'error';
        project.cloudError = error.message;
        localSave();
        paintStatus(project);
        toast('Cloud draft could not be refreshed. Your local copy is still available.');
      }
    }
  };

  // Who can see and edit a draft, in plain words. The key to a draft is held by this browser (there is no sign-in), so
  // clearing browser data or switching device needs the private link.
  window.draftAccessNote = () => {
    const project = projectForReference();
    return project?.cloudId
      ? 'Only you can see it, and it is not public until you share it. This browser holds the key, so on another device (or after clearing browser data) open it with your private link: choose Copy private link in the editor. Anyone with that link can edit, so keep it to yourself.'
      : 'Only you can see it, and it is not public until you share it. It is saved in this browser only, so it will not open on another device.';
  };
  window.draftRecoveryCard = recoveryCard;
  window.draftStorageNote = () => {
    const project = projectForReference();
    return project?.cloudId
      ? 'Your draft is private and saved in the cloud.'
      : 'Drafts are saved on this device until cloud setup is available.';
  };

  function galleryPayload(project) {
    return {
      preference: project.preferences?.gallery || 'gallery',
      photos: (project.photos || []).map(photo => ({
        alt: photo.alt || '',
        storagePath: photo.storagePath || null,
        width: Number.isInteger(photo.width) ? photo.width : null,
        height: Number.isInteger(photo.height) ? photo.height : null
      }))
    };
  }

  // Image and audio data URLs are never sent to the server: they are too large for a
  // save and are not stored in the database. Media stays on this device until media
  // storage exists. Hero images are not sent either; that control is gated too.
  function transferableIntro(intro) {
    const out = {};
    for (const [key, value] of Object.entries(intro && typeof intro === 'object' ? intro : {})) {
      if (typeof value === 'string' && /^data:/i.test(value.trim())) continue;
      out[key] = value;
    }
    return out;
  }

  function transferablePreferences(preferences) {
    const { heroImageUrl, ...rest } = preferences && typeof preferences === 'object' ? preferences : {};
    return rest;
  }

  function cloudPayload(project) {
    return {
      name: project.name || project.title || 'Untitled wedding',
      category: project.category || 'Wedding',
      templateId: project.templateId,
      title: project.title || (project.category === 'Wedding' ? 'Our wedding' : 'Our celebration'),
      date: project.date || null,
      location: project.location || '',
      message: project.message || '',
      story: project.story || '',
      hosts: project.hosts || '',
      locale: project.locale || 'English',
      theme: project.theme || {},
      preferences: transferablePreferences(project.preferences),
      culturalPreferences: project.culturalPreferences || {},
      sections: project.sections || [],
      introSettings: transferableIntro(project.introSettings),
      animationSettings: project.animationSettings || {},
      functions: window.InviteEventFields.cloudEvents(project.functions),
      copy: project.copy && typeof project.copy === 'object' ? project.copy : {},
      gallery: galleryPayload(project)
    };
  }

  function mergeServerWedding(project, wedding, preserveLocalPhotos = true) {
    if (!wedding) return;
    project.cloudId = wedding.id;
    project.cloudVersion = wedding.version;
    // Publish state is kept apart from save state (cloudStatus holds saving/saved/...).
    project.publishStatus = wedding.status || 'draft';
    project.publicSlug = wedding.slug || project.publicSlug || null;
    project.published = wedding.status === 'published';
    project.status = PUBLISH_LABELS[wedding.status] || 'Draft';
    project.updated = wedding.updated_at || 'Just now';
    project.name = wedding.name || project.name;
    project.category = wedding.category || project.category;
    project.templateId = wedding.template_id || project.templateId;
    // The server needs some title, so a draft without names is stored as "Our wedding". That stand-in must not
    // come back as if the couple had typed it.
    const standIn = wedding.title === 'Our wedding' || wedding.title === 'Our celebration';
    project.title = standIn && !String(project.title || '').trim() ? '' : (wedding.title || project.title);
    project.date = wedding.event_date || project.date || '';
    project.location = wedding.location || '';
    project.message = wedding.message || '';
    project.story = wedding.story || '';
    project.hosts = wedding.hosts || '';
    project.locale = wedding.locale || 'English';
    project.theme = wedding.theme || project.theme || {};
    project.preferences = wedding.preferences || project.preferences || {};
    project.culturalPreferences = wedding.cultural_preferences || project.culturalPreferences || {};
    project.sections = wedding.sections || project.sections || [];
    // Local-only media (data URLs) is kept when the server copy is merged in.
    const localMedia = Object.fromEntries(Object.entries(project.introSettings || {})
      .filter(([, value]) => typeof value === 'string' && /^data:/i.test(value.trim())));
    project.introSettings = { ...(wedding.intro_settings || {}), ...localMedia };
    project.animationSettings = wedding.animation_settings || project.animationSettings || {};
    const content = wedding.content && typeof wedding.content === 'object' ? wedding.content : {};
    // Keep what was typed when the server's copy is just what we sent (cleaned up); take the server's otherwise.
    if (Array.isArray(content.functions) && !window.InviteEventFields.sameEvents(window.InviteEventFields.cloudEvents(project.functions), content.functions)) project.functions = content.functions;
    if (content.copy && typeof content.copy === 'object') project.copy = content.copy;
    if (content.gallery?.preference) {
      project.preferences = { ...(project.preferences || {}), gallery: content.gallery.preference };
    }
    if (Array.isArray(content.gallery?.photos)) project.galleryMetadata = content.gallery.photos;
    if (!preserveLocalPhotos && Array.isArray(content.gallery?.photos)) project.photos = content.gallery.photos;
    return project;
  }

  function localSave() {
    try {
      localStorage.setItem('invitestudio-projects', JSON.stringify(state.projects));
      if (typeof current === 'function') rememberDraftReference(current());
      state.saveFailed = false;
      state.saveStatus = 'saved';
      return true;
    } catch {
      state.saveFailed = true;
      state.saveStatus = 'failed';
      return false;
    }
  }

  function paintStatus(project) {
    if (typeof window.paintSetupStatus === 'function') window.paintSetupStatus();
    // Figma islands subscribe to save status; tell them whenever it may have changed.
    if (typeof window.notifyInviteStudioChange === 'function') window.notifyInviteStudioChange();
    const status = document.querySelector('.status');
    if (!status || !project || typeof window.cloudSaveLabel !== 'function') return;
    status.setAttribute('aria-label', window.cloudSaveLabel(project));
    const text = [...status.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (text) text.textContent = ` ${window.cloudSaveLabel(project)}`;
  }

  function decorateRecoveryUi(project) {
    const note = document.querySelector('.dashboard-data-note strong');
    if (note && typeof window.draftStorageNote === 'function') note.textContent = window.draftStorageNote();
    const toolbarLink = document.querySelector('[data-private-edit-link]');
    if (!project?.cloudId || !tokenFor(project.cloudId) || state.page !== 'editor') {
      toolbarLink?.remove();
      return;
    }
    const actions = document.querySelector('.editor-toolbar .right');
    if (!actions || actions.querySelector('[data-private-edit-link]')) return;
    const button = document.createElement('button');
    button.className = 'btn small';
    button.type = 'button';
    button.dataset.privateEditLink = 'true';
    button.textContent = 'Copy private link';
    button.title = 'Copy a private link that lets you edit this draft';
    button.onclick = () => window.copyPrivateEditLink();
    actions.insertBefore(button, actions.firstChild);
    decorateTokenControls(project);
  }

  function decorateTokenControls(project) {
    if (state.editorTab !== 'Settings') return;
    const panel = document.querySelector('.editor-panel');
    if (!panel || panel.querySelector('[data-edit-token-controls]')) return;
    const controls = document.createElement('section');
    controls.className = 'editor-control';
    controls.dataset.editTokenControls = 'true';
    controls.style.marginTop = '24px';
    controls.innerHTML = `<h3>Private editing access</h3><p class="tiny muted">Anyone with this link can edit this private draft. Keep it safe and regenerate it if you think it was shared.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" type="button" data-copy-edit-link>Copy private link</button><button class="btn small" type="button" data-regenerate-edit-link>Regenerate link</button><button class="btn small" type="button" data-revoke-edit-link>Revoke all links</button></div>`;
    controls.querySelector('[data-copy-edit-link]').onclick = () => window.copyPrivateEditLink();
    controls.querySelector('[data-regenerate-edit-link]').onclick = () => window.regeneratePrivateEditLink();
    controls.querySelector('[data-revoke-edit-link]').onclick = () => window.revokePrivateEditLinks();
    panel.append(controls);
  }

  function markDirty(project) {
    if (!project) return;
    const meta = metaFor(project);
    meta.revision += 1;
    meta.retryCount = 0;
    project.cloudStatus = project.cloudId ? 'pending' : 'local';
    project.cloudError = '';
    paintStatus(project);
  }

  function queueCloudSave(project, delay = 650) {
    if (!project?.cloudId || !tokenFor(project.cloudId) || !window.inviteStudioApi?.enabled) return;
    const meta = metaFor(project);
    clearTimeout(meta.timer);
    clearTimeout(meta.retryTimer);
    meta.timer = setTimeout(() => syncProject(project), delay);
  }

  // Sends any unsaved change right away when the page is closed, reloaded or hidden,
  // so a change made just before leaving is not lost to the autosave delay.
  function flushPendingCloudSaves() {
    for (const project of state.projects) {
      if (project.cloudStatus !== 'pending' || !project.cloudId || !tokenFor(project.cloudId)) continue;
      const meta = metaFor(project);
      clearTimeout(meta.timer);
      clearTimeout(meta.retryTimer);
      syncProject(project, { keepalive: true });
    }
  }

  function scheduleCloudSave(project) {
    markDirty(project);
    queueCloudSave(project);
  }

  function shouldRetry(error) {
    return !error?.code || error.status >= 500 || error.status === 408 || error.status === 429;
  }

  function retryDelay(attempt) {
    return Math.min(15000, 1000 * (2 ** Math.max(0, attempt - 1)));
  }

  async function syncProject(project, options = {}) {
    if (!project?.cloudId || !tokenFor(project.cloudId) || !window.inviteStudioApi?.enabled) return;
    const meta = metaFor(project);
    if (meta.inFlight) {
      queueCloudSave(project);
      return;
    }
    const version = Number(project.cloudVersion);
    if (!Number.isInteger(version) || version < 1) return;
    const revisionAtRequest = meta.revision;
    const payload = JSON.parse(JSON.stringify(cloudPayload(project)));
    meta.inFlight = true;
    project.cloudStatus = 'saving';
    paintStatus(project);
    try {
      const result = await window.inviteStudioApi.updateWedding(
        project.cloudId,
        tokenFor(project.cloudId),
        { version, ...payload },
        { keepalive: options.keepalive === true }
      );
      const isCurrent = meta.revision === revisionAtRequest;
      if (isCurrent) mergeServerWedding(project, result.wedding);
      else project.cloudVersion = result.wedding?.version || project.cloudVersion;
      project.cloudStatus = isCurrent ? 'saved' : 'pending';
      project.cloudSavedAt = Date.now();
      project.cloudError = '';
      meta.retryCount = 0;
      localSave();
      paintStatus(project);
      if (!isCurrent) queueCloudSave(project);
    } catch (error) {
      const conflict = error.code === 'VERSION_CONFLICT';
      project.cloudStatus = conflict ? 'conflict' : 'error';
      project.cloudError = error.message;
      localSave();
      paintStatus(project);
      if (conflict) {
        if (window.toast) toast('This draft changed elsewhere. Reload it before continuing.');
      } else if (shouldRetry(error) && meta.retryCount < maxRetries) {
        meta.retryCount += 1;
        project.cloudStatus = 'retrying';
        paintStatus(project);
        meta.retryTimer = setTimeout(() => syncProject(project), retryDelay(meta.retryCount));
      } else if (window.toast) {
        toast('Cloud save failed. Your local draft is still safe; try again when online.');
      }
    } finally {
      meta.inFlight = false;
      if (meta.revision > revisionAtRequest && project.cloudStatus !== 'conflict') queueCloudSave(project);
    }
  }

  async function createCloudDraft(project, attempt = 0) {
    if (!project || project.cloudId || !window.inviteStudioApi?.enabled) return;
    const meta = metaFor(project);
    if (meta.inFlight) return;
    const revisionAtCreate = meta.revision;
    // One key per creation attempt, persisted with the project so retries and
    // reloads reuse it. The server treats a repeated key as the same creation.
    if (!project.createRequestId) project.createRequestId = crypto.randomUUID();
    meta.inFlight = true;
    project.cloudStatus = 'creating';
    localSave();
    paintStatus(project);
    try {
      const result = await window.inviteStudioApi.createWedding(
        JSON.parse(JSON.stringify(cloudPayload(project))),
        project.createRequestId
      );
      project.createRequestId = null;
      const oldId = project.id;
      project.id = result.wedding.id;
      project.cloudId = result.wedding.id;
      rememberToken(project.cloudId, result.editToken);
      rememberDraftReference(project);
      if (state.currentId === oldId) state.currentId = project.id;
      const isCurrent = meta.revision === revisionAtCreate;
      if (isCurrent) mergeServerWedding(project, result.wedding);
      else {
        project.cloudVersion = result.wedding.version;
        project.cloudStatus = 'pending';
      }
      project.cloudStatus = isCurrent ? 'saved' : 'pending';
      project.cloudSavedAt = isCurrent ? Date.now() : project.cloudSavedAt;
      localSave();
      // Targeted refresh only: a full render() would rebuild the setup form and wipe
      // anything the user is typing while the create request was in flight.
      paintStatus(project);
      decorateRecoveryUi(project);
      if (!isCurrent) queueCloudSave(project);
    } catch (error) {
      // A replay that is too old cannot be recovered with the same key.
      if (error.code === 'CREATE_REPLAY_EXPIRED') project.createRequestId = null;
      project.cloudStatus = shouldRetry(error) && attempt < maxRetries ? 'retrying' : 'local';
      project.cloudError = error.message;
      localSave();
      if (attempt < maxRetries && shouldRetry(error)) {
        meta.retryTimer = setTimeout(() => createCloudDraft(project, attempt + 1), retryDelay(attempt + 1));
      } else {
        paintStatus(project);
        decorateRecoveryUi(project);
        if (window.toast) toast('Cloud draft could not be created. Your local draft is still available.');
      }
    } finally {
      meta.inFlight = false;
    }
  }

  async function hydrateCloudProjects() {
    if (!window.inviteStudioApi?.enabled) return;
    // Resume a creation that was interrupted by a reload or a closed tab.
    for (const project of state.projects.filter(item => !item.cloudId && item.createRequestId)) {
      createCloudDraft(project);
    }
    for (const project of state.projects.filter(item => item.cloudId)) {
      const token = tokenFor(project.cloudId);
      if (!token) {
        project.cloudStatus = 'token-missing';
        continue;
      }
      const hasUnsavedLocalChanges = ['pending', 'saving', 'retrying', 'error'].includes(project.cloudStatus);
      if (hasUnsavedLocalChanges) {
        const meta = metaFor(project);
        meta.revision = Math.max(meta.revision, 1);
        project.cloudStatus = 'pending';
        queueCloudSave(project, 0);
        continue;
      }
      try {
        const result = await window.inviteStudioApi.getWedding(project.cloudId, token);
        mergeServerWedding(project, result.wedding);
        project.cloudStatus = 'saved';
        paintStatus(project);
      } catch (error) {
        if (error.code === 'EDIT_TOKEN_INVALID') forgetToken(project.cloudId);
        project.cloudStatus = 'error';
        project.cloudError = error.message;
      }
    }
    localSave();
    if (state.page === 'home' || state.page === 'dashboard' || state.page === 'editor') {
      render();
      paintStatus(typeof current === 'function' ? current() : null);
    }
  }

  window.cloudSaveLabel = project => {
    if (project?.cloudStatus === 'creating') return 'Creating cloud draft…';
    if (project?.cloudStatus === 'pending') return 'Saving changes…';
    if (project?.cloudStatus === 'saving') return 'Saving to cloud…';
    if (project?.cloudStatus === 'retrying') return 'Retrying save…';
    if (project?.cloudStatus === 'saved') {
      const age = project.cloudSavedAt ? Date.now() - project.cloudSavedAt : 0;
      if (age < 60000) return 'Saved just now ✓';
      if (age < 3600000) return `Saved ${Math.max(1, Math.floor(age / 60000))} min ago ✓`;
      return 'Saved ✓';
    }
    if (project?.cloudStatus === 'conflict') return 'Save conflict — reload';
    if (project?.cloudStatus === 'error') return 'Cloud save failed — local copy safe';
    if (project?.cloudStatus === 'token-missing') return 'Edit link unavailable — local copy safe';
    return 'Saved on this device';
  };

  window.retryCloudSave = function retryCloudSave() {
    const project = typeof current === 'function' ? current() : null;
    if (!project) return;
    const meta = metaFor(project);
    meta.retryCount = 0;
    project.cloudStatus = 'pending';
    project.cloudError = '';
    paintStatus(project);
    queueCloudSave(project, 0);
  };

  // ---- Publishing (cloud drafts) -------------------------------------------------
  // The server is authoritative for slugs (format, reserved words, availability and the
  // live-address confirmation). This dialog checks early and explains the outcome.
  const RESERVED_SLUG_WORDS = new Set([
    'api', 'admin', 'edit', 's', 'w', 'assets', 'static', 'public', 'login', 'signup',
    'dashboard', 'templates', 'pricing', 'privacy', 'terms', 'support', 'help', 'www',
    'mail', 'root', 'null', 'undefined'
  ]);

  function suggestSlug(title) {
    const base = String(title || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '');
    return base || 'our-wedding';
  }

  // Same limit as the server (SLUG_MAX_LENGTH in functions/_shared/api.js).
  const SLUG_MAX_LENGTH = 60;

  // A live invitation may keep its own longer address; only a new address must fit the limit.
  function slugProblem(slug, ownAddress = '') {
    if (!slug) return 'Choose a web address for your invitation.';
    if (slug.length > SLUG_MAX_LENGTH && slug !== ownAddress) return `Keep the web address to ${SLUG_MAX_LENGTH} characters or fewer.`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Use lowercase letters, numbers and single hyphens only.';
    if (RESERVED_SLUG_WORDS.has(slug)) return 'That web address is reserved. Choose another.';
    return '';
  }

  function publicLinkFor(slug) {
    return `${window.location.origin}/s/${slug}`;
  }

  function findCloudProject(projectId) {
    return state.projects.find(project => project.cloudId === projectId || project.id === projectId) || null;
  }

  function publishStatusLabel(project) {
    return PUBLISH_LABELS[project.publishStatus] || 'Draft';
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Dialog session: the address being typed, its availability, and whether a live address
  // is being changed. Kept per dialog opening.
  let publishSession = null;
  let availabilityTimer = null;

  function newPublishSession(project) {
    const current = project.publicSlug || '';
    return {
      projectId: project.id,
      typed: current || suggestSlug(project.title || project.name),
      changing: false,
      confirmed: false,
      availability: null,      // { available, message, suggestions } once checked
      checking: false,
      queued: false,           // an availability check is scheduled but has not started
      busy: false,
      error: '',
      success: false
    };
  }

  function isLive(project) {
    return project.publishStatus === 'published';
  }

  // Whether the Publish button may be used right now.
  function canPublish(project, session) {
    if (session.busy || session.checking) return false;
    if (project.cloudStatus !== 'saved') return false;
    if (slugProblem(session.typed, project.publicSlug)) return false;
    if (isLive(project) && !session.changing && session.typed === project.publicSlug) return true;
    if (session.changing && !session.confirmed) return false;
    return Boolean(session.availability && session.availability.available);
  }

  function slugStatusText(project, session) {
    const problem = slugProblem(session.typed, project.publicSlug);
    if (problem) return { tone: 'bad', text: problem };
    if (session.checking) return { tone: 'muted', text: 'Checking availability…' };
    if (isLive(project) && session.typed === project.publicSlug) return { tone: 'ok', text: 'This is the live address of your invitation.' };
    if (!session.availability) return { tone: 'muted', text: 'We will check that this address is free.' };
    if (session.availability.available) return { tone: 'ok', text: 'This address is available.' };
    return { tone: 'bad', text: session.availability.message || 'That web address is already in use.' };
  }

  function paintPublishDialog(project, notice = {}) {
    if (!publishSession || publishSession.projectId !== project.id) publishSession = newPublishSession(project);
    const session = publishSession;
    if (notice.error !== undefined) session.error = notice.error;
    if (notice.success !== undefined) session.success = notice.success;
    const live = isLive(project);
    const status = slugStatusText(project, session);
    const toneColor = { ok: '#2f6b45', bad: '#9b5147', muted: '#6b6760' }[status.tone];
    const suggestions = session.availability && !session.availability.available && session.availability.suggestions?.length
      ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap" role="group" aria-label="Available alternatives">${session.availability.suggestions.map(s => `<button class="btn small" type="button" data-use-suggestion="${escapeText(s)}">${escapeText(s)}</button>`).join('')}</div>`
      : '';
    const notSaved = project.cloudStatus !== 'saved'
      ? '<p class="tiny" role="status" style="color:#6b6760;margin:8px 0 0">Saving your latest changes first. You can go live as soon as they are saved.</p>'
      : '';
    const liveBlock = live && !session.changing
      ? `<div style="margin-top:14px;background:#f2eee6;border-radius:9px;padding:12px"><div class="tiny muted">Current public link</div><a href="${escapeText(publicLinkFor(project.publicSlug))}" target="_blank" rel="noopener" style="word-break:break-all">${escapeText(publicLinkFor(project.publicSlug))}</a><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" type="button" data-copy-public-link>Copy link</button><button class="btn small" type="button" data-change-address>Change web address</button></div></div>`
      : '';
    const changeWarning = session.changing
      ? `<div role="alert" style="margin-top:14px;background:#f7ebe8;border:1px solid #e3c2bb;border-radius:9px;padding:12px;font-size:14px"><strong>The old address will stop working.</strong><p style="margin:6px 0 0">Guests who have <span>${escapeText(publicLinkFor(project.publicSlug))}</span> will see "not available". Share the new link with them.</p><label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" data-confirm-change ${session.confirmed ? 'checked' : ''}> <span>I understand the old link will stop working.</span></label></div>`
      : '';
    const error = session.error ? `<p class="tiny" role="alert" style="color:#9b5147;margin:10px 0 0">${escapeText(session.error)}</p>` : '';
    const success = session.success ? '<p class="tiny" role="status" style="color:#2f6b45;margin:10px 0 0">Your invitation is live. Share the link below.</p>' : '';
    const primary = live ? (session.changing ? 'Change address and update' : 'Update live page') : 'Make it live';
    const addressField = live && !session.changing
      ? ''
      : `<label class="tiny muted" for="publishSlug" style="display:block;margin-top:14px">Web address</label>
         <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="tiny muted">${escapeText(window.location.origin)}/s/</span><input id="publishSlug" type="text" value="${escapeText(session.typed)}" maxlength="60" autocomplete="off" spellcheck="false" aria-describedby="slug-status" style="flex:1;min-width:160px;padding:9px 10px;border:1px solid #8a8276;border-radius:8px" ${session.busy ? 'disabled' : ''}></div>
         <p id="slug-status" aria-live="polite" class="tiny" style="color:${toneColor};margin:6px 0 0">${escapeText(status.text)}</p>${suggestions}
         <p class="tiny" style="margin:8px 0 0;word-break:break-all"><span class="muted">Your link will be</span> <strong id="link-preview">${escapeText(window.location.origin)}/s/${escapeText(session.typed || '…')}</strong></p>`;
    // Said before anything is public, in plain words: what happens, what does not, and what can be undone.
    const explainer = live
      ? '<p class="tiny muted" style="margin:10px 0 0">Made changes since going live? Choose <strong>Update live page</strong> to show them. Choose <strong>Take offline</strong> to make the link stop working.</p>'
      : `<ul style="margin:12px 0 0;padding:0;list-style:none;display:grid;gap:8px;font-size:14px;line-height:1.5">
          <li><strong>What it does.</strong> Gives your invitation a web link. Anyone you send the link to can open it.</li>
          <li><strong>Not public until you do this.</strong> Nobody can see your invitation yet. You can look at it as guests will see it first.</li>
          <li><strong>Guests can’t reply online yet.</strong> Guest responses are not open, so for now the invitation is for viewing.</li>
          <li><strong>You can change your mind.</strong> Keep editing and choose <em>Update live page</em>, or take it offline any time.</li>
        </ul>
        <button class="btn small" type="button" data-preview-first style="margin-top:12px">Preview it first</button>`;
    renderModal(`<div class="eyebrow">Share your invitation</div>
      <h2 id="modal-title">${live ? 'Your invitation is live' : 'Get your invitation link'}</h2>
      <p class="muted">Status: <strong>${escapeText(publishStatusLabel(project))}</strong>${live ? '' : ', not public yet'}.</p>
      ${explainer}${addressField}${changeWarning}${notSaved}${error}${success}${liveBlock}
      <div class="modal-actions" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn" type="button" data-publish-close>Close</button>
        ${live ? '<button class="btn" type="button" data-unpublish>Take offline</button>' : ''}
        <button class="btn dark" type="button" data-publish-submit ${canPublish(project, session) ? '' : 'disabled'}>${session.busy ? 'Going live…' : primary}</button>
      </div>`);
    wirePublishDialog(project);
    ensureAddressChecked(project);
  }

  // The suggested address (or the live one) is checked as soon as the dialog shows, so the person can
  // publish it as it is and only needs to type to choose a different one.
  function ensureAddressChecked(project) {
    const session = publishSession;
    if (!session || session.availability || session.checking || session.queued || session.busy) return;
    if (!session.typed || slugProblem(session.typed, project.publicSlug)) return;
    if (!project.cloudId || !tokenFor(project.cloudId) || !window.inviteStudioApi?.enabled) return;
    checkAddressSoon(project);
  }

  function wirePublishDialog(project) {
    const root = document.querySelector('#modal-root');
    root.querySelector('[data-publish-close]')?.addEventListener('click', () => { publishSession = null; closeModal(); });
    root.querySelector('[data-publish-submit]')?.addEventListener('click', () => publishFromDialog(project));
    root.querySelector('[data-preview-first]')?.addEventListener('click', () => {
      publishSession = null;
      closeModal();
      if (window.InviteStudioBridge?.openPreview) window.InviteStudioBridge.openPreview();
      else { state.page = 'preview'; render(); }
    });
    root.querySelector('[data-unpublish]')?.addEventListener('click', () => unpublishFromDialog(project));
    root.querySelector('[data-copy-public-link]')?.addEventListener('click', () => copyPublicLink(publicLinkFor(project.publicSlug)));
    root.querySelector('[data-change-address]')?.addEventListener('click', () => {
      publishSession.changing = true;
      publishSession.confirmed = false;
      publishSession.typed = project.publicSlug;
      publishSession.availability = null;
      paintPublishDialog(project, {});
    });
    root.querySelector('[data-confirm-change]')?.addEventListener('change', event => {
      publishSession.confirmed = event.target.checked;
      paintPublishDialog(project, {});
    });
    root.querySelectorAll('[data-use-suggestion]').forEach(button => button.addEventListener('click', () => {
      publishSession.typed = button.getAttribute('data-use-suggestion');
      publishSession.availability = null;
      paintPublishDialog(project, {});
      checkAddressSoon(project);
    }));
    const input = root.querySelector('#publishSlug');
    input?.addEventListener('input', () => {
      publishSession.typed = input.value.trim().toLowerCase();
      publishSession.availability = null;
      updateDialogWithoutRepaint(project);
      checkAddressSoon(project);
    });
  }

  // Updates only the status line and the button while typing, so the input keeps focus.
  function updateDialogWithoutRepaint(project) {
    const root = document.querySelector('#modal-root');
    const status = slugStatusText(project, publishSession);
    const line = root?.querySelector('#slug-status');
    if (line) {
      line.textContent = status.text;
      line.style.color = { ok: '#2f6b45', bad: '#9b5147', muted: '#6b6760' }[status.tone];
    }
    const linkLine = root?.querySelector('#link-preview');
    if (linkLine) linkLine.textContent = `${window.location.origin}/s/${publishSession.typed || '…'}`;
    const button = root?.querySelector('[data-publish-submit]');
    if (button) button.disabled = !canPublish(project, publishSession);
    root?.querySelectorAll('[data-use-suggestion]').forEach(element => element.remove());
  }

  function checkAddressSoon(project) {
    clearTimeout(availabilityTimer);
    const session = publishSession;
    const typed = session.typed;
    if (slugProblem(typed, project.publicSlug) || !project.cloudId || !tokenFor(project.cloudId) || !window.inviteStudioApi?.enabled) {
      updateDialogWithoutRepaint(project);
      return;
    }
    if (isLive(project) && typed === project.publicSlug) {
      session.availability = { available: true, message: '', suggestions: [] };
      updateDialogWithoutRepaint(project);
      return;
    }
    session.queued = true;
    availabilityTimer = setTimeout(async () => {
      session.queued = false;
      session.checking = true;
      updateDialogWithoutRepaint(project);
      try {
        const result = await window.inviteStudioApi.checkSlugAvailability(project.cloudId, tokenFor(project.cloudId), typed);
        if (publishSession !== session || session.typed !== typed) return;
        session.availability = result;
      } catch {
        if (publishSession === session && session.typed === typed) {
          session.availability = { available: false, message: 'We could not check this address. Try again in a moment.', suggestions: [] };
        }
      } finally {
        if (publishSession === session) session.checking = false;
        if (publishSession === session && session.typed === typed) paintPublishDialog(project, {});
      }
    }, 350);
  }

  async function copyPublicLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied. Share it with your guests.');
    } catch {
      window.prompt('Copy your invitation link:', link);
    }
  }

  function publishErrorMessage(error) {
    if (error.code === 'SLUG_CHANGE_CONFIRMATION_REQUIRED') return 'Confirm that the old address will stop working.';
    if (error.code === 'SLUG_CONFLICT') return 'That web address is already in use. Choose another.';
    if (error.code === 'PUBLISH_CONFLICT' || error.code === 'VERSION_CONFLICT') return 'This draft changed elsewhere. Reload the page before publishing.';
    if (error.code === 'TEMPLATE_UNAVAILABLE') return 'This design is no longer available. Choose another template before publishing.';
    if (error.fields?.slug) return error.fields.slug;
    if (error.code === 'VALIDATION_ERROR') return error.message || 'Please correct the web address.';
    return 'Publishing did not complete. Your draft is safe; try again in a moment.';
  }

  async function publishFromDialog(project) {
    const session = publishSession;
    if (!session || !canPublish(project, session)) return;
    session.busy = true;
    session.error = '';
    paintPublishDialog(project, {});
    try {
      const options = session.changing && session.confirmed ? { confirmSlugChange: true } : {};
      const result = await window.inviteStudioApi.publishWedding(project.cloudId, tokenFor(project.cloudId), project.cloudVersion, session.typed, options);
      project.publishStatus = 'published';
      project.published = true;
      project.publicSlug = session.typed;
      project.status = 'Published';
      project.cloudVersion = result.wedding?.version || project.cloudVersion;
      project.cloudStatus = 'saved';
      project.cloudSavedAt = Date.now();
      project.cloudError = '';
      localSave();
      paintStatus(project);
      session.busy = false;
      session.changing = false;
      session.confirmed = false;
      session.success = true;
      paintPublishDialog(project, {});
      toast('Your invitation is live.');
    } catch (error) {
      session.busy = false;
      session.error = publishErrorMessage(error);
      if (error.code === 'SLUG_CONFLICT') {
        session.availability = { available: false, message: 'That web address is already in use.', suggestions: [] };
        checkAddressSoon(project);
      }
      paintPublishDialog(project, {});
    }
  }

  async function unpublishFromDialog(project) {
    if (!window.confirm('Take this invitation offline? Guests will no longer see it. You can publish it again later.')) return;
    try {
      const result = await window.inviteStudioApi.unpublishWedding(project.cloudId, tokenFor(project.cloudId), project.cloudVersion);
      project.publishStatus = 'unpublished';
      project.published = false;
      project.status = 'Unpublished';
      project.cloudVersion = result.wedding?.version || project.cloudVersion;
      project.cloudStatus = 'saved';
      localSave();
      paintStatus(project);
      publishSession = null;
      paintPublishDialog(project, {});
      toast('The invitation is offline. Its web address is kept for you.');
    } catch {
      publishSession.error = 'The invitation could not be taken offline. Try again in a moment.';
      paintPublishDialog(project, {});
    }
  }

  // ---- Deleting a website -----------------------------------------------------------
  // Permanent. The cloud copy is removed with its private links, photo records, events,
  // payments and RSVPs (cascading foreign keys). Its public address stops working at once.
  // This device's copy, token and draft reference are removed too. Nothing is removed
  // until the couple confirms, and nothing is removed if the server refuses.
  function removeLocalWebsite(project) {
    const index = state.projects.indexOf(project);
    if (index >= 0) state.projects.splice(index, 1);
    const meta = metaFor(project);
    clearTimeout(meta.timer);
    clearTimeout(meta.retryTimer);
    if (project.cloudId) forgetToken(project.cloudId);
    const reference = draftReference();
    if (reference && (reference.localId === project.id || (project.cloudId && reference.cloudId === project.cloudId))) {
      try { localStorage.removeItem(draftReferenceKey); } catch { /* best effort */ }
    }
    if (state.currentId === project.id) state.currentId = null;
    localSave();
  }

  async function performWebsiteDelete(project) {
    const errorBox = document.querySelector('#delete-website-error');
    const fail = message => { if (errorBox) errorBox.textContent = message; };
    if (!project.cloudId) {
      removeLocalWebsite(project);
      closeModal();
      state.page = 'dashboard';
      render();
      toast('Website deleted from this device.');
      return;
    }
    const token = tokenFor(project.cloudId);
    if (!token || !window.inviteStudioApi?.enabled) {
      fail('This website\'s private link is not on this device, so its cloud copy cannot be deleted from here. Nothing has been deleted.');
      return;
    }
    try {
      await window.inviteStudioApi.deleteWedding(project.cloudId, token);
    } catch (error) {
      if (error.status === 404) {
        // Already gone on the server: finish the local cleanup.
      } else if (error.status === 401 || error.status === 403) {
        fail('This private link is no longer valid, so the website cannot be deleted from here. Nothing has been deleted.');
        return;
      } else {
        fail('The website could not be deleted right now. Check your connection and try again. Nothing has been deleted.');
        return;
      }
    }
    removeLocalWebsite(project);
    closeModal();
    state.page = 'dashboard';
    render();
    toast('Website permanently deleted.');
  }

  function confirmDeleteWebsite(project) {
    if (!project) return;
    const name = escapeText(project.title || project.name || 'this website');
    const publicNote = project.publishStatus === 'published'
      ? '<p class="tiny" style="color:#9b5147;margin:8px 0 0">Its public address will stop working straight away.</p>'
      : '';
    renderModal(`<div class="eyebrow">Delete website</div>
      <h2 id="modal-title">Delete \u201c${name}\u201d?</h2>
      <p class="muted">This permanently removes the invitation, its private edit links and its RSVP and photo records. It cannot be undone.</p>
      ${publicNote}
      <p id="delete-website-error" role="alert" class="tiny" style="color:#9b5147;margin:10px 0 0"></p>
      <div class="modal-actions" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:18px">
        <button class="btn" type="button" data-delete-cancel>Keep it</button>
        <button class="btn dark" type="button" data-delete-confirm>Delete permanently</button>
      </div>`);
    const root = document.querySelector('#modal-root');
    root.querySelector('[data-delete-cancel]')?.addEventListener('click', () => closeModal());
    root.querySelector('[data-delete-confirm]')?.addEventListener('click', () => performWebsiteDelete(project));
  }

  window.deleteProjectFromDashboard = function deleteProjectFromDashboard(projectId) {
    confirmDeleteWebsite(state.projects.find(project => project.id === projectId || project.cloudId === projectId) || null);
  };

  // Opens the cloud publish dialog. Returns false when the API is not enabled, so
  // the caller can show the local-only message instead.
  window.openCloudPublish = function openCloudPublish(project) {
    if (!window.inviteStudioApi?.enabled) return false;
    if (!project?.cloudId || !tokenFor(project.cloudId)) {
      renderModal(`<div class="eyebrow">Share your invitation</div><h2 id="modal-title">Almost ready</h2><p class="muted">Your draft is still being saved to the cloud. Publishing becomes available as soon as it is saved.</p><div class="modal-actions"><button class="btn dark" type="button" onclick="closeModal()">Got it</button></div>`);
      return true;
    }
    if (!String(project.title || '').trim()) {
      renderModal(`<div class="eyebrow">Share your invitation</div><h2 id="modal-title">Add your names first</h2><p class="muted">Your names become your invitation's web address, so add them before publishing.</p><div class="modal-actions"><button class="btn dark" type="button" onclick="closeModal()">Got it</button></div>`);
      return true;
    }
    paintPublishDialog(project, {});
    return true;
  };

  window.createCloudDraftForProject = function createCloudDraftForProject(project) {
    return createCloudDraft(project);
  };

  window.bootInviteStudioCloud = function bootInviteStudioCloud() {
    const originalLoad = window.load;
    const originalSave = window.save;
    const originalStartCreate = window.startCreate;
    const originalRender = window.render;
    const originalDuplicateProject = window.duplicateProject;
    originalLoad();
    // Public invitations are read-only: no editor, no drafts, and no edit tokens are read.
    const publicSlug = typeof window.parsePublicSlug === 'function' ? window.parsePublicSlug() : null;
    if (publicSlug !== null) {
      state.page = 'public';
      window.loadPublicInvitation(publicSlug);
      return;
    }
    if (!draftReference()) {
      const cloudProject = state.projects.find(project => project.cloudId);
      if (cloudProject) rememberDraftReference(cloudProject);
    }
    const privateLink = parsePrivateEditLink();

    window.save = function cloudAwareSave() {
      const result = originalSave();
      if (result && typeof current === 'function') scheduleCloudSave(current());
      return result;
    };

    window.render = function cloudAwareRender() {
      originalRender();
      const project = typeof current === 'function' ? current() : null;
      paintStatus(project);
      decorateRecoveryUi(project);
    };

    window.startCreate = function cloudAwareStartCreate(category, templateId) {
      originalStartCreate(category, templateId);
      setTimeout(() => {
        const project = ensureProject();
        if (!project.cloudId) createCloudDraft(project);
      }, 0);
    };

    window.duplicateProject = function cloudAwareDuplicateProject(id) {
      const existingIds = new Set(state.projects.map(project => project.id));
      originalDuplicateProject(id);
      const copy = state.projects.find(project => !existingIds.has(project.id));
      if (!copy) return;
      copy.cloudId = null;
      copy.cloudVersion = null;
      copy.cloudStatus = 'local';
      copy.cloudSavedAt = null;
      copy.cloudError = '';
      localSave();
      render();
      setTimeout(() => createCloudDraft(copy), 0);
    };

    window.flushInviteStudioSaves = flushPendingCloudSaves;
    window.addEventListener('pagehide', flushPendingCloudSaves);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPendingCloudSaves();
    });
    render();
    if (privateLink) {
      recoverFromPrivateLink(privateLink);
    } else {
      hydrateCloudProjects();
    }
  };
})();
