/* © 2026 InviteStudio. All rights reserved. These templates, artwork and code are licensed only for use in an invitation built and hosted on InviteStudio (see /terms). Copying, extracting or re-hosting them is not permitted. */
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
 *            {{calendar}} (inside an event) the "Add to calendar" button; {{details}} (inside an event) its description and notes;
 *            {{icon:name}} a line icon
 * Behaviour (countdown, menu, scrolling) lives in template-widgets.js, never in a template.
 * The file works in the browser and in Node (tests), so it avoids the DOM.
 */
(function (root) {
  "use strict";
  var DEFAULTS = Object.freeze({ title: "Your celebration", date: "Date to be announced" });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  // The two names are told apart by a sign ("A & B", "A+B", "A × B", with or without spaces) or by a word between them:
  // "and", "weds", "wed", "weds to", "marries", or a lower-case "x" ("A x B"). A capital X is left alone (it can be an initial).
  // The same rule is in sampleHosts (figma/islands/shared.tsx), which suggests the hosts line from the names.
  var NAME_SEPARATOR = /\s*[&+×]\s*|\s+(?:and|weds?(?:\s+to)?|marries)\s+/i, NAME_X = /\s+x\s+/;
  function splitNames(title) {
    var t = String(title || "").trim();
    var clean = function (list) { return list.map(function (part) { return part.trim(); }).filter(Boolean); };
    var parts = clean(t.split(NAME_SEPARATOR));
    if (parts.length < 2) parts = clean(t.split(NAME_X));
    return parts.length >= 2 ? [parts[0], parts.slice(1).join(" & ")] : [t, ""];
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

  // {{icon:name}}: the platform's line icons (styled by templates/_shared/icons.css). Unicode arrows and stars render
  // differently on every phone, and some turn into colour emoji, so templates draw these instead.
  var ICONS = {
    "arrow-right": '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
    "arrow-up-right": '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
    "arrow-down-right": '<path d="M7 7l10 10M17 8.5V17H8.5"/>',
    "arrow-down": '<path d="M12 4.5v15M6 13.5l6 6 6-6"/>',
    "arrow-up": '<path d="M12 19.5v-15M6 10.5l6-6 6 6"/>',
    "chevron-down": '<path d="M6 9.5l6 6 6-6"/>',
    menu: '<path d="M3.5 8.5h17M3.5 15.5h17"/>',
    pin: '<path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    asterisk: '<path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18"/>',
    sparkle: '<path fill="currentColor" stroke="none" d="M12 2.5c.7 5 2.6 7 7.5 9.5-4.9 2.5-6.8 4.5-7.5 9.5-.7-5-2.6-7-7.5-9.5 4.9-2.5 6.8-4.5 7.5-9.5Z"/>',
    "sparkle-line": '<path d="M12 3c.7 4.9 2.6 6.9 7.5 9-4.9 2.1-6.8 4.1-7.5 9-.7-4.9-2.6-6.9-7.5-9 4.9-2.1 6.8-4.1 7.5-9Z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z"/>',
    blossom: '<g fill="currentColor" stroke="none"><ellipse cx="12" cy="6.4" rx="2.7" ry="3.9"/><ellipse cx="12" cy="6.4" rx="2.7" ry="3.9" transform="rotate(72 12 12)"/><ellipse cx="12" cy="6.4" rx="2.7" ry="3.9" transform="rotate(144 12 12)"/><ellipse cx="12" cy="6.4" rx="2.7" ry="3.9" transform="rotate(216 12 12)"/><ellipse cx="12" cy="6.4" rx="2.7" ry="3.9" transform="rotate(288 12 12)"/></g><circle cx="12" cy="12" r="1.6" fill="#fff" fill-opacity=".75" stroke="none"/>',
    moon: '<path d="M15.8 4.2A8.2 8.2 0 1 0 19.8 17 6.8 6.8 0 0 1 15.8 4.2Z"/>',
    dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'
  };
  function icon(name) {
    return ICONS[name] ? '<svg data-icon="' + name + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>" : "";
  }

  /* ---------- Add to calendar ----------
   * An event with a date can be added to a guest's calendar with one button: it downloads a small .ics file (a data link, so it needs
   * no server and works in the editor preview too) that Apple Calendar, Outlook, the calendar app on Android and most others open.
   * A template places it with {{calendar}} at the end of an event; it is one link, so it needs no script, styled by
   * templates/_shared/calendar.css.
   * Times are "floating": the clock time the couple typed, shown in the guest's own calendar (events carry no time zone yet).
   * No end time (or one that is not after the start) means two hours; no time means an all-day event. */
  var CAL_DEFAULT_MINUTES = 120;
  function calPad(n) { return String(n).padStart(2, "0"); }
  function calStamp(ms, timed) {
    var d = new Date(ms), day = d.getUTCFullYear() + calPad(d.getUTCMonth() + 1) + calPad(d.getUTCDate());
    return timed ? day + "T" + calPad(d.getUTCHours()) + calPad(d.getUTCMinutes()) + "00" : day;
  }
  function calTime(v) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(v || ""));
    return m && +m[1] < 24 && +m[2] < 60 ? { h: +m[1], m: +m[2] } : null;
  }
  function icsText(s) { return String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[\\;,]/g, function (c) { return "\\" + c; }).replace(/\n/g, "\\n"); }
  // Lines are folded at 75 bytes (RFC 5545), never in the middle of a character.
  function icsFold(line) {
    var out = [], cur = "", bytes = 0, limit = 75;
    Array.from(line).forEach(function (ch) {
      var n = unescape(encodeURIComponent(ch)).length;
      if (bytes + n > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
      cur += ch; bytes += n;
    });
    out.push(cur);
    return out.join("\r\n");
  }
  // f: an event of the invitation; info: { couple, where, invitation, index }. Returns { ics, file, title }, or null when the event has no usable date.
  function calendarFor(f, info) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f.date || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
    var st = calTime(f.time), timed = Boolean(st), start, end;
    if (timed) {
      start = Date.UTC(y, mo - 1, d, st.h, st.m);
      var et = calTime(f.endTime);
      end = et && Date.UTC(y, mo - 1, d, et.h, et.m) > start ? Date.UTC(y, mo - 1, d, et.h, et.m) : start + CAL_DEFAULT_MINUTES * 6e4;
    } else { start = Date.UTC(y, mo - 1, d); end = start + 864e5; }
    var title = String(f.title || "").trim(), couple = String(info.couple || "").trim();
    var summary = couple && couple !== title ? title + " \u2013 " + couple : title;
    var where = String(f.venue || "").trim() || String(info.where || "").trim();
    var maps = safeHttp(f.directionsUrl);
    var notes = [];
    if (String(f.description || "").trim()) notes.push(String(f.description).trim().slice(0, 600));
    if (String(f.dressCode || "").trim()) notes.push("Dress code: " + String(f.dressCode).trim().slice(0, 180));
    if (maps) notes.push("Directions: " + maps);
    if (info.invitation) notes.push("Invitation: " + info.invitation);
    var details = notes.join("\n\n");
    var a = calStamp(start, timed), b = calStamp(end, timed);
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InviteStudio//Invitation//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + (String(f.id || "").replace(/[^A-Za-z0-9-]/g, "") || "event-" + (info.index || 0)) + "-" + a.slice(0, 8) + "@invitestudio.co",
      "DTSTAMP:" + calStamp(Date.now(), true) + "Z",
      timed ? "DTSTART:" + a : "DTSTART;VALUE=DATE:" + a, timed ? "DTEND:" + b : "DTEND;VALUE=DATE:" + b,
      "SUMMARY:" + icsText(summary)];
    if (where) lines.push("LOCATION:" + icsText(where));
    if (details) lines.push("DESCRIPTION:" + icsText(details));
    if (info.invitation) lines.push("URL:" + info.invitation);
    lines.push("END:VEVENT", "END:VCALENDAR");
    var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event";
    return { ics: "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.map(icsFold).join("\r\n") + "\r\n"), file: slug + ".ics", title: title };
  }
  var CAL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M12 12.5v4M10 14.5h4"/></svg>';
  function calendarHtml(chain) {
    var ics = lookup(chain, "cal_ics");
    if (!ics) return "";
    return '<div data-cal><a href="' + esc(ics) + '" download="' + esc(lookup(chain, "cal_file")) + '" aria-label="Add to calendar: ' + esc(lookup(chain, "cal_title")) + '">' + CAL_ICON + '<span>Add to calendar</span></a></div>';
  }

  // {{details}} (inside an event): the description and the labelled notes the couple wrote for it. One block, styled by
  // templates/_shared/details.css from the design's own text, so every design shows all of an event's details the same way.
  function detailsHtml(chain) {
    var line = function (key) { return esc(lookup(chain, key)).replace(/\r?\n/g, "<br>"); };
    var rows = [];
    if (lookup(chain, "event_description")) rows.push('<p data-desc>' + line("event_description") + '</p>');
    [["event_dress", "Dress code"], ["event_parking", "Parking"], ["event_stay", "Travel and stays"], ["event_access", "Access"]].forEach(function (pair) {
      if (lookup(chain, pair[0])) rows.push('<p data-note><b>' + pair[1] + '</b> ' + line(pair[0]) + '</p>');
    });
    return rows.length ? '<div data-details>' + rows.join("") + '</div>' : "";
  }

  function value(expr, chain, ctx) {
    var ops = expr.split(":"), mods = [], out, field = null, base, extra = "";
    if (ops[0] === "icon") return icon(ops[1]);
    if (expr === "calendar") return calendarHtml(chain);
    if (expr === "details") return detailsHtml(chain);
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

  // Sample photographs for the template page (see derive), in the order photo spots take them: a template's named spots
  // (cover, story, ...) first, then its gallery. Site-relative paths only. A template can give its own order in
  // manifest example.photoSet (Cinematic puts the venue picture in its venue spot).
  var SAMPLE_PHOTOS = [
    "/assets/samples/couple-portrait.webp",
    "/assets/samples/walk.webp",
    "/assets/samples/rings.webp",
    "/assets/samples/florals.webp",
    "/assets/samples/venue.webp"
  ];

  // The most photos one invitation can hold. Matches the photo limit in functions/_shared/media.js; the editor's "add one more" tile stops here.
  var PHOTO_LIMIT = 12;

  function template(id) { return root.PACKAGED_TEMPLATES && root.PACKAGED_TEMPLATES[id]; }

  /* ---------- the couple's content -> values the markers read ---------- */
  function derive(p, pkg, visible, sample, editable, showcase) {
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
    // On a live invitation the calendar entry carries its address, so a guest can open it from the entry.
    var invitation = "";
    try { var here = root.location; if (here && /^\/s\/[a-z0-9-]+\/?$/.test(here.pathname || "")) invitation = here.origin + here.pathname.replace(/\/$/, ""); } catch (e) { invitation = ""; }
    var events = fns.map(function (f, index) {
      var end = showTime(f.endTime), start = showTime(f.time);
      // Start, and the end when there is one ("6:30 PM – 10:30 PM"): everything a design shows of the time, so an end time is never left out.
      var range = start ? (end ? start + " \u2013 " + end : start) : "";
      var d = parseDate(f.date), bits = [d ? d.short : "", range].filter(Boolean);
      var cal = calendarFor(f, { couple: title, where: String(p.location || "").trim(), invitation: invitation, index: index }) || {};
      return {
        cal_ics: cal.ics || "", cal_file: cal.file || "", cal_title: cal.title || "",
        title: f.title, venue: f.venue || "", when: bits.join(" · "),
        event_id: f.id || "", event_title: f.title, event_venue: f.venue || "",
        date_text: d ? d.weekday + ", " + d.long : "", time_text: range,
        map: safeHttp(f.directionsUrl),
        // What the couple wrote about the event, drawn by {{details}} (description first, then the labelled notes).
        event_description: String(f.description || "").trim(), event_dress: String(f.dressCode || "").trim(),
        event_parking: String(f.parking || "").trim(), event_stay: String(f.accommodation || "").trim(), event_access: String(f.accessibility || "").trim()
      };
    });
    var numbered = function (list) { return list.map(function (e, i) { e.n = String(i + 1).padStart(2, "0"); return e; }); };
    var directions = ""; fns.forEach(function (f) { if (!directions) directions = safeHttp(f.directionsUrl); });
    var timed = fns.filter(function (f) { return f.time; })[0];
    var story = String(p.story || "").trim();
    var example = (sample && pkg.manifest.example) || null;
    if (example && !story) story = example.story || "";
    if (example && !events.length) events = (example.events || []).map(function (e) { return { title: e.title, venue: e.venue || "", event_id: "", event_title: e.title, event_venue: e.venue || "", when: "", date_text: "", time_text: "", map: "", event_description: "", event_dress: "", event_parking: "", event_stay: "", event_access: "" }; });
    events = numbered(events);
    var photos = (Array.isArray(p.photos) ? p.photos : []).map(function (ph) { return ph && { src: safePhoto(ph.data), thumb: safePhoto(ph.thumb), alt: ph.alt || "", slot: ph.slot || "" }; }).filter(function (ph) { return ph && ph.src; });
    // The template page (opts.showcase) shows a design at its best: its sample photographs fill the photo spots (manifest
    // example.photoSet, else the shared SAMPLE_PHOTOS). Nowhere else: not in the editor or the setup steps, where the
    // couple's own invitation is shown, and never on a published page, so these pictures can never be published.
    if (example && showcase && !editable && !photos.length) {
      // As many as the design shows: its named spots plus the gallery tiles its example asks for (a design that reuses
      // its spot pictures in the gallery needs only the larger of the two), so no design shows a longer gallery here
      // than it was drawn for.
      var spots = (manifest.photoSlots || (manifest.heroPhoto ? ["hero"] : [])).length, tiles = example.photos || 0;
      photos = (example.photoSet || SAMPLE_PHOTOS).slice(0, manifest.galleryReuse ? Math.max(spots, tiles) : spots + tiles)
        .map(function (src) { return { src: src, thumb: src, alt: "" }; });
    }
    // Photo slots: a photo goes where it was added. One added to a named spot (cover, story, venue) fills that spot; one added to the
    // gallery stays in the gallery. A photo with no place (added before places existed), or for a spot this design does not have, fills
    // the spots that are still empty in order, as it always did, and the rest go to the gallery. A design that reuses its slot
    // photos in the gallery (galleryReuse) shows all of them there.
    var slots = manifest.photoSlots || (manifest.heroPhoto ? ["hero"] : []);
    // A named picture spot only counts when its section is on the page: a published page leaves out the story section when no
    // story is written (and the events section when there are no events), and a picture put there would vanish. Such photos move
    // to the gallery instead, in the order they were added.
    var slotShown = { hero: visible.hero !== false, story: Boolean(visible.story && story), venue: Boolean(visible.functions && events.length) };
    var slotPhoto = {}, loose = [];
    photos.forEach(function (ph) {
      if (ph.slot && ph.slot !== "gallery" && slots.indexOf(ph.slot) >= 0 && !slotPhoto[ph.slot]) {
        if (slotShown[ph.slot] !== false) slotPhoto[ph.slot] = ph; // otherwise it stays in the gallery
      } else if (ph.slot !== "gallery") loose.push(ph);
    });
    slots.forEach(function (name) {
      if (slotPhoto[name] || !loose.length) return;
      var ph = loose.shift();
      if (slotShown[name] !== false) slotPhoto[name] = ph; // otherwise it stays in the gallery
    });
    var inSlot = photos.filter(function (ph) { return slots.some(function (name) { return slotPhoto[name] === ph; }); });
    var gallery = manifest.galleryReuse ? photos : photos.filter(function (ph) { return inSlot.indexOf(ph) < 0; });
    if (example && !photos.length) { gallery = []; for (var k = 0; k < (example.photos || 0); k++) gallery.push({ src: "", alt: "" }); }
    // In the editor, the empty "Your photo" tiles stay until the design's gallery is full of the couple's own pictures, and one
    // more tile always follows the last photo (until the limit), so adding the next photo is one tap. Without this the tiles
    // vanished with the first photo and a design that needs two gallery pictures showed nothing at all.
    if (sample) {
      var tiles = Math.max(example ? example.photos || 0 : 0, manifest.galleryMin || 1);
      while (gallery.length < tiles) gallery.push({ src: "", alt: "" });
      if (editable && gallery.length < PHOTO_LIMIT - (manifest.galleryReuse ? 0 : slots.length) && gallery.every(function (ph) { return ph.src; })) gallery.push({ src: "", alt: "" });
    }
    var capKeys = manifest.captionKeys || [];
    // Gallery grids show the small version (a guest's phone loads about a sixth of the data); designs that reuse their
    // large pictures in the gallery keep the full version.
    gallery = gallery.map(function (ph, i) { return { src: (!manifest.galleryReuse && ph.thumb) || ph.src, alt: ph.alt, caption: capKeys[i] ? copy(capKeys[i]) : "" }; });
    // A gallery shows as soon as there is one picture in it: hiding the couple's only photo helps nobody. (galleryMin only sizes the editor's empty tiles.)
    var galleryShown = visible.gallery && gallery.length >= 1;
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
      hero_photo: slotPhoto.hero ? slotPhoto.hero.src : "",
      story_photo: slotPhoto.story ? slotPhoto.story.src : "",
      venue_photo: slotPhoto.venue ? slotPhoto.venue.src : "",
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
    if (fns.length <= 1) return (fns[0] && fns[0].time && (fns[0].endTime ? showTime(fns[0].time) + " \u2013 " + showTime(fns[0].endTime) : showTime(fns[0].time))) || copy("time_pending");
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
    var d = derive(p, pkg, visible, Boolean(opts && opts.sample), Boolean(opts && opts.editable), Boolean(opts && opts.showcase)), chain = [d.values], ctx = { copy: d.copy, editable: Boolean(opts && opts.editable) };
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
      body += '<div data-sound-bar><button type="button" data-sound-toggle' + (opts.sample ? " data-sound-demo" : "") + ' data-sound="off" aria-pressed="false" aria-label="Turn the music on" data-sound-src="' + esc(music.src) + '" data-sound-volume="' + esc(String(music.volume || 0.35)) + '">' +
        icon("off", '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>') +
        icon("on", '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>') +
        "</button></div>";
    }
    return '<div class="' + esc(pkg.manifest.root) + '" data-packaged-template="' + esc(id) + '"' + (opts && opts.sample ? " data-preview" : "") + (opts && opts.showcase && !ctx.editable ? " data-showcase" : "") + ">" + body + "</div>";
  }

  root.renderPackagedTemplate = render;
  root.isPackagedTemplate = function (t) { return Boolean(t && t.packaged && template(t.packaged)); };
  root.packagedTemplateManifest = function (id) { var p = template(id); return p ? p.manifest : null; };
  if (typeof module !== "undefined" && module.exports) module.exports = { render: render, derive: derive, esc: esc, calendarFor: calendarFor };
})(typeof globalThis !== "undefined" ? globalThis : this);
