/* © 2026 InviteStudio. All rights reserved.
 *
 * Anonymous visit statistics (docs/ANALYTICS.md). One small message per page view to /api/collect: the page, where the visitor came
 * from (the site's name, only on the first view), the utm_ tags of a campaign link, the window width and the language. No cookie,
 * no storage of an identifier, and never the query or the fragment (a private link lives in the fragment). The server adds the
 * country, the device kind and the browser, and keeps a daily-changing hash instead of any address.
 *
 * Not sent: when the browser says Do Not Track or Global Privacy Control, on /admin and /api, and from any browser where the owner
 * has opened the admin page (it sets "invitestudio-no-track" here, so the owner's own visits do not count).
 */
(function () {
  'use strict';
  var lastPath = '', lastAt = 0, first = true;

  function optedOut() {
    try {
      if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1' || navigator.globalPrivacyControl === true) return true;
      if (window.localStorage.getItem('invitestudio-no-track') === '1') return true;
    } catch (e) { /* storage blocked: carry on */ }
    return false;
  }

  function pageOf(pathname) {
    var path = String(pathname || '/').replace(/\/+$/, '') || '/';
    if (/^\/edit(\/|$)/.test(path)) return '/edit';    // the old private link carried its key in the path
    return path;
  }

  function utm(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }

  function send() {
    if (optedOut() || document.visibilityState === 'prerender') return;
    var path = pageOf(location.pathname);
    if (/^\/(admin|api)(\/|$)/.test(path)) return;
    var now = Date.now();
    if (path === lastPath && now - lastAt < 1500) return;   // the app can announce the same page twice in a row
    lastPath = path; lastAt = now;
    var body = { e: 'pageview', p: path, w: window.innerWidth, l: navigator.language || '' };
    if (first) {
      body.r = document.referrer || '';
      body.us = utm('utm_source'); body.um = utm('utm_medium'); body.uc = utm('utm_campaign');
      first = false;
    }
    var data = JSON.stringify(body);
    try {
      // text/plain so the browser sends it at once, without a permission check first
      if (navigator.sendBeacon && navigator.sendBeacon('/api/collect', new Blob([data], { type: 'text/plain' }))) return;
    } catch (e) { /* fall back below */ }
    try { fetch('/api/collect', { method: 'POST', body: data, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {}); } catch (e) { /* counting a visit never gets in the way */ }
  }

  // The app moves between screens without loading a page: count those too.
  try {
    var push = history.pushState;
    history.pushState = function () {
      var result = push.apply(this, arguments);
      setTimeout(send, 0);
      return result;
    };
    window.addEventListener('popstate', function () { setTimeout(send, 0); });
  } catch (e) { /* no history API: the first view is still counted */ }

  setTimeout(send, 0);
})();
