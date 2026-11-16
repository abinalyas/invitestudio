/* © 2026 InviteStudio. All rights reserved. Licensed only for use in an invitation built and hosted on InviteStudio (see /terms).
 *
 * Loads a design only when a page needs it. A visitor to one invitation downloads that one design (templates/dist/<id>.js,
 * built by scripts/build-templates.mjs) and the shared template code, not the whole library.
 *
 *   InviteTemplates.need(t)     Promise: resolves when catalogue entry `t` can be drawn; rejects if it cannot be loaded
 *   InviteTemplates.ready(t)    true when `t` can be drawn right now (always true for a design with nothing to load)
 *   InviteTemplates.cssFor(t)   the design's CSS text, for the editor's shadow roots (which do not see the page's styles)
 *   InviteTemplates.register()  called by each templates/dist/<id>.js
 *
 * A packaged design needs: packaged-templates.js (the renderer), template-widgets.js (reveals, sound, countdown) and its bundle.
 */
(function (root) {
  'use strict';
  var BUNDLES = '/templates/dist/';
  // The build id (scripts/stamp-build.mjs, in the page's meta tag) goes on every address, so a page only ever loads files of its own build, never an older cached copy.
  var meta = typeof document !== 'undefined' && document.querySelector('meta[name="invitestudio-build"]');
  var V = meta && meta.content ? '?v=' + meta.content : '';
  var scripts = {};   // url -> Promise, one request per file
  var cssText = {};   // key -> CSS text
  var needs = {};     // design key -> Promise

  function loadScript(url) {
    if (scripts[url]) return scripts[url];
    scripts[url] = new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = url + V;
      el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () { delete scripts[url]; el.remove(); reject(new Error('Could not load ' + url)); };
      document.head.appendChild(el);
    });
    return scripts[url];
  }

  // Adds a design's CSS to the page, once. Fonts (@font-face) must live in the page itself: they do not work inside a shadow root.
  function addStyle(key, text) {
    cssText[key] = text;
    if (!document.getElementById('tpl-css-' + key)) {
      var style = document.createElement('style');
      style.id = 'tpl-css-' + key;
      style.textContent = text;
      document.head.appendChild(style);
    }
  }

  // Which design a catalogue entry needs, or null when it needs none (older designs the page draws itself).
  function groupOf(t) {
    if (!t || t.unavailable || !t.packaged) return null;
    return { key: 'packaged:' + t.packaged, id: t.packaged };
  }

  function ready(t) {
    var g = groupOf(t);
    if (!g) return true;
    return typeof root.renderPackagedTemplate === 'function' && typeof root.hydratePackagedTemplates === 'function' &&
      Boolean(root.PACKAGED_TEMPLATES && root.PACKAGED_TEMPLATES[g.id]);
  }

  function need(t) {
    var g = groupOf(t);
    if (!g || ready(t)) return Promise.resolve();
    if (needs[g.key]) return needs[g.key];
    var jobs = [loadScript('/packaged-templates.js'), loadScript('/template-widgets.js'), loadScript(BUNDLES + g.id + '.js')];
    needs[g.key] = Promise.all(jobs).then(function () {
      if (!ready(t)) throw new Error('The design did not load: ' + g.key);
      try { document.dispatchEvent(new CustomEvent('invitestudio:template-ready', { detail: { id: t.id } })); } catch (e) { /* older browser */ }
    }, function (error) { delete needs[g.key]; throw error; });
    return needs[g.key];
  }

  function cssFor(t) {
    var g = groupOf(t);
    return (g && cssText[g.key]) || '';
  }

  // Called by templates/dist/<id>.js: the design's data and its scoped CSS.
  function register(id, data, css) {
    root.PACKAGED_TEMPLATES = root.PACKAGED_TEMPLATES || {};
    root.PACKAGED_TEMPLATES[id] = data;
    addStyle('packaged:' + id, css);
  }

  root.InviteTemplates = { need: need, ready: ready, cssFor: cssFor, register: register };
})(typeof globalThis !== 'undefined' ? globalThis : this);
