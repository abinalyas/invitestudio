/* Phase 2 cloud draft adapter.
 *
 * The current editor still renders from its local project object. This adapter
 * mirrors that object to the server API, keeps the one-time edit token in a
 * browser-only session map, and hydrates cloud drafts when the browser opens
 * again. No Supabase credential is used here.
 */
(function installCloudDraftSync() {
  const tokenStorageKey = 'invitestudio-edit-tokens';
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
    const tokens = tokenMap();
    tokens[id] = token;
    localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
  }

  function forgetToken(id) {
    const tokens = tokenMap();
    delete tokens[id];
    localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
  }

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
    if (state.page === 'dashboard' || state.page === 'editor') {
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

    window.save = function cloudAwareSave() {
      const result = originalSave();
      if (result && typeof current === 'function') scheduleCloudSave(current());
      return result;
    };

    window.render = function cloudAwareRender() {
      originalRender();
      paintStatus(typeof current === 'function' ? current() : null);
    };

    window.startCreate = function cloudAwareStartCreate(category) {
      originalStartCreate(category);
      setTimeout(() => {
        const project = ensureProject();
        if (!project.cloudId) createCloudDraft(project);
      }, 0);
    };

    window.duplicateProject = function cloudAwareDuplicateProject(id) {
      const source = state.projects.find(project => project.id === id);
      originalDuplicateProject(id);
      const copy = state.projects[0] !== source ? state.projects[0] : null;
      if (!copy || !copy.cloudId) return;
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
    hydrateCloudProjects();
  };
})();
