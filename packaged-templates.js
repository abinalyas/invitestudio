/* Packaged templates: designed website templates whose markup comes from templates/<id>/ (built by
 * scripts/build-templates.mjs into templates/templates.generated.js).
 *
 * sitePreview() in index.html hands a project to window.renderPackagedTemplate() when the selected
 * template has a `packaged` key. A template is plain HTML with a handful of markers; this file turns
 * the couple's content into the values those markers read, applies the rules from
 * docs/TEMPLATE_CONTRACT.md (a section with nothing to show is left out, text is escaped, wording
 * comes from content.copy over the template's own defaults) and returns scoped markup.
 *
 * Markers:   {{x}} escaped value   {{upper:x}} upper-cased   {{em:x}} escaped, *word* becomes <em>
 *            {{copy:key}} the wording for a key   (prefixes combine: {{upper:copy:key}})
 *            <!--if x-->..<!--else-->..<!--/if-->   <!--each list-->..{{field}} / {{.}}..<!--/each-->
 * Behaviour (countdown, menu, scrolling) lives in template-widgets.js, never in a template.
 * The file works in the browser and in Node (tests), so it avoids the DOM.
 */
(function (root) {
  "use strict";
  var DEFAULTS = Object.freeze({ title: "Your celebration", date: "Date to be announced" });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function splitNames(title) {
    var t = String(title || "").trim(), parts = t.split(/\s+(?:&|and|\+)\s+/i);
    return parts.length >= 2 ? [parts[0].trim(), parts.slice(1).join(" & ").trim()] : [t, ""];
  }
  // Length of the longest word in the names, counting a hyphenated name as separate words (it can wrap there).
  // Templates scale their big names by it so a long word fits the screen instead of breaking mid-word.
  function longestWord(parts) {
    var longest = 8;
    String(parts[0] + " " + parts[1]).split(/[\s-]+/).forEach(function (w) { longest = Math.max(longest, Array.from(w).length); });
    return longest;
  }
  function initial(name) { var c = Array.from(String(name || "").trim())[0]; return c ? c.toUpperCase() : ""; }
  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    if (isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return null;
    var f = function (opt) { return d.toLocaleDateString("en-GB", Object.assign({ timeZone: "UTC" }, opt)); };
    return { iso: iso, long: f({ day: "numeric", month: "long", year: "numeric" }), weekday: f({ weekday: "long" }), short: f({ day: "numeric", month: "short" }), day: String(+m[3]), month_long: f({ month: "long" }), month_short: f({ month: "short" }), year: m[1], dots: m[3] + "." + m[2] + "." + m[1], num: m[3] + " · " + m[2] + " · " + m[1] };
  }
  // 16:00 -> 4:00 PM; anything else (older free text) is shown as typed.
  function showTime(value) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!m) return String(value || "");
    var h = +m[1];
    return (h % 12 || 12) + ":" + m[2] + " " + (h < 12 ? "AM" : "PM");
  }
  function safeHttp(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  // A photo address: an embedded picture, an https address, or one of this site's own /media/ pictures.
  function safePhoto(u) {
    return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u || "") || /^https:\/\//i.test(u || "") || /^\/media\/w\/[0-9a-f-]{36}\/[0-9a-f-]{36}-(full|thumb)\.(webp|jpg)$/.test(u || "") ? u : "";
  }

  /* ---------- marker engine ---------- */
  var TOKEN = /<!--(if|each) ([\w.]+)-->|<!--(else|\/if|\/each)-->/g;
  var ELSE = { type: "else" };
  function parse(src) {
    var top = { kids: [] }, stack = [top], last = 0, m, cur;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      cur = stack[stack.length - 1];
      if (m.index > last) cur.kids.push(src.slice(last, m.index));
      last = TOKEN.lastIndex;
      if (m[1]) { var node = { type: m[1], key: m[2], kids: [] }; cur.kids.push(node); stack.push(node); }
      else if (m[3] === "else") cur.kids.push(ELSE);
      else stack.pop();
    }
    if (last < src.length) top.kids.push(src.slice(last));
    return top;
  }
  var parseCache = {};
  function cachedParse(src) { return parseCache[src] || (parseCache[src] = parse(src)); }

  function lookup(chain, key) {
    for (var i = chain.length - 1; i >= 0; i--) {
      var c = chain[i];
      if (key === ".") { if (typeof c === "string") return c; continue; }
      if (c && typeof c === "object" && key in c) return c[key];
    }
    return undefined;
  }
  function truthy(v) { return Array.isArray(v) ? v.length > 0 : Boolean(v); }

  // Fields the couple can change by clicking their text in the editor preview: marker key -> the field it edits.
  var EDITABLE = {
    names: "title", closing_note: "message", hosts_line: "hosts",
    venue: "location:venue", place: "location:place",   // the panel's location is "Venue, Place"; each part is edited on its own
    event_title: "event:title", event_venue: "event:venue",
    date_long: "date",                                   // the date opens a date picker; its raw value is date_iso
    a: "names:first", b: "names:second",                 // the big names in the hero: both halves are saved as "A & B"
    place_or_venue: "location"                           // a combined line: edits the whole "Venue, Place"; raw is location_raw
  };

  function value(expr, chain, ctx) {
    var ops = expr.split(":"), mods = [], out, field = null, base, extra = "";
    while (ops.length && (ops[0] === "upper" || ops[0] === "em")) mods.push(ops.shift());
    // {{edit:key}} (or {{upper:edit:key}}): the same value as {{key}}, marked for in-place editing. The editor
    // gets the plain value in data-raw, so an uppercased line is edited as typed, not in capitals.
    if (ops[0] === "edit") {
      ops.shift();
      // Wording (copy:key) is saved through the panel's wording path; the others through their own field.
      field = ops[0] === "copy" ? "copy:" + ops[1] : EDITABLE[ops.join(":")] || null;
    }
    base = esc(ops[0] === "copy" ? ctx.copy(ops[1]) : lookup(chain, ops.join(":")));
    out = base;
    mods.forEach(function (m) {
      if (m === "upper") out = out.toUpperCase();
      if (m === "em") out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    });
    if (!field || !ctx.editable) return out;
    var raw = base;
    if (field === "date") raw = esc(lookup(chain, "date_iso"));
    if (field === "location") raw = esc(lookup(chain, "location_raw"));
    // A location part is saved together with the other part, so the editor needs that too.
    if (field === "location:venue") extra = ' data-other="' + esc(lookup(chain, "place")) + '"';
    if (field === "location:place") extra = ' data-other="' + esc(lookup(chain, "venue")) + '"';
    // An event's title or venue is saved against the event itself.
    if (field.indexOf("event:") === 0) {
      var eventId = lookup(chain, "event_id");
      if (!eventId) return out; // the design's example events are placeholders until the couple adds their own
      extra = ' data-id="' + esc(eventId) + '"';
    }
    if (field === "names:first") extra = ' data-other="' + esc(lookup(chain, "b")) + '"';
    if (field === "names:second") extra = ' data-other="' + esc(lookup(chain, "a")) + '"';
    return '<span data-edit="' + field + '" data-raw="' + raw + '"' + extra + ">" + out + "</span>";
  }
  function branch(n, wantElse) {
    var i = n.kids.indexOf(ELSE);
    if (i < 0) return wantElse ? [] : n.kids;
    return wantElse ? n.kids.slice(i + 1) : n.kids.slice(0, i);
  }
  function evaluate(nodes, chain, ctx) {
    var out = "";
    nodes.forEach(function (n) {
      if (typeof n === "string") { out += n.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, e) { return value(e, chain, ctx); }); return; }
      if (n === ELSE) return;
      var v = lookup(chain, n.key);
      if (n.type === "if") out += evaluate(branch(n, !truthy(v)), chain, ctx);
      else if (Array.isArray(v)) v.forEach(function (item) { out += evaluate(n.kids, chain.concat([item]), ctx); });
    });
    return out;
  }

  function template(id) { return root.PACKAGED_TEMPLATES && root.PACKAGED_TEMPLATES[id]; }

  /* ---------- the couple's content -> values the markers read ---------- */
  function derive(p, pkg, visible, sample) {
    p = p || {};
    var manifest = pkg.manifest, overrides = p.copy && typeof p.copy === "object" ? p.copy : {};
    var copy = function (key) {
      var def = manifest.copy[key];
      var set = overrides[key];
      if (typeof set === "string" && set.trim()) return set.trim().slice(0, 300);
      return def ? def.default : "";
    };
    var title = String(p.title || p.name || "").trim() || DEFAULTS.title, n = splitNames(title);
    var date = parseDate(p.date);
    var loc = String(p.location || "").split(","), venue = loc[0].trim(), place = loc.slice(1).join(",").trim();
    var fns = (Array.isArray(p.functions) ? p.functions : []).filter(function (f) { return f && f.visible !== false && (f.title || "").trim(); });
    var events = fns.map(function (f) {
      var d = parseDate(f.date), bits = [d ? d.short : "", showTime(f.time)].filter(Boolean);
      var end = showTime(f.endTime), start = showTime(f.time);
      return {
        title: f.title, venue: f.venue || "", when: bits.join(" · "),
        event_id: f.id || "", event_title: f.title, event_venue: f.venue || "",
        date_text: d ? d.weekday + ", " + d.long : "", time_text: start ? (end ? start + " – " + end : start) : "",
        map: safeHttp(f.directionsUrl)
      };
    });
    var numbered = function (list) { return list.map(function (e, i) { e.n = String(i + 1).padStart(2, "0"); return e; }); };
    var directions = ""; fns.forEach(function (f) { if (!directions) directions = safeHttp(f.directionsUrl); });
    var timed = fns.filter(function (f) { return f.time; })[0];
    var story = String(p.story || "").trim();
    var example = (sample && pkg.manifest.example) || null;
    if (example && !story) story = example.story || "";
    if (example && !events.length) events = (example.events || []).map(function (e) { return { title: e.title, venue: e.venue || "", event_id: "", event_title: e.title, event_venue: e.venue || "", when: "", date_text: "", time_text: "", map: "" }; });
    events = numbered(events);
    var photos = (Array.isArray(p.photos) ? p.photos : []).map(function (ph) { return ph && { src: safePhoto(ph.data), thumb: safePhoto(ph.thumb), alt: ph.alt || "" }; }).filter(function (ph) { return ph && ph.src; });
    // Photo slots: the first photos fill the template's named slots (hero, story, ...), in order. The gallery gets the
    // rest, or all of them when the template reuses its slot photos (galleryReuse).
    var slots = manifest.photoSlots || (manifest.heroPhoto ? ["hero"] : []);
    var gallery = manifest.galleryReuse ? photos : photos.slice(slots.length);
    if (example && !photos.length) { gallery = []; for (var k = 0; k < (example.photos || 0); k++) gallery.push({ src: "", alt: "" }); }
    var capKeys = manifest.captionKeys || [];
    // Gallery grids show the small version (a guest's phone loads about a sixth of the data); designs that reuse their
    // large pictures in the gallery keep the full version.
    gallery = gallery.map(function (ph, i) { return { src: (!manifest.galleryReuse && ph.thumb) || ph.src, alt: ph.alt, caption: capKeys[i] ? copy(capKeys[i]) : "" }; });
    var galleryShown = visible.gallery && gallery.length >= (manifest.galleryMin || 1);
    var rsvp = root.InviteRsvp ? root.InviteRsvp.view(p, "") : { text: "", show: false };
    var long = (n[0] + n[1]).length > 18;
    var namesLen = title.length;
    var v = {
      names: title, a: n[0], b: n[1], ia: initial(n[0]), ib: initial(n[1]),
      long_names: long, name_len: longestWord(n), crest_size: namesLen > 17 ? Math.max(6, Math.round(100 * 17 / namesLen) / 10) : 10, stamp_y: 91,
      date: date ? true : false, date_long: date ? date.long : DEFAULTS.date, weekday: date ? date.weekday : "", date_num: date ? date.num : "", date_iso: date ? date.iso : "",
      day: date ? date.day : "", month_long: date ? date.month_long : "", month_short: date ? date.month_short : "", year: date ? date.year : "", date_dots: date ? date.dots : "",
      venue: venue, place: place, has_venue: Boolean(venue), place_or_venue: place || venue, location_raw: String(p.location || "").trim(),
      footer_names: n[1] ? n[0] + " & " + n[1] : n[0],
      hosts_line: String(p.hosts || "").trim() || copy("hosts_line"),
      closing_note: String(p.message || "").trim() || copy(["invitation_note", "note_text", "details_note"].filter(function (k) { return manifest.copy[k]; })[0] || "details_note"),
      time_text: timeText(fns, timed, copy),
      story: Boolean(story) && visible.story, story_raw: story, story_paras: story ? story.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean) : [],
      events: visible.functions ? events : [], events_count: Math.min(Math.max(events.length, 1), 3),
      hero_photo: slots.indexOf("hero") >= 0 && photos[slots.indexOf("hero")] ? photos[slots.indexOf("hero")].src : "",
      story_photo: slots.indexOf("story") >= 0 && photos[slots.indexOf("story")] ? photos[slots.indexOf("story")].src : "",
      venue_photo: slots.indexOf("venue") >= 0 && photos[slots.indexOf("venue")] ? photos[slots.indexOf("venue")].src : "",
      photos: galleryShown ? gallery : [], show_gallery: galleryShown,
      map_url: directions || (p.location ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.location) : ""),
      welcome: visible.welcome, show_venue: visible.welcome && Boolean(venue),
      rsvp_status_show: rsvp.show, rsvp_status_text: rsvp.text, rsvp_contact: rsvp.contact, rsvp_href: rsvp.href, rsvp_contact_label: rsvp.label,
      rsvp_online: Boolean(rsvp.config), rsvp_config: rsvp.config || "",
      footer_line: [date ? date.long : "", place || venue].filter(Boolean).join(" · ")
    };
    return { values: v, copy: copy };
  }

  // The time shown beside the date. With one event it is that event's time; with several there is no single
  // time, so point to the schedule (or the first time when the template has no such wording) instead of
  // showing one event's time as if it were the day's.
  function timeText(fns, timed, copy) {
    if (fns.length <= 1) return (fns[0] && showTime(fns[0].time)) || copy("time_pending");
    if (!timed) return copy("time_pending");
    return copy("time_multi") || showTime(timed.time);
  }

  var DEFAULT_SECTIONS = ["hero", "welcome", "story", "functions", "gallery", "rsvp"];
  // opts.intro: "play" runs the template's opening screen, "wait" holds it until it is clicked (the template page's phone).
  // opts.sample: the editor's preview fills empty sections with the template's own example content so the
  // template looks complete. The published page never does (render without opts): it leaves empty sections out.
  function render(p, t, opts) {
    var id = t && t.packaged, pkg = template(id);
    if (!pkg) return "";
    p = p || {};
    var registry = Array.isArray(p.sections) && p.sections.length ? p.sections : DEFAULT_SECTIONS.map(function (s) { return { id: s, visible: true }; });
    var visible = {};
    DEFAULT_SECTIONS.forEach(function (s) { visible[s] = false; });
    registry.forEach(function (sec) { if (sec && DEFAULT_SECTIONS.indexOf(sec.id) >= 0 && sec.visible !== false) visible[sec.id] = true; });
    var d = derive(p, pkg, visible, Boolean(opts && opts.sample)), chain = [d.values], ctx = { copy: d.copy, editable: Boolean(opts && opts.editable) };
    // The story is edited as one block in the editor, so the template only wraps it there.
    d.values.editable = ctx.editable;
    var show = function (name) { return evaluate(cachedParse(pkg.parts[name] || "").kids, chain, ctx); };
    // An opening screen. Only a template that declares one (manifest.intro) has it, only where guests see the invitation
    // ("play") or in the template page's phone preview ("wait" for a click), never in the editor, and not when the couple
    // turned it off. The platform's intro widget (template-widgets.js) runs it.
    var introOn = Boolean(pkg.manifest.intro && opts && (opts.intro === "play" || opts.intro === "wait") && !ctx.editable && !(p.introSettings && p.introSettings.enabled === false));
    d.values.intro = introOn;
    d.values.intro_wait = introOn && opts.intro === "wait";
    d.values.intro_ms = (pkg.manifest.intro && pkg.manifest.intro.duration) || 9400;
  d.values.intro_at = (pkg.manifest.intro && pkg.manifest.intro.buttonAt) || 3.5;
    var body = (introOn ? show("intro") : "") + show("header");
    registry.forEach(function (sec) {
      if (!sec || sec.visible === false || DEFAULT_SECTIONS.indexOf(sec.id) < 0) return;
      if (sec.id === "story" && !d.values.story) return;
      if (sec.id === "functions" && !d.values.events.length) return;
      if (sec.id === "gallery" && !d.values.photos.length) return;
      body += show(sec.id);
    });
    body += show("footer");
    // Background music, when the template has some and the page asks for it (guests' pages and the template page's phone,
    // never the editor or the thumbnails): a round on/off button. template-widgets.js plays the track and remembers the choice.
    var music = pkg.manifest.music;
    if (opts && opts.sound && !ctx.editable && music && music.src) {
      var icon = function (kind, paths) { return '<svg data-snd="' + kind + '" viewBox="0 0 24 24" aria-hidden="true">' + paths + "</svg>"; };
      body += '<div data-sound-bar><button type="button" data-sound-toggle data-sound="off" aria-pressed="false" aria-label="Turn the music on" data-sound-src="' + esc(music.src) + '" data-sound-volume="' + esc(String(music.volume || 0.35)) + '">' +
        icon("off", '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>') +
        icon("on", '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>') +
        "</button></div>";
    }
    return '<div class="' + esc(pkg.manifest.root) + '" data-packaged-template="' + esc(id) + '"' + (opts && opts.sample ? " data-preview" : "") + ">" + body + "</div>";
  }

  root.renderPackagedTemplate = render;
  root.isPackagedTemplate = function (t) { return Boolean(t && t.packaged && template(t.packaged)); };
  root.packagedTemplateManifest = function (id) { var p = template(id); return p ? p.manifest : null; };
  if (typeof module !== "undefined" && module.exports) module.exports = { render: render, derive: derive, esc: esc };
})(typeof globalThis !== "undefined" ? globalThis : this);
