# SEO and AI discoverability

Goal: when someone searches for a wedding invitation website, or asks an AI assistant for one, InviteStudio is a result or a recommendation.

## Built (phase 1: technical foundation)

The site is a client-rendered single page, so the HTML a crawler downloads used to be an empty shell with one title. Now:

- `functions/_middleware.js` gives `/`, `/templates` and `/templates/<id>` their own title, description, canonical address, Open Graph / Twitter card, JSON-LD (Organization, WebSite, WebApplication, FAQPage, ItemList, BreadcrumbList) and a plain-HTML copy of the page's content inside `#app` (the app replaces it on first render). Crawlers that do not run JavaScript, which includes most AI crawlers, read this copy.
- `/robots.txt` allows everything public, names the AI crawlers explicitly, blocks `/api/`, `/edit`, `/editor/`, `/media/`, and points at the sitemap.
- `/sitemap.xml` lists every public page. `/llms.txt` is a plain-text summary for AI assistants.
- All of it lives in `functions/_shared/seo.js`. Absolute URLs come from the `PUBLIC_ORIGIN` environment variable, else the request's own origin. `tests/unit/seo.test.mjs` fails if the template list drifts from the gallery, a description is too long, or a price slips into the markup.
- Prices differ by country and are placeholders, so no amount appears in structured data.

## Needs the product owner

1. **Set `PUBLIC_ORIGIN`** to the real production address (and confirm it is the one address people use; redirect any other to it).
2. **Add `/assets/og-image.jpg`** (1200x630). Until it exists, link previews on pages without a template image have no picture.
3. **Verify the site** in Google Search Console and Bing Webmaster Tools, then submit `/sitemap.xml`.
4. **Decide whether guests' invitations (`/s/<slug>`) should be indexed.** `functions/s/[slug].js` currently sends `index,follow` for every published public invitation, so couples' names, dates and venues can appear in search results. Consider `noindex` unless the couple opts in. It is also not in the sitemap.

## Next phases (not built)

- **Real pages for real searches.** One page per intent, each with unique useful content: "wedding invitation website", "digital wedding invitation", "online wedding invitation with RSVP", "animated wedding invitation", "wedding invitation for WhatsApp", plus a regional page for each market the pricing covers. A single home page cannot rank for all of them.
- **Per-template detail**: a short description of what each design looks like and who it suits, and real images with descriptive alt text.
- **Performance**: the 360 KB `index.html` and the client-side render slow the first paint; Core Web Vitals affect ranking.
- **Off-site presence** is what makes assistants recommend a product: listings and mentions on wedding directories and "best wedding website builder" roundups, reviews, real couples' published invitations (with permission) and a blog of genuinely useful planning guides.
- **Measure**: Search Console queries and impressions; ask several AI assistants the target questions monthly and record whether InviteStudio appears.
