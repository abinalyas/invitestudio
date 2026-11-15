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

export const SITE_NAME = 'InviteStudio';

// Social card image. Add /assets/og-image.jpg (1200x630) and it is used automatically on every page that has no better image.
const DEFAULT_IMAGE = '/assets/og-image.jpg';

export const TEMPLATES = Object.freeze([
  { id: 9, title: 'Savanna Sunset', tagline: 'Golden dunes, acacia silhouettes and a script title at sunset.', image: '/assets/templates/savanna-sunset-phone.jpg' },
  { id: 10, title: 'Palmera Beach', tagline: 'A sunlit beach inside an arch, framed by palms and hibiscus.', image: '/assets/templates/palmera-beach-phone.jpg' },
  { id: 11, title: 'Curtain Call', tagline: 'Theatre curtains that open on tap to reveal the invitation.', image: '/assets/templates/curtain-call-phone.jpg' },
  { id: 12, title: 'Lunaria', tagline: 'Dusty blue linen, a moon and an arch of leaves and water lilies.', image: '/assets/templates/lunaria-moon-phone.jpg' },
  { id: 13, title: 'Modern Heritage', tagline: 'Ivory paper, deep green and gold botanical details, with a live countdown to the day.', image: '/assets/templates/modern-heritage-phone.jpg' },
  { id: 14, title: 'Minimalist', tagline: 'Quiet editorial layout: large serif names, one olive accent and plenty of space.', image: '/assets/templates/minimalist-phone.jpg' },
  { id: 15, title: 'Cinematic', tagline: 'A dark, film-like invitation: big names, a golden countdown and quiet scenes.', image: '/assets/templates/cinematic-phone.jpg' },
  { id: 16, title: 'Fairy Tale', tagline: 'A pink sunset sky, a castle on the hill and script lettering: once upon a time, with a countdown to forever.', image: '/assets/templates/fairy-tale-phone.jpg' },
  { id: 17, title: 'Blue Hydrangea', tagline: 'A pale blue sky framed by hydrangea and orchid garlands, with a countdown in a scalloped frame and a soft, garden-party feel.', image: '/assets/templates/blue-hydrangea-phone.jpg' },
  { id: 18, title: 'Bloom Reveal', tagline: 'A watercolour border of peonies and roses that blooms in from the corners, with a live countdown and soft script lettering.', image: '/assets/templates/bloom-reveal-phone.jpg' },
  { id: 19, title: 'Velvet Reveal', tagline: 'Emerald velvet curtains part on a full-screen opening, then a gold foil to scratch away to find the date.', image: '/assets/templates/velvet-reveal-phone.jpg' },
  { id: 20, title: 'Under the Same Moon', tagline: 'A moonlit lake under a slowly turning moon, a gold foil to scratch for the date, and a lantern-lit story.', image: '/assets/templates/under-the-same-moon-phone.jpg' },
  { id: 21, title: 'Golden Butterfly', tagline: 'A short film of golden butterflies opens a black-and-gold invitation, with floating butterflies and a countdown.', image: '/assets/templates/golden-butterfly-phone.jpg' },
  { id: 22, title: 'Cherry Blossom', tagline: 'A short film of blossom, petals falling past your names, and a date to uncover with three taps and a soft chime.', image: '/assets/templates/cherry-blossom-phone.jpg' }
]);

// Same questions as the home page (figma/islands/shared.tsx `faqs`), reworded to stand alone, because a search engine or an
// assistant quotes the answer without the page around it.
export const FAQ = Object.freeze([
  ['Do I need any technical skills to create a wedding website?', 'No. Pick a template, add your names, date and event details, and publish in a few simple steps.'],
  ['Can I collect RSVPs from my guests?', 'Yes. Guests reply from your invitation with their name, whether they are coming and how many. You see every reply in your editor and can download them as a spreadsheet, or switch replies off and ask guests to contact you instead.'],
  ['Can I customise the design and content?', 'Yes. You can change colours, fonts, photos, event details and page sections. Each template keeps its own curated look.'],
  ['How much does a wedding invitation website on InviteStudio cost?', 'Building and previewing is free. You pay once, when you publish, and the price depends on the design you choose and where you are. There is no subscription.'],
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
      description: 'Create a beautiful, animated wedding invitation website in minutes. Pick a template, add events and photos, collect RSVPs and share one link. Free to build',
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
    crumbs.push({ name: 'Templates', url: absolute(origin, '/templates') });
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
  return { title: info.title, html: tags.join('') };
}

// A plain-HTML copy of the page's main content, placed inside #app. Crawlers that do not run scripts read it; in a browser the
// application replaces #app on its first render, so visitors never see it for more than an instant.
export function staticContent(page, origin) {
  const link = (path, text) => `<a href="${escapeHtml(absolute(origin, path))}">${escapeHtml(text)}</a>`;
  const templateList = `<ul>${TEMPLATES.map(template => `<li>${link(`/templates/${template.id}`, template.title)} — ${escapeHtml(template.tagline)}</li>`).join('')}</ul>`;
  const nav = `<nav aria-label="Main">${link('/', 'Home')} ${link('/templates', 'Templates')}</nav>`;
  let body;
  if (page.kind === 'home') {
    body = `<h1>Create a wedding invitation website your guests will love</h1>
<p>${SITE_NAME} is a wedding invitation website builder. Choose an animated template, add your names, date, events, venues, travel details and photos, and share one link with your guests. Guests can reply (RSVP) from the invitation, and you see every reply in your editor and can download them as a spreadsheet.</p>
<h2>How it works</h2>
<ol><li>Choose a template.</li><li>Add your names, date, events and photos. Drafts save automatically.</li><li>Preview it privately, then publish and share the link on WhatsApp, text or email.</li></ol>
<h2>What you get</h2>
<ul><li>${TEMPLATES.length} animated, mobile-first wedding invitation templates</li><li>Guest RSVP with a spreadsheet download</li><li>Event schedule, venues and travel details</li><li>Photo gallery and a live countdown to your day</li><li>A private preview before you publish</li></ul>
<h2>Templates</h2>${templateList}
<h2>Pricing</h2>
<p>Building and previewing your invitation is free. You pay once, when you publish, and the price depends on the design you choose and where you are. There is no subscription.</p>
<h2>Frequently asked questions</h2>
${FAQ.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p>`).join('')}`;
  } else if (page.kind === 'templates') {
    body = `<h1>Wedding invitation website templates</h1>
<p>Beautiful, animated starting points for your wedding invitation website, with room to make them your own. Open any design to preview it for free.</p>${templateList}`;
  } else {
    const { template } = page;
    body = `<h1>${escapeHtml(template.title)} wedding invitation website template</h1>
<p>${escapeHtml(template.tagline)} Add your names, date, events, photos and RSVP, preview it privately for free, then pay once to publish. ${SHARE}</p>
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

// Paths that are private or not pages: the API, owner edit links, the designer, and the media proxy.
const DISALLOWED = Object.freeze(['/api/', '/edit', '/edit/', '/editor/', '/media/']);

export function robotsTxt(origin) {
  const rules = DISALLOWED.map(path => `Disallow: ${path}`).join('\n');
  const groups = [`User-agent: *\nAllow: /\n${rules}`];
  for (const agent of AI_CRAWLERS) groups.push(`User-agent: ${agent}\nAllow: /\n${rules}`);
  return `${groups.join('\n\n')}\n\nSitemap: ${absolute(origin, '/sitemap.xml')}\n`;
}

export function sitemapXml(origin) {
  const paths = ['/', '/templates', ...TEMPLATES.map(template => `/templates/${template.id}`)];
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
3. Publish (a one-time payment, priced by design and by country, no subscription) and share the link.

## Pages
- [Home](${absolute(origin, '/')}): what ${SITE_NAME} does, how it works, pricing and answers to common questions
- [Templates](${absolute(origin, '/templates')}): all ${TEMPLATES.length} wedding invitation templates
${TEMPLATES.map(template => `- [${template.title}](${absolute(origin, `/templates/${template.id}`)}): ${template.tagline}`).join('\n')}

## Facts
- Weddings only for now.
- Every invitation gets its own ${SITE_NAME} link. Custom domains are not supported yet.
- A published invitation stays online until 2 months after the event.
`;
}
