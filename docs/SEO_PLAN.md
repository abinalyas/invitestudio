# SEO and AI discoverability

Goal: when someone searches for a wedding invitation website, or asks an AI assistant for one, InviteStudio is a result or a recommendation.

## Built (phase 1: technical foundation)

The site is a client-rendered single page, so the HTML a crawler downloads used to be an empty shell with one title. Now:

- `functions/_middleware.js` gives `/`, `/templates` and `/templates/<id>` their own title, description, canonical address, Open Graph / Twitter card, JSON-LD (Organization, WebSite, WebApplication, FAQPage, ItemList, BreadcrumbList) and a plain-HTML copy of the page's content inside `#app` (the app replaces it on first render). Crawlers that do not run JavaScript, which includes most AI crawlers, read this copy.
- `/robots.txt` allows everything public, names the AI crawlers explicitly, blocks `/api/`, `/edit`, `/editor/`, `/media/`, and points at the sitemap.
- `/sitemap.xml` lists every public page. `/llms.txt` is a plain-text summary for AI assistants.
- All of it lives in `functions/_shared/seo.js`. Absolute URLs come from the `PUBLIC_ORIGIN` environment variable, else the request's own origin. `tests/unit/seo.test.mjs` fails if the template list drifts from the gallery, a description is too long, or a price slips into the markup.
- Prices differ by country and are placeholders, so no amount appears in structured data.

## Decided

- The public address is **https://invitestudio.co** (`SITE_ORIGIN` in `functions/_shared/seo.js`; `PUBLIC_ORIGIN` overrides it). Canonical links, the sitemap and `llms.txt` always use it. The `*.pages.dev` addresses and previews send `X-Robots-Tag: noindex` and a `Disallow: /` robots.txt.
- Guests' invitations (`/s/<slug>`) are always `noindex,nofollow`; link previews (WhatsApp, iMessage) still work.

## Needs the product owner

1. **Search Console**: add `https://invitestudio.co` as a Domain property, verify with the DNS TXT record Google gives (add it in Cloudflare DNS), then submit `/sitemap.xml`. Repeat in Bing Webmaster Tools (it can import from Search Console).
2. **Redirect `www.invitestudio.co`** (if used) to `invitestudio.co` so there is one address.

## Next phases (not built)

- **Real pages for real searches.** One page per intent, each with unique useful content: "wedding invitation website", "digital wedding invitation", "online wedding invitation with RSVP", "animated wedding invitation", "wedding invitation for WhatsApp", plus a regional page for each market the pricing covers. A single home page cannot rank for all of them.
- **Per-template detail**: a short description of what each design looks like and who it suits, and real images with descriptive alt text.
- **Performance**: the 360 KB `index.html` and the client-side render slow the first paint; Core Web Vitals affect ranking.
- **Off-site presence** is what makes assistants recommend a product: listings and mentions on wedding directories and "best wedding website builder" roundups, reviews, real couples' published invitations (with permission) and a blog of genuinely useful planning guides.
- **Measure**: Search Console queries and impressions; ask several AI assistants the target questions monthly and record whether InviteStudio appears.
