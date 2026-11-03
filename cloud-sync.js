/* Phase 2 cloud draft adapter.
 *
 * The current editor still renders from its local project object. This adapter
 * mirrors that object to the server API, keeps the one-time edit token in a
 * browser-only session map, and hydrates cloud drafts when the browser opens
 * again. No Supabase credential is used here.
 */
(function installCloudDraftSync() {
  const tokenStorageKey = 'invitestudio-edit-tokens';
  const pending = new Map();
  const inFlight = new Map();

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

  function scheduleCloudSave(project) {
    if (!project?.cloudId || !tokenFor(project.cloudId) || !window.inviteStudioApi) return;
    clearTimeout(pending.get(project.cloudId));
    pending.set(project.cloudId, setTimeout(() => syncProject(project), 650));
  }

  async function syncProject(project) {
    if (!project?.cloudId || !tokenFor(project.cloudId) || !window.inviteStudioApi) return;
    if (inFlight.has(project.cloudId)) {
      pending.set(project.cloudId, setTimeout(() => syncProject(project), 650));
      return;
    }
    const version = Number(project.cloudVersion);
    if (!Number.isInteger(version) || version < 1) return;
    inFlight.set(project.cloudId, true);
    project.cloudStatus = 'saving';
    paintStatus(project);
    try {
      const result = await window.inviteStudioApi.updateWedding(
        project.cloudId,
        tokenFor(project.cloudId),
        { version, ...cloudPayload(project) }
      );
      mergeServerWedding(project, result.wedding);
      project.cloudStatus = 'saved';
      localSave();
      paintStatus(project);
    } catch (error) {
      project.cloudStatus = error.code === 'VERSION_CONFLICT' ? 'conflict' : 'error';
      project.cloudError = error.message;
      localSave();
      paintStatus(project);
      if (window.toast) toast(error.code === 'VERSION_CONFLICT'
        ? 'This draft changed elsewhere. Reload it before continuing.'
        : 'Cloud save failed. Your local draft is still safe; retrying shortly.');
    } finally {
      inFlight.delete(project.cloudId);
    }
  }

  async function createCloudDraft(project) {
    if (!project || project.cloudId || !window.inviteStudioApi) return;
    project.cloudStatus = 'creating';
    localSave();
    paintStatus(project);
    try {
      const result = await window.inviteStudioApi.createWedding(cloudPayload(project));
      const oldId = project.id;
      project.id = result.wedding.id;
      project.cloudId = result.wedding.id;
      rememberToken(project.cloudId, result.editToken);
      if (state.currentId === oldId) state.currentId = project.id;
      mergeServerWedding(project, result.wedding);
      project.cloudStatus = 'saved';
      localSave();
      render();
      scheduleCloudSave(project);
    } catch (error) {
      project.cloudStatus = 'local';
      project.cloudError = error.message;
      localSave();
      render();
      if (window.toast) toast('Cloud draft could not be created. Your local draft is still available.');
    }
  }

  async function hydrateCloudProjects() {
    if (!window.inviteStudioApi) return;
    for (const project of state.projects.filter(item => item.cloudId)) {
      const token = tokenFor(project.cloudId);
      if (!token) {
        project.cloudStatus = 'token-missing';
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
    if (project?.cloudStatus === 'saving') return 'Saving to cloud…';
    if (project?.cloudStatus === 'saved') return 'Saved to cloud';
    if (project?.cloudStatus === 'conflict') return 'Save conflict — reload';
    if (project?.cloudStatus === 'error') return 'Cloud save failed — local copy safe';
    if (project?.cloudStatus === 'token-missing') return 'Edit link unavailable — local copy safe';
    return 'Saved on this device';
  };

  window.bootInviteStudioCloud = function bootInviteStudioCloud() {
    const originalLoad = window.load;
    const originalSave = window.save;
    const originalStartCreate = window.startCreate;
    originalLoad();

    window.save = function cloudAwareSave() {
      const result = originalSave();
      if (result && typeof current === 'function') scheduleCloudSave(current());
      return result;
    };

    window.startCreate = function cloudAwareStartCreate(category) {
      originalStartCreate(category);
      setTimeout(() => {
        const project = ensureProject();
        if (!project.cloudId) createCloudDraft(project);
      }, 0);
    };

    render();
    hydrateCloudProjects();
  };
})();
