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
    if (Array.isArray(result?.photos)) project.photos = localPhotos(result.photos);
  }
  // What the invitation and the editor show for each uploaded photo: its full picture, thumbnail and description.
  function localPhotos(list) {
    return list.map(photo => ({
      id: photo.id, alt: photo.alt || '', width: photo.width || null, height: photo.height || null,
      data: photo.full, thumb: photo.thumb
    }));
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

  const askConfirm = options => (window.inviteConfirm ? window.inviteConfirm(options) : Promise.resolve(window.confirm(options.message || options.title)));

  function recoveryCard() {
    const project = projectForReference();
    if (!project) return '';
    const cloud = Boolean(project.cloudId);
    const title = project.name || project.title || 'Your invitation draft';
    const status = project.cloudStatus === 'error'
      ? 'Your local copy is safe. Check your connection and try again.'
      : cloud ? 'Your latest changes are saved securely online.' : 'Your draft is saved on this device.';
    return `<section class="container" aria-label="Continue your draft" style="margin-top:18px"><div style="display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#f3eee5;border:1px solid #dfd4c5;border-radius:12px;padding:18px 20px"><div><div class="eyebrow">Welcome back</div><strong style="font-family:var(--serif);font-size:22px">Pick up where you left off</strong><p class="tiny muted" style="margin:5px 0 0">${esc(status)}</p>${state.recoveryError?`<p class="tiny" role="alert" style="color:#9b5147;margin:5px 0 0">${esc(state.recoveryError)}</p>`:''}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn dark" onclick="go('dashboard')">My invitations</button></div></div></section>`;
  }

  window.copyPrivateEditLink = async function copyPrivateEditLink() {
    const link = privateEditLink(typeof current === 'function' ? current() : null);
    if (!link) { toast('Your private link is available once your draft has been saved online.'); return; }
    try {
      await navigator.clipboard.writeText(link);
      toast('Private link copied. Keep it safe.');
    } catch {
      window.prompt('Copy your private link:', link);
    }
  };

  // ---- Photos (docs/MEDIA_PLAN.md). The list on the server is the truth; project.photos mirrors it. ----
  function mediaContext() {
    const project = typeof current === 'function' ? current() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    return { project, token, api: window.inviteStudioApi, ready: Boolean(project && token && window.inviteStudioApi?.enabled) };
  }
  function applyMedia(project, result) {
    project.media = {
      enabled: result.enabled !== false, reason: result.reason || '', limits: result.limits || null,
      usage: result.usage || { count: 0, bytes: 0 }, error: ''
    };
    project.photos = localPhotos(result.photos || []);
    localSave();
  }
  // When this website is kept until. Cached on window so the (plain) publish dialog can show the same date.
  window.loadRetention = async function loadRetention() {
    const { project, token, api, ready } = mediaContext();
    if (!ready) { window.InviteRetentionLast = null; return { available: false }; }
    const result = await api.getRetention(project.cloudId, token);
    window.InviteRetentionLast = result && result.available ? { ...result, projectId: project.id } : null;
    return result;
  };
  window.loadMedia = async function loadMedia() {
    const { project, token, api, ready } = mediaContext();
    if (!project) return;
    if (!ready) { project.media = { enabled: false, reason: 'NOT_SAVED_ONLINE', limits: null, usage: { count: 0, bytes: 0 }, error: '' }; window.notifyInviteStudioChange?.(); return; }
    try {
      applyMedia(project, await api.listMedia(project.cloudId, token));
    } catch (error) {
      project.media = { ...(project.media || {}), enabled: Boolean(project.media?.enabled), error: error.message || 'Photos could not be loaded.' };
    }
    window.notifyInviteStudioChange?.();
  };
  // Adds photos one at a time (each is resized here first). Returns what was added and what failed, with reasons.
  window.uploadMediaPhotos = async function uploadMediaPhotos(files, onProgress) {
    const { project, token, api, ready } = mediaContext();
    const result = { added: 0, errors: [] };
    if (!ready) { result.errors.push({ name: '', message: 'Your invitation needs to be saved online before you can add photos.' }); return result; }
    const list = Array.from(files || []);
    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      if (onProgress) onProgress({ index: i + 1, total: list.length, name: file.name });
      try {
        const prepared = await window.InviteMedia.prepare(file);
        const form = new FormData();
        const ext = prepared.format === 'webp' ? 'webp' : 'jpg';
        form.set('full', prepared.full, `full.${ext}`);
        form.set('thumb', prepared.thumb, `thumb.${ext}`);
        form.set('alt', '');
        await api.uploadMedia(project.cloudId, token, form);
        result.added += 1;
      } catch (error) {
        result.errors.push({ name: file.name, message: friendlyMediaError(error) });
        if (error.code === 'MEDIA_LIMIT' || error.code === 'RATE_LIMITED' || error.code === 'MEDIA_NOT_CONFIGURED') break;
      }
    }
    await window.loadMedia();
    return result;
  };
  // Replaces one photo with another in the same place (the preview's "Replace"). The new picture is uploaded first, so if that
  // fails the old one is untouched; only then is the old one deleted and the new one moved into its position.
  window.replaceMediaPhoto = async function replaceMediaPhoto(oldId, file, onProgress) {
    const { project, token, api, ready } = mediaContext();
    if (!ready) return { added: 0, errors: [{ name: '', message: 'Your invitation needs to be saved online before you can add photos.' }] };
    const before = (project.photos || []).map(item => item.id);
    const index = before.indexOf(oldId);
    if (index < 0) return { added: 0, errors: [{ name: '', message: 'That photo is no longer in your invitation.' }] };
    const result = await window.uploadMediaPhotos([file], onProgress);
    if (!result.added) return result;
    const now = (project.photos || []).map(item => item.id);
    const fresh = now.filter(id => !before.includes(id));
    if (fresh.length !== 1) return result; // cannot tell which one is new: keep both; the couple can remove one
    try {
      const order = now.filter(id => id !== oldId && id !== fresh[0]);
      order.splice(index, 0, fresh[0]);
      await api.deleteMedia(project.cloudId, token, oldId);
      await api.reorderMedia(project.cloudId, token, order);
    } catch { /* the reload below shows the truth */ }
    await window.loadMedia();
    return result;
  };
  function friendlyMediaError(error) {
    if (error.code === 'MEDIA_LIMIT') return 'You have reached the limit of 12 photos or 8 MB. Remove a photo to add another.';
    if (error.code === 'RATE_LIMITED') return 'Too many uploads just now. Please try again in a little while.';
    if (error.code === 'MEDIA_NOT_CONFIGURED') return 'Photo storage is not set up yet.';
    if (error.code === 'MEDIA_TOO_LARGE') return 'This photo is too large to store, even after shrinking it. Try a smaller or simpler photo.';
    if (error.code === 'MEDIA_DIMENSIONS') return 'This photo has an unusual size and could not be used. Try a different photo, or crop it first.';
    if (error.code === 'MEDIA_TYPE') return 'Only JPEG, PNG, WebP and HEIC photos can be used.';
    return error.message || 'This photo could not be added.';
  }
  window.setMediaAlt = async function setMediaAlt(photoId, alt) {
    const { project, token, api, ready } = mediaContext();
    if (!ready) return;
    const photo = (project.photos || []).find(item => item.id === photoId);
    if (photo) photo.alt = alt;
    window.notifyInviteStudioChange?.();
    try { await api.updateMedia(project.cloudId, token, photoId, { alt }); } catch { await window.loadMedia(); }
  };
  window.moveMediaPhoto = async function moveMediaPhoto(photoId, delta) {
    const { project, token, api, ready } = mediaContext();
    if (!ready) return;
    const list = (project.photos || []).slice();
    const from = list.findIndex(item => item.id === photoId), to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    project.photos = list;
    window.notifyInviteStudioChange?.();
    try { await api.reorderMedia(project.cloudId, token, list.map(item => item.id)); } catch { await window.loadMedia(); }
  };
  window.deleteMediaPhoto = async function deleteMediaPhoto(photoId) {
    const { project, token, api, ready } = mediaContext();
    if (!ready) return;
    try { await api.deleteMedia(project.cloudId, token, photoId); } catch { /* the reload below shows the truth */ }
    await window.loadMedia();
  };

  // The couple's replies (private: needs the edit token this device holds).
  window.loadRsvpReplies = async function loadRsvpReplies() {
    const project = typeof current === 'function' ? current() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!token || !window.inviteStudioApi?.enabled) throw Object.assign(new Error('Replies are saved with your invitation online.'), { code: 'NOT_SAVED_ONLINE' });
    return window.inviteStudioApi.listRsvps(project.cloudId, token);
  };
  window.deleteRsvpReply = async function deleteRsvpReply(replyId) {
    const project = typeof current === 'function' ? current() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!token || !window.inviteStudioApi?.enabled) throw new Error('Not saved online.');
    return window.inviteStudioApi.deleteRsvp(project.cloudId, token, replyId);
  };
  window.regeneratePrivateEditLink = async function regeneratePrivateEditLink() {
    const project = typeof current === 'function' ? current() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!project?.cloudId || !token || !window.inviteStudioApi?.enabled) {
      toast('You need your private link to get a new one.');
      return;
    }
    if (!await askConfirm({ title: 'Get a new private link?', message: 'The old link will stop working.', confirmLabel: 'Get new link' })) return;
    try {
      const result = await window.inviteStudioApi.regenerateEditToken(project.cloudId, token);
      rememberToken(project.cloudId, result.editToken);
      project.editTokenExpiresAt = result.editTokenExpiresAt;
      project.cloudStatus = 'saved';
      localSave();
      decorateRecoveryUi(project);
      toast('You have a new private link. The old one no longer works.');
    } catch (error) {
      toast(error.message || 'A new private link could not be made.');
    }
  };

  window.revokePrivateEditLinks = async function revokePrivateEditLinks() {
    const project = typeof current === 'function' ? current() : null;
    const token = project?.cloudId ? tokenFor(project.cloudId) : '';
    if (!project?.cloudId || !token || !window.inviteStudioApi?.enabled) {
      toast('There is no private link to turn off.');
      return;
    }
    if (!await askConfirm({ title: 'Turn off all private links?', message: 'Nobody will be able to open this draft with an old link. This cannot be undone.', confirmLabel: 'Turn off all links', danger: true })) return;
    try {
      await window.inviteStudioApi.revokeEditTokens(project.cloudId, token);
      forgetToken(project.cloudId);
      project.cloudStatus = 'token-missing';
      project.cloudError = 'All private links have been turned off.';
      localSave();
      render();
      toast('All private links have been turned off.');
    } catch (error) {
      toast(error.message || 'The private links could not be turned off.');
    }
  };

  // True when the server's copy is the one these unsent edits were made on (same version), or says the same thing, so
  // keeping the device's copy loses nothing. A server copy that is newer AND different (another device edited it) is
  // not covered here: that one still wins, as before.
  function keepsUnsentEdits(project, wedding) {
    if (!wedding) return false;
    if (Number(wedding.version) === Number(project.cloudVersion)) return true;
    const same = (a, b) => String(a || '').trim() === String(b || '').trim();
    return same(project.title, wedding.title) && same(project.date, wedding.event_date) && same(project.location, wedding.location)
      && same(project.message, wedding.message) && same(project.story, wedding.story) && same(project.hosts, wedding.hosts);
  }

  // Opens a draft in the editor, then refreshes it from the cloud (keeping any edits this device has not sent yet).
  // "Continue" uses both steps; Edit on the My invitations page opens the draft itself and then runs the refresh.
  async function openAndRefresh(project) {
    state.currentId = project.id;
    state.page = 'editor';
    state.recoveryError = '';
    rememberDraftReference(project);
    render();
    await refreshFromCloud(project);
  }

  async function refreshFromCloud(project) {
    if (project.cloudId && tokenFor(project.cloudId) && window.inviteStudioApi?.enabled) {
      const unsent = ['pending', 'saving', 'retrying', 'error'].includes(project.cloudStatus);
      try {
        const revisionBefore = metaFor(project).revision;
        const result = await window.inviteStudioApi.getWedding(project.cloudId, tokenFor(project.cloudId));
        if (metaFor(project).revision !== revisionBefore) return;   // edited while this copy was on its way: keep the newer text
        if (unsent && keepsUnsentEdits(project, result.wedding)) {
          // This device holds edits the server never received (for example the tab crashed before the autosave ran).
          // Keep them and send them; never replace them with the older copy from the server.
          project.cloudVersion = result.wedding.version;
          mergeRecoveredChildren(project, result);
          const meta = metaFor(project);
          meta.revision = Math.max(meta.revision, 1);
          project.cloudStatus = 'pending';
          localSave();
          render();
          queueCloudSave(project, 0);
          return;
        }
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
        toast('Your draft could not be refreshed. The copy on this device is still here.');
      }
    }
  }

  window.continueLastDraft = async function continueLastDraft() {
    const project = projectForReference();
    const reference = draftReference();
    if (!project && reference?.cloudId && tokenFor(reference.cloudId)) {
      await recoverFromPrivateLink({ id: reference.cloudId, token: tokenFor(reference.cloudId) });
      return;
    }
    if (!project) { toast('This draft is no longer available on this device.'); return; }
    await openAndRefresh(project);
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
      ? 'Your draft is private and saved online.'
      : 'Drafts are saved on this device until online saving is available.';
  };

  function galleryPayload(project) {
    // Photos are uploaded and managed through the media endpoints, not saved with the invitation's content.
    return { preference: project.preferences?.gallery || 'gallery' };
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
    project.publishUnlocked = Boolean(wedding.publish_unlocked_at);
    if ('paid_tier' in wedding) project.paidTier = wedding.paid_tier || ''; // the price tier that was paid for; designs above it are locked
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
    const wasPending = project?.cloudStatus === 'pending';
    markDirty(project);
    // save() has just written the draft to this device, but it did so before the draft was marked as unsent. If the tab
    // crashed now, the device would hold the new text marked "saved", and reopening would replace it with the older
    // copy from the server. Write the "unsent" mark too (once; later keystrokes already carry it).
    if (project?.cloudId && !wasPending) localSave();
    queueCloudSave(project);
  }

  // The text fields of a draft, as the server stores them. Used to tell whether the server's copy is one this device wrote.
  function textSnapshot(source, dateKey) {
    const t = value => String(value || '').trim();
    return JSON.stringify([t(source.title), t(source[dateKey]), t(source.location), t(source.message), t(source.story), t(source.hosts)]);
  }

  // Says why a draft could not be created, in words for the couple (the server's own messages are written to be shown).
  function createFailureReason(error) {
    if (!error) return '';
    if (error.fields && error.fields.templateId) return 'this design is not set up on the server yet';
    if (!error.code && !error.status) return 'we could not reach the server';
    if (error.status === 429) return 'too many requests, please wait a moment';
    if (error.status >= 500) return 'the server had a problem';
    return error.message ? String(error.message).replace(/\.$/, '').slice(0, 120) : '';
  }

  function shouldRetry(error) {
    return !error?.code || error.status >= 500 || error.status === 408 || error.status === 429;
  }

  function retryDelay(attempt) {
    return Math.min(15000, 1000 * (2 ** Math.max(0, attempt - 1)));
  }

  // A version conflict can be this device's own earlier save: it reached the server, but the tab closed before the reply.
  // When the server's text is exactly what this device has sent since its last confirmed save, take its version and send the newer edits on top.
  // Anything else (a different copy) stays a conflict.
  async function adoptOwnLandedWrite(project) {
    try {
      if (!(project.sentTexts || []).length) return false;
      const result = await window.inviteStudioApi.getWedding(project.cloudId, tokenFor(project.cloudId));
      const wedding = result?.wedding;
      if (!wedding || !project.sentTexts.includes(textSnapshot(wedding, 'event_date'))) return false;
      project.cloudVersion = wedding.version;
      const meta = metaFor(project);
      meta.revision += 1;
      queueCloudSave(project, 0);
      return true;
    } catch { return false; }
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
    // Remember what this device is about to send (kept on disk too). If the tab is closed after the server accepts it
    // but before the reply arrives, the server is one version ahead of this device; this lets that be recognised as
    // this device's own write, not another device's edit.
    project.sentTexts = [...(project.sentTexts || []).filter(item => item !== textSnapshot(payload, 'date')), textSnapshot(payload, 'date')].slice(-6);
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
      project.sentTexts = [];
      meta.retryCount = 0;
      localSave();
      paintStatus(project);
      if (!isCurrent) queueCloudSave(project);
    } catch (error) {
      let conflict = error.code === 'VERSION_CONFLICT';
      if (conflict && await adoptOwnLandedWrite(project)) {
        project.cloudStatus = 'pending';
        localSave();
        paintStatus(project);
        return;
      }
      if (error.code === 'DESIGN_LOCKED') {
        // The paid plan does not include that design: say so, and put the saved design back.
        if (window.toast) toast(error.message || 'That design is not included in what you paid for.');
        project.cloudStatus = 'pending';
        try { await refreshFromCloud(project); } catch { /* the design is put back on the next load */ }
        return;
      }
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
        toast('We could not save online. Your changes are kept on this device; try again when you are back online.');
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
        const why = createFailureReason(error);
        if (window.toast) toast(`Your draft could not be saved online${why ? `: ${why}` : ''}. It is kept on this device.`);
      }
    } finally {
      meta.inFlight = false;
    }
  }

  // Brings every saved invitation up to date with the server, all at once (they used to be fetched one after another, which made
  // opening the app slow for anyone with several invitations). `skip` leaves one project alone (the one being paid for), and
  // `redraw: false` does not redraw the screen when done.
  async function hydrateCloudProjects({ skip = '', redraw = true } = {}) {
    if (!window.inviteStudioApi?.enabled) return;
    // Resume a creation that was interrupted by a reload or a closed tab.
    for (const project of state.projects.filter(item => !item.cloudId && item.createRequestId)) {
      createCloudDraft(project);
    }
    await Promise.all(state.projects.filter(item => item.cloudId && item.id !== skip).map(async project => {
      const token = tokenFor(project.cloudId);
      if (!token) {
        project.cloudStatus = 'token-missing';
        return;
      }
      const hasUnsavedLocalChanges = ['pending', 'saving', 'retrying', 'error'].includes(project.cloudStatus);
      if (hasUnsavedLocalChanges) {
        const meta = metaFor(project);
        meta.revision = Math.max(meta.revision, 1);
        project.cloudStatus = 'pending';
        queueCloudSave(project, 0);
        return;
      }
      try {
        const revisionBefore = metaFor(project).revision;
        const result = await window.inviteStudioApi.getWedding(project.cloudId, token);
        if (metaFor(project).revision !== revisionBefore) {
          // The person edited while this copy was on its way. Their newer text must not be replaced by it.
          return;
        }
        mergeServerWedding(project, result.wedding);
        project.cloudStatus = 'saved';
        paintStatus(project);
      } catch (error) {
        if (error.code === 'EDIT_TOKEN_INVALID') forgetToken(project.cloudId);
        project.cloudStatus = 'error';
        project.cloudError = error.message;
      }
    }));
    localSave();
    if (!redraw) return;
    // A template's own page (/templates/<n>) shows nothing from the drafts. Drawing it again would throw away what the
    // visitor is doing in its phone preview (for example the opening they have just started) the moment this
    // slower, first-visit request finishes.
    const onTemplatePage = /^\/templates\/\d+\/?$/.test(window.location.pathname);
    if (!onTemplatePage && (state.page === 'home' || state.page === 'dashboard' || state.page === 'editor')) {
      render();
      paintStatus(typeof current === 'function' ? current() : null);
    }
  }

  window.cloudSaveLabel = project => {
    if (project?.cloudStatus === 'creating') return 'Creating your draft…';
    if (project?.cloudStatus === 'pending') return 'Saving changes…';
    if (project?.cloudStatus === 'saving') return 'Saving…';
    if (project?.cloudStatus === 'retrying') return 'Retrying save…';
    if (project?.cloudStatus === 'saved') {
      const age = project.cloudSavedAt ? Date.now() - project.cloudSavedAt : 0;
      if (age < 60000) return 'Saved just now ✓';
      if (age < 3600000) return `Saved ${Math.max(1, Math.floor(age / 60000))} min ago ✓`;
      return 'Saved ✓';
    }
    if (project?.cloudStatus === 'conflict') return 'Save conflict — reload';
    if (project?.cloudStatus === 'error') return 'Could not save online — kept on this device';
    if (project?.cloudStatus === 'token-missing') return 'Private link missing — kept on this device';
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
      info: '',
      price: null,             // { text, tierName, mode } from /api/pricing, for the pay step
      needsPayment: false,     // the server asked for the one-time payment (402)
      contact: contactOf(project), // the buyer's name, email, optional phone and reminders tick, asked for before paying
      success: false
    };
  }

  function isLive(project) {
    return project.publishStatus === 'published';
  }

  // The buyer's details asked for before paying (name, email, optional phone, and an optional tick for tips and reminders).
  // They are remembered on this device, so coming back from the payment page does not ask again. The server checks them again.
  function contactOf(project) {
    const saved = project && project.buyerContact && typeof project.buyerContact === 'object' ? project.buyerContact : {};
    return { name: String(saved.name || ''), email: String(saved.email || ''), phone: String(saved.phone || ''), marketing: saved.marketing === true };
  }

  function contactProblem(contact) {
    if (!contact.name.trim()) return 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) return 'Enter a valid email address.';
    const phone = contact.phone.trim().replace(/[\s().-]/g, '').replace(/^00/, '+');
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) return 'Enter a phone number with 7 to 15 digits, or leave it empty.';
    return '';
  }

  function rememberContact(project) {
    if (!publishSession) return;
    project.buyerContact = { ...publishSession.contact };
    try { localStorage.setItem('invitestudio-projects', JSON.stringify(state.projects)); } catch { /* it is asked for again next time */ }
  }

  // Whether the Publish button may be used right now.
  function canPublish(project, session) {
    if (session.busy || session.checking) return false;
    if (needsPayment(project, session) && contactProblem(session.contact)) return false;
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
    const ICON = {
      lock: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
      card: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
      link: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
      user: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
      mail: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
      phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>',
      pencil: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg>',
      layers: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
      shield: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
      eye: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
      bolt: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/></svg>',
      check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
      help: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg>'
    };
    const publicLink = live ? publicLinkFor(project.publicSlug) : '';
    const liveBlock = live && !session.changing
      ? `<section class="pub-card pub-live"><h3>Your live link</h3><div class="tiny muted">Current public link</div><a href="${escapeText(publicLink)}" target="_blank" rel="noopener">${escapeText(publicLink)}</a><div class="pub-row"><button class="btn small" type="button" data-copy-public-link>Copy link</button><button class="btn small" type="button" data-change-address>Change web address</button></div></section>`
      : '';
    const changeWarning = session.changing
      ? `<div role="alert" class="pub-warn"><strong>The old address will stop working.</strong><p>Guests who have <span>${escapeText(publicLink)}</span> will see "not available". Share the new link with them.</p><label class="pub-check"><input type="checkbox" data-confirm-change ${session.confirmed ? 'checked' : ''}> <span>I understand the old link will stop working.</span></label></div>`
      : '';
    const error = session.error ? `<p class="pub-note bad" role="alert">${escapeText(session.error)}</p>` : '';
    const success = session.success ? '<p class="pub-note ok" role="status">Your invitation is live. Share the link below.</p>' : '';
    const notSaved = project.cloudStatus !== 'saved'
      ? '<p class="pub-note" role="status">Saving your latest changes first. You can go live as soon as they are saved.</p>'
      : '';
    const info = session.info ? `<p class="pub-note ok" role="status" data-payment-info>${escapeText(session.info)}</p>` : '';
    const checkAgain = session.checkAgain ? '<button class="btn small" type="button" data-check-payment>Check again</button>' : '';
    const paying = needsPayment(project, session);
    const priceText = session.price && session.price.text ? session.price.text : '';
    const primary = live ? (session.changing ? 'Change address and update' : 'Update live page') : paying ? (priceText ? `Pay ${priceText} and continue` : 'Pay and continue') : 'Make it live';
    const priceNote = live || project.publishUnlocked || !session.price ? ''
      : session.price.mode === 'live'
        ? `<p class="pub-fine" data-price-note><strong>One-time price: ${escapeText(session.price.text)}</strong> (${escapeText(session.price.tierName)} design). You pay once, securely on Razorpay's page with UPI, a card or netbanking, then come straight back to make it live. Editing and previewing stay free. By paying you agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a>; see the <a href="/refund-policy" target="_blank" rel="noopener">Refund policy</a>.</p>`
        : `<p class="pub-fine" data-price-note><strong>Free during early access.</strong> The price that will apply later is ${escapeText(session.price.text)} (${escapeText(session.price.tierName)} design), paid once.</p>`;

    // Your details (asked for before paying).
    const contactBlock = paying ? `<fieldset class="pub-card" data-buyer-contact>
        <legend class="sr-only">Your details</legend>
        <h3 class="pub-card-title">Your details</h3>
        <p class="pub-sub">Used for your payment receipt and for recovering your private link. Razorpay's page is filled in with them, so you do not type them twice.</p>
        <label for="buyerName">Your name <b class="req" aria-hidden="true">*</b></label>
        <span class="pub-field">${ICON.user}<input id="buyerName" type="text" autocomplete="name" maxlength="120" placeholder="Enter your full name" value="${escapeText(session.contact.name)}"></span>
        <label for="buyerEmail">Email address <b class="req" aria-hidden="true">*</b></label>
        <span class="pub-field">${ICON.mail}<input id="buyerEmail" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@example.com" value="${escapeText(session.contact.email)}"></span>
        <label for="buyerPhone">Phone or WhatsApp number <span class="pub-opt">(optional)</span></label>
        <span class="pub-field">${ICON.phone}<input id="buyerPhone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="Enter your number" value="${escapeText(session.contact.phone)}"></span>
        <label class="pub-check"><input id="buyerMarketing" type="checkbox" ${session.contact.marketing ? 'checked' : ''}><span>Send me tips and reminders about my invitation <span class="pub-opt">(optional)</span></span></label>
        <p id="contact-status" class="pub-sub bad" aria-live="polite">${escapeText(contactProblem(session.contact))}</p>
      </fieldset>` : '';

    // Your invitation link.
    const status = slugStatusText(project, session);
    const suggestions = session.availability && !session.availability.available && session.availability.suggestions?.length
      ? `<div class="pub-suggest" role="group" aria-label="Available alternatives"><span>Suggested alternatives</span><div>${session.availability.suggestions.map(sug => `<button class="pub-chip" type="button" data-use-suggestion="${escapeText(sug)}">${escapeText(sug)}</button>`).join('')}</div></div>`
      : '';
    const addressField = live && !session.changing
      ? ''
      : `<section class="pub-card">
         <h3 class="pub-card-title">Your invitation link</h3>
         <p class="pub-sub">Choose a unique, easy-to-remember web address for your invitation.</p>
         <label class="sr-only" for="publishSlug">Web address</label>
         <div class="pub-slug"><span class="pub-prefix">${escapeText(window.location.origin)}/s/</span><input id="publishSlug" type="text" value="${escapeText(session.typed)}" maxlength="60" autocomplete="off" spellcheck="false" aria-describedby="slug-status"></div>
         <p id="slug-status" aria-live="polite" class="pub-status-pill" data-tone="${status.tone}">${escapeText(status.text)}</p>${suggestions}
         <p class="pub-fine"><span>Your link will be</span> <strong id="link-preview">${escapeText(window.location.origin)}/s/${escapeText(session.typed || '…')}</strong></p>
       </section>`;
    // How long the invitation stays online: the closing date, or an estimate before it is live (docs/RETENTION_PLAN.md).
    const kept = window.InviteRetentionLast && window.InviteRetentionLast.projectId === project.id ? window.InviteRetentionLast : null;
    const keptDate = kept ? (kept.endsOn || kept.estimatedEndsOn) : '';
    const keptBefore = kept ? Boolean(kept.endsBeforeEvent || kept.estimateBeforeEvent) : false;
    const keptLinks = window.InviteContact ? window.InviteContact.links('extend', live ? publicLinkFor(project.publicSlug) : '') : null;
    const keptBlock = keptDate
      ? `<p class="pub-fine${keptBefore ? ' bad' : ''}" data-kept-note>${live ? 'Your invitation stays online until' : 'Once live, your invitation stays online until'} <strong>${escapeText(new Date(keptDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}</strong>.${keptBefore ? ' That is before your event.' : ''} Need longer? Talk to us: ${keptLinks && keptLinks.whatsapp ? `<a href="${escapeText(keptLinks.whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}${keptLinks && keptLinks.whatsapp && keptLinks.email ? ' · ' : ''}${keptLinks && keptLinks.email ? `<a href="${escapeText(keptLinks.email)}">Email</a>` : ''}</p>`
      : '';
    // What guests can do about replies, from the couple's own RSVP choice (kept true to what the invitation does).
    const rsvpMode = project.preferences?.rsvp || 'count';
    const repliesLine = rsvpMode === 'none' ? ''
      : rsvpMode === 'contact' ? '<li><strong>Replies.</strong> Guests will see your contact details on the invitation, so they can reach you directly.</li>'
      : '<li><strong>Replies.</strong> Guests can reply from the live invitation. You see their replies under <em>Replies</em> in the editor.</li>';
    // Said before anything is public, in plain words: what happens, what does not, and what can be undone.
    // Straight after going live there is nothing to update yet, so the dialog only shows the link (and Close / Take offline).
    const justWentLive = live && session.success && !session.changing;
    const explainer = justWentLive ? '' : live
      ? '<p class="pub-fine">Made changes since going live? Choose <strong>Update live page</strong> to show them. Choose <strong>Take offline</strong> to make the link stop working.</p>'
      : `<section class="pub-card pub-explain"><h3 class="pub-card-title">What happens next</h3><ul>
          <li><strong>Right now it is private.</strong> Only you can see your invitation. It stays private until you choose <em>Make it live</em>. You can look at it as guests will see it first.</li>
          <li><strong>Making it live gives it a web link.</strong> Anyone who has the link can open it, so share it only with the people you want to invite.</li>
          ${repliesLine}
          <li><strong>You can change your mind.</strong> Keep editing and choose <em>Update live page</em>, or <em>Take offline</em> any time. The link then stops working.</li>
        </ul></section>`;

    // The right-hand column: the chosen design, what is included, and the order with the main button.
    const design = typeof tpl === 'function' ? tpl(project.templateId) : null;
    const designName = escapeText((design && design.name) || project.templateName || 'Your design');
    const designCard = `<section class="pub-card pub-design">
        ${design && design.image ? `<img src="${escapeText(design.image)}" alt="" width="190" height="190">` : '<span class="pub-design-empty"></span>'}
        <div><h3>${designName}</h3><p class="pub-sub">Your selected design</p>
        ${live ? '' : `<button class="btn small pub-ghost" type="button" data-preview-first>${ICON.eye} Preview invitation</button>`}</div>
      </section>`;
    const benefits = live ? '' : `<section class="pub-benefits"><ul>
        <li><span>${ICON.pencil}</span><div><strong>Keep editing anytime</strong><p>You can update your invitation even after it is live.</p></div></li>
        ${paying || (session.price && session.price.mode === 'live') ? `<li><span>${ICON.layers}</span><div><strong>One-time payment</strong><p>${priceText ? `Pay ${escapeText(priceText)} once.` : 'Pay once.'} No subscription, ever.</p></div></li>
        <li><span>${ICON.shield}</span><div><strong>Secure and trusted</strong><p>Payments are processed securely by Razorpay.</p></div></li>` : ''}
      </ul></section>`;
    const submit = justWentLive ? '' : `<button class="btn dark pub-primary" type="button" data-publish-submit ${canPublish(project, session) ? '' : 'disabled'}>${paying && !session.busy ? ICON.card + ' ' : ''}${session.busy ? (paying || session.info ? 'Please wait…' : 'Going live…') : primary}</button>`;
    const showOrder = !live && !project.publishUnlocked && session.price;
    const orderCard = `<section class="pub-card pub-order">
        ${showOrder ? `<h3 class="pub-card-title">Your order</h3>
        <div class="pub-line"><span>${designName} (live invitation)</span><span>${escapeText(session.price.mode === 'live' ? session.price.text : 'Free')}</span></div>
        <div class="pub-total"><span>${session.price.mode === 'live' ? 'Total payable' : 'Total today'}</span><strong>${escapeText(session.price.mode === 'live' ? session.price.text : 'Free')}</strong></div>
        <p class="pub-pill">${ICON.bolt} ${session.price.mode === 'live' ? 'One-time payment · No recurring charges' : 'Free during early access'}</p>` : `<h3 class="pub-card-title">${live ? 'Your live page' : 'Ready to go live'}</h3>`}
        ${priceNote}${keptBlock}${notSaved}${info}${checkAgain}${error}${success}
        <div class="pub-actions">${submit}
          ${live && !session.changing ? '<button class="btn" type="button" data-share-card>Share card for WhatsApp</button>' : ''}
          ${live ? '<button class="btn" type="button" data-unpublish>Take offline</button>' : ''}
        </div>
      </section>`;
    const stepsPay = paying || (session.price && session.price.mode === 'live')
      ? `<li><span>${ICON.card}</span><div><strong>Pay once</strong><small>${priceText ? escapeText(priceText) + ' (one-time)' : 'One-time payment'}</small></div></li>`
      : `<li><span>${ICON.card}</span><div><strong>Free for now</strong><small>Early access</small></div></li>`;
    const steps = live ? '' : `<ol class="pub-steps" aria-label="How it works"><li><span>${ICON.lock}</span><div><strong>Private now</strong><small>Only you can see it</small></div></li><li class="pub-arrow" aria-hidden="true">›</li>${stepsPay}<li class="pub-arrow" aria-hidden="true">›</li><li><span>${ICON.link}</span><div><strong>Get a live link</strong><small>Share with your guests</small></div></li></ol>`;
    const lead = live
      ? 'Guests can open your invitation with the link below.'
      : paying ? 'Your invitation is currently private. Complete your purchase to make it live and share it with your guests.'
      : 'Your invitation is currently private. Make it live to get a link you can share with your guests.';
    renderModal(`<div class="pub-shell">
      <div class="pub-top"><span class="pub-logo">${typeof logoMark === 'string' ? logoMark : ''}<span>InviteStudio</span></span><button class="pub-x" type="button" data-publish-close aria-label="Dismiss">×</button></div>
      <div class="eyebrow">${live ? 'Your live invitation' : 'Share your invitation'}</div>
      <h2 id="modal-title">${live ? 'Your invitation is live' : 'Your invitation is almost ready.'}</h2>
      <p class="pub-lead">${lead}</p>
      <p class="pub-status">Status: <strong>${escapeText(publishStatusLabel(project))}</strong>${live ? '' : ', not public yet'}.</p>
      ${steps}
      <div class="pub-grid">
        <div class="pub-main">${contactBlock}${addressField}${changeWarning}${liveBlock}${explainer}</div>
        <aside class="pub-side">${designCard}${benefits}${orderCard}</aside>
      </div>
      <div class="pub-foot"><p>${ICON.help} <span><strong>Questions?</strong> <a href="/contact" target="_blank" rel="noopener">Contact us</a> and we will help.</span></p><button class="btn" type="button" data-publish-close>Close</button></div>
    </div>`);
    wirePublishDialog(project);
    ensureAddressChecked(project);
    loadPublishPrice(project);
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
    root.querySelectorAll('[data-publish-close]').forEach(button => button.addEventListener('click', () => { publishSession = null; closeModal(); }));
    root.querySelector('[data-publish-submit]')?.addEventListener('click', () => (needsPayment(project, publishSession) ? startPayment(project) : publishFromDialog(project)));
    root.querySelector('[data-check-payment]')?.addEventListener('click', () => { if (publishSession) publishSession.checkAgain = false; handlePaymentReturnAgain(project); });
    root.querySelector('[data-preview-first]')?.addEventListener('click', () => {
      publishSession = null;
      closeModal();
      if (window.InviteStudioBridge?.openPreview) window.InviteStudioBridge.openPreview();
      else { state.page = 'preview'; render(); }
    });
    root.querySelector('[data-unpublish]')?.addEventListener('click', () => unpublishFromDialog(project));
    root.querySelector('[data-share-card]')?.addEventListener('click', () => { publishSession = null; if (typeof window.openShareCard === 'function') window.openShareCard(project); });
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
    [['#buyerName', 'name'], ['#buyerEmail', 'email'], ['#buyerPhone', 'phone']].forEach(([selector, key]) => {
      const field = root.querySelector(selector);
      field?.addEventListener('input', () => {
        publishSession.contact[key] = field.value;
        rememberContact(project);
        updateDialogWithoutRepaint(project);
      });
    });
    const marketing = root.querySelector('#buyerMarketing');
    marketing?.addEventListener('change', () => { publishSession.contact.marketing = marketing.checked; rememberContact(project); });
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
      line.dataset.tone = status.tone;
    }
    const linkLine = root?.querySelector('#link-preview');
    if (linkLine) linkLine.textContent = `${window.location.origin}/s/${publishSession.typed || '…'}`;
    const contactLine = root?.querySelector('#contact-status');
    if (contactLine) contactLine.textContent = contactProblem(publishSession.contact);
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

  // ---- Paying to publish (docs/PRICING_PLAN.md). The page only SHOWS the price; the server decides it again at checkout. ----
  const PENDING_PAYMENT_KEY = 'invitestudio-pending-payment';
  // Where the payment page may be: Razorpay's own addresses, and nothing the server could be tricked into returning.
  const PAYMENT_HOST = /^https:\/\/([a-z0-9-]+\.)*(razorpay\.com|rzp\.io)\//i;

  function formatMoney(amountMinor, currency, locale) {
    try {
      const whole = amountMinor % 100 === 0;
      return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(amountMinor / 100);
    } catch {
      return '';
    }
  }

  // Looks up the price of this design for this visitor, once per dialog. If it cannot be loaded the dialog simply says nothing about price.
  async function loadPublishPrice(project) {
    const session = publishSession;
    if (!session || session.price !== null || session.priceLoading) return;
    session.priceLoading = true;
    try {
      const response = await fetch('/api/pricing', { headers: { Accept: 'application/json' } });
      const data = response.ok ? await response.json() : null;
      const tierId = data?.templates?.[project.templateId] || 'classic';
      const tier = data?.tiers?.find(item => item.id === tierId);
      const text = tier ? formatMoney(tier.amountMinor, data.currency, data.locale) : '';
      session.price = text ? { text, tierName: tier.name, mode: data.mode } : false;
    } catch {
      session.price = false;
    }
    session.priceLoading = false;
    if (publishSession === session) paintPublishDialog(project, {});
  }

  // Whether this dialog's main button takes a payment: the server has said so, or payments are live and this website is not unlocked.
  function needsPayment(project, session) {
    if (isLive(project) || project.publishUnlocked) return false;
    return Boolean(session.needsPayment || (session.price && session.price.mode === 'live'));
  }

  async function startPayment(project) {
    const session = publishSession;
    if (!session || !canPublish(project, session)) return;
    session.busy = true;
    session.error = '';
    session.info = '';
    paintPublishDialog(project, {});
    try {
      rememberContact(project);
      const result = await window.inviteStudioApi.startCheckout(project.cloudId, tokenFor(project.cloudId), session.contact);
      if (result.alreadyUnlocked) {
        project.publishUnlocked = true;
        session.busy = false;
        session.needsPayment = false;
        paintPublishDialog(project, {});
        return;
      }
      if (!PAYMENT_HOST.test(String(result.url || ''))) throw new Error('unexpected payment address');
      // Remember what is being paid for, so coming back from the payment page can pick up exactly here.
      try {
        window.localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ paymentId: result.paymentId, projectId: project.id, slug: session.typed, at: Date.now() }));
      } catch { /* the page can still be paid; coming back just asks to open the dialog again */ }
      window.location.assign(result.url);
    } catch (error) {
      session.busy = false;
      if (error.code === 'PAYMENTS_NOT_LIVE') {
        session.needsPayment = false;
        if (session.price) session.price.mode = 'early-access';
        session.error = 'Payments are not open yet, so there is nothing to pay. Choose Make it live.';
      } else if (error.code === 'CONTACT_INVALID' || error.code === 'CONTACT_REQUIRED') {
        session.error = 'Please check your name and email, then try again.';
      } else if (error.code === 'PAYMENTS_NOT_CONFIGURED') {
        session.error = 'Payments are not set up yet. Please try again later or contact us.';
      } else {
        session.error = 'We could not start the payment. Your draft is safe; try again in a moment.';
      }
      paintPublishDialog(project, {});
    }
  }

  // Back from the payment page (?payment=<id>): ask the server whether it was paid, and carry on in the publish dialog.
  function hidePaymentCover() {
    document.documentElement.classList.remove('payment-return');
  }

  async function handlePaymentReturn({ onShown } = {}) {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment');
    if (!paymentId) return;
    params.delete('payment');
    const rest = params.toString();
    try { window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash); } catch { /* the address bar keeps the id; harmless */ }
    let pending = null;
    try { pending = JSON.parse(window.localStorage.getItem(PENDING_PAYMENT_KEY) || 'null'); } catch { pending = null; }
    const project = pending && pending.paymentId === paymentId ? state.projects.find(item => item.id === pending.projectId) : null;
    if (!project || !project.cloudId || !tokenFor(project.cloudId) || !window.inviteStudioApi?.enabled) {
      toast('We could not match that payment to a draft in this browser. If you paid, contact us with your payment details and we will sort it out.');
      return;
    }
    state.currentId = project.id;
    state.page = 'editor';
    render();
    window.openCloudPublish(project);
    if (onShown) onShown();
    if (!publishSession) return;
    publishSession.typed = pending.slug || publishSession.typed;
    await confirmPayment(project, paymentId);
  }

  // Asks the server (which asks the payment service) whether the payment is done, a few times, since the bank can take a moment.
  async function confirmPayment(project, paymentId) {
    const session = publishSession;
    if (!session) return;
    session.info = 'Confirming your payment…';
    session.busy = true;
    session.checkAgain = false;
    paintPublishDialog(project, {});
    for (let attempt = 0; attempt < 6 && publishSession === session; attempt++) {
      try {
        const result = await window.inviteStudioApi.verifyPayment(project.cloudId, tokenFor(project.cloudId), paymentId);
        if (result.unlocked) {
          project.publishUnlocked = true;
          if (result.paidTier) project.paidTier = result.paidTier;
          // Confirming the payment changed the website's record on the server: keep its version, so "Make it live" is not refused.
          if (Number.isInteger(result.version) && result.version >= Number(project.cloudVersion || 0)) project.cloudVersion = result.version;
          try { window.localStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* nothing to clear */ }
          session.busy = false;
          session.needsPayment = false;
          session.info = 'Payment received. Thank you! Choose Make it live to publish.';
          localSave();
          paintPublishDialog(project, {});
          return;
        }
      } catch (error) {
        if (error.code === 'PAYMENT_MISMATCH') {
          session.busy = false;
          session.info = '';
          session.error = 'We could not confirm this payment. Please contact us with your payment details and we will sort it out.';
          paintPublishDialog(project, {});
          return;
        }
      }
      if (attempt < 5) await new Promise(resolve => window.setTimeout(resolve, 2500));
    }
    if (publishSession !== session) return;
    session.busy = false;
    session.info = 'We have not heard back from the payment service yet. If you have paid, it unlocks within a few minutes: choose Check again.';
    session.checkAgain = true;
    paintPublishDialog(project, {});
  }

  function handlePaymentReturnAgain(project) {
    let pending = null;
    try { pending = JSON.parse(window.localStorage.getItem(PENDING_PAYMENT_KEY) || 'null'); } catch { pending = null; }
    if (pending && pending.projectId === project.id && pending.paymentId) confirmPayment(project, pending.paymentId);
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
      if (error.code === 'PAYMENT_REQUIRED') {
        // The server says this website must be paid for first: the main button now takes the payment.
        session.needsPayment = true;
        session.error = '';
        paintPublishDialog(project, {});
        return;
      }
      session.error = publishErrorMessage(error);
      if (error.code === 'SLUG_CONFLICT') {
        session.availability = { available: false, message: 'That web address is already in use.', suggestions: [] };
        checkAddressSoon(project);
      }
      paintPublishDialog(project, {});
    }
  }

  async function unpublishFromDialog(project) {
    if (!await askConfirm({ title: 'Take this invitation offline?', message: 'Guests will no longer see it. You can publish it again later.', confirmLabel: 'Take offline', cancelLabel: 'Keep it live', danger: true })) return;
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
      toast('Invitation deleted from this device.');
      return;
    }
    const token = tokenFor(project.cloudId);
    if (!token || !window.inviteStudioApi?.enabled) {
      fail('This invitation\'s private link is not on this device, so its online copy cannot be deleted from here. Nothing has been deleted.');
      return;
    }
    try {
      await window.inviteStudioApi.deleteWedding(project.cloudId, token);
    } catch (error) {
      if (error.status === 404) {
        // Already gone on the server: finish the local cleanup.
      } else if (error.status === 401 || error.status === 403) {
        fail('This private link is no longer valid, so the invitation cannot be deleted from here. Nothing has been deleted.');
        return;
      } else {
        fail('The invitation could not be deleted right now. Check your connection and try again. Nothing has been deleted.');
        return;
      }
    }
    removeLocalWebsite(project);
    closeModal();
    state.page = 'dashboard';
    render();
    toast('Invitation permanently deleted.');
  }

  function confirmDeleteWebsite(project) {
    if (!project) return;
    const name = escapeText(project.title || project.name || 'this invitation');
    const publicNote = project.publishStatus === 'published'
      ? '<p class="tiny" style="color:#9b5147;margin:8px 0 0">Its public address will stop working straight away.</p>'
      : '';
    renderModal(`<div class="eyebrow">Delete invitation</div>
      <h2 id="modal-title">Delete \u201c${name}\u201d?</h2>
      <p class="muted">This permanently removes the invitation, its private links and its RSVP and photo records. It cannot be undone.</p>
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
      renderModal(`<div class="eyebrow">Share your invitation</div><h2 id="modal-title">Almost ready</h2><p class="muted">Your draft is still being saved online. Publishing becomes available as soon as it is saved.</p><div class="modal-actions"><button class="btn dark" type="button" onclick="closeModal()">Got it</button></div>`);
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
    const originalOpenProject = window.openProject;
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

    // Edit on the My invitations page opens the draft and refreshes it from the cloud, as "continue" always did.
    if (typeof originalOpenProject === 'function') {
      window.openProject = function openProjectAndRefresh(id) {
        const result = originalOpenProject.apply(this, arguments);
        const project = state.projects.find(item => item.id === id);
        if (project) {
          state.recoveryError = '';
          rememberDraftReference(project);
          void refreshFromCloud(project);
        }
        return result;
      };
    }

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
      if (new URLSearchParams(window.location.search).has('payment')) {
        // Back from the payment page: carry on with the payment at once (the other invitations are brought up to date afterwards,
        // not before), and take the "confirming your payment" cover away as soon as the dialog is on the screen.
        let paying = '';
        try { paying = JSON.parse(window.localStorage.getItem(PENDING_PAYMENT_KEY) || 'null')?.projectId || ''; } catch { paying = ''; }
        handlePaymentReturn({ onShown: hidePaymentCover }).catch(() => null).finally(hidePaymentCover);
        Promise.resolve(hydrateCloudProjects({ skip: paying, redraw: false })).catch(() => null);
      } else {
        Promise.resolve(hydrateCloudProjects()).catch(() => null).then(handlePaymentReturn).catch(() => null);
      }
    }
  };
})();
