/* © 2026 InviteStudio. All rights reserved. Licensed only for use in an invitation built and hosted on InviteStudio (see /terms).
 *
 * The share card: a 4:5 picture with the event, names, date and place on the design's artwork, and a ready-written message
 * for WhatsApp, like the cards couples send by hand. Included with Premium and Signature designs.
 *
 *   InviteShareCard.events(project)               the events a card can be made for
 *   InviteShareCard.message(opts)                 the message text (names, event, url)
 *   InviteShareCard.draw(opts) -> Promise<Blob>   the picture (browser only)
 *   InviteShareCard.open(project, {art, url})     the dialog (browser only; uses renderModal from the page)
 *
 * The pure parts (events, message, mapsLink, dateLine) also run in Node, for the unit tests.
 */
(function (root) {
  'use strict';

  var WIDTH = 1080, HEIGHT = 1350;       // 4:5
  var CAPTION_LIMIT = 1000;              // WhatsApp keeps about 1024 characters of caption with a picture

  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

  // "2026-11-28" -> "Saturday, 28 November 2026" (read as a plain date, never shifted by the viewer's time zone).
  function dateLine(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(date));
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return '';
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return days[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function timeLine(time) {
    var m = /^(\d{2}):(\d{2})$/.exec(text(time));
    if (!m) return text(time);
    var h = +m[1];
    return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  // The couple's own directions link when it is a web address, otherwise a Google Maps search for the place.
  function mapsLink(event) {
    var own = text(event && event.directionsUrl);
    if (/^https?:\/\//i.test(own)) return own;
    var venue = text(event && event.venue);
    return venue ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(venue) : '';
  }

  // The events to choose from: the ones shown on the invitation, or one made from the main date and place when there are none.
  function events(project) {
    var list = ((project && project.functions) || []).filter(function (e) { return e && e.visible !== false && (text(e.title) || text(e.date)); })
      .map(function (e) {
        return { id: String(e.id || ''), title: text(e.title), date: text(e.date), time: text(e.time), venue: text(e.venue), directionsUrl: text(e.directionsUrl) };
      });
    if (list.length) return list;
    var date = text(project && project.date), venue = text(project && project.location);
    return date || venue ? [{ id: 'main', title: '', date: date, time: '', venue: venue, directionsUrl: '' }] : [];
  }

  function the(title) { return /^the\s/i.test(title) ? title : 'the ' + title; }

  // The message that goes under the picture, in the same friendly style couples write by hand.
  function message(opts) {
    var names = text(opts.names) || 'us', event = opts.event || {}, title = text(event.title);
    var when = [dateLine(event.date), timeLine(event.time)].filter(Boolean).join(', ');
    var maps = mapsLink(event);
    var lines = ['✨ With great joy, we invite you to celebrate a beautiful new beginning with us! ❤️', ''];
    lines.push(title ? 'Please join us for ' + the(title) + ' of ' + names + ' and bless us with your love and good wishes.' : 'Please join us as we celebrate ' + names + ' and bless us with your love and good wishes.');
    lines.push('');
    if (when) lines.push('📅 ' + when);
    if (text(event.venue)) lines.push('📍 ' + text(event.venue));
    if (maps) lines.push('🗺️ Venue location: ' + maps);
    if (when || text(event.venue) || maps) lines.push('');
    if (opts.url) { lines.push('💌 See the full invitation: ' + opts.url); lines.push(''); }
    lines.push('Your presence will make our celebration even more special.', '', 'With love,', names + ' 💞');
    var out = lines.join('\n');
    return out.length > CAPTION_LIMIT ? out.slice(0, CAPTION_LIMIT - 1).replace(/\s+\S*$/, '') + '…' : out;
  }

  var api = { events: events, message: message, mapsLink: mapsLink, dateLine: dateLine, WIDTH: WIDTH, HEIGHT: HEIGHT };

  /* ---------------------------------------------------------------- browser only */
  if (typeof document === 'undefined') { root.InviteShareCard = api; if (typeof module !== 'undefined') module.exports = api; return; }

  var meta = document.querySelector('meta[name="invitestudio-build"]');
  var V = meta && meta.content ? '?v=' + meta.content : '';
  var FONTS = [
    ['Great Vibes', '/assets/scene-fonts/great-vibes-latin-400-normal.woff2', '400'],
    ['Cormorant Garamond', '/assets/scene-fonts/cormorant-garamond-latin-500-normal.woff2', '500']
  ];
  var fontsReady = null;
  function loadFonts() {
    if (!fontsReady) {
      fontsReady = Promise.all(FONTS.map(function (f) {
        var face = new FontFace(f[0], 'url(' + f[1] + ')', { weight: f[2] });
        return face.load().then(function (loaded) { document.fonts.add(loaded); }, function () { /* the card falls back to a serif */ });
      }));
    }
    return fontsReady;
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not load the design picture')); };
      img.src = src;
    });
  }

  function spaced(ctx, value, x, y, gap) {
    // Capital letters with a little space between them, centred on x.
    var chars = value.split(''), widths = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (chars.length - 1), at = x - total / 2;
    ctx.textAlign = 'left';
    chars.forEach(function (c, i) { ctx.fillText(c, at, y); at += widths[i] + gap; });
    ctx.textAlign = 'center';
  }

  function fit(ctx, value, font, max, start) {
    var size = start;
    do { ctx.font = font.replace('%', size); size -= 4; } while (ctx.measureText(value).width > max && size > 40);
  }

  function wrap(ctx, value, max) {
    var words = value.split(' '), lines = [], line = '';
    words.forEach(function (w) {
      var next = line ? line + ' ' + w : w;
      if (line && ctx.measureText(next).width > max) { lines.push(line); line = w; } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

  // opts: { art (wide picture address), names, event, url (unused in the picture) }
  function draw(opts) {
    return Promise.all([loadFonts(), loadImage(opts.art)]).then(function (parts) {
      var img = parts[1];
      var canvas = document.createElement('canvas');
      canvas.width = WIDTH; canvas.height = HEIGHT;
      var ctx = canvas.getContext('2d');
      // The picture fills the card (cropped at the sides), then a soft band keeps the words readable.
      var scale = Math.max(WIDTH / img.width, HEIGHT / img.height);
      var w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
      var sample = ctx.getImageData(140, 330, WIDTH - 280, 620).data, sum = 0, n = 0;
      for (var i = 0; i < sample.length; i += 64) { sum += 0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2]; n++; }
      var light = sum / n > 150;                       // a light picture gets dark words, a dark one light words
      var ink = light ? '#2a2118' : '#fbf6ea', band = light ? '255,250,240' : '10,8,6';
      var grad = ctx.createLinearGradient(0, 250, 0, 1050);
      grad.addColorStop(0, 'rgba(' + band + ',0)'); grad.addColorStop(0.25, 'rgba(' + band + ',.42)');
      grad.addColorStop(0.75, 'rgba(' + band + ',.42)'); grad.addColorStop(1, 'rgba(' + band + ',0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 250, WIDTH, 800);

      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = light ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10;
      var event = opts.event || {}, title = text(event.title), names = text(opts.names), maxW = WIDTH - 200;
      var y = 330;
      ctx.font = '500 30px "Cormorant Garamond", Georgia, serif';
      spaced(ctx, (title ? 'WE CORDIALLY INVITE YOU TO THE' : 'TOGETHER WITH THEIR FAMILIES').toUpperCase(), WIDTH / 2, y, 5);
      if (title) {
        y += 150;
        fit(ctx, title, '400 %px "Great Vibes", "Snell Roundhand", cursive', maxW, 150);
        ctx.fillText(title, WIDTH / 2, y);
        y += 80;
        ctx.font = '500 28px "Cormorant Garamond", Georgia, serif';
        spaced(ctx, 'OF', WIDTH / 2, y, 6);
        ctx.fillRect(WIDTH / 2 - 330, y - 10, 250, 2); ctx.fillRect(WIDTH / 2 + 80, y - 10, 250, 2);
        y += 130;
      } else { y += 150; }
      fit(ctx, names, '400 %px "Great Vibes", "Snell Roundhand", cursive', maxW, 140);
      ctx.fillText(names, WIDTH / 2, y);
      y += 70;
      ctx.fillRect(WIDTH / 2 - 260, y, 520, 2);
      y += 80;
      ctx.font = '500 38px "Cormorant Garamond", Georgia, serif';
      var when = [dateLine(event.date), timeLine(event.time)].filter(Boolean).join('  ·  ').toUpperCase();
      if (when) { spaced(ctx, when, WIDTH / 2, y, 3); y += 62; }
      ctx.font = '500 32px "Cormorant Garamond", Georgia, serif';
      if (text(event.venue)) wrap(ctx, text(event.venue).toUpperCase(), maxW).slice(0, 3).forEach(function (line) { ctx.fillText(line, WIDTH / 2, y); y += 48; });
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.7;
      ctx.font = '500 24px "Cormorant Garamond", Georgia, serif';
      ctx.fillText('Made with InviteStudio', WIDTH / 2, HEIGHT - 50);
      ctx.globalAlpha = 1;
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('Could not make the picture')); }, 'image/png');
      });
    });
  }

  /* ---- the dialog ---- */
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function tierOf(project) {
    return fetch('/api/pricing', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { return (data && data.templates && data.templates[project.templateId]) || 'classic'; })
      .catch(function () { return 'classic'; });
  }

  function open(project, extra) {
    if (!project || typeof renderModal !== 'function') return;
    extra = extra || {};
    var url = extra.url || '';
    var list = events(project);
    var state = { index: 0, blob: null, objectUrl: '', token: 0 };
    var names = text(project.title);

    function close() { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); if (typeof closeModal === 'function') closeModal(); }
    function $(sel) { return document.querySelector('#modal-root ' + sel); }

    function shell(inner) {
      renderModal('<div class="eyebrow">Share on WhatsApp</div><h2 id="modal-title">Your share card</h2>' + inner +
        '<div class="modal-actions" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" type="button" data-sc-close>Close</button></div>');
      $('[data-sc-close]').addEventListener('click', close);
    }

    shell('<p class="muted" role="status">Getting your card ready…</p>');
    tierOf(project).then(function (tier) {
      if (tier === 'classic') {
        shell('<p data-sc-locked>The share card, a picture of your invitation with a ready-written message, is included with <strong>Premium</strong> and <strong>Signature</strong> designs. Your invitation link works the same on every design.</p>');
        return;
      }
      if (!list.length) {
        shell('<p data-sc-empty>Add the date and place of an event in the editor first, then your card will be ready here.</p>');
        return;
      }
      render();
    });

    function render() {
      var event = list[state.index];
      var picker = list.length > 1
        ? '<label class="tiny muted" for="sc-event" style="display:block;margin-top:10px">Event</label><select id="sc-event" data-sc-event>' +
          list.map(function (e, i) { return '<option value="' + i + '"' + (i === state.index ? ' selected' : '') + '>' + esc(e.title || 'Wedding') + (e.date ? ' · ' + esc(dateLine(e.date)) : '') + '</option>'; }).join('') + '</select>'
        : '';
      shell(picker +
        '<div style="margin-top:12px;display:grid;place-items:center;background:#f2eee6;border-radius:10px;padding:10px"><img data-sc-image alt="Your share card" style="max-width:100%;max-height:48vh;border-radius:6px;display:none"><p class="tiny muted" data-sc-wait>Making the picture…</p></div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn dark" type="button" data-sc-share disabled>Share</button><button class="btn" type="button" data-sc-download disabled>Download picture</button><button class="btn" type="button" data-sc-copy>Copy message</button></div>' +
        '<label class="tiny muted" for="sc-text" style="display:block;margin-top:12px">Message (you can change it)</label>' +
        '<textarea id="sc-text" data-sc-text rows="8" style="width:100%"></textarea>' +
        '<p class="tiny muted" data-sc-note style="margin:6px 0 0"></p>');
      $('[data-sc-text]').value = message({ names: names, event: event, url: url });
      var picker2 = $('[data-sc-event]');
      if (picker2) picker2.addEventListener('change', function () { state.index = +picker2.value; render(); });
      $('[data-sc-copy]').addEventListener('click', function () {
        var note = $('[data-sc-note]'), value = $('[data-sc-text]').value;
        (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject()).then(
          function () { note.textContent = 'Message copied.'; }, function () { $('[data-sc-text]').select(); note.textContent = 'Select the message and copy it.'; });
      });
      var token = ++state.token;
      draw({ art: extra.art, names: names, event: event }).then(function (blob) {
        if (token !== state.token || !$('[data-sc-image]')) return;
        if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
        state.blob = blob; state.objectUrl = URL.createObjectURL(blob);
        var img = $('[data-sc-image]'); img.src = state.objectUrl; img.style.display = 'block'; $('[data-sc-wait]').style.display = 'none';
        var file = new File([blob], 'invitation-card.png', { type: 'image/png' });
        var canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        var share = $('[data-sc-share]'), download = $('[data-sc-download]'), note = $('[data-sc-note]');
        download.disabled = false;
        download.addEventListener('click', function () {
          var a = document.createElement('a'); a.href = state.objectUrl; a.download = 'invitation-card.png'; document.body.appendChild(a); a.click(); a.remove();
        });
        if (canShare) {
          share.disabled = false;
          note.textContent = 'Share sends the picture with your message. If WhatsApp leaves the message out, use Copy message and paste it under the picture.';
          share.addEventListener('click', function () {
            navigator.share({ files: [file], text: $('[data-sc-text]').value }).catch(function () { /* closed without sending */ });
          });
        } else {
          share.style.display = 'none';
          note.textContent = 'On a computer: download the picture, copy the message, then paste both into WhatsApp.';
        }
      }, function () {
        var wait = $('[data-sc-wait]'); if (wait) wait.textContent = 'The picture could not be made. You can still copy the message.';
      });
    }
  }

  api.draw = draw; api.open = open;
  root.InviteShareCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
