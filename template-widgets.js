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
 *                           With data-intro-manual (an opening with a video and an "open" button) there is no timer:
 *                           the video in it (data-src-wide / data-src-tall, only the one that fits the frame is
 *                           downloaded) plays muted, the button [data-intro-open] appears at data-intro-at seconds (or
 *                           after a short wait if the video cannot play), and clicking it lifts the opening.
 *   data-scratch            a gold foil to scratch away (a canvas the platform draws over [data-scratch-card]); at half
 *                           scratched, or on [data-scratch-reveal], it dissolves and data-scratched is set. Until then
 *                           data-scratch-armed is set, so a template can show a button and hide what follows. Without
 *                           canvas support the date is simply shown. data-scratched in the markup skips the foil.
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
    introState.set(el, { key: key, demo: wait, frame: frame, timer: 0, timers: [], video: null, started: false, finished: false, unlock: function () { box.style.overflow = before; } });
    if (!wait) startIntro(el);
  }
  // An opening that ends when the guest presses its button: a muted video, and the button once it has had time to play.
  function playOpening(el, st) {
    var showButton = function () { el.setAttribute("data-button", ""); };
    var at = parseFloat(el.getAttribute("data-intro-at")) || 3.5;
    var video = el.querySelector("video[data-src-wide],video[data-src-tall]");
    // The button never depends on the video alone.
    st.timers.push(window.setTimeout(showButton, at * 1000 + 500));
    if (!video) return;
    var w = st.frame ? st.frame.clientWidth : window.innerWidth, h = st.frame ? st.frame.clientHeight : window.innerHeight;
    var wide = video.getAttribute("data-src-wide"), tall = video.getAttribute("data-src-tall");
    var src = h > w ? (tall || wide) : (wide || tall);
    if (!src) return;
    st.video = video;
    video.muted = true; video.defaultMuted = true;
    video.addEventListener("playing", function () { el.setAttribute("data-playing", ""); });
    video.addEventListener("timeupdate", function () { if (video.currentTime >= at) showButton(); });
    video.addEventListener("error", showButton);
    video.src = src;
    var attempt = video.play && video.play();
    if (attempt && attempt.catch) attempt.catch(function () { /* autoplay refused: the poster and the button stay */ });
  }
  function startIntro(el) {
    var st = introState.get(el);
    if (!st || st.finished || st.started) return;
    st.started = true;
    el.removeAttribute("data-wait");
    if (el.hasAttribute("data-intro-manual")) { playOpening(el, st); return; }
    st.timer = window.setTimeout(function () { finishIntro(el); }, parseInt(el.getAttribute("data-intro-ms"), 10) || 9400);
  }
  function finishIntro(el, quick) {
    var st = introState.get(el);
    if (!st || st.finished) return;
    st.finished = true;
    window.clearTimeout(st.timer);
    st.timers.forEach(function (t) { window.clearTimeout(t); });
    if (st.video) { try { st.video.pause(); } catch (e) { /* already stopped */ } }
    if (!st.demo) remember(st.key);
    st.unlock();
    el.removeAttribute("data-wait");
    var done = function () {
      el.setAttribute("data-done", "");
      el.dispatchEvent(new CustomEvent("intro-done", { bubbles: true, composed: true }));
    };
    if (quick) { done(); return; }
    el.setAttribute("data-leaving", "");
    window.setTimeout(done, 900);
  }
  // The guest presses the opening's button: the template plays its own reveal (data-opening), then the page is theirs.
  function openIntro(el) {
    var st = introState.get(el);
    if (!st || st.finished || el.hasAttribute("data-opening")) return;
    el.setAttribute("data-opening", "");
    window.setTimeout(function () { finishIntro(el, true); }, reduce() ? 250 : 1200);
  }

  /* ---------- scratch card ---------- */
  var scratchState = new WeakMap();
  function revealScratch(el, burst) {
    var st = scratchState.get(el);
    if (el.hasAttribute("data-scratched")) return;
    el.setAttribute("data-scratched", "");
    var card = el.querySelector("[data-scratch-card]");
    if (burst && card && !reduce()) {
      var box = document.createElement("div"), w = card.offsetWidth || 300, h = card.offsetHeight || 150;
      box.setAttribute("data-scratch-burst", "");
      box.style.top = h / 2 + "px";
      for (var i = 0; i < 18; i++) {
        var petal = document.createElement("i"), a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4, d = 60 + Math.random() * 110;
        petal.style.setProperty("--x", Math.round(Math.cos(a) * d * (w / 260)) + "px");
        petal.style.setProperty("--y", Math.round(Math.sin(a) * d - 30) + "px");
        petal.style.setProperty("--r", Math.round(Math.random() * 540 - 270) + "deg");
        petal.style.animationDelay = Math.random() * 0.2 + "s";
        box.appendChild(petal);
      }
      card.appendChild(box);
      window.setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2200);
    }
    if (st && st.observer) st.observer.disconnect();
  }
  function setupScratch(el) {
    el.setAttribute("data-scratch-ready", "");
    if (el.hasAttribute("data-scratched")) return;
    var card = el.querySelector("[data-scratch-card]"), canvas = document.createElement("canvas"), ctx = null;
    if (!card) { el.setAttribute("data-scratched", ""); return; }
    try { ctx = canvas.getContext && canvas.getContext("2d", { willReadFrequently: true }); } catch (e) { ctx = null; }
    if (!ctx) { el.setAttribute("data-scratched", ""); return; } // never hide the date from anyone
    canvas.setAttribute("data-scratch-canvas", ""); canvas.setAttribute("aria-hidden", "true");
    card.appendChild(canvas);
    el.setAttribute("data-scratch-armed", "");
    var label = el.getAttribute("data-scratch-label") || "Scratch to reveal";
    var st = { touched: false, drawing: false, last: null, checked: 0, observer: null };
    scratchState.set(el, st);
    function paint() {
      if (st.touched || el.hasAttribute("data-scratched")) return;
      var r = card.getBoundingClientRect(), w = r.width, h = r.height;
      if (w < 2 || h < 2) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      var g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#A98443"); g.addColorStop(0.22, "#E8D3A2"); g.addColorStop(0.5, "#C9A762"); g.addColorStop(0.78, "#F0E0B6"); g.addColorStop(1, "#A98443");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < Math.round((w * h) / 90); i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(70,45,10,0.08)";
        ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      ctx.strokeStyle = "rgba(70,45,10,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(10.5, 10.5, w - 21, h - 21);
      ctx.fillStyle = "rgba(60,40,10,0.78)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "italic 500 " + Math.max(16, Math.round(h * 0.2)) + 'px "Cormorant Garamond", Georgia, serif';
      ctx.fillText(label, w / 2, h / 2 - h * 0.04);
      ctx.font = Math.max(11, Math.round(h * 0.09)) + "px Georgia, serif";
      ctx.fillText("\u2726", w / 2, h / 2 + h * 0.22);
    }
    paint();
    if (typeof ResizeObserver !== "undefined") { st.observer = new ResizeObserver(paint); st.observer.observe(card); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint, function () {});
    function at(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function stroke(from, to) {
      ctx.globalCompositeOperation = "destination-out"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 40;
      ctx.beginPath(); ctx.moveTo((from || to).x, (from || to).y); ctx.lineTo(to.x, to.y); ctx.stroke();
    }
    function check(force) {
      var now = Date.now();
      if (!force && now - st.checked < 140) return;
      st.checked = now;
      if (el.hasAttribute("data-scratched")) return;
      try {
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data, total = Math.floor(data.length / 4), seen = 0, clear = 0;
        for (var i = 0; i < total; i += 6) { seen++; if (data[i * 4 + 3] < 128) clear++; }
        if (seen && clear / seen >= 0.5) revealScratch(el, true);
      } catch (e) { /* unreadable canvas: the button still works */ }
    }
    canvas.addEventListener("pointerdown", function (e) {
      if (el.hasAttribute("data-scratched")) return;
      st.touched = true; st.drawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* not critical */ }
      st.last = at(e); stroke(null, st.last);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!st.drawing) return;
      var p = at(e); stroke(st.last, p); st.last = p; check(false);
    });
    var end = function () { if (!st.drawing) return; st.drawing = false; st.last = null; check(true); };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
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
    Array.prototype.forEach.call(scope.querySelectorAll("[data-scratch]:not([data-scratch-ready])"), setupScratch);
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
    if (closest(path, function (n) { return n.hasAttribute("data-intro-open"); })) { if (overlay) openIntro(overlay); return; }
    var scratch = closest(path, function (n) { return n.hasAttribute("data-scratch-reveal"); });
    if (scratch) { var zone = closest(path, function (n) { return n.hasAttribute("data-scratch"); }); if (zone) revealScratch(zone, true); return; }
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
