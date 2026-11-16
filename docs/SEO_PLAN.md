# SEO and AI discoverability

Goal: when someone searches for a wedding invitation website, or asks an AI assistant for one, InviteStudio is a result or a recommendation.

## Built (phase 1: technical foundation)

The site is a client-rendered single page, so the HTML a crawler downloads used to be an empty shell with one title. Now:

- `functions/_middleware.js` gives `/`, `/templates` and `/templates/<id>` their own title, description, canonical address, Open Graph / Twitter card, JSON-LD (Organization, WebSite, WebApplication, FAQPage, ItemList, BreadcrumbList) and a plain-HTML copy of the page's content inside `#app` (the app replaces it on first render). Crawlers that do not run JavaScript, which includes most AI crawlers, read this copy.
- `/robots.txt` allows everything public, names the AI crawlers explicitly, blocks `/api/`, `/edit`, `/editor/`, `/media/`, and points at the sitemap.
- `/sitemap.xml` lists every public page. `/llms.txt` is a plain-text summary for AI assistants.
- All of it lives in `functions/_shared/seo.js`. Absolute URLs come from the `PUBLIC_ORIGIN` environment variable, else the request's own origin. `tests/unit/seo.test.mjs` fails if the template list drifts from the gallery, a description is too long, or a price slips into the markup.
- Prices differ by country and are placeholders, so no amount appears in structured data.

## Built (phase 2: search-intent pages)

Five server-rendered pages, one per thing people search for, each with its own angle, three template picks, a FAQ (with FAQPage markup) and links to the others: `/wedding-invitation-website`, `/digital-wedding-invitation`, `/online-wedding-invitation-with-rsvp`, `/animated-wedding-invitation`, `/whatsapp-wedding-invitation`. Content lives in `functions/_shared/landing.js`; they are in the sitemap and `llms.txt`, and linked from the home page footer. They say only what the product does today and show no price. To add a page, add an entry to `LANDING`; `tests/unit/seo.test.mjs` checks the templates exist, links work and each page has one h1.

## Built (phase 3: template pages)

Each `/templates/<id>` page now carries its own image with alt text, how the invitation opens, its style tags, what the couple adds, and links to similar templates and to the guides. The text comes from the gallery data in `figma/islands/shared.tsx`; `tests/unit/seo.test.mjs` fails if the two disagree.

## Built (phase 4: page speed)

Measured in a throttled browser (slow 4G, 4x slower CPU, phone width) before and after, home page:

| | Before | After |
|---|---|---|
| Largest Contentful Paint | 6.3 s | 3.3 s (3.9 s before the hero picture was recompressed) |
| Picture data on first load | 954 KB | 620 KB |
| Template pictures in the home strip | 126 + 97 + 62 KB | about 15 KB each |
| `/favicon.ico` | the whole 363 KB app page | a real 2 KB icon |

What changed: the hero picture is preloaded (the app only asked for it after its scripts had run, about 2.7 s in); the decorative pictures load at low priority; the home strip and setup page use 320 px wide `-phone-sm.webp` copies of the template pictures (the full ones are 720 px wide and shown at 160 px); a favicon (`favicon.ico`, `assets/favicon.svg`, `assets/apple-touch-icon.png`) that also shows in search results; and long cache lifetimes for fonts (1 year) and pictures (1 day, refreshed in the background for a week), set in `_headers`.

If you regenerate the template pictures (`npm run thumbs:scenes`), make the small copies again: resize each `assets/templates/<name>-phone.jpg` to 320x640 and save it as `<name>-phone-sm.webp` (quality 80). `tests/unit/seo.test.mjs` fails if one is missing.

These are lab numbers on a simulated slow phone, so treat them as direction, not a promise. Check the real figures in Search Console's Core Web Vitals report after a few weeks.

Not done, and why: the 112 KB application script and 18 separate script files still decide when the home page appears (about 3.5 s in the lab), and cutting that means restructuring how the page loads, which is a bigger and riskier change. The hero picture is left at full size because real phones have 2x to 3x screens and need it. Layout shift on the home page is 0.096, just inside the "good" limit of 0.1.

### Phase 4 follow-up: what the script work found

- Measured with the same throttled phone: the main thread is busy for only about 1.3 s; the wait is bytes. The application starts only after all 18 scripts (about 255 KB compressed) and the large inline script have arrived, because they run in order.
- The hero picture was recompressed (181 KB to 104 KB, indistinguishable side by side). Home-page LCP went from 3.9 s to about 3.3 s (6.3 s originally).
- Tried and dropped: hiding the crawler copy of each page (layout shift 0.096 to 0.006, but a blank screen for 3 s on slow phones and a worse template-page LCP); giving it a fixed system font (shift rose to 0.19). Left as is: shift 0.096 on the home page, under the 0.1 "good" limit but with little room. The cause is the plain-text copy re-flowing when the web font arrives.
- Not done, on purpose: minifying the scripts (saves about 28 KB compressed, about 0.15 s, but adds a build step that must stay in step with the sources); splitting the editor out of the application bundle (about 15 KB compressed). (Loading the designs later was done afterwards: designs are now fetched one at a time by `template-loader.js`; see docs/PROTECTION.md.)
- The remaining larger gain (about 0.7 s) is loading the scripts the home page does not use (editor, RSVP, publishing) after the first render. That means auditing every script's use of the others, testing every route, and making the app wait for a script when the visitor goes to a page that needs it. Do it only with the full browser tests (`npm run test:e2e`) in place.

## Decided

- The public address is **https://invitestudio.co** (`SITE_ORIGIN` in `functions/_shared/seo.js`; `PUBLIC_ORIGIN` overrides it). Canonical links, the sitemap and `llms.txt` always use it. The `*.pages.dev` addresses and previews send `X-Robots-Tag: noindex` and a `Disallow: /` robots.txt.
- Guests' invitations (`/s/<slug>`) are always `noindex,nofollow`; link previews (WhatsApp, iMessage) still work.

## Needs the product owner

1. **Search Console**: add `https://invitestudio.co` as a Domain property, verify with the DNS TXT record Google gives (add it in Cloudflare DNS), then submit `/sitemap.xml`. Repeat in Bing Webmaster Tools (it can import from Search Console).
2. **Redirect `www.invitestudio.co`** (if used) to `invitestudio.co` so there is one address.

## Next phases (not built)

- **More pages for more searches**: a regional page for each market the pricing covers (only with claims that are true there), and pages for other intents as they appear in Search Console.
- **Performance**: the 360 KB `index.html` and the client-side render slow the first paint; Core Web Vitals affect ranking.
- **Off-site presence** is what makes assistants recommend a product: listings and mentions on wedding directories and "best wedding website builder" roundups, reviews, real couples' published invitations (with permission) and a blog of genuinely useful planning guides.
- **Measure**: Search Console queries and impressions; ask several AI assistants the target questions monthly and record whether InviteStudio appears.
