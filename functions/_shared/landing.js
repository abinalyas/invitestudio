// Search-intent landing pages: one real, server-rendered page for each thing people search for or ask an assistant
// ("digital wedding invitation", "wedding invitation with RSVP", ...). Each has its own angle and its own content, so none repeats another.
// Rules: say only what the product does today (docs/PRODUCT_DECISIONS.md, docs/PRICING_PLAN.md, docs/RSVP_PLAN.md) and show no
// price (prices differ by country and are placeholders). The template ids must exist in seo.js TEMPLATES (tests/unit/seo.test.mjs).

export const LANDING = Object.freeze([
  {
    slug: 'wedding-invitation-website',
    title: 'Wedding invitation website builder — InviteStudio',
    description: 'Build a wedding invitation website with your story, events, photos and RSVP. Pick an animated template, preview it free and share one link with guests.',
    h1: 'A wedding invitation website, made in minutes',
    lead: 'Put everything your guests need on one beautiful page: who is getting married, when and where, the schedule, photos and a way to reply. InviteStudio gives you a designed, animated wedding invitation website to fill in, not a blank page to design.',
    picks: [13, 14, 9],
    sections: [
      { h2: 'What goes on your wedding invitation website', p: ['Your names and date, a short story, the events of the day with times and venues, travel details, a photo gallery and a way for guests to reply. Each template arranges these in its own style, so you choose a look and add your details.'], list: ['Names, date and a live countdown (on templates that have one)', 'A schedule of events, with venues and times', 'Photos of the two of you', 'Guest replies (RSVP) collected for you'] },
      { h2: 'Why a website instead of only a printed card', p: ['A website can change after you send it. If a time moves or a venue is added, you update the page and every guest sees the latest. It also holds the details a card has no room for, such as travel and a full schedule, and guests can answer from their phone without posting anything back.'] },
      { h2: 'How it works', ol: ['Choose a template and open it.', 'Add your names, date, events and photos. Your draft saves as you go.', 'Preview it privately, as many times as you like.', 'Publish and share the link.'] },
      { h2: 'Cost', p: ['Building and previewing is free. You pay once, when you publish, and the price depends on the design you choose and where you are. There is no subscription. Your invitation stays online until 2 months after your event.'] }
    ],
    faq: [
      ['Do I need to know how to design or code?', 'No. Templates are designed for you. You change the words, dates, photos and event details, and each template keeps its own colours and fonts.'],
      ['Can I use my own domain name?', 'Not yet. Every invitation gets its own InviteStudio link to share with your guests.'],
      ['Can I see it before my guests do?', 'Yes. You can preview your invitation privately and only publish when you are happy with it.']
    ]
  },
  {
    slug: 'digital-wedding-invitation',
    title: 'Digital wedding invitation to share online — InviteStudio',
    description: 'Send a digital wedding invitation guests open on their phones: animated, with events, photos and RSVP. Share one link by message or email.',
    h1: 'A digital wedding invitation guests open on their phones',
    lead: 'A digital wedding invitation is an invitation your guests open as a link instead of a card in the post. InviteStudio makes it a full, scrolling, animated page that looks right on any phone, and lets guests reply from it.',
    picks: [12, 17, 10],
    sections: [
      { h2: 'Made for the phone in your guest’s hand', p: ['Most guests will open your invitation on a phone, so the templates are built mobile first. Sections appear as guests scroll. Guests who have reduced motion turned on in their device settings see the invitation without the animation.'] },
      { h2: 'Everything in one link', p: ['Instead of sending a photo of a card, a map, a schedule and a form separately, you send one link. The invitation holds the details, and guests reply there.'], list: ['Event schedule, venues and travel details', 'Your photos', 'RSVP: name, whether they are coming and how many', 'A preview of your title, date and place when the link is shared in a chat'] },
      { h2: 'Digital, printed, or both', p: ['Many couples send the link to most guests and a printed card to those who prefer paper. The link can also be shared again later, for example as a reminder with the schedule.'] },
      { h2: 'Try it first', p: ['You can build and preview a digital wedding invitation free. You pay only when you publish, once, with no subscription.'] }
    ],
    faq: [
      ['What is a digital wedding invitation?', 'It is a wedding invitation sent as a link or file instead of on paper. On InviteStudio it is a designed web page with your details, photos and a way to reply.'],
      ['Do guests need to install an app or sign up?', 'No. Guests open the link in their phone’s browser and can reply without creating an account.'],
      ['How do I send it?', 'Publish your invitation, copy its link, and share it by message, email or any way you already contact your guests.']
    ]
  },
  {
    slug: 'online-wedding-invitation-with-rsvp',
    title: 'Online wedding invitation with RSVP — InviteStudio',
    description: 'Collect wedding RSVPs on your invitation itself: guests give their name, whether they are coming and how many. See every reply and download a spreadsheet.',
    h1: 'An online wedding invitation with RSVP built in',
    lead: 'Guests reply on the invitation itself, so you do not chase answers across chats and emails. Every reply appears in one list in your editor.',
    picks: [11, 13, 14],
    sections: [
      { h2: 'What guests are asked', p: ['The reply form is short on purpose, so people actually fill it in.'], list: ['Their name', 'Whether they are coming or not', 'How many people are coming (you set the maximum)', 'Any meal or access needs', 'An optional message for you'] },
      { h2: 'What you get', p: ['All replies are listed in your editor as they arrive. Download them as a spreadsheet to plan catering and seating. If you would rather not take replies on the page, you can switch RSVP off and ask guests to contact you instead.'] },
      { h2: 'How it fits in', ol: ['Choose a template and add your details.', 'Publish your invitation.', 'Share the link. Guests reply from it.', 'Check your replies in the editor and download them when you need to.'] },
      { h2: 'Who sees the replies', p: ['Replies are not shown on the invitation. Only you can see them, through your private editing link.'] }
    ],
    faq: [
      ['Can guests RSVP without an account?', 'Yes. They open your link and reply with their name and answer. No sign-up is needed.'],
      ['Can I download the guest list?', 'Yes. Every reply can be downloaded as a spreadsheet.'],
      ['Can I turn RSVP off?', 'Yes. You can switch replies off and ask guests to contact you another way.']
    ]
  },
  {
    slug: 'animated-wedding-invitation',
    title: 'Animated wedding invitation templates — InviteStudio',
    description: 'Animated wedding invitations that open with curtains, a short film of butterflies or blossom, or a gold foil to scratch away. Preview free, then make it yours.',
    h1: 'Animated wedding invitations with a moment of surprise',
    lead: 'The first few seconds set the tone. These templates open with something guests remember: curtains that part, a short film, or a date to uncover.',
    picks: [19, 21, 22],
    sections: [
      { h2: 'Ways an invitation can open', p: ['Each template has its own opening, so you can match it to your wedding.'], list: ['Velvet Reveal: emerald curtains part, then a gold foil to scratch away to find the date', 'Golden Butterfly: a short film of golden butterflies opens a black-and-gold invitation', 'Cherry Blossom: falling petals, and a date to uncover with three taps and a soft chime', 'Curtain Call: theatre curtains that open on a tap', 'Under the Same Moon: a moonlit lake and a gold foil to scratch for the date'] },
      { h2: 'Animation that stays out of the way', p: ['Sections fade in as guests scroll, and the invitation is built for phones. Guests who prefer reduced motion see it without the animation, and the details are always readable.'] },
      { h2: 'Your details, their style', p: ['You change the names, date, events and photos. Each template keeps its own colours, fonts and motion, so it always looks designed.'] },
      { h2: 'Preview before you commit', p: ['Open any animated template and see it as your guests will. Building and previewing is free; you pay once when you publish.'] }
    ],
    faq: [
      ['Will the animations slow down older phones?', 'The templates are designed for phones. Guests who have reduced motion turned on see a calmer version with no animation.'],
      ['Can I change the music, colours or fonts?', 'You can change your content: names, date, events, photos and which sections show. Each template keeps its own curated colours and fonts, so it always looks right.'],
      ['Which template should I pick?', 'Open a few and look at the first screen your guests will see. Pick the one that feels most like your wedding.']
    ]
  },
  {
    slug: 'whatsapp-wedding-invitation',
    title: 'Wedding invitation to share on WhatsApp — InviteStudio',
    description: 'Make a wedding invitation you can send as one link on WhatsApp, text or email. Animated, mobile first, with events, photos and RSVP. Preview free.',
    h1: 'A wedding invitation you can send as one link on WhatsApp',
    lead: 'Most wedding invitations travel through group chats. A link to a designed invitation page works better than forwarding a photo, because it carries the schedule, photos and a reply form.',
    picks: [10, 9, 16],
    sections: [
      { h2: 'Why a link beats a forwarded image', p: ['An image cannot update, cannot hold a full schedule and cannot collect replies. A link opens a page that can do all three, and guests can open it again whenever they need the details.'] },
      { h2: 'What guests see in the chat', p: ['When you share your link, chat apps can show a preview with your title, the date and the place, so guests know what it is before they open it.'] },
      { h2: 'Share it anywhere', p: ['The same link works in WhatsApp, text messages, email, or any app you use with your guests. Nothing to install.'] },
      { h2: 'Keep it private until you are ready', p: ['Preview privately first. Publish when you are happy, then share the link. Guests reply on the page, and you see every reply in your editor.'] }
    ],
    faq: [
      ['Does it work only on WhatsApp?', 'No. It is a normal web link, so you can share it in any chat app, by text message or by email.'],
      ['Do guests need to install anything?', 'No. The invitation opens in their phone’s browser.'],
      ['Can guests reply without leaving the invitation?', 'Yes. They reply on the invitation page, with their name and whether they are coming.']
    ]
  }
]);

// The links in every footer. tests/unit/policies.test.mjs checks they are the policy pages.
// Shown in every footer. The templates, artwork and code are protected by copyright (see the Terms, "Our templates and designs").
export const COPYRIGHT = `© ${new Date().getFullYear()} InviteStudio. The templates and designs on this site are protected by copyright.`;

export const POLICY_LINKS = Object.freeze([['Terms', '/terms'], ['Refund policy', '/refund-policy'], ['Privacy', '/privacy'], ['Contact', '/contact']]);

const CSS = `
@font-face{font-family:"Playfair Display";font-weight:400 900;font-style:normal;font-display:swap;src:url("/assets/scene-fonts/playfair-display-latin-variable.woff2") format("woff2")}
@font-face{font-family:"DM Sans";font-weight:400;font-style:normal;font-display:swap;src:url("/assets/scene-fonts/dm-sans-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:"DM Sans";font-weight:500;font-style:normal;font-display:swap;src:url("/assets/scene-fonts/dm-sans-latin-500-normal.woff2") format("woff2")}
:root{--bg:#fbf7f2;--ink:#24231f;--muted:#5f5b54;--green:#145c37;--green-dark:#083a23;--deep:#10281d;--line:#e6e0d9;--card:#fffdf9}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.65 "DM Sans",system-ui,sans-serif}
a{color:var(--green)}a:focus-visible,.btn:focus-visible{outline:2px solid var(--green);outline-offset:3px}
.w{max-width:920px;margin:0 auto;padding:0 20px}
header.top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0;min-height:72px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin:0 -20px;padding-left:20px;padding-right:20px}
.logo{display:inline-flex;align-items:center;gap:9px;font:600 21px/1 "Playfair Display",Georgia,serif;text-decoration:none;color:var(--deep)}
.mark{position:relative;display:block;width:23px;height:23px;transform:rotate(45deg);flex:none}.mark i{position:absolute;width:10px;height:10px;border:1.5px solid currentColor;border-radius:8px 8px 2px 8px}
.mark i:nth-child(1){left:1px;top:1px}.mark i:nth-child(2){right:1px;top:1px;transform:rotate(90deg)}.mark i:nth-child(3){right:1px;bottom:1px;transform:rotate(180deg)}.mark i:nth-child(4){left:1px;bottom:1px;transform:rotate(270deg)}
nav a{margin-right:22px;color:#4f4b44;text-decoration:none;font-weight:500;font-size:15px}nav a:hover{color:var(--green)}
h1,h2,h3{font-family:"Playfair Display",Georgia,serif;font-weight:500;line-height:1.15;margin:0;color:var(--deep)}
h1{font-size:clamp(34px,6.4vw,54px);letter-spacing:-.6px;margin:30px 0 18px}h2{font-size:clamp(26px,4.4vw,34px);letter-spacing:-.3px;margin:46px 0 12px}
.lead{font-size:19px;color:var(--muted);margin:0 0 26px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;background:linear-gradient(135deg,var(--green),var(--green-dark));color:#fff;padding:0 28px;border:1px solid var(--green);border-radius:999px;text-decoration:none;font-weight:500;transition:transform .18s,box-shadow .18s}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(8,58,35,.23)}
.btn.o{background:transparent;color:#13221a}.btn.o:hover{background:rgba(13,84,47,.06);box-shadow:none}.hero-actions{display:flex;gap:10px;flex-wrap:wrap}
.picks{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:18px;margin:26px 0 0}
.pick{display:block;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:10px;text-decoration:none;color:var(--ink);box-shadow:0 10px 28px -20px rgba(44,42,34,.3);transition:transform .2s,box-shadow .2s}.pick:hover{transform:translateY(-3px);box-shadow:0 18px 36px -22px rgba(44,42,34,.4)}
.pick img{width:100%;height:auto;border-radius:12px;display:block;aspect-ratio:1/2;object-fit:cover}
.pick strong{display:block;margin-top:10px;font:600 19px "Playfair Display",Georgia,serif;color:var(--deep)}.pick small{color:var(--muted);font-size:14px;line-height:1.4;display:block}
ul,ol{padding-left:22px}li{margin:6px 0}
.faq h3{font-size:22px;margin:22px 0 4px}.faq p{margin:0}
.cta{background:#f1ece3;border:1px solid var(--line);border-radius:24px;padding:32px 24px;margin:52px 0;text-align:center}.cta h2{margin:0 0 10px}
.more ul{list-style:none;padding:0}.more li{margin:8px 0}
footer{border-top:1px solid var(--line);margin-top:40px;padding:26px 0 40px;color:var(--muted);font-size:15px}footer nav{margin:10px 0 0}footer nav a{margin-right:16px}footer .copy{margin:14px 0 0;font-size:13px}@media(pointer:coarse){nav a,footer a,.logo{display:inline-flex;align-items:center;min-height:44px;padding:0 6px;margin-right:12px}footer nav a{margin-right:10px}}.doc h2{margin-top:36px}.doc .updated{color:var(--muted);font-size:15px;margin:0 0 20px}.contact-actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
@media(max-width:560px){body{font-size:16px}.lead{font-size:17px}header.top nav a{margin-right:14px}.btn{width:100%}.hero-actions .btn,.contact-actions .btn{width:100%}}
`;

// The small (320 px wide) version of a template's phone picture; scripts/ keeps the pair in step (tests/unit/seo.test.mjs checks it exists).
export function smallImage(path) {
  return path.replace(/-phone\.jpg$/, '-phone-sm.webp');
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// A complete HTML document. `templates` is seo.js TEMPLATES; `head` is the shared head tags from seo.js (title excluded).
export function renderLanding(page, origin, { templates, head, title }) {
  const abs = path => new URL(path, origin).href;
  const picks = page.picks.map(id => templates.find(t => t.id === id));
  const others = LANDING.filter(p => p.slug !== page.slug);
  const sections = page.sections.map(s => `<section><h2>${esc(s.h2)}</h2>${(s.p || []).map(t => `<p>${esc(t)}</p>`).join('')}${s.list ? `<ul>${s.list.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}${s.ol ? `<ol>${s.ol.map(i => `<li>${esc(i)}</li>`).join('')}</ol>` : ''}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#fbf7f2"/><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"/><link rel="icon" href="/favicon.ico" sizes="48x48"/><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"/><title>${esc(title)}</title>${head}<style>${CSS}</style></head>
<body><div class="w"><header class="top"><a class="logo" href="/"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>InviteStudio</span></a><nav aria-label="Main"><a href="/templates">Templates</a><a href="/#pricing">Pricing</a></nav></header>
<main><h1>${esc(page.h1)}</h1><p class="lead">${esc(page.lead)}</p>
<p class="hero-actions"><a class="btn" href="/templates">Browse templates</a><a class="btn o" href="/templates/${picks[0].id}">Preview ${esc(picks[0].title)}</a></p>
<h2>Templates to start from</h2><div class="picks">${picks.map(t => `<a class="pick" href="/templates/${t.id}"><img src="${esc(t.image)}" srcset="${esc(smallImage(t.image))} 320w, ${esc(t.image)} 720w" sizes="(max-width: 600px) 45vw, 200px" alt="${esc(`${t.title} wedding invitation, first screen`)}" width="720" height="1440" loading="lazy"/><strong>${esc(t.title)}</strong><small>${esc(t.tagline)}</small></a>`).join('')}</div>
${sections}
<section class="faq"><h2>Questions</h2>${page.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}</section>
<div class="cta"><h2>Make your invitation</h2><p>Build and preview it free. Pay once, only when you publish.</p><a class="btn" href="/templates">Choose a template</a></div>
<section class="more"><h2>More guides</h2><ul>${others.map(p => `<li><a href="${abs(`/${p.slug}`)}">${esc(p.h1)}</a></li>`).join('')}</ul></section></main>
<footer><a href="/">InviteStudio</a>: wedding invitation websites. Weddings only for now.<nav aria-label="Policies">${POLICY_LINKS.map(([name, path]) => `<a href="${path}">${name}</a>`).join('')}</nav><p class="copy">${COPYRIGHT}</p></footer></div></body></html>`;
}

const ICONS = '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"/><link rel="icon" href="/favicon.ico" sizes="48x48"/><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"/>';

// A policy page: the same look as the landing pages, plain text. `extra` is { updated, contact: {email, whatsapp}, business: {legalName, address} }.
export function renderPolicy(page, origin, { head, title, updated, contact, business }) {
  const sections = page.sections.map(s => `<section><h2>${esc(s.h2)}</h2>${(s.p || []).map(t => `<p>${esc(t)}</p>`).join('')}${s.list ? `<ul>${s.list.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</section>`).join('');
  const digits = String(contact.whatsapp || '').replace(/\D/g, '');
  const actions = page.contact
    ? `<div class="contact-actions">${contact.email ? `<a class="btn" href="mailto:${esc(contact.email)}">Email ${esc(contact.email)}</a>` : ''}${digits ? `<a class="btn o" href="https://wa.me/${esc(digits)}">WhatsApp +${esc(digits)}</a>` : ''}</div>${business.legalName || business.address ? `<p>${[business.legalName, business.address].filter(Boolean).map(esc).join('<br/>')}</p>` : ''}`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#fbf7f2"/>${ICONS}<title>${esc(title)}</title>${head}<style>${CSS}</style></head>
<body><div class="w"><header class="top"><a class="logo" href="/"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>InviteStudio</span></a><nav aria-label="Main"><a href="/templates">Templates</a><a href="/#pricing">Pricing</a></nav></header>
<main class="doc"><h1>${esc(page.h1)}</h1>${page.contact ? '' : `<p class="updated">Last updated: ${esc(updated)}</p>`}${actions}${sections}</main>
<footer><a href="/">InviteStudio</a>: wedding invitation websites. Weddings only for now.<nav aria-label="Policies">${POLICY_LINKS.map(([name, path]) => `<a href="${path}">${name}</a>`).join('')}</nav><p class="copy">${COPYRIGHT}</p></footer></div></body></html>`;
}
