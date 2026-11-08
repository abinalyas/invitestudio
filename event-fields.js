/* Event fields, shared by the editor, the cloud sync and the invitation renderers.
 *
 * The server accepts only clean values for an event: times as 24-hour HH:MM, dates as YYYY-MM-DD, directions as an
 * http(s) address, a title, and limited lengths (functions/_shared/api.js, validateFunctions). One value it refuses
 * makes the whole draft fail to save, so the client normalises before sending: what can be understood is converted
 * ("4:00 PM" becomes 16:00), what cannot is left out of the cloud copy (the local copy keeps what was typed).
 * Works in the browser and in Node (tests), without the DOM.
 */
(function (root) {
  "use strict";
  var LIMITS = { title: 180, venue: 500, description: 4000, dressCode: 180, directionsUrl: 2000, parking: 4000, accommodation: 4000, accessibility: 4000 };
  var FIELDS = ["id", "title", "date", "time", "endTime", "venue", "description", "dressCode", "directionsUrl", "parking", "accommodation", "accessibility", "visible"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // "16:00", "4:00 PM", "4pm", "4.30 p.m.", "0930" -> "HH:MM"; anything else -> "".
  function normalizeTime(value) {
    var text = String(value == null ? "" : value).trim().toLowerCase().replace(/([ap])\.m\.?/g, "$1m").replace(/\./g, ":").replace(/\s+/g, "");
    if (!text) return "";
    var m = /^(\d{1,2})(?::?(\d{2}))?(a|p)?m?:?$/.exec(text.replace(/:$/, ""));
    if (!m) return "";
    var h = +m[1], min = m[2] ? +m[2] : 0, suffix = m[3];
    if (min > 59) return "";
    if (suffix) { if (h < 1 || h > 12) return ""; h = h % 12 + (suffix === "p" ? 12 : 0); }
    else if (h > 23) return "";
    return pad(h) + ":" + pad(min);
  }

  // "16:00" -> "4:00 PM" for display. Values that are not HH:MM (older drafts, free text) are shown as they are.
  function formatTime(value) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!m) return String(value || "");
    var h = +m[1];
    return (h % 12 || 12) + ":" + m[2] + " " + (h < 12 ? "AM" : "PM");
  }

  function cleanUrl(value) {
    var url = String(value == null ? "" : value).trim();
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url.slice(0, LIMITS.directionsUrl);
    // "maps.google.com/..." typed without the scheme: add it. Anything else cannot be a link.
    return /^[\w-]+(\.[\w-]+)+(\/|$)/.test(url) ? ("https://" + url).slice(0, LIMITS.directionsUrl) : "";
  }

  // One event as the server will accept it.
  function cloudEvent(event) {
    var e = event || {};
    var text = function (key) { return String(e[key] == null ? "" : e[key]).trim().slice(0, LIMITS[key]); };
    var time = normalizeTime(e.time), end = normalizeTime(e.endTime);
    if (time && end && end < time) end = "";
    return {
      id: typeof e.id === "string" && e.id.length <= 80 ? e.id : undefined,
      title: text("title") || "Untitled event",
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") ? e.date : "",
      time: time, endTime: end,
      venue: text("venue"), description: text("description"), dressCode: text("dressCode"),
      directionsUrl: cleanUrl(e.directionsUrl),
      parking: text("parking"), accommodation: text("accommodation"), accessibility: text("accessibility"),
      visible: e.visible !== false
    };
  }
  function cloudEvents(list) { return (Array.isArray(list) ? list : []).slice(0, 50).map(cloudEvent); }

  // The same event with every known field present, for comparing what was sent with what the server returned.
  function canonical(event) {
    var out = {};
    FIELDS.forEach(function (key) { out[key] = event && event[key] !== undefined ? event[key] : key === "visible" ? true : ""; });
    return out;
  }
  function sameEvents(a, b) {
    var x = (Array.isArray(a) ? a : []).map(canonical), y = (Array.isArray(b) ? b : []).map(canonical);
    return JSON.stringify(x) === JSON.stringify(y);
  }

  var api = { LIMITS: LIMITS, normalizeTime: normalizeTime, formatTime: formatTime, cleanUrl: cleanUrl, cloudEvent: cloudEvent, cloudEvents: cloudEvents, sameEvents: sameEvents };
  root.InviteEventFields = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
