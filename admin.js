/* © 2026 InviteStudio. The owner's overview page (/admin). Everything shown is written as plain text, never as HTML,
 * because couples' names and places are typed by visitors. */
(function () {
  'use strict';
  var main = document.getElementById('main');
  var who = document.getElementById('who');
  var logout = document.getElementById('logout');
  var data = null, filter = 'all', query = '';

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

  function table(headers, rows) {
    return el('div', { class: 'wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, headers.map(function (h) { return el('th', { text: h }); }))),
      el('tbody', {}, rows)
    ]));
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
      el('td', {}, link),
      el('td', { text: site.unlocked ? (site.paid_minor ? money(site.paid_minor, site.paid_currency) : 'Yes') : '—' }),
      el('td', { text: replies }),
      el('td', {}, [day(site.created_at), el('div', { class: 'small muted', text: 'edited ' + ago(site.updated_at) })])
    ]);
  }

  function sitesSection() {
    var wrap = el('div', {});
    var list = el('div', {});
    function paint() {
      var q = query.trim().toLowerCase();
      var rows = data.sites.filter(function (s) {
        if (filter !== 'all' && statusOf(s) !== filter) return false;
        return !q || [s.title, s.name, s.slug, s.location, s.template_name].join(' ').toLowerCase().indexOf(q) !== -1;
      });
      clear(list);
      list.appendChild(table(['Couple', 'Design', 'Status', 'Link', 'Paid', 'Replies', 'Created'], rows.map(siteRow)));
      if (!rows.length) list.appendChild(el('p', { class: 'muted', text: 'No websites match.' }));
      if (data.sites.length >= 500) list.appendChild(el('p', { class: 'small muted', text: 'Showing the 500 most recently edited websites.' }));
      count.textContent = rows.length + ' of ' + data.sites.length;
    }
    var count = el('span', { class: 'small muted' });
    var search = el('input', { type: 'search', placeholder: 'Search by names, place, address or design', 'aria-label': 'Search websites' });
    search.addEventListener('input', function () { query = search.value; paint(); });
    var chips = ['all', 'live', 'private', 'offline'].map(function (key) {
      var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(key === filter), text: key === 'all' ? 'All' : STATUS_TEXT[key] });
      chip.addEventListener('click', function () { filter = key; chips.forEach(function (c, i) { c.setAttribute('aria-pressed', String(['all', 'live', 'private', 'offline'][i] === key)); }); paint(); });
      return chip;
    });
    wrap.appendChild(el('div', { class: 'tools' }, [search].concat(chips, [count])));
    wrap.appendChild(list);
    paint();
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
      card(number(t.sites), 'All websites', number(t.createdToday) + ' today · ' + number(t.created7d) + ' this week · ' + number(t.created30d) + ' this month'),
      card(number(t.unlocked), 'Paid', number(payments) + ' payment' + (payments === 1 ? '' : 's')),
      card(revenue, 'Revenue'),
      card(number(t.replies), 'Guest replies', number(t.attendingReplies) + ' coming · ' + number(t.guestsComing) + ' guests')
    ]));
    main.appendChild(el('h2', { text: 'Last 30 days' }));
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
      if (result.status === 503) return message('Not set up yet', 'The admin page needs its Google sign-in settings in Cloudflare. See docs/ADMIN.md.');
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
