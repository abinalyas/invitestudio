/* © 2026 InviteStudio. All rights reserved.
 *
 * Session recordings with Microsoft Clarity, on the PUBLIC marketing pages only (docs/REPLAY.md).
 *
 * This does nothing unless the server put <meta name="invitestudio-replay" content="<project id>"> on the page, and the server only does
 * that for the home page, the templates page, a design page and the search landing pages, for a visitor whose country is known and is
 * outside the European Economic Area, the United Kingdom and Switzerland, when a Clarity project is configured.
 *
 * Even then, recording is switched OFF the moment the visitor enters a screen that can hold personal details: the setup steps, the
 * editor, the dashboard, the preview, and any dialog (publish, payment details, replies). The app moves between screens without
 * loading a page, so this watches the screen continuously. While off, the page is also marked data-clarity-mask so anything that is
 * still captured is masked. Also not loaded: Do Not Track, Global Privacy Control, and a browser where the owner has opened /admin.
 */
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="invitestudio-replay"]');
  var id = meta ? String(meta.getAttribute('content') || '') : '';
  if (!/^[a-z0-9]{6,16}$/i.test(id)) return;

  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    if (window.localStorage.getItem('invitestudio-no-track') === '1') return;
  } catch (e) { /* storage blocked: carry on */ }

  var SAFE_SCREENS = { home: 1, templates: 1, detail: 1 };   // the screens that show only the site's own content
  var loaded = false, stopped = false, timer = 0;

  // Whether what is on screen right now holds only public content.
  function safe() {
    var modal = document.getElementById('modal-root'), confirm = document.getElementById('confirm-root');
    if ((modal && modal.firstElementChild) || (confirm && confirm.firstElementChild)) return false;
    if (!document.getElementById('app')) return true;                    // a search landing page: no application
    var hosts = document.querySelectorAll('.figma-island-host');
    if (!hosts.length) return false;                                      // an older screen (preview, dashboard): treated as private
    for (var i = 0; i < hosts.length; i += 1) if (!SAFE_SCREENS[hosts[i].dataset.island]) return false;
    return true;
  }

  function load() {
    if (loaded) return;
    loaded = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', id);
  }

  function call() {
    try { if (typeof window.clarity === 'function') window.clarity.apply(window, arguments); } catch (e) { /* recording must never break the page */ }
  }

  function check() {
    timer = 0;
    var ok = safe();
    var body = document.body;
    if (body) { if (ok) body.removeAttribute('data-clarity-mask'); else body.setAttribute('data-clarity-mask', 'True'); }
    if (ok) {
      if (!loaded) load();
      else if (stopped) { call('start'); stopped = false; }
    } else if (loaded && !stopped) {
      call('stop'); stopped = true;
    }
  }

  function soon() { if (!timer) timer = setTimeout(check, 50); }

  // Check at once (no recording can start on a private screen), then keep watching as the app moves between screens.
  check();
  if (window.MutationObserver) {
    new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-island'] });
  }
  window.addEventListener('popstate', soon);
  document.addEventListener('click', soon, true);
})();
