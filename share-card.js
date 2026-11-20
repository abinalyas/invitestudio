/* © 2026 InviteStudio. All rights reserved. Licensed only for use in an invitation built and hosted on InviteStudio (see /terms).
 *
 * The share card: a picture of the invitation (each design has its own card layout; others get a generic 4:5 card) with the event, names, date and place on the design's artwork, and a ready-written message
 * for WhatsApp, like the cards couples send by hand. Included with every design (Classic, Premium and Signature).
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

  /* ---------------------------------------------------------------- designed cards (one per design) */
  // Each design has its own card: the design's artwork without text (assets/share-cards/<id>.webp) and a layout that says where
  // every word goes. The words are the couple's own (names, event, date, place); the fixed phrases are the design's.

  // "Palash & Amruta" -> { a: 'Palash', b: 'Amruta' }. A title that is not two names stays whole in a.
  function splitNames(title) {
    var t = text(title);
    var m = /^(.+?)\s*(?:&|\+|\band\b|\bweds\b)\s*(.+)$/i.exec(t);
    return m ? { a: text(m[1]), b: text(m[2]) } : { a: t, b: '' };
  }

  function initials(names) {
    var first = function (value) { var c = /[A-Za-zÀ-ɏऀ-ॿ]/.exec(value); return c ? c[0].toUpperCase() : ''; };
    var a = first(names.a), b = first(names.b);
    return a && b ? a + '/' + b : a;
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateParts(date) {
    var line = dateLine(date);                       // "Saturday, 28 November 2026", or '' for a date that is not real
    if (!line) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(date));
    return { weekday: line.split(',')[0], day: (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] };
  }

  function isWedding(title) { return !title || /wedding/i.test(title); }

  // Everything a card says that comes from the couple, ready to draw.
  function cardData(names, event) {
    event = event || {};
    var n = splitNames(names), parts = dateParts(event.date), time = event.time ? timeLine(event.time) : '';
    var when = null;
    if (parts) {
      when = {
        one: [parts.weekday + ', ' + parts.day, time].filter(Boolean).join(' · '),
        two: [parts.day, [parts.weekday, time].filter(Boolean).join(' · ')]
      };
    } else if (time) { when = { one: time, two: [time, ''] }; }
    var venue = text(event.venue);
    return { a: n.a, b: n.b, initials: initials(n), title: text(event.title) || 'Wedding', wedding: isWedding(text(event.title)), when: when, venue: venue };
  }

  var CG = '"Cormorant Garamond", Georgia, serif', PF = '"Playfair Display", Georgia, serif', PIN = '"Pinyon Script", "Snell Roundhand", cursive';
  var MONT = '"Montserrat", "Helvetica Neue", Arial, sans-serif';
  function cg(weight, italic) { return (italic ? 'italic ' : '') + weight + ' %px ' + CG; }

  // Layout helpers: one "when" and one "where" block per card. Column cards stack ON and AT under each other; split cards put them
  // side by side. iconAbove puts the icon over the label instead of beside it.
  function column(o) {
    var base = { cx: o.cx, size: o.size, iconSize: o.iconSize || 36, labelSize: o.labelSize, track: 4, font: o.font, labelFont: o.labelFont, color: o.color, iconColor: o.iconColor || o.accent, maxW: 760, maxLines: 3, lines: 'one' };
    return [
      Object.assign({ t: 'info', kind: 'when', iconY: o.on[0], labelY: o.on[1], valueY: o.on[2], label: 'ON' }, base),
      Object.assign({ t: 'info', kind: 'where', iconY: o.at[0], labelY: o.at[1], valueY: o.at[2], label: 'AT' }, base)
    ];
  }
  function split(o) {
    var base = { size: o.size, iconSize: o.iconSize || 40, labelSize: o.labelSize, track: 4, font: o.font, labelFont: o.labelFont, color: o.color, iconColor: o.accent, maxW: o.colW || 400, maxLines: o.maxLines || 3, lines: 'two', iconAbove: o.iconAbove, solo: o.solo, lh: o.lh, up: o.up };
    var parts = [
      Object.assign({ t: 'info', kind: 'when', cx: o.cx[0], iconY: o.y[0], labelY: o.y[1], valueY: o.y[2], label: 'ON', valueDx: o.dx || 0 }, base),
      Object.assign({ t: 'info', kind: 'where', cx: o.cx[1], iconY: o.y[0], labelY: o.y[1], valueY: o.y[2], label: 'AT', valueDx: o.dx || 0 }, base)
    ];
    if (o.rule) parts.push({ t: 'rule', x: o.rule[0], y0: o.rule[1], y1: o.rule[2], color: o.accent });
    return parts;
  }

  var INVITE = 'WE CORDIALLY INVITE YOU TO THE', FAMILIES = 'TOGETHER WITH THEIR FAMILIES', WEDDING_OF = 'THE WEDDING OF';

  var CARDS = {
    'minimalist': (function () {
      var ink = '#161616', green = '#3f5a2e';
      return { w: 1086, h: 1448, parts: [
        { t: 'mono', font: '600 %px ' + PF, size: 72, color: ink, x: 546, y: 127 },
        { t: 'text', text: 'A CELEBRATION OF LOVE', font: '600 %px ' + MONT, size: 29, track: 6, color: green, x: 545, y: 192, maxW: 540 },
        { t: 'names', mode: 'stack', font: '800 %px ' + PF, size: 150, color: ink, amp: { color: green, scale: 1 }, dot: green, x: 545, y: [365, 502], maxW: 700 },
        { t: 'text', text: INVITE, font: cg(600), size: 31, track: 5, color: ink, x: 545, y: 622, maxW: 700 },
        { t: 'title', font: '%px ' + PIN, size: 152, color: green, x: 545, y: 752, maxW: 690 }
      ].concat(split({ cx: [326, 758], y: [845, 857, 906], size: 46, labelSize: 26, font: cg(500, true), labelFont: cg(600), color: ink, accent: green, colW: 420, up: 16, lh: 42, maxLines: 2 })) };
    })(),
    'cinematic': (function () {
      var cream = '#fbf3e3', gold = '#f0bf4f';
      return { w: 1086, h: 1448, shadow: true, parts: [
        { t: 'text', text: WEDDING_OF, alt: FAMILIES, font: cg(600), size: 31, track: 11, color: cream, x: 543, y: 147, maxW: 700 },
        { t: 'names', mode: 'stack', font: cg(500, true), size: 150, color: cream, amp: { color: gold, scale: .9 }, x: 543, y: [303, 412], maxW: 700 },
        { t: 'orn', type: 'diamond', x: 543, y: 466, w: 312, color: gold },
        { t: 'text', text: INVITE, font: cg(600), size: 29, track: 5, color: cream, x: 543, y: 528, maxW: 700 },
        { t: 'title', font: '%px ' + PIN, size: 140, color: gold, x: 543, y: 652, maxW: 610 }
      ].concat(column({ cx: 546, on: [717, 727, 778], at: [842, 852, 905], size: 47, labelSize: 26, font: cg(500, true), labelFont: cg(600), color: cream, accent: gold })) };
    })(),
    'fairy-tale': (function () {
      var wine = '#6b1230', gold = '#a06f18';
      return { w: 1086, h: 1448, parts: [
        { t: 'text', text: 'Once Upon', font: cg(500, true), size: 112, color: wine, x: 546, y: 183, maxW: 520 },
        { t: 'text', text: 'OUR FOREVER', font: cg(600), size: 36, track: 12, color: gold, x: 546, y: 247, maxW: 520 },
        { t: 'orn', type: 'diamond', x: 546, y: 295, w: 300, color: gold },
        { t: 'names', mode: 'stack', font: cg(500, true), size: 152, color: wine, amp: { color: wine, scale: 1, join: true }, x: 546, y: [440, 585], maxW: 620 },
        { t: 'text', text: INVITE, font: cg(600), size: 29, track: 5, color: wine, x: 546, y: 657, maxW: 680 },
        { t: 'title', font: '%px ' + PIN, size: 140, color: gold, x: 546, y: 768, maxW: 590 }
      ].concat(column({ cx: 548, on: [844, 855, 905], at: [970, 982, 1034], size: 47, labelSize: 26, font: cg(500, true), labelFont: cg(600), color: wine, accent: gold })) };
    })(),
    'velvet-reveal': (function () {
      var cream = '#fdf6df', gold = '#f2bd3a', softGold = '#e2c46f';
      return { w: 1086, h: 1448, shadow: true, parts: [
        { t: 'text', text: FAMILIES, font: cg(600), size: 27, track: 5, color: softGold, x: 543, y: 301, maxW: 620 },
        { t: 'orn', type: 'star', x: 543, y: 353, w: 360, color: softGold },
        { t: 'names', mode: 'inline', font: cg(500), size: 112, color: cream, amp: { color: gold, scale: .8, italic: true }, x: 543, y: 497, maxW: 720 },
        { t: 'text', text: 'invite you to celebrate with them', font: cg(500, true), size: 42, color: cream, x: 543, y: 582, maxW: 640 },
        { t: 'text', text: 'AT THEIR', font: cg(600), size: 27, track: 6, color: cream, x: 543, y: 662, maxW: 300 },
        { t: 'title', font: '%px ' + PIN, size: 156, color: gold, x: 543, y: 800, maxW: 680 }
      ].concat(split({ cx: [358, 733], y: [927, 976, 1020], size: 43, labelSize: 24, font: cg(500, true), labelFont: cg(600), color: cream, accent: gold, iconAbove: true, rule: [544, 928, 1025], colW: 340, solo: 543 })) };
    })(),
    'bloom-reveal': (function () {
      var ink = '#1f3110', gold = '#9a6a14';
      return { w: 1086, h: 1448, parts: [
        { t: 'text', text: FAMILIES, font: cg(600), size: 30, track: 5, color: ink, x: 543, y: 241, maxW: 640 },
        { t: 'orn', type: 'diamond', x: 543, y: 284, w: 308, color: gold },
        { t: 'names', mode: 'stack', font: cg(500), size: 144, color: ink, amp: { color: gold, scale: .9, italic: true }, x: 543, y: [418, 530], maxW: 620 },
        { t: 'text', text: INVITE, font: cg(600), size: 29, track: 5, color: ink, x: 543, y: 603, maxW: 620 },
        { t: 'title', font: '%px ' + PIN, size: 134, color: ink, x: 543, y: 712, maxW: 520 }
      ].concat(column({ cx: 548, on: [792, 804, 860], at: [931, 944, 1000], size: 47, labelSize: 26, font: cg(500, true), labelFont: cg(600), color: ink, accent: gold })) };
    })(),
    'golden-butterfly': (function () {
      var cream = '#fdf6e6', gold = '#f5c13a';
      return { w: 1086, h: 1448, shadow: true, parts: [
        { t: 'text', text: WEDDING_OF, alt: FAMILIES, font: cg(600), size: 31, track: 11, color: cream, x: 543, y: 148, maxW: 700 },
        { t: 'names', mode: 'stack3', font: cg(500, true), size: 112, color: cream, amp: { color: gold, scale: .75 }, x: 543, y: [292, 372, 460], maxW: 720 },
        { t: 'text', text: INVITE, font: cg(600), size: 28, track: 5, color: cream, x: 543, y: 556, maxW: 680 },
        { t: 'title', font: '%px ' + PIN, size: 134, color: gold, x: 543, y: 668, maxW: 610 }
      ].concat(column({ cx: 546, on: [750, 760, 810], at: [883, 892, 945], size: 45, labelSize: 25, font: cg(500, true), labelFont: cg(600), color: cream, accent: gold })) };
    })(),
    'cherry-blossom': (function () {
      var ink = '#6a0b14', deep = '#4a0a10';
      return { w: 1086, h: 1448, parts: [
        { t: 'text', text: 'TOGETHER WITH', font: cg(600), size: 27, track: 9, color: deep, x: 546, y: 295, maxW: 360 },
        { t: 'text', text: 'THEIR FAMILIES', font: cg(600), size: 27, track: 9, color: deep, x: 546, y: 331, maxW: 360 },
        { t: 'orn', type: 'dot', x: 543, y: 370, w: 215, color: ink },
        { t: 'names', mode: 'script', font: '%px "Italianno", "Great Vibes", cursive', size: 168, color: ink, amp: { color: ink, scale: 1 }, x: 570, y: [520], maxW: 800, bold: 0 },
        { t: 'text', text: 'invite you to celebrate with them', font: cg(500, true), size: 40, color: deep, x: 546, y: 581, maxW: 600 },
        { t: 'text', text: 'at their', font: cg(500, true), size: 40, color: deep, x: 546, y: 625, maxW: 400 },
        { t: 'title', font: '%px "Italianno", "Great Vibes", cursive', size: 215, color: ink, x: 556, y: 768, maxW: 625, bold: 0 },
        { t: 'orn', type: 'flower', x: 544, y: 838, w: 440, color: ink }
      ].concat(column({ cx: 546, on: [912, 920, 970], at: [1050, 1058, 1113], size: 45, labelSize: 24, font: cg(500, true), labelFont: cg(600), color: deep, accent: '#8a0a18' })) };
    })(),
    'lantern-night': (function () {
      var cream = '#fdf3dc', gold = '#f2c46c';
      return { w: 1086, h: 1448, shadow: true, parts: [
        { t: 'text', text: 'A NIGHT OF A THOUSAND LANTERNS', font: '600 %px ' + MONT, size: 26, track: 5, color: cream, x: 547, y: 165, maxW: 650, bold: 0 },
        { t: 'orn', type: 'diamond', x: 543, y: 206, w: 310, color: gold },
        { t: 'names', mode: 'stack', font: cg(500), size: 138, color: cream, amp: { color: gold, scale: .9, italic: true }, x: 543, y: [335, 445], maxW: 640 },
        { t: 'text', text: INVITE, font: cg(600), size: 26, track: 4, color: cream, x: 543, y: 511, maxW: 560 },
        { t: 'title', font: '%px ' + PIN, size: 124, color: gold, x: 543, y: 612, maxW: 470 }
      ].concat(column({ cx: 546, on: [677, 686, 732], at: [792, 802, 848], size: 43, labelSize: 24, font: cg(500, true), labelFont: cg(600), color: cream, accent: gold })) };
    })(),
    'under-the-same-moon': (function () {
      var cream = '#fdf8e8', gold = '#f4c040';
      return { w: 1024, h: 1536, shadow: true, parts: [
        { t: 'text', text: FAMILIES, font: cg(600), size: 27, track: 6, color: cream, x: 512, y: 402, maxW: 660 },
        { t: 'orn', type: 'star', x: 512, y: 452, w: 398, color: gold },
        { t: 'names', mode: 'inline', font: cg(500), size: 118, color: cream, amp: { color: gold, scale: .8, italic: true }, x: 512, y: 580, maxW: 790 },
        { t: 'text', text: 'invite you to celebrate with them', font: cg(500, true), size: 40, color: cream, x: 512, y: 653, maxW: 640 },
        { t: 'text', text: 'AT THEIR', font: cg(600), size: 26, track: 6, color: cream, x: 512, y: 722, maxW: 300 },
        { t: 'title', font: '%px ' + PIN, size: 142, color: gold, x: 512, y: 862, maxW: 640 }
      ].concat(split({ cx: [329, 705], y: [970, 1023, 1062], size: 41, labelSize: 24, font: cg(500, true), labelFont: cg(600), color: cream, accent: gold, iconAbove: true, rule: [517, 968, 1065], colW: 330, solo: 512 })) };
    })()
  };

  function cardArt(templateId) { return CARDS[templateId] ? '/assets/share-cards/' + templateId + '.webp' : ''; }

  var api = { events: events, message: message, mapsLink: mapsLink, dateLine: dateLine, WIDTH: WIDTH, HEIGHT: HEIGHT, splitNames: splitNames, initials: initials, cardData: cardData, cards: CARDS, cardArt: cardArt };

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

  function spaced(ctx, value, x, y, gap, weight) {
    // Capital letters with a little space between them, centred on x. weight (optional) thickens thin letters with an outline.
    var chars = value.split(''), widths = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (chars.length - 1), at = x - total / 2;
    ctx.textAlign = 'left';
    if (weight) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = weight; ctx.lineJoin = 'round'; }
    chars.forEach(function (c, i) { ctx.fillText(c, at, y); if (weight) ctx.strokeText(c, at, y); at += widths[i] + gap; });
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

  /* ---- designed cards: drawing ---- */
  var CARD_FONTS = [
    ['Playfair Display', 'playfair-display-latin-variable.woff2', '400 900', 'normal'],
    ['Cormorant Garamond', 'cormorant-garamond-latin-500-normal.woff2', '500', 'normal'],
    ['Cormorant Garamond', 'cormorant-garamond-latin-600-normal.woff2', '600', 'normal'],
    ['Cormorant Garamond', 'cormorant-garamond-latin-500-italic.woff2', '500', 'italic'],
    ['Pinyon Script', 'pinyon-script-latin-400-normal.woff2', '400', 'normal'],
    ['Italianno', 'italianno-latin-400-normal.woff2', '400', 'normal'],
    ['Great Vibes', 'great-vibes-latin-400-normal.woff2', '400', 'normal'],
    ['Montserrat', 'montserrat-latin-600-normal.woff2', '600', 'normal']
  ];
  var cardFontsReady = null;
  function loadCardFonts() {
    if (!cardFontsReady) {
      cardFontsReady = Promise.all(CARD_FONTS.map(function (f) {
        var face = new FontFace(f[0], 'url(/assets/scene-fonts/' + f[1] + ')', { weight: f[2], style: f[3] });
        return face.load().then(function (loaded) { document.fonts.add(loaded); }, function () { /* falls back to a serif */ });
      }));
    }
    return cardFontsReady;
  }

  function setFont(ctx, tpl, size) { ctx.font = tpl.replace('%', Math.round(size * 10) / 10); }
  function widthOf(ctx, str, gap) { return ctx.measureText(str).width + (gap || 0) * Math.max(0, str.length - 1); }

  // The largest size (down to min) at which the string fits maxW.
  function fitSize(ctx, str, tpl, size, maxW, track, min) {
    var s = size;
    for (; s > min; s -= 2) { setFont(ctx, tpl, s); if (widthOf(ctx, str, track * s / size) <= maxW) return s; }
    return min;
  }

  // One centred line (optionally letter-spaced) that shrinks to fit.
  function drawLine(ctx, o, str) {
    if (!str) return;
    var size = o.maxW ? fitSize(ctx, str, o.font, o.size, o.maxW, o.track || 0, Math.max(24, o.size * .5)) : o.size, gap = (o.track || 0) * size / o.size;
    setFont(ctx, o.font, size); ctx.fillStyle = o.color;
    var weight = o.bold != null ? o.bold : (o.t === 'title' ? size * .011 : .6);
    if (gap) spaced(ctx, str, o.x, o.y, gap, weight);
    else {
      ctx.textAlign = 'center'; ctx.fillText(str, o.x, o.y);
      if (weight) { ctx.strokeStyle = o.color; ctx.lineWidth = weight; ctx.lineJoin = 'round'; ctx.strokeText(str, o.x, o.y); }
    }
    ctx.textAlign = 'center';
  }

  // Wrap into at most maxLines, shrinking first and cutting with an ellipsis only as a last resort.
  function fitLines(ctx, str, tpl, size, maxW, maxLines, min) {
    if (maxLines > 1) {            // a single line at up to 22% smaller reads better than two lines
      var single = fitLines(ctx, str, tpl, size, maxW, 1, size * .78);
      if (single.lines.length === 1 && single.lines[0] === str) return single;
    }
    for (var s = size; s >= min; s -= 2) {
      setFont(ctx, tpl, s);
      var lines = wrap(ctx, str, maxW);
      if (lines.length <= maxLines && lines.every(function (l) { return ctx.measureText(l).width <= maxW; })) return { size: s, lines: lines };
    }
    setFont(ctx, tpl, min);
    var cut = wrap(ctx, str, maxW).slice(0, maxLines), last = cut[maxLines - 1] || '';
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    cut[cut.length - 1] = last + '…';
    return { size: min, lines: cut };
  }

  function paintNames(ctx, o, d) {
    if (!d.a) return;
    var a = d.a, b = d.b, mode = b ? o.mode : 'single';
    var ampTpl = o.amp.italic ? 'italic ' + o.font.replace(/^italic\s+/, '') : o.font;
    var size = o.size, w, ampSize, gap;
    function measure(tpl, sz, str) { setFont(ctx, tpl, sz); return ctx.measureText(str).width; }
    for (; size > 40; size -= 4) {
      ampSize = size * (o.amp.scale || 1); gap = size * (mode === 'script' ? .2 : .1);
      var wa = measure(o.font, size, a), wb = b ? measure(o.font, size, b) : 0, wm = measure(ampTpl, ampSize, '&'), wd = o.dot ? measure(o.font, size, '.') : 0;
      if (mode === 'stack') w = Math.max(wa + gap + wm, wb + wd);
      else if (mode === 'stack3') w = Math.max(wa, wb);
      else if (mode === 'single') w = wa;
      else w = wa + gap + wm + gap + wb;
      if (w <= o.maxW) break;
    }
    ampSize = size * (o.amp.scale || 1); gap = size * (mode === 'script' ? .2 : .1);
    ctx.textAlign = 'left';
    var weight = o.bold != null ? o.bold : size * .012;
    function put(tpl, sz, str, x, y, color) {
      setFont(ctx, tpl, sz); ctx.fillStyle = color; ctx.fillText(str, x, y);
      if (weight) { ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
      return ctx.measureText(str).width;
    }
    var wa2 = measure(o.font, size, a), wb2 = b ? measure(o.font, size, b) : 0, wm2 = measure(ampTpl, ampSize, '&'), wd2 = o.dot ? measure(o.font, size, '.') : 0;
    var y = Array.isArray(o.y) ? o.y : [o.y];
    if (mode === 'single') {
      put(o.font, size, a, o.x - wa2 / 2, y.length > 1 ? (y[0] + y[1]) / 2 : y[0], o.color);
    } else if (mode === 'stack') {
      var x1 = o.x - (wa2 + gap + wm2) / 2;
      put(o.font, size, a, x1, y[0], o.color); put(ampTpl, ampSize, '&', x1 + wa2 + gap, y[0], o.amp.color);
      var x2 = o.x - (wb2 + wd2) / 2;
      put(o.font, size, b, x2, y[1], o.color);
      if (o.dot) put(o.font, size, '.', x2 + wb2, y[1], o.dot);
    } else if (mode === 'stack3') {
      put(o.font, size, a, o.x - wa2 / 2, y[0], o.color);
      put(ampTpl, ampSize, '&', o.x - wm2 / 2, y[1], o.amp.color);
      put(o.font, size, b, o.x - wb2 / 2, y[2], o.color);
    } else {
      var x0 = o.x - (wa2 + gap + wm2 + gap + wb2) / 2;
      x0 += put(o.font, size, a, x0, y[0], o.color) + gap;
      x0 += put(ampTpl, ampSize, '&', x0, y[0], o.amp.color) + gap;
      put(o.font, size, b, x0, y[0], o.color);
    }
    ctx.textAlign = 'center';
  }

  function iconCalendar(ctx, cx, cy, s, color) {
    var w = s, h = s * .92, x = cx - w / 2, y = cy - h / 2 + s * .04, lw = Math.max(2, s * .075);
    ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.roundRect(x + lw / 2, y + lw / 2, w - lw, h - lw, s * .12); ctx.stroke();
    ctx.fillRect(x, y, w, s * .26);
    ctx.fillRect(x + w * .24, y - s * .1, lw * 1.2, s * .2); ctx.fillRect(x + w * .76 - lw * 1.2, y - s * .1, lw * 1.2, s * .2);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) ctx.fillRect(x + w * .17 + c * w * .2, y + h * .42 + r * h * .18, s * .1, s * .1);
    ctx.restore();
  }

  function iconPin(ctx, cx, cy, s, color) {
    ctx.save(); ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * .5);
    ctx.bezierCurveTo(cx - s * .56, cy + s * .02, cx - s * .42, cy - s * .5, cx, cy - s * .5);
    ctx.bezierCurveTo(cx + s * .42, cy - s * .5, cx + s * .56, cy + s * .02, cx, cy + s * .5);
    ctx.closePath();
    ctx.moveTo(cx + s * .17, cy - s * .2); ctx.arc(cx, cy - s * .2, s * .17, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
  }

  function paintInfo(ctx, o, d) {
    var value = o.kind === 'when' ? d.when : d.venue;
    if (!value) return;
    var both = d.when && d.venue, cx = !both && o.solo ? o.solo : o.cx;
    var lines = [], size = o.size, second = '';
    if (o.kind === 'when') {
      if (o.lines === 'two') {
        var fit = fitLines(ctx, value.two[0], o.font, o.size, o.maxW, 1, o.size * .6); size = fit.size; lines = fit.lines; second = value.two[1];
      } else { var one = fitLines(ctx, value.one, o.font, o.size, o.maxW, 1, o.size * .6); size = one.size; lines = one.lines; }
    } else { var f = fitLines(ctx, value, o.font, o.size, o.maxW, o.maxLines, o.size * .7); size = f.size; lines = f.lines; }
    // The label (ON / AT) with its icon, either side by side or one above the other.
    var ls = o.labelSize, gap = ls * .55, lt = o.label;
    setFont(ctx, o.labelFont, ls);
    var lw = widthOf(ctx, lt, o.track), icon = o.kind === 'when' ? iconCalendar : iconPin, is = o.iconSize;
    ctx.fillStyle = o.color;
    if (o.iconAbove) {
      icon(ctx, cx, o.iconY, is, o.iconColor);
      spaced(ctx, lt, cx, o.labelY, o.track);
    } else {
      var start = cx - (is + gap + lw) / 2;
      icon(ctx, start + is / 2, o.iconY, is, o.iconColor);
      ctx.fillStyle = o.color; setFont(ctx, o.labelFont, ls);
      spaced(ctx, lt, start + is + gap + lw / 2, o.labelY, o.track);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = o.color; setFont(ctx, o.font, size);
    var lh = o.lh || size * 1.12, y = o.valueY - (lines.length - 1) * (o.up || 0);
    ctx.strokeStyle = o.color; ctx.lineWidth = .8; ctx.lineJoin = 'round';
    lines.forEach(function (line, i) { ctx.fillText(line, cx, y + i * lh); ctx.strokeText(line, cx, y + i * lh); });
    if (second) { setFont(ctx, o.font, size * .78); ctx.globalAlpha = .9; ctx.fillText(second, cx, y + (lines.length - 1) * lh + size * .86); ctx.globalAlpha = 1; }
  }

  function fadeLine(ctx, x0, x1, y, color, fadeLeft) {
    var g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(fadeLeft ? 0 : 1, color + '00'); g.addColorStop(fadeLeft ? .45 : .55, color); g.addColorStop(fadeLeft ? 1 : 0, color);
    ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), y - 1.5, Math.abs(x1 - x0), 3);
  }

  function polygon(ctx, points, color) {
    ctx.fillStyle = color; ctx.beginPath();
    points.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.closePath(); ctx.fill();
  }

  function paintOrn(ctx, o) {
    var x = o.x, y = o.y, half = o.w / 2, c = o.color;
    if (o.type === 'dot') {
      fadeLine(ctx, x - half, x, y, c, true); fadeLine(ctx, x, x + half, y, c, false);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); return;
    }
    var gap = o.type === 'flower' ? 62 : 28;
    fadeLine(ctx, x - half, x - gap, y, c, true); fadeLine(ctx, x + gap, x + half, y, c, false);
    if (o.type === 'diamond') polygon(ctx, [[x, y - 14], [x + 14, y], [x, y + 14], [x - 14, y]], c);
    else if (o.type === 'star') polygon(ctx, [[x, y - 20], [x + 5, y - 5], [x + 20, y], [x + 5, y + 5], [x, y + 20], [x - 5, y + 5], [x - 20, y], [x - 5, y - 5]], c);
    else if (o.type === 'flower') {
      for (var k = 0; k < 5; k++) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(k * Math.PI * 2 / 5 - Math.PI / 2);
        ctx.fillStyle = '#f8b8c8'; ctx.strokeStyle = '#e07a95'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(0, -16, 11, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = '#d2506e'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function paint(ctx, L, d) {
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    if (L.shadow) { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2; }
    L.parts.forEach(function (o) {
      if (o.t === 'text') drawLine(ctx, o, !d.wedding && o.alt ? o.alt : o.text);
      else if (o.t === 'mono') drawLine(ctx, o, d.initials);
      else if (o.t === 'names') paintNames(ctx, o, d);
      else if (o.t === 'title') drawLine(ctx, o, d.title);
      else if (o.t === 'orn') paintOrn(ctx, o);
      else if (o.t === 'info') paintInfo(ctx, o, d);
      else if (o.t === 'rule' && d.when && d.venue) { ctx.fillStyle = o.color; ctx.globalAlpha = .85; ctx.fillRect(o.x - 1, o.y0, 2.2, o.y1 - o.y0); ctx.globalAlpha = 1; }
    });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }

  function drawDesigned(opts) {
    var L = CARDS[opts.templateId];
    return Promise.all([loadCardFonts(), loadImage(opts.art)]).then(function (parts) {
      var canvas = document.createElement('canvas');
      canvas.width = L.w; canvas.height = L.h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(parts[1], 0, 0, L.w, L.h);
      paint(ctx, L, cardData(opts.names, opts.event));
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('Could not make the picture')); }, 'image/png');
      });
    });
  }

  // opts: { templateId, art (picture address), names, event }. A design with its own card gets it; any other design gets the generic card.
  function draw(opts) {
    if (opts.templateId && CARDS[opts.templateId]) return drawDesigned(opts);
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

  function open(project, extra) {
    if (!project || typeof renderModal !== 'function') return;
    extra = extra || {};
    var url = extra.url || '';
    var list = events(project);
    var state = { index: 0, blob: null, objectUrl: '', token: 0 };
    var names = text(project.title);
    var designedArt = cardArt(project.templateId) ? cardArt(project.templateId) + V : '';

    function close() { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); if (typeof closeModal === 'function') closeModal(); }
    function $(sel) { return document.querySelector('#modal-root ' + sel); }

    function shell(inner) {
      renderModal('<div class="eyebrow">Share on WhatsApp</div><h2 id="modal-title">Your share card</h2>' + inner +
        '<div class="modal-actions" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"><button class="btn" type="button" data-sc-close>Close</button></div>');
      $('[data-sc-close]').addEventListener('click', close);
    }

    shell('<p class="muted" role="status">Getting your card ready…</p>');
    if (!list.length) {
      shell('<p data-sc-empty>Add the date and place of an event in the editor first, then your card will be ready here.</p>');
    } else {
      render();
    }

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
      draw({ art: designedArt || extra.art, templateId: designedArt ? project.templateId : '', names: names, event: event }).then(function (blob) {
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
