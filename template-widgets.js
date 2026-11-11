/* Shared behaviour for packaged templates (see packaged-templates.js). Templates carry only markers:
 *   data-scroll-to="name"   scroll to the section marked data-tpl-section="name" inside the same invitation
 *   data-menu-toggle        open or close the template's menu (the .main-nav next to it)
 *   data-countdown="YYYY-MM-DD" with [data-cd="days|hours|minutes|seconds"] children
 *   data-reveal             fade (and rise, or scale) in once, when scrolled into view. The template styles the hidden
 *                           state under [data-reveal-armed]:not([data-revealed]) only, so without this script (or with
 *                           reduced motion) everything simply stays visible. A --rd custom property sets the delay.
 *   data-intro              an opening screen (a template declares one in its manifest). It is the first thing in the
 *                           invitation; the platform sizes it to what the guest sees (the scrolling frame, else the window),
 *                           holds the page still while it plays, and lifts it after data-intro-ms. data-intro-skip ends it,
 *                           data-intro-replay (anywhere in the invitation) plays it again, and it is skipped under reduced
 *                           motion or once seen this session. With data-wait (the template page's phone) it waits for a click on
 *                           data-intro-start, and an "intro-done" event is sent when it lifts.
 * Clicks are handled once on the document (composedPath reaches inside the editor's shadow root), so
 * scrolling stays inside the editor's device frame and never changes the page address.
 * hydratePackagedTemplates(node) is called after markup is drawn into a shadow root.
 */
(function () {
  "use strict";
  var roots = new Set();
  var reduce = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  function pad(n) { return String(n).padStart(2, "0"); }
  // The ceremony day counts from midnight in the viewer's own time zone (time zones come later, see the contract).
  function targetOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
  }
  function tick() {
    roots.forEach(function (node) {
      if (!node.isConnected) { roots.delete(node); return; }
      var target = targetOf(node.getAttribute("data-countdown")), left = target - Date.now();
      var parts = isNaN(target) ? null : left <= 0 ? [0, 0, 0, 0] : [Math.floor(left / 864e5), Math.floor(left % 864e5 / 36e5), Math.floor(left % 36e5 / 6e4), Math.floor(left % 6e4 / 1e3)];
      ["days", "hours", "minutes", "seconds"].forEach(function (k, i) {
        var el = node.querySelector('[data-cd="' + k + '"]');
        // Only write when the text changes: the page-level observer below reacts to DOM changes, and writing the
        // same text again would trigger it again, forever.
        var next = parts ? pad(parts[i]) : "—";
        if (el && el.textContent !== next) el.textContent = next;
      });
    });
  }
  /* ---------- scroll reveals ---------- */
  var revealer = null;
  function revealObserver() {
    if (!revealer) revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.setAttribute("data-revealed", "");
        revealer.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    return revealer;
  }
  // The box the guest actually sees the element in: the nearest scrolling ancestor (the editor's device frame), else the window.
  function scroller(el) {
    for (var n = el.parentNode || el.host; n; n = n.parentNode || n.host) {
      if (n.nodeType === 1 && n.scrollHeight > n.clientHeight + 1) {
        var oy = window.getComputedStyle(n).overflowY;
        if (oy === "auto" || oy === "scroll") return n;
      }
    }
    return null;
  }
  function viewBox(el) {
    var n = scroller(el);
    return n ? n.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  }

  /* ---------- opening screen ---------- */
  var introState = new WeakMap(), introHtml = new WeakMap();
  function introKey(el) {
    var root = el.closest("[data-packaged-template]");
    return "introSeen:" + window.location.pathname + ":" + (root ? root.getAttribute("data-packaged-template") : "");
  }
  function seen(key) { try { return window.sessionStorage.getItem(key) === "1"; } catch (e) { return false; } }
  function remember(key) { try { window.sessionStorage.setItem(key, "1"); } catch (e) { /* played again next time */ } }
  function forget(key) { try { window.sessionStorage.removeItem(key); } catch (e) { /* nothing to forget */ } }
  function sizeIntro(el, frame) { el.style.setProperty("--intro-h", (frame ? frame.clientHeight : window.innerHeight) + "px"); }
  function setupIntro(el) {
    // Kept clean (not waiting, not started) so it can be played again.
    var clean = el.cloneNode(true); clean.removeAttribute("data-wait");
    introHtml.set(el, clean.outerHTML);
    el.setAttribute("data-intro-ready", "");
    var wait = el.hasAttribute("data-wait"), key = introKey(el);
    if (reduce() || (!wait && seen(key))) { el.setAttribute("data-done", ""); return; }
    var frame = scroller(el), box = frame || document.documentElement, before = box.style.overflow;
    sizeIntro(el, frame);
    box.style.overflow = "hidden"; // the page stays still behind the opening
    introState.set(el, { key: key, demo: wait, frame: frame, timer: 0, finished: false, unlock: function () { box.style.overflow = before; } });
    if (!wait) startIntro(el);
  }
  function startIntro(el) {
    var st = introState.get(el);
    if (!st || st.finished || st.timer) return;
    el.removeAttribute("data-wait");
    st.timer = window.setTimeout(function () { finishIntro(el); }, parseInt(el.getAttribute("data-intro-ms"), 10) || 9400);
  }
  function finishIntro(el) {
    var st = introState.get(el);
    if (!st || st.finished) return;
    st.finished = true;
    window.clearTimeout(st.timer);
    if (!st.demo) remember(st.key);
    st.unlock();
    el.removeAttribute("data-wait");
    el.setAttribute("data-leaving", "");
    window.setTimeout(function () {
      el.setAttribute("data-done", "");
      el.dispatchEvent(new CustomEvent("intro-done", { bubbles: true, composed: true }));
    }, 900);
  }
  function replayIntro(scope) {
    var el = scope && scope.querySelector("[data-intro]"), html = el && introHtml.get(el);
    if (!el || !html) return;
    forget(introKey(el));
    var frame = scroller(el);
    if (frame) frame.scrollTo(0, 0); else window.scrollTo(0, 0);
    el.outerHTML = html;
    hydrate(scope);
  }
  window.addEventListener("resize", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-intro]:not([data-done])"), function (el) {
      var st = introState.get(el);
      if (st && !st.frame) sizeIntro(el, null);
    });
  });
  function arm(scope) {
    if (reduce() || typeof IntersectionObserver === "undefined") return;
    Array.prototype.forEach.call(scope.querySelectorAll("[data-reveal]:not([data-reveal-armed]):not([data-revealed])"), function (el) {
      var root = el.closest("[data-packaged-template]");
      // The editor redraws the whole invitation on every keystroke. What is already on screen, or scrolled past, stays
      // put instead of fading in again; only what is still below the fold waits for its reveal.
      if (root && root.hasAttribute("data-preview") && el.getBoundingClientRect().top < viewBox(el).bottom) return;
      el.setAttribute("data-reveal-armed", "");
      revealObserver().observe(el);
    });
  }

  var timer = null;
  function hydrate(scope) {
    if (!scope || !scope.querySelectorAll) return;
    Array.prototype.forEach.call(scope.querySelectorAll("[data-intro]:not([data-intro-ready])"), setupIntro);
    arm(scope);
    Array.prototype.forEach.call(scope.querySelectorAll("[data-countdown]"), function (el) { roots.add(el); });
    if (roots.size) { tick(); if (!timer) timer = window.setInterval(function () { tick(); if (!roots.size) { window.clearInterval(timer); timer = null; } }, 1000); }
  }
  window.hydratePackagedTemplates = hydrate;

  function closest(path, test) {
    for (var i = 0; i < path.length; i++) { if (path[i] && path[i].nodeType === 1 && test(path[i])) return path[i]; }
    return null;
  }
  document.addEventListener("click", function (e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    var toggle = closest(path, function (n) { return n.hasAttribute("data-menu-toggle"); });
    if (toggle) {
      var nav = toggle.parentNode.querySelector("[data-nav]");
      if (nav) { var open = !nav.hasAttribute("data-open"); if (open) nav.setAttribute("data-open", ""); else nav.removeAttribute("data-open"); toggle.setAttribute("aria-expanded", String(open)); }
      return;
    }
    var overlay = closest(path, function (n) { return n.hasAttribute("data-intro"); });
    if (closest(path, function (n) { return n.hasAttribute("data-intro-start"); })) { if (overlay) startIntro(overlay); return; }
    if (closest(path, function (n) { return n.hasAttribute("data-intro-skip"); })) { if (overlay) finishIntro(overlay); return; }
    if (closest(path, function (n) { return n.hasAttribute("data-intro-replay"); })) {
      replayIntro(closest(path, function (n) { return n.hasAttribute("data-packaged-template"); }));
      return;
    }
    var link = closest(path, function (n) { return n.hasAttribute("data-scroll-to"); });
    if (!link) return;
    var scope = closest(path, function (n) { return n.hasAttribute("data-packaged-template"); });
    if (!scope) return;
    var target = scope.querySelector('[data-tpl-section="' + link.getAttribute("data-scroll-to") + '"]');
    var nav2 = scope.querySelector("[data-nav][data-open]");
    if (nav2) { nav2.removeAttribute("data-open"); var t2 = scope.querySelector("[data-menu-toggle]"); if (t2) t2.setAttribute("aria-expanded", "false"); }
    if (target) target.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
  });

  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(function () { hydrate(document); }).observe(document.documentElement, { childList: true, subtree: true });
  }
  hydrate(document);
})();
