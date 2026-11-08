/* What the RSVP section of an invitation says, from the couple's settings. One source for every design, so the
 * packaged templates and the older scene templates cannot disagree. Pure: it reads a project and returns values.
 *
 *   mode "count" | "rsvp"  online replies (with or without a guest count)
 *   mode "contact"         the couple's WhatsApp or phone number, no form
 *   mode "none"            nothing about replies
 * Online replies that are switched off, or past the reply-by date, show "Replies are closed." and the number when
 * the couple gave one. A line the couple wrote themselves (copy.rsvp_status) is always shown first.
 */
(function (root) {
  "use strict";
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function view(p, custom) {
    p = p || {};
    var prefs = p.preferences || {}, mode = ["count", "rsvp", "contact", "none"].indexOf(prefs.rsvp) >= 0 ? prefs.rsvp : "count";
    var own = typeof custom === "string" ? custom.trim().slice(0, 300) : "";
    var online = mode === "count" || mode === "rsvp";
    var open = prefs.rsvpOpen !== false;
    var replyBy = /^\d{4}-\d{2}-\d{2}$/.test(prefs.rsvpReplyBy || "") ? prefs.rsvpReplyBy : "";
    var maxParty = Number.isInteger(prefs.rsvpMaxParty) ? Math.min(Math.max(prefs.rsvpMaxParty, 1), 20) : 10;
    var accepting = online && open && (!replyBy || today() <= replyBy);
    var c = prefs.rsvpContact || {}, digits = String(c.value || "").replace(/[^\d]/g, "");
    var numberOk = digits.length >= 7 && digits.length <= 15 && (c.type === "whatsapp" || c.type === "phone");
    var contact = numberOk && (mode === "contact" || (online && !accepting));
    var pretty = String(c.value || "").replace(/[^\d+\s()-]/g, "").trim().slice(0, 24);
    var events = (Array.isArray(p.functions) ? p.functions : [])
      .filter(function (f) { return f && f.visible !== false && typeof f.id === "string" && f.id && String(f.title || "").trim(); })
      .map(function (f) { return { id: f.id, title: String(f.title).trim() }; });
    var text = own;
    if (!text && mode === "contact" && contact) text = "To reply, contact the couple:";
    if (!text && online && !accepting) text = "Replies are closed." + (contact ? " To reach the couple:" : "");
    return {
      mode: mode, online: online, accepting: accepting,
      show: Boolean(text), text: text,
      contact: contact,
      href: contact ? (c.type === "whatsapp" ? "https://wa.me/" + digits : "tel:+" + digits) : "",
      label: contact ? (c.type === "whatsapp" ? "WhatsApp " : "Call ") + pretty : "",
      config: accepting ? JSON.stringify({ mode: mode, maxParty: maxParty, replyBy: replyBy, events: events.length > 1 ? events : [] }) : ""
    };
  }

  root.InviteRsvp = { view: view };
  if (typeof module !== "undefined" && module.exports) module.exports = root.InviteRsvp;
})(typeof globalThis !== "undefined" ? globalThis : this);
