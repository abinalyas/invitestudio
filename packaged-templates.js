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
  function initial(name) { var c = Array.from(String(name || "").trim())[0]; return c ? c.toUpperCase() : ""; }
  function parseDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    if (isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return null;
    var f = function (opt) { return d.toLocaleDateString("en-GB", Object.assign({ timeZone: "UTC" }, opt)); };
    return { iso: iso, long: f({ day: "numeric", month: "long", year: "numeric" }), weekday: f({ weekday: "long" }), short: f({ day: "numeric", month: "short" }), day: String(+m[3]), month_long: f({ month: "long" }), month_short: f({ month: "short" }), year: m[1], dots: m[3] + "." + m[2] + "." + m[1], num: m[3] + " · " + m[2] + " · " + m[1] };
  }
  function safeHttp(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function safePhoto(u) { return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u || "") || /^https:\/\//i.test(u || "") ? u : ""; }

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

  function value(expr, chain, ctx) {
    var ops = expr.split(":"), mods = [], out;
    while (ops.length && (ops[0] === "upper" || ops[0] === "em")) mods.push(ops.shift());
    out = esc(ops[0] === "copy" ? ctx.copy(ops[1]) : lookup(chain, ops.join(":")));
    mods.forEach(function (m) {
      if (m === "upper") out = out.toUpperCase();
      if (m === "em") out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    });
    return out;
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
      var d = parseDate(f.date), bits = [d ? d.short : "", f.time || ""].filter(Boolean);
      return { title: f.title, venue: f.venue || "", when: bits.join(" · ") };
    });
    var directions = ""; fns.forEach(function (f) { if (!directions) directions = safeHttp(f.directionsUrl); });
    var timed = fns.filter(function (f) { return f.time; })[0];
    var story = String(p.story || "").trim();
    var example = (sample && pkg.manifest.example) || null;
    if (example && !story) story = example.story || "";
    if (example && !events.length) events = (example.events || []).map(function (e) { return { title: e.title, venue: e.venue || "", when: "" }; });
    var photos = (Array.isArray(p.photos) ? p.photos : []).map(function (ph) { return ph && { src: safePhoto(ph.data), alt: ph.alt || "" }; }).filter(function (ph) { return ph && ph.src; });
    var gallery = manifest.heroPhoto ? photos.slice(1) : photos;
    if (example && !photos.length) { gallery = []; for (var k = 0; k < (example.photos || 0); k++) gallery.push({ src: "", alt: "" }); }
    var long = (n[0] + n[1]).length > 18;
    var namesLen = title.length;
    var v = {
      names: title, a: n[0], b: n[1], ia: initial(n[0]), ib: initial(n[1]),
      long_names: long, crest_size: namesLen > 17 ? Math.max(6, Math.round(100 * 17 / namesLen) / 10) : 10, stamp_y: 91,
      date: date ? true : false, date_long: date ? date.long : DEFAULTS.date, weekday: date ? date.weekday : "", date_num: date ? date.num : "", date_iso: date ? date.iso : "",
      day: date ? date.day : "", month_long: date ? date.month_long : "", month_short: date ? date.month_short : "", year: date ? date.year : "", date_dots: date ? date.dots : "",
      venue: venue, place: place, has_venue: Boolean(venue), place_or_venue: place || venue,
      footer_names: n[1] ? n[0] + " & " + n[1] : n[0],
      hosts_line: String(p.hosts || "").trim() || copy("hosts_line"),
      closing_note: String(p.message || "").trim() || copy(manifest.copy.invitation_note ? "invitation_note" : "details_note"),
      time_text: (fns.length === 1 && fns[0].time) || (timed && timed.time) || copy("time_pending"),
      story: Boolean(story) && visible.story, story_paras: story ? story.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean) : [],
      events: visible.functions ? events : [], events_count: Math.min(Math.max(events.length, 1), 3),
      hero_photo: manifest.heroPhoto && photos.length ? photos[0].src : "",
      photos: visible.gallery ? gallery : [],
      map_url: directions || (p.location ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.location) : ""),
      welcome: visible.welcome, show_venue: visible.welcome && Boolean(venue),
      footer_line: [date ? date.long : "", place || venue].filter(Boolean).join(" · ")
    };
    return { values: v, copy: copy };
  }

  var DEFAULT_SECTIONS = ["hero", "welcome", "story", "functions", "gallery", "rsvp"];
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
    var d = derive(p, pkg, visible, Boolean(opts && opts.sample)), chain = [d.values], ctx = { copy: d.copy };
    var show = function (name) { return evaluate(cachedParse(pkg.parts[name] || "").kids, chain, ctx); };
    var body = show("header");
    registry.forEach(function (sec) {
      if (!sec || sec.visible === false || DEFAULT_SECTIONS.indexOf(sec.id) < 0) return;
      if (sec.id === "story" && !d.values.story) return;
      if (sec.id === "functions" && !d.values.events.length) return;
      if (sec.id === "gallery" && !d.values.photos.length) return;
      body += show(sec.id);
    });
    body += show("footer");
    return '<div class="' + esc(pkg.manifest.root) + '" data-packaged-template="' + esc(id) + '">' + body + "</div>";
  }

  root.renderPackagedTemplate = render;
  root.isPackagedTemplate = function (t) { return Boolean(t && t.packaged && template(t.packaged)); };
  root.packagedTemplateManifest = function (id) { var p = template(id); return p ? p.manifest : null; };
  if (typeof module !== "undefined" && module.exports) module.exports = { render: render, derive: derive, esc: esc };
})(typeof globalThis !== "undefined" ? globalThis : this);
