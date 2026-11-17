/* © 2026 InviteStudio. The owner's overview page (/admin). Everything shown is written as plain text, never as HTML,
 * because couples' names and places are typed by visitors. */
(function () {
  'use strict';
  var main = document.getElementById('main');
  var who = document.getElementById('who');
  var logout = document.getElementById('logout');
  var data = null, filter = 'all', query = '', sortBy = 'edited', trafficDays = 30;
  // The owner's own visits should not count as visitors: this browser stops reporting page views (analytics.js).
  try { window.localStorage.setItem('invitestudio-no-track', '1'); } catch (e) { /* the owner's visits may then be counted */ }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'class') node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    [].concat(children || []).forEach(function (child) { if (child != null) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function number(n) { return new Intl.NumberFormat('en-IN').format(n || 0); }
  function money(minor, currency) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR' }).format((minor || 0) / 100); } catch (e) { return (minor / 100) + ' ' + currency; }
  }
  function day(value) { return value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
  function ago(value) {
    if (!value) return '—';
    var minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 60) return minutes + ' min ago';
    if (minutes < 1440) return Math.round(minutes / 60) + ' h ago';
    return Math.round(minutes / 1440) + ' d ago';
  }

  function message(title, body, action) {
    clear(main);
    main.appendChild(el('div', { class: 'center' }, [el('h2', { text: title }), el('p', { class: 'muted', text: body }), action || null]));
  }

  function card(value, label, sub) {
    return el('div', { class: 'card' }, [el('div', { class: 'n', text: value }), el('div', { class: 'l', text: label }), sub ? el('div', { class: 's', text: sub }) : null]);
  }

  function statusOf(site) {
    if (site.status === 'published' && site.visibility === 'public') return 'live';
    if (site.status === 'draft') return 'private';
    return 'offline';
  }
  var STATUS_TEXT = { live: 'Live', private: 'Private', offline: 'Offline' };
  function daysSince(value) { return value ? Math.floor((Date.now() - new Date(value).getTime()) / 86400000) : 0; }
  function daysUntil(date) { return date ? Math.ceil((new Date(date + 'T00:00:00').getTime() - Date.now()) / 86400000) : null; }
  // Filters beyond the status: private drafts nobody has touched for a week, and events that are close but not live.
  var FILTERS = {
    all: function () { return true; },
    live: function (s) { return statusOf(s) === 'live'; },
    private: function (s) { return statusOf(s) === 'private'; },
    offline: function (s) { return statusOf(s) === 'offline'; },
    idle: function (s) { return s.status === 'draft' && daysSince(s.updated_at) >= 7; },
    soon: function (s) { var d = daysUntil(s.event_date); return d !== null && d >= 0 && d <= 30 && statusOf(s) !== 'live'; }
  };
  var FILTER_LABELS = { all: 'All', live: 'Live', private: 'Private', offline: 'Offline', idle: 'Idle 7+ days', soon: 'Event within 30 days' };
  var SORTS = {
    edited: function (a, b) { return new Date(b.updated_at) - new Date(a.updated_at); },
    idle: function (a, b) { return new Date(a.updated_at) - new Date(b.updated_at); },
    event: function (a, b) { return (a.event_date ? new Date(a.event_date) : 8e15) - (b.event_date ? new Date(b.event_date) : 8e15); }
  };

  function table(headers, rows) {
    return el('div', { class: 'wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, headers.map(function (h) { return el('th', { text: h }); }))),
      el('tbody', {}, rows)
    ]));
  }

  // The buyer's name, email and phone (asked for before paying), shown on request; each look is logged on the server.
  function contactCell(site) {
    var box = el('div', {});
    var button = el('button', { type: 'button', class: 'chip', text: 'Show contact' });
    button.addEventListener('click', function () {
      button.disabled = true;
      fetch('/api/admin/contact', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: site.id }) })
        .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
        .then(function (result) {
          clear(box);
          if (!result.ok) { box.appendChild(el('span', { class: 'error small', text: 'Could not load.' })); return; }
          var c = result.body.contact;
          if (!c) { box.appendChild(el('span', { class: 'small muted', text: 'None yet (they have not reached payment).' })); return; }
          var digits = c.phone.replace(/\D/g, '');
          box.appendChild(el('div', {}, el('strong', { text: c.name })));
          box.appendChild(el('div', { class: 'small' }, el('a', { href: 'mailto:' + encodeURIComponent(c.email), text: c.email })));
          if (c.phone) box.appendChild(el('div', { class: 'small' }, el('a', { href: 'https://wa.me/' + digits, target: '_blank', rel: 'noopener noreferrer', text: c.phone })));
          box.appendChild(el('div', { class: 'small muted', text: c.marketing ? 'OK to send tips and reminders' : 'No reminders: they did not tick the box' }));
        }, function () { clear(box); box.appendChild(el('span', { class: 'error small', text: 'Could not load.' })); });
    });
    box.appendChild(button);
    return box;
  }

  // A private editing link is made fresh on request (existing links are stored only as hashes and cannot be shown).
  function privateLinkCell(site) {
    var box = el('div', {});
    var button = el('button', { type: 'button', class: 'chip', text: 'Create link' });
    button.addEventListener('click', function () {
      button.disabled = true; button.textContent = 'Creating…';
      fetch('/api/admin/private-link', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: site.id }) })
        .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
        .then(function (result) {
          clear(box);
          if (!result.ok) { box.appendChild(el('span', { class: 'error small', text: 'Could not create the link.' })); return; }
          var input = el('input', { type: 'text', readonly: 'readonly', value: result.body.link, 'aria-label': 'Private link for ' + (site.title || 'this website'), class: 'linkbox' });
          var copy = el('button', { type: 'button', class: 'chip', text: 'Copy' });
          copy.addEventListener('click', function () {
            (navigator.clipboard ? navigator.clipboard.writeText(result.body.link) : Promise.reject()).then(
              function () { copy.textContent = 'Copied'; }, function () { input.select(); copy.textContent = 'Select and copy'; });
          });
          var open = el('a', { class: 'chip btn-link', href: result.body.link, target: '_blank', rel: 'noopener noreferrer', text: 'Open editor' });
          box.appendChild(input); box.appendChild(copy); box.appendChild(open);
          box.appendChild(el('div', { class: 'small muted', text: 'Anyone with this link can edit the website and see its guest replies. Works for 90 days. Open it in a private window so it does not mix with your own drafts.' }));
        }, function () { clear(box); box.appendChild(el('span', { class: 'error small', text: 'Could not create the link.' })); });
    });
    box.appendChild(button);
    return box;
  }

  // How far along a website is, and how long it has been quiet, to tell who needs a nudge.
  function progressCell(site) {
    if (site.events === undefined) return '';   // the database has not had the progress migration yet (docs/ADMIN.md)
    var parts = [site.has_story ? 'story' : 'no story', (site.events || 0) + ' event' + (site.events === 1 ? '' : 's'), (site.photos || 0) + ' photo' + (site.photos === 1 ? '' : 's')];
    var idle = daysSince(site.updated_at), until = daysUntil(site.event_date);
    var note = statusOf(site) === 'live' ? '' : (idle >= 1 ? 'idle ' + idle + ' d' : 'edited today') + (until !== null && until >= 0 ? ' · event in ' + until + ' d' : '');
    return [el('div', { class: 'small', text: parts.join(' · ') }), note ? el('div', { class: 'small muted', text: note }) : null];
  }

  function siteRow(site) {
    var status = statusOf(site);
    var link = status === 'live' && site.slug ? el('a', { href: '/s/' + encodeURIComponent(site.slug), target: '_blank', rel: 'noopener', text: '/s/' + site.slug }) : el('span', { class: 'muted', text: site.slug ? '/s/' + site.slug : '—' });
    var replies = site.replies
      ? site.replies + ' repl' + (site.replies === 1 ? 'y' : 'ies') + ' · ' + site.attending + ' coming · ' + site.guests + ' guest' + (site.guests === 1 ? '' : 's')
      : '—';
    return el('tr', {}, [
      el('td', {}, [el('strong', { text: site.title || site.name || 'Untitled' }), el('div', { class: 'small muted', text: [site.event_date ? day(site.event_date + 'T00:00:00') : '', site.location || ''].filter(Boolean).join(' · ') })]),
      el('td', { text: site.template_name || site.template_id }),
      el('td', {}, el('span', { class: 'badge ' + status, text: STATUS_TEXT[status] })),
      el('td', {}, progressCell(site)),
      el('td', {}, link),
      el('td', { text: site.unlocked ? (site.paid_minor ? money(site.paid_minor, site.paid_currency) : 'Yes') : '—' }),
      el('td', { text: replies }),
      el('td', {}, [day(site.created_at), el('div', { class: 'small muted', text: 'edited ' + ago(site.updated_at) })]),
      el('td', {}, contactCell(site)),
      el('td', {}, privateLinkCell(site))
    ]);
  }

  function sitesSection() {
    var wrap = el('div', {});
    var list = el('div', {});
    function paint() {
      var q = query.trim().toLowerCase();
      var rows = data.sites.filter(function (s) {
        if (!FILTERS[filter](s)) return false;
        return !q || [s.title, s.name, s.slug, s.location, s.template_name].join(' ').toLowerCase().indexOf(q) !== -1;
      });
      rows.sort(SORTS[sortBy]);
      clear(list);
      list.appendChild(table(['Couple', 'Design', 'Status', 'Progress', 'Link', 'Paid', 'Replies', 'Created', 'Contact', 'Private link'], rows.map(siteRow)));
      if (!rows.length) list.appendChild(el('p', { class: 'muted', text: 'No websites match.' }));
      if (data.sites.length >= 500) list.appendChild(el('p', { class: 'small muted', text: 'Showing the 500 most recently edited websites.' }));
      count.textContent = rows.length + ' of ' + data.sites.length;
    }
    var count = el('span', { class: 'small muted' });
    var search = el('input', { type: 'search', placeholder: 'Search by names, place, address or design', 'aria-label': 'Search websites' });
    search.addEventListener('input', function () { query = search.value; paint(); });
    var keys = Object.keys(FILTER_LABELS);
    var chips = keys.map(function (key) {
      var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(key === filter), text: FILTER_LABELS[key] });
      chip.addEventListener('click', function () { filter = key; chips.forEach(function (c, i) { c.setAttribute('aria-pressed', String(keys[i] === key)); }); paint(); });
      return chip;
    });
    var sorter = el('select', { 'aria-label': 'Sort websites' }, [
      el('option', { value: 'edited', text: 'Recently edited' }), el('option', { value: 'idle', text: 'Longest idle' }), el('option', { value: 'event', text: 'Event date, soonest' })
    ]);
    sorter.addEventListener('change', function () { sortBy = sorter.value; paint(); });
    wrap.appendChild(el('div', { class: 'tools' }, [search].concat(chips, [sorter, count])));
    wrap.appendChild(list);
    paint();
    return wrap;
  }


  // ---- Visitors: anonymous visit statistics (docs/ANALYTICS.md) ----
  var DESIGN_NAMES = { 13: 'Modern Heritage', 14: 'Minimalist', 15: 'Cinematic', 16: 'Fairy Tale', 18: 'Bloom Reveal', 19: 'Velvet Reveal', 20: 'Under the Same Moon', 21: 'Golden Butterfly', 22: 'Cherry Blossom', 23: 'Lantern Night' };
  var COUNTRY_NAMES = (function () { try { return new Intl.DisplayNames(undefined, { type: 'region' }); } catch (e) { return null; } })();
  function countryName(code) { try { return (COUNTRY_NAMES && code && code !== '??' && COUNTRY_NAMES.of(code)) || code; } catch (e) { return code; } }
  function percent(part, whole) { return whole ? Math.round((part / whole) * 100) + '%' : '—'; }

  // A small table with a bar behind each number. rows: [{ name, value, extra }]
  function barList(title, rows, total) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var box = el('div', { class: 'card tbl' }, [el('div', { class: 'l', text: title })]);
    if (!rows.length) box.appendChild(el('div', { class: 'small muted', text: 'Nothing yet.' }));
    rows.forEach(function (r) {
      var bar = el('i', {}); bar.style.width = Math.max(2, (r.value / max) * 100) + '%';
      box.appendChild(el('div', { class: 'row' }, [
        el('div', { class: 'bar' }, bar),
        el('span', { class: 'nm', text: r.name }),
        el('span', { class: 'nv', text: number(r.value) + (total ? ' · ' + percent(r.value, total) : '') + (r.extra ? ' · ' + r.extra : '') })
      ]));
    });
    return box;
  }

  function trafficSection() {
    var wrap = el('div', {});
    var body = el('div', {}, el('p', { class: 'muted', text: 'Loading visitors…' }));
    var chips = [7, 30, 90].map(function (n) {
      var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(n === trafficDays), text: 'Last ' + n + ' days' });
      chip.addEventListener('click', function () { trafficDays = n; chips.forEach(function (c, i) { c.setAttribute('aria-pressed', String([7, 30, 90][i] === n)); }); load(); });
      return chip;
    });
    wrap.appendChild(el('div', { class: 'tools' }, chips));
    wrap.appendChild(body);

    function paint(t) {
      clear(body);
      var visitors = t.totals.visitors;
      body.appendChild(el('div', { class: 'cards' }, [
        card(number(visitors), 'Visitors', 'unique per day, added up'),
        card(number(t.totals.pageviews), 'Page views'),
        card(number(t.totals.invitationViews), 'Invitation views', number(t.totals.invitationVisitors) + ' visitors to published invitations'),
        card(visitors ? (t.totals.pageviews / visitors).toFixed(1) : '—', 'Pages per visitor')
      ]));

      var max = Math.max.apply(null, t.daily.map(function (d) { return d.visitors; }).concat([1]));
      var bars = el('div', { class: 'bars', role: 'img', 'aria-label': 'Visitors each day' });
      t.daily.forEach(function (d) {
        var b = el('div', { title: day(d.day + 'T00:00:00') + ': ' + d.visitors + ' visitors, ' + d.pageviews + ' page views' });
        b.style.height = Math.max(2, (d.visitors / max) * 100) + '%';
        bars.appendChild(b);
      });
      body.appendChild(el('div', { style: 'margin-top:12px' }, [bars, el('p', { class: 'legend', text: 'Visitors per day, last ' + t.days + ' days.' })]));

      var f = t.funnel;
      body.appendChild(el('h2', { text: 'From visit to live website' }));
      body.appendChild(table(['Step', 'People', 'Of visitors'], [
        ['Visited the site', f.visitors], ['Looked at a design', f.viewedADesign], ['Started a draft', f.draftsCreated], ['Paid', f.paid], ['Made it live', f.wentLive]
      ].map(function (r) { return el('tr', {}, [el('td', { text: r[0] }), el('td', { text: number(r[1]) }), el('td', { text: percent(r[1], f.visitors) })]); })));
      body.appendChild(el('p', { class: 'small muted', text: 'Visits are counted per day; drafts, payments and live websites are counted in the same period from the database, so a draft may be from someone who visited earlier.' }));

      var grid = el('div', { class: 'grid3' }, [
        barList('Pages', t.pages.map(function (r) { return { name: r.path, value: r.views, extra: number(r.visitors) + ' visitors' }; })),
        barList('Where visitors come from', t.referrers.map(function (r) { return { name: r.name, value: r.visitors }; }), visitors),
        barList('Countries', t.countries.map(function (r) { return { name: countryName(r.name), value: r.visitors }; }), visitors),
        barList('Devices', t.devices.map(function (r) { return { name: r.name.charAt(0).toUpperCase() + r.name.slice(1), value: r.visitors }; }), visitors),
        barList('Browsers', t.browsers.map(function (r) { return { name: r.name, value: r.visitors }; }), visitors),
        barList('Systems', t.systems.map(function (r) { return { name: r.name, value: r.visitors }; }), visitors),
        barList('Screen width (pixels)', t.screens.map(function (r) { return { name: r.name, value: r.visitors }; }), visitors),
        barList('Languages', t.languages.map(function (r) { return { name: r.name, value: r.visitors }; }), visitors),
        barList('Designs looked at', t.designs.map(function (r) { return { name: DESIGN_NAMES[r.number] || 'Design ' + r.number, value: r.views, extra: number(r.visitors) + ' visitors' }; })),
        barList('Campaign links (utm_)', t.campaigns.map(function (r) { return { name: [r.source, r.medium, r.campaign].filter(Boolean).join(' / '), value: r.visitors }; })),
        barList('Published invitations viewed', t.invitations.map(function (r) { return { name: '/s/' + r.slug, value: r.views, extra: number(r.visitors) + ' visitors' }; }))
      ]);
      body.appendChild(grid);
      body.appendChild(el('p', { class: 'small muted', text: 'Anonymous: no cookies, no addresses, no user-agent text are stored. A visitor is a hash that changes every day. Visitors who send Do Not Track and your own browsers are not counted.' }));
    }

    function load() {
      clear(body); body.appendChild(el('p', { class: 'muted', text: 'Loading visitors…' }));
      fetch('/api/admin/traffic?days=' + trafficDays, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
        .then(function (response) { return response.json().catch(function () { return null; }).then(function (b) { return { status: response.status, body: b }; }); })
        .then(function (result) {
          if (result.status === 200 && result.body && result.body.totals) return paint(result.body);
          clear(body);
          body.appendChild(el('p', { class: 'error', text: result.status === 502 ? 'Visitors are not available yet. Run the analytics migration in Supabase (docs/ANALYTICS.md).' : 'Could not load the visitors.' }));
        }, function () { clear(body); body.appendChild(el('p', { class: 'error', text: 'Could not load the visitors.' })); });
    }
    load();
    return wrap;
  }

  function chart() {
    var max = Math.max.apply(null, data.daily.map(function (d) { return Math.max(d.created, d.live); }).concat([1]));
    var bars = el('div', { class: 'bars', role: 'img', 'aria-label': 'Websites created and made live each day for 30 days' });
    data.daily.forEach(function (d) {
      var created = el('div', { title: day(d.day + 'T00:00:00') + ': ' + d.created + ' created, ' + d.live + ' made live' });
      created.style.height = Math.max(2, (d.created / max) * 100) + '%';
      var live = el('div', { class: 'live', title: day(d.day + 'T00:00:00') + ': ' + d.live + ' made live' });
      live.style.height = Math.max(2, (d.live / max) * 100) + '%';
      bars.appendChild(created); bars.appendChild(live);
    });
    return el('div', {}, [bars, el('p', { class: 'legend', text: 'Last 30 days. Green: websites created. Gold: websites made live.' })]);
  }

  function render() {
    var t = data.totals;
    who.textContent = data.admin;
    logout.hidden = false;
    clear(main);
    var revenue = data.revenue.length ? data.revenue.map(function (r) { return money(r.amountMinor, r.currency); }).join(' + ') : '—';
    var payments = data.revenue.reduce(function (n, r) { return n + r.payments; }, 0);
    main.appendChild(el('div', { class: 'cards' }, [
      card(number(t.live), 'Live websites', number(t.liveSince7d) + ' went live this week'),
      card(number(t.private), 'Private drafts', 'not shared yet'),
      card(number(t.offline), 'Taken offline'),
      t.idleDrafts7d === undefined ? null : card(number(t.idleDrafts7d), 'Idle private drafts', 'not edited for 7+ days'),
      t.eventSoonNotLive === undefined ? null : card(number(t.eventSoonNotLive), 'Event soon, not live', 'within 30 days'),
      card(number(t.sites), 'All websites', number(t.createdToday) + ' today · ' + number(t.created7d) + ' this week · ' + number(t.created30d) + ' this month'),
      card(number(t.unlocked), 'Paid', number(payments) + ' payment' + (payments === 1 ? '' : 's')),
      card(revenue, 'Revenue'),
      card(number(t.replies), 'Guest replies', number(t.attendingReplies) + ' coming · ' + number(t.guestsComing) + ' guests')
    ]));
    main.appendChild(el('h2', { text: 'Visitors' }));
    main.appendChild(trafficSection());
    main.appendChild(el('h2', { text: 'Websites created and made live, last 30 days' }));
    main.appendChild(chart());
    main.appendChild(el('h2', { text: 'Designs' }));
    main.appendChild(table(['Design', 'Websites', 'Live', 'Paid'], data.byDesign.map(function (d) {
      return el('tr', {}, [el('td', { text: d.name }), el('td', { text: number(d.sites) }), el('td', { text: number(d.live) }), el('td', { text: number(d.paid) })]);
    })));
    main.appendChild(el('h2', { text: 'Websites' }));
    main.appendChild(sitesSection());
    main.appendChild(el('p', { class: 'small muted', text: 'Guest replies are only counted here. Guests’ names and details are not shown. Updated ' + ago(data.asOf) + '.' }));
  }

  function signInCard(denied) {
    var signIn = el('a', { class: 'btn dark', href: '/api/admin/login', text: 'Sign in with Google' });
    message('Admin', denied ? 'That Google account does not have access.' : 'Sign in with the owner’s Google account.', signIn);
    if (denied) main.querySelector('p').className = 'error';
  }

  function load() {
    var denied = /[?&]denied=1/.test(location.search);
    fetch('/api/admin/overview', { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (body) { return { status: response.status, body: body }; });
    }).then(function (result) {
      if (result.status === 401) return signInCard(denied);
      if (result.status === 503) {
        var error = (result.body && result.body.error) || {};
        var missing = error.fields && error.fields.missing;
        if (error.code === 'BACKEND_NOT_CONFIGURED') return message('Not set up yet', 'The database settings (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are missing in Cloudflare.');
        message('Not set up yet', 'The admin page needs its Google sign-in settings in Cloudflare (see docs/ADMIN.md).' + (missing && missing.length ? ' Missing or too short: ' + missing.join(', ') + '. Add them under Production, then redeploy.' : ''));
        return;
      }
      if (result.status !== 200 || !result.body) return message('Could not load', 'Something went wrong. Reload the page to try again.');
      data = result.body;
      render();
    }, function () { message('Could not load', 'Check your connection and reload the page.'); });
  }

  logout.addEventListener('click', function () {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { location.href = '/admin'; });
  });
  load();
})();
