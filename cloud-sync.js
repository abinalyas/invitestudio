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
    return `${window.location.origin}/edit/${encodeURIComponent(token)}`;
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

  window.draftRecoveryCard = recoveryCard;
  window.draftStorageNote = () => {
    const project = projectForReference();
    return project?.cloudId
      ? 'Your draft is saved in the cloud and can be continued from this browser.'
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
      preferences: project.preferences || {},
      culturalPreferences: project.culturalPreferences || {},
      sections: project.sections || [],
      introSettings: project.introSettings || {},
      animationSettings: project.animationSettings || {},
      functions: project.functions || [],
      gallery: galleryPayload(project)
    };
  }

  function mergeServerWedding(project, wedding, preserveLocalPhotos = true) {
    if (!wedding) return;
    project.cloudId = wedding.id;
    project.cloudVersion = wedding.version;
    project.cloudStatus = wedding.status || 'draft';
    project.status = wedding.status === 'published' ? 'Published' : 'Draft';
    project.updated = wedding.updated_at || 'Just now';
    project.name = wedding.name || project.name;
    project.category = wedding.category || project.category;
    project.templateId = wedding.template_id || project.templateId;
    project.title = wedding.title || project.title;
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
    project.introSettings = wedding.intro_settings || project.introSettings || {};
    project.animationSettings = wedding.animation_settings || project.animationSettings || {};
    const content = wedding.content && typeof wedding.content === 'object' ? wedding.content : {};
    if (Array.isArray(content.functions)) project.functions = content.functions;
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

  async function syncProject(project) {
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
        { version, ...payload }
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
    meta.inFlight = true;
    project.cloudStatus = 'creating';
    localSave();
    paintStatus(project);
    try {
      const result = await window.inviteStudioApi.createWedding(JSON.parse(JSON.stringify(cloudPayload(project))));
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
      render();
      if (!isCurrent) queueCloudSave(project);
    } catch (error) {
      project.cloudStatus = shouldRetry(error) && attempt < maxRetries ? 'retrying' : 'local';
      project.cloudError = error.message;
      localSave();
      if (attempt < maxRetries && shouldRetry(error)) {
        meta.retryTimer = setTimeout(() => createCloudDraft(project, attempt + 1), retryDelay(attempt + 1));
      } else {
        render();
        if (window.toast) toast('Cloud draft could not be created. Your local draft is still available.');
      }
    } finally {
      meta.inFlight = false;
    }
  }

  async function hydrateCloudProjects() {
    if (!window.inviteStudioApi?.enabled) return;
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

    window.startCreate = function cloudAwareStartCreate(category) {
      originalStartCreate(category);
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

    render();
    if (privateLink) {
      recoverFromPrivateLink(privateLink);
    } else {
      hydrateCloudProjects();
    }
  };
})();
