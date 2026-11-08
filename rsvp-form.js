/* Guest reply form (RSVP). Any element marked data-rsvp-open opens it; data-rsvp-config carries the couple's
 * settings ({ mode, maxParty, replyBy, events }). On a published invitation (/s/<slug>) the form sends the reply to
 * the API. Anywhere else (the editor's preview) it shows the same form with sending switched off.
 *
 * Everything a guest types is put on the page as text, never as markup. After replying, the guest gets a private
 * link to change the reply; the link carries a secret in the address fragment (#reply=...), which browsers do not
 * send to any server, and it is removed from the address bar as soon as it is used.
 */
(function () {
  "use strict";
  var CSS = [
    ".rsvp-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(20,16,14,.6);display:flex;align-items:flex-end;justify-content:center;padding:0;overflow:auto;-webkit-overflow-scrolling:touch}",
    "@media(min-width:600px){.rsvp-overlay{align-items:center;padding:24px}}",
    ".rsvp-card{box-sizing:border-box;width:100%;max-width:520px;max-height:100%;overflow:auto;background:#fffdfa;color:#2b2420;border-radius:16px 16px 0 0;padding:26px 22px 28px;font:400 16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)}",
    "@media(min-width:600px){.rsvp-card{border-radius:16px;padding:32px}}",
    ".rsvp-card *{box-sizing:border-box}",
    ".rsvp-card h2{margin:0 0 4px;font:600 1.45rem/1.25 Georgia,'Times New Roman',serif}",
    ".rsvp-card .rsvp-sub{margin:0 0 18px;color:#6b5f58;font-size:.92rem}",
    ".rsvp-card label,.rsvp-card legend{display:block;margin:14px 0 6px;font-weight:600;font-size:.92rem}",
    ".rsvp-card fieldset{border:0;margin:0;padding:0;min-width:0}",
    ".rsvp-card input[type=text],.rsvp-card select,.rsvp-card textarea{width:100%;padding:11px 12px;border:1px solid #8a7f76;border-radius:8px;background:#fff;color:inherit;font:inherit}",
    ".rsvp-card textarea{min-height:76px;resize:vertical}",
    ".rsvp-card .rsvp-choice{display:flex;align-items:center;gap:10px;margin:0 0 8px;padding:11px 12px;border:1px solid #8a7f76;border-radius:8px;font-weight:400;cursor:pointer}",
    ".rsvp-card .rsvp-choice input{width:18px;height:18px;margin:0;flex:none}",
    ".rsvp-card .rsvp-hint{margin:4px 0 0;font-size:.82rem;color:#6b5f58;font-weight:400}",
    ".rsvp-card .rsvp-error{margin:6px 0 0;color:#a3261c;font-size:.88rem}",
    ".rsvp-card .rsvp-banner{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#f4ece3;font-size:.88rem}",
    ".rsvp-card .rsvp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}",
    ".rsvp-card button{font:600 .95rem/1 system-ui,sans-serif;padding:13px 22px;border-radius:999px;cursor:pointer;border:1px solid #2b2420}",
    ".rsvp-card .rsvp-primary{background:#2b2420;color:#fff}",
    ".rsvp-card .rsvp-primary[disabled]{opacity:.45;cursor:not-allowed}",
    ".rsvp-card .rsvp-secondary{background:transparent;color:#2b2420}",
    ".rsvp-card .rsvp-link{display:block;width:100%;margin:8px 0;padding:10px 12px;border:1px dashed #b9ada3;border-radius:8px;font-size:.82rem;word-break:break-all;background:#faf6f1;user-select:all}",
    ".rsvp-card dl{margin:14px 0;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.92rem}",
    ".rsvp-card dt{color:#6b5f58}.rsvp-card dd{margin:0;overflow-wrap:anywhere}",
    ".rsvp-trap{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}"
  ].join("");

  var lastFocus = null, overlay = null;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "class") node.className = attrs[k];
      else if (attrs[k] === true) node.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }

  function storageKey(slug) { return "invitestudio-rsvp-" + slug; }
  function remembered(slug) { try { return localStorage.getItem(storageKey(slug)) || ""; } catch (e) { return ""; } }
  function remember(slug, token) { try { localStorage.setItem(storageKey(slug), token); } catch (e) { /* private window: the link on screen still works */ } }

  function liveSlug(path) {
    var inside = path.some(function (n) { return n && n.nodeType === 1 && n.hasAttribute("data-public-invitation"); });
    var m = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(location.pathname);
    return inside && m ? m[1] : "";
  }

  function close() {
    if (!overlay) return;
    document.removeEventListener("keydown", onKey, true);
    overlay.remove(); overlay = null;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* element gone */ } }
  }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab" || !overlay) return;
    var items = Array.prototype.filter.call(overlay.querySelectorAll("button,input,select,textarea,a[href]"), function (n) { return !n.disabled && n.offsetParent !== null && !n.closest(".rsvp-trap"); });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(config, slug, existing) {
    if (!document.getElementById("rsvp-form-css")) { var st = el("style", { id: "rsvp-form-css" }); st.textContent = CSS; document.head.appendChild(st); }
    close();
    var live = Boolean(slug);
    var card = el("div", { class: "rsvp-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "rsvp-title" });
    overlay = el("div", { class: "rsvp-overlay" }, [card]);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey, true);
    form(card, config, slug, existing);
    var focusTarget = card.querySelector("input[type=text]") || card.querySelector("button");
    if (focusTarget) focusTarget.focus();
    return live;
  }

  function form(card, config, slug, existing) {
    var token = existing ? existing.token : "";
    var reply = existing ? existing.reply : null;
    var live = Boolean(slug), events = config.events || [], counted = config.mode === "count";
    card.textContent = "";
    card.appendChild(el("h2", { id: "rsvp-title", text: token ? "Change your reply" : "Will you join us?" }));
    card.appendChild(el("p", { class: "rsvp-sub", text: "Only the couple can see your reply." }));
    if (!live) card.appendChild(el("p", { class: "rsvp-banner", text: "Preview only. This is how guests will reply. Replies open once your invitation is live." }));

    var name = el("input", { type: "text", id: "rsvp-name", maxlength: "160", autocomplete: "name", required: true, value: reply ? reply.name : "" });
    var nameErr = el("p", { class: "rsvp-error", role: "alert", hidden: true });
    card.appendChild(el("label", { for: "rsvp-name", text: "Your name" }));
    card.appendChild(name); card.appendChild(nameErr);

    var yes = el("input", { type: "radio", name: "rsvp-attending", value: "yes" });
    var no = el("input", { type: "radio", name: "rsvp-attending", value: "no" });
    if (reply) (reply.attending ? yes : no).checked = true;
    var attendErr = el("p", { class: "rsvp-error", role: "alert", hidden: true });
    card.appendChild(el("fieldset", {}, [
      el("legend", { text: "Will you attend?" }),
      el("label", { class: "rsvp-choice" }, [yes, "Yes, I will be there"]),
      el("label", { class: "rsvp-choice" }, [no, "Sorry, I cannot make it"]),
      attendErr
    ]));

    var more = el("div", {});
    card.appendChild(more);
    var checks = {};
    if (events.length) {
      var set = el("fieldset", {}, [el("legend", { text: "Which events will you attend?" })]);
      events.forEach(function (ev) {
        var box = el("input", { type: "checkbox", value: ev.id });
        if (reply && reply.events && reply.events[ev.id]) box.checked = true;
        checks[ev.id] = box;
        set.appendChild(el("label", { class: "rsvp-choice" }, [box, ev.title]));
      });
      var evErr = el("p", { class: "rsvp-error", role: "alert", hidden: true });
      set.appendChild(evErr); set.errorNode = evErr;
      more.appendChild(set);
    }
    var party = null, partyErr = el("p", { class: "rsvp-error", role: "alert", hidden: true });
    if (counted) {
      party = el("select", { id: "rsvp-party" });
      for (var i = 1; i <= config.maxParty; i++) party.appendChild(el("option", { value: String(i), text: String(i) }));
      party.value = String(reply && reply.party ? reply.party : 1);
      more.appendChild(el("label", { for: "rsvp-party", text: "How many people are coming, including you?" }));
      more.appendChild(party); more.appendChild(partyErr);
    }
    var needs = el("textarea", { id: "rsvp-needs", maxlength: "500" }); needs.value = reply ? reply.needs : "";
    more.appendChild(el("label", { for: "rsvp-needs", text: "Meal or access needs (optional)" }));
    more.appendChild(needs);
    more.appendChild(el("p", { class: "rsvp-hint", text: "For example vegetarian meals, or step-free access." }));

    var message = el("textarea", { id: "rsvp-message", maxlength: "2000" }); message.value = reply ? reply.message : "";
    card.appendChild(el("label", { for: "rsvp-message", text: "A message for the couple (optional)" }));
    card.appendChild(message);

    // Hidden from people; bots tend to fill every field.
    var trap = el("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    card.appendChild(el("div", { class: "rsvp-trap", "aria-hidden": "true" }, [trap]));

    var formErr = el("p", { class: "rsvp-error", role: "alert", hidden: true });
    var send = el("button", { type: "button", class: "rsvp-primary", text: token ? "Save changes" : "Send reply", disabled: !live });
    var cancel = el("button", { type: "button", class: "rsvp-secondary", text: live ? "Cancel" : "Close" });
    card.appendChild(formErr);
    card.appendChild(el("div", { class: "rsvp-actions" }, [send, cancel]));
    cancel.addEventListener("click", close);

    function sync() { more.hidden = !yes.checked; }
    yes.addEventListener("change", sync); no.addEventListener("change", sync); sync();

    function show(node, text) { node.textContent = text || ""; node.hidden = !text; }
    function problems(fields) {
      show(nameErr, fields.name); show(attendErr, fields.attending); show(partyErr, fields.party);
      var set2 = more.querySelector("fieldset"); if (set2 && set2.errorNode) show(set2.errorNode, fields.events);
    }

    send.addEventListener("click", function () {
      if (!live) return;
      var fields = {};
      if (!name.value.trim()) fields.name = "Please enter your name.";
      if (!yes.checked && !no.checked) fields.attending = "Please say whether you will attend.";
      var chosen = {};
      events.forEach(function (ev) { chosen[ev.id] = Boolean(checks[ev.id] && checks[ev.id].checked); });
      if (yes.checked && events.length && !events.some(function (ev) { return chosen[ev.id]; })) fields.events = "Choose at least one event you will attend.";
      problems(fields); show(formErr, "");
      if (Object.keys(fields).length) return;
      var body = { name: name.value.trim(), attending: yes.checked, needs: needs.value.trim(), message: message.value.trim(), website: trap.value };
      if (yes.checked) { if (party) body.party = Number(party.value); if (events.length) body.events = chosen; }
      send.disabled = true; send.textContent = "Sending…";
      var api = window.inviteStudioApi;
      var call = token ? api.changeRsvp(slug, token, body) : api.submitRsvp(slug, body);
      call.then(function (res) {
        var used = token || res.changeToken;
        remember(slug, used);
        thanks(card, config, slug, res.reply, used, Boolean(token));
      }).catch(function (err) {
        send.disabled = false; send.textContent = token ? "Save changes" : "Send reply";
        if (err && err.fields) problems(err.fields);
        var text = "We could not send your reply. Please check your connection and try again.";
        if (err && err.code === "RATE_LIMITED") text = "Too many replies were sent just now. Please try again in a little while.";
        else if (err && err.code === "RSVP_CLOSED") text = "Replies for this invitation are now closed. Please contact the couple.";
        else if (err && err.code === "VALIDATION_ERROR") text = "Please check the highlighted answers.";
        show(formErr, text);
      });
    });
  }

  function thanks(card, config, slug, reply, token, changed) {
    card.textContent = "";
    var link = location.origin + "/s/" + slug + "#reply=" + token;
    card.appendChild(el("h2", { id: "rsvp-title", text: changed ? "Your reply is updated" : "Thank you, your reply is sent" }));
    card.appendChild(el("p", { class: "rsvp-sub", text: reply.attending ? "We are so glad you can join us." : "We will miss you, and thank you for letting us know." }));
    var rows = [["Name", reply.name], ["Attending", reply.attending ? "Yes" : "No"]];
    if (reply.attending && config.mode === "count") rows.push(["People", String(reply.party)]);
    var titles = {}; (config.events || []).forEach(function (ev) { titles[ev.id] = ev.title; });
    var going = Object.keys(reply.events || {}).filter(function (id) { return reply.events[id] && titles[id]; }).map(function (id) { return titles[id]; });
    if (going.length) rows.push(["Events", going.join(", ")]);
    if (reply.needs) rows.push(["Needs", reply.needs]);
    if (reply.message) rows.push(["Message", reply.message]);
    var dl = el("dl", {});
    rows.forEach(function (r) { dl.appendChild(el("dt", { text: r[0] })); dl.appendChild(el("dd", { text: r[1] })); });
    card.appendChild(dl);
    card.appendChild(el("p", { class: "rsvp-hint", text: "Plans change. Keep this private link to change your reply later. Anyone who has it can change your reply, so do not share it." }));
    card.appendChild(el("div", { class: "rsvp-link", text: link }));
    var copy = el("button", { type: "button", class: "rsvp-secondary", text: "Copy link" });
    var done = el("button", { type: "button", class: "rsvp-primary", text: "Done" });
    copy.addEventListener("click", function () {
      var ok = function () { copy.textContent = "Copied"; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, function () { copy.textContent = "Select the link to copy it"; });
      else copy.textContent = "Select the link to copy it";
    });
    done.addEventListener("click", close);
    card.appendChild(el("div", { class: "rsvp-actions" }, [done, copy]));
    done.focus();
  }

  function begin(button, path) {
    var config; try { config = JSON.parse(button.getAttribute("data-rsvp-config") || "{}"); } catch (e) { return; }
    if (!config || (config.mode !== "count" && config.mode !== "rsvp")) return;
    config.maxParty = Number.isInteger(config.maxParty) ? config.maxParty : 10;
    var slug = liveSlug(path);
    lastFocus = button;
    var token = slug ? remembered(slug) : "";
    if (slug && token && window.inviteStudioApi) {
      window.inviteStudioApi.getRsvp(slug, token).then(function (res) {
        open(config, slug, { token: token, reply: res.reply });
      }, function () { open(config, slug, null); });
    } else open(config, slug, null);
  }

  document.addEventListener("click", function (e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.nodeType === 1 && n.hasAttribute("data-rsvp-open")) { e.preventDefault(); begin(n, path); return; }
    }
  });

  // A guest arriving by their private link: remember it, take it out of the address bar, and open their reply.
  var linkMatch = /^#reply=([A-Za-z0-9_-]{43})$/.exec(location.hash || "");
  var linkSlug = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(location.pathname);
  if (linkMatch && linkSlug) {
    remember(linkSlug[1], linkMatch[1]);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* keep the fragment */ }
    var tries = 0, timer = window.setInterval(function () {
      var button = document.querySelector("[data-public-invitation] [data-rsvp-open]");
      if (button) { window.clearInterval(timer); begin(button, [button, document.querySelector("[data-public-invitation]")]); }
      else if (++tries > 40) window.clearInterval(timer);
    }, 400);
  }
})();
