/* Scene templates: renderer and artwork for Savanna, Palmera, Curtain Call and Lunaria.
 *
 * sitePreview() in index.html hands a project to window.renderSceneTemplate() when the selected
 * template has a `scene` key. The output is a string of scoped markup (see scene-templates.css);
 * every project value is escaped here. Behaviour (reveals, curtain tap) is attached by delegation,
 * so it works for the editor preview and the public /s/<slug> page alike. Artwork is drawn as SVG
 * from code, so there are no image requests and nothing for the CSP to block.
 */
(function () {
  "use strict";
  var uidN = 0;
  /* What the invitation shows until the couple fills a field in. The editor shows the same texts as hints. */
  var DEFAULTS = Object.freeze({ title: 'Your celebration', message: 'Together with our favourite people, for a day to remember.', hosts: 'Together with their families', date: 'Date to be announced' });
  function uid(p) { uidN += 1; return p + uidN; }
  function rng(seed) { var s = seed; return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

  /* ================= Illustrations ================= */

  function grain(u, o) {
    return '<filter id="' + u + 'n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4"/><feColorMatrix type="saturate" values="0"/></filter>' +
      '<rect width="360" height="720" filter="url(#' + u + 'n)" opacity="' + o + '" style="mix-blend-mode:multiply"/>';
  }

  /* Savanna */
  function savDefs(u) {
    return '<defs>' +
      '<linearGradient id="' + u + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94605a"/><stop offset=".28" stop-color="#d98c62"/><stop offset=".52" stop-color="#f4a95a"/><stop offset=".7" stop-color="#f9c873"/></linearGradient>' +
      '<radialGradient id="' + u + 'g"><stop offset="0" stop-color="#fff0b0" stop-opacity=".95"/><stop offset=".4" stop-color="#ffd27a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>' +
      '<g id="' + u + 'gf" fill="#44200f" stroke="#44200f"><ellipse cx="0" cy="-20" rx="15" ry="7" stroke="none"/><path d="M9 -24 L16 -24 L25 -52 L20 -54Z" stroke="none"/><ellipse cx="24" cy="-54" rx="6.5" ry="3" transform="rotate(-18 24 -54)" stroke="none"/><path d="M-9 -16 V0 M-4 -15 V0 M5 -15 V0 M10 -16 V0 M-15 -22 L-19 -10" fill="none" stroke-width="2.2" stroke-linecap="round"/><path d="M22 -58 V-62 M26 -58 V-62" fill="none" stroke-width="1.4"/></g>' +
      '<g id="' + u + 'el" fill="#44200f" stroke="#44200f"><ellipse cx="0" cy="-18" rx="19" ry="12" stroke="none"/><circle cx="-20" cy="-22" r="9" stroke="none"/><ellipse cx="-13" cy="-22" rx="5" ry="8" stroke="none" opacity=".85"/><path d="M-27 -19 C-33 -12 -31 -4 -27 0" fill="none" stroke-width="3.4" stroke-linecap="round"/><path d="M-13 -10 V0 M-5 -8 V0 M7 -8 V0 M14 -10 V0" fill="none" stroke-width="4.2" stroke-linecap="round"/><path d="M19 -20 C23 -14 22 -8 20 -4" fill="none" stroke-width="1.4"/></g>' +
      '<g id="' + u + 'ac" fill="none" stroke="#2b120a" stroke-linecap="round"><path d="M0 0 C2 -12 -1 -22 -4 -34" stroke-width="3"/><path d="M-2 -22 C6 -30 14 -32 22 -40 M-4 -30 C-12 -36 -20 -38 -28 -44" stroke-width="2"/><g fill="#2b120a" stroke="none"><ellipse cx="0" cy="-40" rx="30" ry="5"/><ellipse cx="22" cy="-44" rx="14" ry="3.5"/><ellipse cx="-27" cy="-48" rx="14" ry="3.5"/></g></g>' +
      '</defs>';
  }
  function artSavanna() {
    var u = uid("sv");
    return '<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">' + savDefs(u) +
      '<rect width="360" height="720" fill="url(#' + u + 's)"/>' +
      '<circle cx="180" cy="458" r="190" fill="url(#' + u + 'g)"/><circle cx="180" cy="458" r="56" fill="#ffe6a3"/>' +
      '<g fill="none" stroke="#7a3f2c" stroke-width="1.6" stroke-linecap="round" opacity=".7"><path d="M60 300 q6 -6 12 0 q6 -6 12 0"/><path d="M270 340 q5 -5 10 0 q5 -5 10 0"/><path d="M220 270 q4 -4 8 0 q4 -4 8 0"/><path d="M110 372 q4 -4 8 0 q4 -4 8 0"/></g>' +
      '<path d="M0 478 C60 458 120 488 190 470 S320 448 360 478 V720 H0Z" fill="#dc8b52"/>' +
      '<path d="M0 526 C80 500 150 546 240 518 S330 506 360 526 V720 H0Z" fill="#b8612f"/>' +
      '<use href="#' + u + 'gf" x="74" y="522"/><use href="#' + u + 'gf" transform="translate(112 526) scale(.78)"/><use href="#' + u + 'gf" transform="translate(146 524) scale(.6)"/>' +
      '<use href="#' + u + 'el" transform="translate(246 524) scale(.9)"/><use href="#' + u + 'el" transform="translate(292 528) scale(.62)"/>' +
      '<path d="M0 608 C90 576 190 628 280 596 S340 590 360 600 V720 H0Z" fill="#7a3d21"/>' +
      '<use href="#' + u + 'ac" transform="translate(52 612) scale(2.3)"/><use href="#' + u + 'ac" transform="translate(308 604) scale(1.7)"/>' +
      '<path d="M0 668 C120 640 240 690 360 656 V720 H0Z" fill="#3b1b10"/>' +
      grain(u, 0.16) + '</svg>';
  }
  function artSavannaPage() {
    var u = uid("sv");
    return '<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">' + savDefs(u) +
      '<rect width="360" height="720" fill="url(#' + u + 's)"/>' +
      '<circle cx="300" cy="120" r="150" fill="url(#' + u + 'g)" opacity=".7"/>' +
      '<path d="M0 640 C90 618 190 662 280 636 S340 630 360 640 V720 H0Z" fill="#b8612f"/>' +
      '<path d="M0 684 C120 660 240 704 360 676 V720 H0Z" fill="#7a3d21"/>' +
      '<use href="#' + u + 'ac" transform="translate(38 690) scale(1.5)"/><use href="#' + u + 'gf" transform="translate(300 648) scale(.9)"/>' +
      grain(u, 0.14) + '</svg>';
  }

  /* Palmera */
  function palDefs(u) {
    return '<defs>' +
      '<clipPath id="' + u + 'c"><path d="M70 620 V380 A110 110 0 0 1 290 380 V620Z"/></clipPath>' +
      '<linearGradient id="' + u + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe4c6"/><stop offset=".6" stop-color="#fbd2a5"/><stop offset="1" stop-color="#f9c1a0"/></linearGradient>' +
      '<g id="' + u + 'fr"><path d="M0 0 C16 -14 54 -16 90 6 C56 -3 18 4 0 0Z"/><path d="M0 0 C30 -4 60 -2 86 5" fill="none" stroke="#1d4f2d" stroke-width="1"/></g>' +
      '<g id="' + u + 'hb"><g>' + [0, 1, 2, 3, 4].map(function (i) { return '<ellipse cx="0" cy="-10" rx="7" ry="11" transform="rotate(' + i * 72 + ')" fill="#f26b5b" stroke="#d64a3c" stroke-width=".8"/>'; }).join("") + '</g><circle r="3" fill="#ffd36a"/><path d="M0 0 L9 -12" stroke="#a3281c" stroke-width="1.4"/></g>' +
      '</defs>';
  }
  function fan(u, x, y, scale, angles, fill) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + scale + ')">' + angles.map(function (a) { return '<use href="#' + u + 'fr" transform="rotate(' + a + ')" fill="' + fill[Math.abs(a) % fill.length] + '"/>'; }).join("") + '</g>';
  }
  function artPalmera() {
    var u = uid("pl"), g = ["#3f7a4a", "#2f6b43", "#5a9a5a", "#35764a"];
    var rays = "";
    for (var i = 0; i < 24; i++) { rays += '<line x1="0" y1="-50" x2="0" y2="-' + (i % 2 ? 62 : 70) + '" transform="rotate(' + i * 15 + ')"/>'; }
    return '<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">' + palDefs(u) +
      '<rect width="360" height="720" fill="#fbf1dd"/>' +
      '<g clip-path="url(#' + u + 'c)">' +
      '<rect x="60" y="260" width="240" height="380" fill="url(#' + u + 's)"/>' +
      '<g transform="translate(180 440)" stroke="#f2a33a" stroke-width="2.4" stroke-linecap="round">' + rays + '</g>' +
      '<circle cx="180" cy="440" r="42" fill="#f7b84a"/>' +
      '<path d="M60 478 C100 468 130 488 180 478 S260 468 300 480 V640 H60Z" fill="#8fd0c9"/>' +
      '<path d="M60 506 C100 494 140 516 190 504 S262 496 300 508 V640 H60Z" fill="#62b6b6"/>' +
      '<path d="M60 538 C110 526 150 548 200 536 S262 528 300 540 V640 H60Z" fill="#3f9aa5"/>' +
      '<path d="M60 584 C120 566 190 600 300 572 V640 H60Z" fill="#f3d8a8"/>' +
      '<path d="M60 612 C140 596 210 624 300 604 V640 H60Z" fill="#e8c68c"/>' +
      '<g transform="translate(108 596)"><path d="M0 0 C6 -50 4 -100 -8 -150" fill="none" stroke="#7a4b2a" stroke-width="7" stroke-linecap="round"/>' + fan(u, -8, -150, 0.95, [-165, -130, -95, -55, -20, 18, 160], g) + '</g>' +
      '<g transform="translate(262 600)"><path d="M0 0 C-4 -34 -2 -68 6 -96" fill="none" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round"/>' + fan(u, 6, -96, 0.65, [-170, -135, -100, -60, -25, 15, 150], g) + '</g>' +
      '<g transform="translate(206 590) rotate(-14)"><rect x="-9" y="-62" width="18" height="70" rx="9" fill="#f2796a"/><rect x="-1.5" y="-58" width="3" height="62" fill="#fbe6d0"/></g>' +
      '<path d="M162 596 q6 -9 12 0 q-6 4 -12 0Z" fill="#f6d6c4"/><path d="M226 608 q5 -8 10 0 q-5 4 -10 0Z" fill="#f6d6c4"/>' +
      '</g>' +
      '<path d="M70 620 V380 A110 110 0 0 1 290 380 V620Z" fill="none" stroke="#c9a35a" stroke-width="2.5"/>' +
      '<path d="M60 626 V380 A120 120 0 0 1 300 380 V626Z" fill="none" stroke="#c9a35a" stroke-width="1" opacity=".7"/>' +
      fan(u, 58, 300, 0.95, [105, 140, 175, 210, 245], g) + fan(u, 300, 626, 0.85, [-75, -40, -5, 30, 65], g) +
      '<use href="#' + u + 'hb" transform="translate(76 322) scale(1.15)"/><use href="#' + u + 'hb" transform="translate(98 338) scale(.8)"/><use href="#' + u + 'hb" transform="translate(284 606) scale(1.1)"/>' +
      grain(u, 0.1) + '</svg>';
  }
  function artPalmeraPage() {
    var u = uid("pl"), g = ["#3f7a4a", "#2f6b43", "#5a9a5a", "#35764a"];
    return '<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">' + palDefs(u) +
      '<rect width="360" height="720" fill="#fbf1dd"/>' +
      '<rect x="14" y="14" width="332" height="692" rx="8" fill="none" stroke="#c9a35a" stroke-width="1.2" opacity=".8"/>' +
      fan(u, 0, 0, 1, [15, 45, 75, 105], g) + fan(u, 360, 720, 1, [-165, -135, -105, -75], g) +
      '<use href="#' + u + 'hb" transform="translate(34 40) scale(1.1)"/><use href="#' + u + 'hb" transform="translate(326 682) scale(1.1)"/>' +
      grain(u, 0.1) + '</svg>';
  }

  /* Lunaria */
  function leavesAlong(fn, n, r, pal, u) {
    var out = "";
    for (var i = 0; i <= n; i++) {
      var p = fn(i / n), side = i % 2 ? 1 : -1;
      var a = p.a + side * (38 + r() * 26), k = 0.8 + r() * 0.7;
      out += '<use href="#' + u + 'lf" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + a.toFixed(0) + ') scale(' + k.toFixed(2) + ')" fill="' + pal[Math.floor(r() * pal.length)] + '"/>';
    }
    return out;
  }
  function lily(x, y, k, a) {
    var s = "";
    for (var i = 0; i < 8; i++) { s += '<ellipse cx="0" cy="-10" rx="4.6" ry="11" transform="rotate(' + i * 45 + ')" fill="#eeeaf6" stroke="#b7aed0" stroke-width=".6"/>'; }
    return '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + a.toFixed(0) + ') scale(' + k + ')">' + s + '<circle r="4" fill="#e8c878"/></g>';
  }
  var PAL = ["#7e9a86", "#9fb3a0", "#6c8a7a", "#b9c7bb", "#8aa39a"];
  function luDefs(u) {
    return '<defs><path id="' + u + 'lf" d="M0 0 C5 -7 17 -7 26 0 C17 7 5 7 0 0Z"/>' +
      '<pattern id="' + u + 'w" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 .5 H4 M.5 0 V4" stroke="#fff" stroke-width=".5" opacity=".18"/></pattern>' +
      '<radialGradient id="' + u + 'm"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>';
  }
  function artLunaria() {
    var u = uid("lu"), r = rng(11), L1 = 380, R = 118, A = Math.PI * R, L = L1 * 2 + A;
    function at(t) {
      var s = t * L;
      if (s < L1) { return { x: 62, y: 630 - s, a: -90 }; }
      if (s < L1 + A) { var th = (s - L1) / R; return { x: 180 - R * Math.cos(th), y: 250 - R * Math.sin(th), a: Math.atan2(-Math.cos(th), Math.sin(th)) * 180 / Math.PI }; }
      return { x: 298, y: 250 + (s - L1 - A), a: 90 };
    }
    var flowers = "", marks = [0.08, 0.2, 0.33, 0.47, 0.5, 0.62, 0.77, 0.9];
    marks.forEach(function (t, i) { var p = at(t); flowers += lily(p.x, p.y, 0.8 + (i % 3) * 0.12, p.a + 90); });
    var ripples = "";
    for (var i = 0; i < 6; i++) { ripples += '<path d="M' + (80 + i * 6) + ' ' + (560 + i * 11) + ' q18 -6 36 0 t36 0 t36 0 t36 0" fill="none" stroke="#fff" stroke-width="1" opacity="' + (0.5 - i * 0.06) + '"/>'; }
    return '<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">' + luDefs(u) +
      '<rect width="360" height="720" fill="#a6b6c9"/><rect width="360" height="720" fill="url(#' + u + 'w)"/>' +
      '<path d="M62 630 V250 A118 118 0 0 1 298 250 V630Z" fill="#b8c6d6" opacity=".7"/>' +
      '<path d="M62 630 V250 A118 118 0 0 1 298 250 V630" fill="none" stroke="#6f8b78" stroke-width="2.4"/>' +
      leavesAlong(at, 70, r, PAL, u) + flowers +
      '<circle cx="180" cy="140" r="52" fill="url(#' + u + 'm)"/><circle cx="180" cy="140" r="27" fill="#eeedf5"/><circle cx="170" cy="134" r="5" fill="#d7d6e6"/><circle cx="188" cy="148" r="7" fill="#d7d6e6"/><circle cx="184" cy="128" r="3" fill="#d7d6e6"/>' +
      ripples + grain(u, 0.14) + '</svg>';
  }
  function artLunariaPage() {
    var u = uid("lu"), r = rng(23);
    function left(t) { return { x: 12 + Math.sin(t * 5) * 6, y: 720 - t * 360, a: -90 }; }
    function right(t) { return { x: 348 - Math.sin(t * 5) * 6, y: t * 360, a: 90 }; }
    return '<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">' + luDefs(u) +
      '<rect width="360" height="720" fill="#a6b6c9"/><rect width="360" height="720" fill="url(#' + u + 'w)"/>' +
      '<path d="M12 720 C18 600 6 500 14 360" fill="none" stroke="#6f8b78" stroke-width="2"/><path d="M348 0 C342 120 354 220 346 360" fill="none" stroke="#6f8b78" stroke-width="2"/>' +
      leavesAlong(left, 22, r, PAL, u) + leavesAlong(right, 22, r, PAL, u) +
      lily(30, 560, 0.9, 20) + lily(330, 160, 0.9, -20) +
      grain(u, 0.14) + '</svg>';
  }


  /* ================= Scene templates ================= */
  var SCENES = {
    savanna: { theme: 'sx-savanna', art: artSavanna, page: artSavannaPage },
    palmera: { theme: 'sx-palmera', art: artPalmera, page: artPalmeraPage },
    curtain: { theme: 'sx-curtain-call', art: null, page: null },
    lunaria: { theme: 'sx-lunaria', art: artLunaria, page: artLunariaPage }
  };
  var CHEV = '<svg class="sx-chev" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function splitNames(title) {
    var t = String(title || '').trim(), parts = t.split(/\s+(?:&|and|\+)\s+/i);
    return parts.length >= 2 ? [parts[0].trim(), parts.slice(1).join(' & ').trim()] : [t, ''];
  }
  function fmtDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return {
      wd: d.toLocaleDateString('en-GB', { weekday: 'long' }), day: d.getDate(),
      mon: d.toLocaleDateString('en-GB', { month: 'long' }), yr: d.getFullYear(),
      short: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    };
  }
  // 16:00 -> 4:00 PM; anything else (older free text) is shown as typed.
  function showTime(value) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!m) return String(value || '');
    var h = +m[1];
    return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }

  // Length of the longest word in the names (a hyphenated name can wrap at the hyphen). The big script names are
  // sized by it, so a long word fits the screen instead of breaking in the middle.
  function longestWord(a, b) {
    var longest = 8;
    String(a + ' ' + b).split(/[\s-]+/).forEach(function (w) { longest = Math.max(longest, Array.from(w).length); });
    return longest;
  }
  function namesHtml(a, b) {
    return '<h2 class="sx-names" style="--nl:' + longestWord(a, b) + '"><span class="sx-nm">' + esc(a) + '</span>' + (b ? '<span class="sx-amp">&amp;</span><span class="sx-nm">' + esc(b) + '</span>' : '') + '</h2>';
  }
  function dateLine(f, withWeekday) {
    return f ? (withWeekday ? f.wd.toUpperCase() + ' ' : '') + f.day + ' ' + f.mon.toUpperCase() + ' ' + f.yr : DEFAULTS.date.toUpperCase();
  }

  function coverScene(key, d) {
    var S = SCENES[key], f = d.date, c;
    var venueBlock = '<div class="sx-cv-bot sx-rv" style="--d:3">' + (d.venue ? '<p class="sx-caps">' + esc(d.venue) + '</p>' : '') + (d.place ? '<p class="sx-caps">' + esc(d.place) + '</p>' : '') + '</div>';
    if (key === 'savanna') {
      c = '<section class="sx-scene sx-cover in" data-section="hero"><div class="sx-art">' + S.art() + '</div>' +
        '<div class="sx-cv-top"><p class="sx-caps sx-rv" style="--d:0">' + esc(d.pretitle) + '</p><div class="sx-rv" style="--d:1">' + namesHtml(d.a, d.b) + '</div><p class="sx-caps sx-rv" style="--d:2">' + esc(dateLine(f, true)) + '</p></div>' + venueBlock + CHEV + '</section>';
    } else if (key === 'palmera') {
      c = '<section class="sx-scene sx-cover in" data-section="hero"><div class="sx-art">' + S.art() + '</div>' +
        '<div class="sx-cv-top"><p class="sx-caps sx-rv" style="--d:0">' + esc(d.pretitle) + '</p><div class="sx-rv" style="--d:1">' + namesHtml(d.a, d.b) + '</div></div>' +
        '<div class="sx-cv-bot sx-rv" style="--d:2"><p class="sx-caps">' + esc(dateLine(f, false)) + '</p>' + (d.place || d.venue ? '<p class="sx-caps">' + esc(d.place || d.venue) + '</p>' : '') + '</div>' + CHEV + '</section>';
    } else if (key === 'lunaria') {
      c = '<section class="sx-scene sx-cover in" data-section="hero"><div class="sx-art">' + S.art() + '</div>' +
        '<div class="sx-cv-mid"><p class="sx-caps sx-rv" style="--d:0">' + esc(d.pretitle) + '</p><div class="sx-rv" style="--d:1">' + namesHtml(d.a, d.b) + '</div><p class="sx-caps sx-rv" style="--d:2">' + esc(dateLine(f, false)) + '</p></div>' + venueBlock + CHEV + '</section>';
    } else {
      c = '<section class="sx-scene sx-cover sx-cv in" data-section="hero" style="padding:0"><div class="sx-stage"></div>' +
        '<div class="sx-stage-content"><p class="sx-caps">' + esc(d.pretitle) + '</p>' + namesHtml(d.a, d.b) + '<p class="sx-caps">' + esc(dateLine(f, true)) + '</p>' + (d.venue || d.place ? '<p class="sx-caps" style="opacity:.7">' + esc([d.venue, d.place].filter(Boolean).join(', ')) + '</p>' : '') + '</div>' +
        '<div class="sx-curtain l"></div><div class="sx-curtain r"></div><div class="sx-valance"></div>' +
        '<div class="sx-emboss">' + esc(d.a) + (d.b ? '<br>&amp; ' + esc(d.b) : '') + '</div><p class="sx-hint">Tap to open</p>' +
        '<button class="sx-hit" type="button" data-sx-open aria-label="Open the curtains"></button>' + CHEV + '</section>';
    }
    return c;
  }
  function pageArt(key) {
    var S = SCENES[key];
    if (S.page) { return '<div class="sx-art">' + S.page() + '</div>'; }
    return '<div class="sx-art" style="background:#f4ecd9"><svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect x="14" y="14" width="332" height="692" rx="4" fill="none" stroke="#b9a77a" stroke-width="1.2"/><rect x="22" y="22" width="316" height="676" rx="2" fill="none" stroke="#b9a77a" stroke-width=".6"/><g fill="#bcad87"><path d="M0 0 H70 C40 8 14 34 0 74Z"/><path d="M360 0 H290 C320 8 346 34 360 74Z"/></g></svg></div>';
  }
  function scene(key, sec, inner) { return '<section class="sx-scene" data-section="' + sec + '">' + pageArt(key) + '<div class="sx-content">' + inner + '</div></section>'; }

  function messageScene(key, d) {
    return scene(key, 'welcome',
      '<p class="sx-caps sx-rv" style="--d:0">' + esc(d.hosts || DEFAULTS.hosts) + '</p>' +
      '<p class="sx-script sx-h sx-rv" style="--d:1">' + esc(d.title) + '</p>' +
      '<p class="sx-body sx-rv" style="--d:2">' + esc(d.message) + '</p>');
  }
  function whereScene(key, d) {
    var f = d.date, h = '';
    if (f) { h += '<p class="sx-caps sx-rv" style="--d:0">' + esc(f.wd) + '</p><div class="sx-date sx-rv" style="--d:1"><span class="sx-day">' + f.day + '</span><span class="sx-caps">' + esc(f.mon + ' ' + f.yr) + '</span></div>'; }
    if (d.time) { h += '<p class="sx-caps sx-rv" style="--d:2">' + esc(d.time) + '</p>'; }
    if (d.venue) { h += '<p class="sx-script sx-rv" style="--d:3;font-size:34px">' + esc(d.venue) + '</p>'; }
    if (d.place) { h += '<p class="sx-body sx-rv" style="--d:3">' + esc(d.place) + '</p>'; }
    if (d.mapUrl) { h += '<a class="sx-link sx-rv" style="--d:4" href="' + esc(d.mapUrl) + '" target="_blank" rel="noopener noreferrer">Open in maps</a>'; }
    if (d.dress) { h += '<p class="sx-body sx-rv" style="--d:5;margin-top:8px"><strong style="font-weight:600;color:var(--sx-ink)">Dress code.</strong> ' + esc(d.dress) + '</p>'; }
    return scene(key, 'welcome', h);
  }
  function storyScene(key, d) {
    return scene(key, 'story', '<p class="sx-caps sx-rv" style="--d:0">The story</p><p class="sx-script sx-h sx-rv" style="--d:1">' + esc(d.storyTitle) + '</p><p class="sx-body sx-rv" style="--d:2">' + esc(d.story) + '</p>');
  }
  function schedScene(key, d) {
    var multi = {}; d.fns.forEach(function (f) { multi[f.date || ''] = 1; });
    var manyDays = Object.keys(multi).length > 1;
    var rows = d.fns.map(function (f) {
      var fd = fmtDate(f.date), time = [showTime(f.time), showTime(f.endTime)].filter(Boolean).join(' to ');
      var left = manyDays ? (fd ? esc(fd.short) : '') + (time ? '<small>' + esc(time) + '</small>' : '') : esc(time || (fd ? fd.short : ''));
      var sub = [f.venue, f.description].filter(Boolean).map(esc).join(' · ');
      return '<li><span class="sx-tm">' + left + '</span><span class="sx-ev">' + esc(f.title) + (sub ? '<small>' + sub + '</small>' : '') + '</span></li>';
    }).join('');
    return scene(key, 'functions', '<p class="sx-caps sx-rv" style="--d:0">The celebrations</p><p class="sx-script sx-h sx-rv" style="--d:1">Schedule</p><ul class="sx-sched sx-rv" style="--d:2">' + rows + '</ul>');
  }
  function galleryScene(key, d) {
    return scene(key, 'gallery', '<p class="sx-script sx-h sx-rv" style="--d:0">Gallery</p><div class="sx-gallery sx-rv" style="--d:1">' + d.photos.map(function (ph) { return '<img src="' + esc(ph.data) + '" alt="' + esc(ph.alt || 'Event photo') + '" loading="lazy">'; }).join('') + '</div>');
  }
  // Online replies are not built yet: "contact" shows the couple's number, "none" says nothing, the rest is honest.
  function rsvpLine(d) {
    var c = d.rsvpContact || {}, digits = String(c.value || '').replace(/\D/g, '');
    if (d.rsvp === 'none') { return ''; }
    if (d.rsvp === 'contact') {
      if ((c.type !== 'whatsapp' && c.type !== 'phone') || digits.length < 7 || digits.length > 15) { return ''; }
      var shown = String(c.value).replace(/[^\d+\s()-]/g, '').trim().slice(0, 24);
      return '<p class="sx-body sx-rv" style="--d:2">To reply, contact the couple: <a href="' + (c.type === 'whatsapp' ? 'https://wa.me/' + digits : 'tel:+' + digits) + '" style="color:inherit;font-weight:700">' + esc((c.type === 'whatsapp' ? 'WhatsApp ' : 'Call ') + shown) + '</a></p>';
    }
    return '<p class="sx-body sx-rv" style="--d:2">Guest responses are not open yet.</p>';
  }
  function closingScene(key, d) {
    return scene(key, 'rsvp',
      '<p class="sx-caps sx-rv" style="--d:0">Save the date</p>' +
      '<p class="sx-script sx-h sx-rv" style="--d:1">' + esc(d.date ? d.date.day + ' ' + d.date.mon + ' ' + d.date.yr : DEFAULTS.date) + '</p>' +
      rsvpLine(d) +
      '<p class="sx-body sx-more sx-rv" style="--d:3">With love, ' + esc(d.b ? d.a + ' & ' + d.b : d.a) + '</p>');
  }
  function customScene(key, sec) {
    return scene(key, 'custom', '<p class="sx-script sx-h sx-rv" style="--d:0">' + esc(sec.title) + '</p><p class="sx-body sx-rv" style="--d:1">' + esc(sec.content || '') + '</p>');
  }

  // Renders a project as a scene template. Mirrors the shared renderer's data and section rules.
  function renderSceneTemplate(p, t) {
    var key = t && t.scene;
    if (!SCENES[key]) { return ''; }
    p = p || {};
    var title = p.title || p.name || DEFAULTS.title, n = splitNames(title);
    var fns = (p.functions || []).filter(function (f) { return f && f.visible !== false; });
    var loc = String(p.location || '').split(','), venue = loc[0].trim(), place = loc.slice(1).join(',').trim();
    var firstDirections = ''; fns.forEach(function (f) { if (!firstDirections) { firstDirections = safeUrl(f.directionsUrl); } });
    var dress = ''; fns.forEach(function (f) { if (!dress && f.dressCode) { dress = f.dressCode; } });
    var d = {
      title: title, a: n[0], b: n[1], date: fmtDate(p.date), venue: venue, place: place,
      pretitle: (p.preferences && p.preferences.pretitle) || (!p.category || p.category === 'Wedding' ? 'The wedding of' : p.category),
      hosts: p.hosts || '', message: p.message || DEFAULTS.message,
      story: p.story || '', storyTitle: (p.preferences && p.preferences.storyTitle) || 'Our story',
      time: fns.length === 1 && fns[0].time ? showTime(fns[0].time) : '', fns: fns, dress: dress,
      mapUrl: firstDirections || (p.location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.location) : ''),
      rsvp: (p.preferences && p.preferences.rsvp) || 'count', rsvpContact: (p.preferences && p.preferences.rsvpContact) || null,
      photos: Array.isArray(p.photos) ? p.photos.filter(function (ph) { return ph && typeof ph.data === 'string'; }) : []
    };
    var registry = (p.sections && p.sections.length) ? p.sections : [{ id: 'hero', visible: true }, { id: 'welcome', visible: true }, { id: 'story', visible: true }, { id: 'functions', visible: true }, { id: 'gallery', visible: true }, { id: 'rsvp', visible: true }];
    var parts = {
      hero: function () { return coverScene(key, d); },
      welcome: function () { return messageScene(key, d) + (d.date || d.venue || d.place ? whereScene(key, d) : ''); },
      story: function () { return d.story ? storyScene(key, d) : ''; },
      functions: function () { return d.fns.length ? schedScene(key, d) : ''; },
      gallery: function () { return d.photos.length ? galleryScene(key, d) : ''; },
      rsvp: function () { return closingScene(key, d); }
    };
    var body = registry.map(function (sec) {
      if (sec.visible === false) { return ''; }
      if (parts[sec.id]) { return parts[sec.id](); }
      return sec.custom ? customScene(key, sec) : '';
    }).join('');
    return '<div class="sx ' + SCENES[key].theme + '" data-scene-template="' + esc(t.id) + '">' + body + '</div>';
  }

  /* ================= Behaviour (browser only) ================= */
  function initRoot(root) {
    if (root.getAttribute('data-sx-init')) { return; }
    root.setAttribute('data-sx-init', '1');
    var scenes = root.querySelectorAll('.sx-scene');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { return; }
    root.classList.add('sx-live');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.3 });
    Array.prototype.forEach.call(scenes, function (s) { if (!s.classList.contains('in')) { io.observe(s); } });
  }
  function scan() { Array.prototype.forEach.call(document.querySelectorAll('.sx:not([data-sx-init])'), initRoot); }

  window.isSceneTemplate = function (t) { return !!(t && SCENES[t.scene]); };
  window.renderSceneTemplate = renderSceneTemplate;
  window.sceneDefaults = DEFAULTS;

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (e) {
      // composedPath() so a tap inside the editor's shadow root is found too.
      var path = e.composedPath ? e.composedPath() : [e.target];
      for (var i = 0; i < path.length; i++) {
        var el = path[i];
        if (el && el.hasAttribute && el.hasAttribute('data-sx-open')) {
          var cv = el.closest('.sx-cv'); if (cv) { cv.classList.add('opened'); }
          return;
        }
      }
    });
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
    }
    scan();
  }
})();
