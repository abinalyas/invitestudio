/* The couple's replies as a spreadsheet file (CSV). Pure: no page access, so it can be tested on its own.
 * Cells that start with = + - @ (or a tab or carriage return) are prefixed with an apostrophe, so a guest cannot make
 * a spreadsheet run a formula by typing one into their name or message.
 */
(function (root) {
  "use strict";
  var COLUMNS = ["Name", "Attending", "People", "Events", "Needs", "Message", "Replied at"];

  function cell(value) {
    var text = String(value == null ? "" : value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  // data: { replies: [{ name, attending, party, events: { id: bool }, needs, message, createdAt, updatedAt }],
  //         totals: { byEvent: { id: { title } } } }
  function repliesCsv(data, options) {
    var withCount = !options || options.withCount !== false;
    var replies = (data && data.replies) || [], titles = {};
    var byEvent = (data && data.totals && data.totals.byEvent) || {};
    Object.keys(byEvent).forEach(function (id) { titles[id] = byEvent[id].title; });
    var columns = withCount ? COLUMNS : COLUMNS.filter(function (c) { return c !== "People"; });
    var rows = [columns.map(cell).join(",")];
    replies.forEach(function (r) {
      var going = Object.keys(r.events || {}).filter(function (id) { return r.events[id] && titles[id]; }).map(function (id) { return titles[id]; });
      var fields = [r.name, r.attending ? "Yes" : "No"];
      if (withCount) fields.push(r.attending ? r.party : 0);
      fields.push(going.join("; "), r.needs || "", r.message || "", r.updatedAt || r.createdAt || "");
      rows.push(fields.map(cell).join(","));
    });
    // The byte order mark makes Excel read the file as UTF-8 (names with accents stay intact).
    return "﻿" + rows.join("\r\n") + "\r\n";
  }

  root.InviteRsvpCsv = { repliesCsv: repliesCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = root.InviteRsvpCsv;
})(typeof globalThis !== "undefined" ? globalThis : this);
