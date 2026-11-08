/* Shared behaviour for packaged templates (see packaged-templates.js). Templates carry only markers:
 *   data-scroll-to="name"   scroll to the section marked data-tpl-section="name" inside the same invitation
 *   data-menu-toggle        open or close the template's menu (the .main-nav next to it)
 *   data-countdown="YYYY-MM-DD" with [data-cd="days|hours|minutes|seconds"] children
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
  var timer = null;
  function hydrate(scope) {
    if (!scope || !scope.querySelectorAll) return;
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
