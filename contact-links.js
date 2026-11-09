/* "Talk to us" links, built from the contact details in site-config.js. Each link opens a message that already says
 * what it is about and, when given, which website: so the person does not have to explain, and we know which one.
 * Pure: it only builds addresses, so it can be tested on its own.
 */
(function (root) {
  "use strict";
  var TOPICS = {
    extend: { subject: "Keep my InviteStudio website longer", text: "Hello, I would like to keep my InviteStudio website online for longer." },
    restore: { subject: "Bring back my InviteStudio website", text: "Hello, my InviteStudio website has closed and I would like it back." },
    custom: { subject: "Something unique for my celebration", text: "Hello, I would like to talk about a design made just for us." },
    general: { subject: "A question about InviteStudio", text: "Hello, I have a question about InviteStudio." }
  };

  function settings() { return (root.INVITESTUDIO_SITE && root.INVITESTUDIO_SITE.contact) || {}; }

  // links(topic, address): { whatsapp, email } (each empty when that detail is not set). address is the website's web
  // address, included in the message only when it really is an http(s) address.
  function links(topic, address) {
    var t = TOPICS[topic] || TOPICS.general, c = settings();
    var where = /^https?:\/\/[^\s"'<>]+$/i.test(address || "") ? "\n\nIts address: " + address : "";
    var text = t.text + where;
    var digits = String(c.whatsapp || "").replace(/\D/g, "");
    var email = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(c.email || "") ? c.email : "";
    return {
      whatsapp: digits.length >= 7 && digits.length <= 15 ? "https://wa.me/" + digits + "?text=" + encodeURIComponent(text) : "",
      email: email ? "mailto:" + email + "?subject=" + encodeURIComponent(t.subject) + "&body=" + encodeURIComponent(text.replace(/\n/g, "\r\n")) : ""
    };
  }

  root.InviteContact = { links: links };
  if (typeof module !== "undefined" && module.exports) module.exports = root.InviteContact;
})(typeof globalThis !== "undefined" ? globalThis : this);
