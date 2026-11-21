// Search and AI-assistant discoverability for the public marketing pages.
//
// The site is a client-rendered single page: the HTML a crawler downloads is an empty shell with one title. Search engines that
// run JavaScript see more; most AI crawlers and link unfurlers do not. functions/_middleware.js uses this module to give each
// public page its own title, description, canonical address, social card, structured data and a plain-HTML copy of its main
// content (replaced by the real page as soon as the script runs). robots.txt, sitemap.xml and llms.txt are served from here too.
//
// Rules: say only what the product does today (docs/PRODUCT_DECISIONS.md, docs/PRICING_PLAN.md). Prices differ by country and
// are placeholders until confirmed, so no amount appears here. The template list mirrors figma/islands/shared.tsx
// (galleryTemplates); tests/unit/seo.test.mjs fails if they drift apart.

import { LANDING, renderLanding, renderPolicy, smallImage } from './landing.js';
import { BUSINESS, CONTACT, POLICIES, SOCIAL, UPDATED } from './policies.js';

export const SITE_NAME = 'InviteStudio';

// The one public address. Canonical links, the sitemap and llms.txt always use it, so preview deployments and the pages.dev address
// never compete with it in search results. Set PUBLIC_ORIGIN (also used for the payment return page) to override.
export const SITE_ORIGIN = 'https://invitestudio.co';

export function originFor(env) {
  return String((env && env.PUBLIC_ORIGIN) || SITE_ORIGIN).replace(/\/+$/, '');
}

// Preview deployments and the pages.dev address are not the public site: keep them out of search.
export function isPrivateHost(hostname) {
  return /(^|\.)pages\.dev$/.test(hostname);
}

// Social card image. Used on every page that has no template image of its own (1200x630).
const DEFAULT_IMAGE = '/assets/og-image.png';

export const TEMPLATES = Object.freeze([
  { id: 14, title: 'Minimalist', tagline: 'Quiet editorial layout: large serif names, one olive accent and plenty of space.', image: '/assets/templates/minimalist-phone.jpg', tags: ["Modern", "Editorial"], opening: "Countdown", openingText: "A calm cover with your names set large and a live countdown to your date. Guests scroll through your story, the day and the schedule." },
  { id: 15, title: 'Cinematic', tagline: 'A dark, film-like invitation: big names, a golden countdown and quiet scenes.', image: '/assets/templates/cinematic-phone.jpg', tags: ["Modern", "Cinematic"], opening: "Countdown", openingText: "A dark cover with your names set large and a live countdown to your date. Guests scroll through your story, the day and the schedule." },
  { id: 16, title: 'Fairy Tale', tagline: 'A pink sunset sky, a castle on the hill and script lettering: once upon a time, with a countdown to forever.', image: '/assets/templates/fairy-tale-phone.jpg', tags: ["Romantic", "Storybook"], opening: "Countdown", openingText: "A storybook cover with your names in script and a live countdown to your date. Guests scroll through your story and your events." },
  { id: 18, title: 'Bloom Reveal', tagline: 'A watercolour border of peonies and roses that blooms in from the corners, with a live countdown and soft script lettering.', image: '/assets/templates/bloom-reveal-phone.jpg', tags: ["Botanical", "Romantic"], opening: "Bloom reveal", openingText: "Watercolour flowers bloom in from the corners around your names, then a countdown to your date. Guests scroll through your story, your events and a reply button." },
  { id: 19, title: 'Velvet Reveal', tagline: 'Emerald velvet curtains part on a full-screen opening, then a gold foil to scratch away to find the date.', image: '/assets/templates/velvet-reveal-phone.jpg', tags: ["Cinematic", "Romantic"], opening: "Velvet curtains", openingText: "A full-screen video of velvet curtains parting, with an Open Invitation button. Then your names in an arch, a gold foil to scratch for the date, a countdown, your story and your events." },
  { id: 20, title: 'Under the Same Moon', tagline: 'A moonlit lake under a slowly turning moon, a gold foil to scratch for the date, and a lantern-lit story.', image: '/assets/templates/under-the-same-moon-phone.jpg', tags: ["Celestial", "Romantic"], opening: "Moonlit sky", openingText: "A short film of the night sky opens the invitation. Then your names over a moonlit lake, a gold foil to scratch for the date, your story, your events and a countdown." },
  { id: 21, title: 'Golden Butterfly', tagline: 'A short film of golden butterflies opens a black-and-gold invitation, with floating butterflies and a countdown.', image: '/assets/templates/golden-butterfly-phone.jpg', tags: ["Cinematic", "Romantic"], opening: "Butterfly film", openingText: "A short film of golden butterflies plays first, then your names over gold light with butterflies drifting past, a countdown, your note, your venues on ivory paper and a reply button." },
  { id: 22, title: 'Cherry Blossom', tagline: 'A short film of blossom, petals falling past your names, and a date to uncover with three taps and a soft chime.', image: '/assets/templates/cherry-blossom-phone.jpg', tags: ["Botanical", "Romantic"], opening: "Blossom film", openingText: "A short film of blossom plays first. Then petals fall past your names, guests tap three blossoms to uncover the date, and scroll through your story, the day, a countdown and a reply button." },
  { id: 23, title: 'Lantern Night', tagline: 'A film of a thousand floating lanterns plays behind the whole invitation, lanterns rise past your names, and the date waits under dark gold foil.', image: '/assets/templates/lantern-night-phone.jpg', tags: ["Cinematic", "Romantic"], opening: "Lantern film", openingText: "A short film of floating lanterns opens the invitation and keeps playing softly behind every section. Lanterns rise past your names, guests scratch a dark gold foil to find the date, then scroll through your story, the celebration, a countdown and a reply button." }
]);

// Same questions as the home page (figma/islands/shared.tsx `faqs`), reworded to stand alone, because a search engine or an
// assistant quotes the answer without the page around it.
export const FAQ = Object.freeze([
  ['Do I need any technical skills to create a wedding website?', 'No. Pick a template, add your names, date and event details, and publish in a few simple steps.'],
  ['Can I collect RSVPs from my guests?', 'Yes. Guests reply from your invitation with their name, whether they are coming and how many. You see every reply in your editor and can download them as a spreadsheet, or switch replies off and ask guests to contact you instead.'],
  ['Can I customise the design and content?', 'Yes. You can change colours, fonts, photos, event details and page sections. Each template keeps its own curated look.'],
  ['What is free on InviteStudio, and when do I pay?', 'Build and preview for free. When you publish, you pay once for a plan that includes your design. The price depends on the plan and your region.'],
  ['Can I change my wedding invitation design later?', 'Yes, anytime, even after you publish. You can switch to any design in your plan or a lower one at no extra cost, and your details stay the same.'],
  ['Do my wedding guests need an app or an account?', 'No. Guests open your invitation link in their phone\u2019s browser and reply with their name.'],
  ['What happens to my invitation after the wedding?', 'Your invitation stays online until 2 months after your event. Then it and the guest replies are deleted.'],
  ['Can I use my own domain?', 'Not yet. Every invitation gets its own InviteStudio link to share with your guests.']
]);

const SHARE = 'Share it with one link on WhatsApp, text or email.';

function absolute(origin, path) {
  return new URL(path, origin).href;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

// JSON inside <script type="application/ld+json">: "<" is escaped so a title can never close the tag.
function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
}

// Search results cut descriptions at about 160 characters; cut at a word instead of mid-word.
function fit(text, max = 160) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[.,;:\s]+$/, '')}…`;
}

function templateById(id) {
  return TEMPLATES.find(template => template.id === id) || null;
}

// The public pages. Returns null for any address that is not one of them (the editor, setup, the dashboard and invitations are
// not described here).
export function pageFor(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'home', path: '/' };
  if (path === '/templates') return { kind: 'templates', path: '/templates' };
  const policy = POLICIES.find(item => `/${item.slug}` === path);
  if (policy) return { kind: 'policy', path, policy };
  const landing = LANDING.find(item => `/${item.slug}` === path);
  if (landing) return { kind: 'landing', path, landing };
  const detail = /^\/templates\/(\d+)$/.exec(path);
  if (detail) {
    const template = templateById(Number(detail[1]));
    if (template) return { kind: 'detail', path, template };
  }
  return null;
}

export function describe(page, origin) {
  const home = absolute(origin, '/');
  const image = absolute(origin, DEFAULT_IMAGE);
  if (page.kind === 'home') {
    return {
      title: 'InviteStudio — Create a wedding invitation website with RSVP',
      description: 'Preview your own wedding invitation free and pay only when you make it live. Animated templates, events, photos, RSVP and one shareable link.',
      canonical: home,
      image,
      type: 'website'
    };
  }
  if (page.kind === 'templates') {
    return {
      title: 'Wedding invitation website templates — InviteStudio',
      description: `Browse ${TEMPLATES.length} animated wedding invitation website templates: beach, botanical, classic, minimalist and more. Preview any design free and make it yours.`,
      canonical: absolute(origin, '/templates'),
      image,
      type: 'website'
    };
  }
  if (page.kind === 'policy') return { title: page.policy.title, description: page.policy.description, canonical: absolute(origin, page.path), image, type: 'website' };
  if (page.kind === 'landing') {
    const first = templateById(page.landing.picks[0]);
    return { title: page.landing.title, description: page.landing.description, canonical: absolute(origin, page.path), image: first && first.image ? absolute(origin, first.image) : image, type: 'website' };
  }
  const { template } = page;
  return {
    title: `${template.title} wedding invitation website template — InviteStudio`,
    description: fit(`${template.tagline} A wedding invitation website with events, photos and RSVP. Preview free.`),
    canonical: absolute(origin, page.path),
    image: template.image ? absolute(origin, template.image) : image,
    type: 'website'
  };
}

export function structuredData(page, origin, info) {
  const home = absolute(origin, '/');
  const publisher = { '@type': 'Organization', '@id': `${home}#organization`, name: SITE_NAME, url: home };
  const graph = [publisher];
  if (page.kind === 'home') {
    graph.push({ '@type': 'WebSite', '@id': `${home}#website`, url: home, name: SITE_NAME, publisher: { '@id': publisher['@id'] } });
    graph.push({
      '@type': 'WebApplication',
      '@id': `${home}#app`,
      name: SITE_NAME,
      url: home,
      description: 'A website builder for wedding invitations: animated templates, event details, photos, RSVP collection and a shareable link.',
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires a modern web browser',
      publisher: { '@id': publisher['@id'] },
      // Prices differ by country and are not stated here on purpose; the pages show the visitor's own price.
      featureList: [
        'Animated wedding invitation templates',
        'Guest RSVP collection with spreadsheet download',
        'Event schedule, venues and travel details',
        'Photo gallery',
        'Private preview before publishing',
        'One shareable link for WhatsApp, text and email'
      ]
    });
    graph.push({
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } }))
    });
  } else {
    graph.push({ '@type': 'WebPage', '@id': `${info.canonical}#page`, url: info.canonical, name: info.title, description: info.description, isPartOf: { '@id': `${home}#website` } });
    const crumbs = [{ name: SITE_NAME, url: home }];
    if (page.kind === 'policy') crumbs.push({ name: page.policy.h1, url: info.canonical });
    else if (page.kind === 'landing') crumbs.push({ name: page.landing.h1, url: info.canonical });
    else crumbs.push({ name: 'Templates', url: absolute(origin, '/templates') });
    if (page.kind === 'landing') {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: page.landing.faq.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } }))
      });
    }
    if (page.kind === 'detail') crumbs.push({ name: page.template.title, url: info.canonical });
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: crumb.url }))
    });
    if (page.kind === 'templates') {
      graph.push({
        '@type': 'ItemList',
        name: 'Wedding invitation website templates',
        itemListElement: TEMPLATES.map((template, index) => ({
          '@type': 'ListItem', position: index + 1, name: template.title, url: absolute(origin, `/templates/${template.id}`)
        }))
      });
    }
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

// The tags added to <head>. The title is set separately.
export function headTags(page, origin) {
  const info = describe(page, origin);
  const tags = [
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"/>',
    `<meta name="description" content="${escapeHtml(info.description)}"/>`,
    `<link rel="canonical" href="${escapeHtml(info.canonical)}"/>`,
    `<meta property="og:type" content="${info.type}"/>`,
    `<meta property="og:site_name" content="${SITE_NAME}"/>`,
    `<meta property="og:title" content="${escapeHtml(info.title)}"/>`,
    `<meta property="og:description" content="${escapeHtml(info.description)}"/>`,
    `<meta property="og:url" content="${escapeHtml(info.canonical)}"/>`,
    `<meta property="og:image" content="${escapeHtml(info.image)}"/>`,
    '<meta name="twitter:card" content="summary_large_image"/>',
    `<meta name="twitter:title" content="${escapeHtml(info.title)}"/>`,
    `<meta name="twitter:description" content="${escapeHtml(info.description)}"/>`,
    `<meta name="twitter:image" content="${escapeHtml(info.image)}"/>`,
    jsonLd(structuredData(page, origin, info))
  ];
  // The home page's biggest picture is drawn by the application, so the browser would not ask for it until the scripts have run.
  // Asking early lets it download alongside them.
  if (page.kind === 'home') tags.push('<link rel="preload" as="image" href="/assets/hero/hero-envelope-invitation.webp" type="image/webp" fetchpriority="high"/>');
  return { title: info.title, html: tags.join('') };
}

// A plain-HTML copy of the page's main content, placed inside #app. Crawlers that do not run scripts read it; in a browser the
// application replaces #app on its first render, so visitors never see it for more than an instant.
export function staticContent(page, origin) {
  const link = (path, text) => `<a href="${escapeHtml(absolute(origin, path))}">${escapeHtml(text)}</a>`;
  const templateList = `<ul>${TEMPLATES.map(template => `<li>${link(`/templates/${template.id}`, template.title)} — ${escapeHtml(template.tagline)}</li>`).join('')}</ul>`;
  const nav = `<nav aria-label="Main">${link('/', 'Home')} ${link('/templates', 'Templates')} ${POLICIES.map(item => link(`/${item.slug}`, item.h1)).join(' ')}</nav>`;
  let body;
  if (page.kind === 'home') {
    body = `<h1>Create a wedding invitation website your guests will love</h1>
<p>${SITE_NAME} is a wedding invitation website builder. Choose an animated template and publish your wedding schedule, photos and guest RSVP on your own shareable InviteStudio link.</p>
<p>${link('/templates', 'Browse wedding designs')} · ${link('/templates/18', 'See a sample invitation')}</p>
<h2>How it works</h2>
<ol><li>Choose a template.</li><li>Add your names, date, events and photos. Drafts save automatically.</li><li>Preview it privately, then publish and share the link on WhatsApp, text or email.</li></ol>
<h2>What you get</h2>
<ul><li>${TEMPLATES.length} animated, mobile-first wedding invitation templates</li><li>Guest RSVP with a spreadsheet download</li><li>Event schedule, venues and travel details</li><li>Photo gallery and a live countdown to your day</li><li>A private preview before you publish</li></ul>
<h2>Guides</h2><ul>${LANDING.map(item => `<li>${link(`/${item.slug}`, item.h1)}</li>`).join('')}</ul>
<h2>Templates</h2>${templateList}
<h2>Pricing</h2>
<p>Building and previewing your invitation is free. Pay once for a publishing plan, with pricing based on your region. Switch designs within your plan anytime, even after publishing. Classic includes Classic designs, Premium includes Classic and Premium, and Signature includes every design.</p>
<p>Published invitations normally stay online for two months after your last event, subject to the hosting limit shown when you publish. Export your RSVPs before your invitation expires.</p>
<h2>Frequently asked questions</h2>
${FAQ.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p>`).join('')}`;
  } else if (page.kind === 'templates') {
    body = `<h1>Wedding invitation website templates</h1>
<p>Beautiful, animated starting points for your wedding invitation website, with room to make them your own. Open any design to preview it for free.</p>${templateList}`;
  } else {
    const { template } = page;
    const related = TEMPLATES.filter(other => other.id !== template.id && other.tags.some(tag => template.tags.includes(tag))).slice(0, 3);
    const guides = LANDING.slice(0, 3);
    body = `<h1>${escapeHtml(template.title)} wedding invitation website template</h1>
<p>${escapeHtml(template.tagline)}</p>
<img src="${escapeHtml(template.image)}" srcset="${escapeHtml(smallImage(template.image))} 320w, ${escapeHtml(template.image)} 720w" sizes="(max-width: 600px) 60vw, 320px" alt="${escapeHtml(`${template.title} wedding invitation, first screen`)}" width="360" height="720"/>
<h2>How it opens</h2><p><strong>${escapeHtml(template.opening)}.</strong> ${escapeHtml(template.openingText)}</p>
<h2>Style</h2><p>${template.tags.map(escapeHtml).join(', ')}.</p>
<h2>What you add</h2>
<ul><li>Your names and wedding date</li><li>Your events, with times and venues</li><li>Your photos and story</li><li>Guest RSVP, with a spreadsheet download of replies</li></ul>
<p>${escapeHtml(template.title)} keeps its own colours and fonts, so it always looks designed. Preview it privately for free, then pay once to publish. ${SHARE}</p>
<h2>Similar templates</h2><ul>${related.map(other => `<li>${link(`/templates/${other.id}`, other.title)}: ${escapeHtml(other.tagline)}</li>`).join('')}</ul>
<h2>Guides</h2><ul>${guides.map(item => `<li>${link(`/${item.slug}`, item.h1)}</li>`).join('')}</ul>
<p>${link('/templates', 'See all wedding invitation templates')}</p>`;
  }
  return `<div id="seo-static" data-prerendered="true">${nav}<main>${body}</main></div>`;
}

// ---- robots.txt, sitemap.xml, llms.txt --------------------------------------------------------------------------------------

// AI search and assistant crawlers. They are named so the intent is explicit: the public pages are meant to be read and
// recommended. Training-only crawlers are allowed too; remove a name here to opt out.
const AI_CRAWLERS = Object.freeze([
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot', 'CCBot', 'Amazonbot', 'Meta-ExternalAgent'
]);

// Paths that are private or not pages: the API, owner edit links, draft previews, the designer, and the media proxy.
const DISALLOWED = Object.freeze(['/api/', '/edit', '/edit/', '/editor/', '/media/', '/draft']);

export function robotsTxt(origin, { blockAll = false } = {}) {
  if (blockAll) return 'User-agent: *\nDisallow: /\n';
  const rules = DISALLOWED.map(path => `Disallow: ${path}`).join('\n');
  const groups = [`User-agent: *\nAllow: /\n${rules}`];
  for (const agent of AI_CRAWLERS) groups.push(`User-agent: ${agent}\nAllow: /\n${rules}`);
  return `${groups.join('\n\n')}\n\nSitemap: ${absolute(origin, '/sitemap.xml')}\n`;
}

export function sitemapXml(origin) {
  const paths = ['/', '/templates', ...LANDING.map(item => `/${item.slug}`), ...TEMPLATES.map(template => `/templates/${template.id}`), ...POLICIES.map(item => `/${item.slug}`)];
  const urls = paths.map(path => `<url><loc>${escapeHtml(absolute(origin, path))}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}

// llms.txt (https://llmstxt.org): a short plain-text description for AI assistants.
export function llmsTxt(origin) {
  return `# ${SITE_NAME}

> ${SITE_NAME} is a wedding invitation website builder. Couples choose an animated, mobile-first template, add their names, date, events, venues, travel details and photos, collect guest RSVPs, and share one link on WhatsApp, text or email.

## Best for
- Couples who want a wedding invitation website or a digital (online) wedding invitation instead of, or alongside, a printed card
- Animated, story-style invitations that guests open on their phones
- Collecting RSVPs without a separate form: replies are listed in the editor and can be downloaded as a spreadsheet

## How it works
1. Choose a template.
2. Add your details. Drafts save automatically, and building and previewing are free.
3. Publish with a one-time plan priced by region and share the link. Switch designs anytime within your plan, even after publishing.

## Pages
- [Home](${absolute(origin, '/')}): what ${SITE_NAME} does, how it works, pricing and answers to common questions
- [Templates](${absolute(origin, '/templates')}): all ${TEMPLATES.length} wedding invitation templates
${LANDING.map(item => `- [${item.h1}](${absolute(origin, `/${item.slug}`)}): ${item.description}`).join('\n')}
${TEMPLATES.map(template => `- [${template.title}](${absolute(origin, `/templates/${template.id}`)}): ${template.tagline}`).join('\n')}

## Facts
- Weddings only for now.
- Every invitation gets its own ${SITE_NAME} link. Custom domains are not supported yet.
- A published invitation stays online until 2 months after the event.
`;
}

// The full HTML document for a landing page (served directly, not through the application shell).
// `replay` is the session-recording project id to offer on this page, or '' (functions/_shared/replay.js).
export function landingDocument(page, origin, { replay = '' } = {}) {
  const { title, html } = headTags(page, origin);
  return renderLanding(page.landing, origin, { templates: TEMPLATES, head: html + (replay ? `<meta name="invitestudio-replay" content="${replay}">` : ''), title, replay, contact: CONTACT, social: SOCIAL });
}

// The full HTML document for a policy page (terms, refund policy, privacy, contact).
export function policyDocument(page, origin, options = {}) {
  const { title, html } = headTags(page, origin);
  return renderPolicy(page.policy, origin, { head: html, title, updated: page.policy.updated || UPDATED, contact: CONTACT, business: BUSINESS, social: SOCIAL });
}
