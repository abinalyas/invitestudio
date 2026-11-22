# Visit statistics (the Visitors section of `/admin`)

First-party, anonymous, no cookies. It answers: how many people visit, from where, on what device, which pages and designs they look
at, and how many drafts are created, unlocked for publishing and made live during the same period.

## What is collected (per page view)
- the **page** (`/`, `/templates`, `/templates/13`, a landing page, `/s/<slug>` for a published invitation). Never the query or the
  fragment: a private link lives in the fragment, and the old `/edit/<key>` path is reported as `/edit`.
- the **site they came from** (its name only, on the first page of a visit) and the **campaign tags** (`utm_source`, `utm_medium`,
  `utm_campaign`) when a link has them. Use them on links you share: `https://invitestudio.co/?utm_source=instagram&utm_medium=bio`.
- from Cloudflare and the browser, on the server: **country**, **device kind** (mobile, tablet, desktop), **browser** (including
  "Instagram app" and "Facebook app", which matter for links shared there), **system**, a **screen-width bucket** and the **language**.

## What is not collected
No cookie, no IP address, no user-agent text (it is read, classified, and thrown away), no name, email or phone. The "visitor" is
`sha256(salt + today's date + IP + browser)`, which cannot be reversed and changes every day, so it can count visitors **within a day**
but cannot follow anyone across days. A person who comes on three days counts as three visitors; the page says so.
Not counted at all: Do Not Track and Global Privacy Control visitors, robots, requests from another site, `/admin` and `/api`, and any
browser where the owner has opened the admin page (it sets `invitestudio-no-track` in that browser).
Rows are deleted after 400 days (when the owner opens the Visitors section). The Privacy policy says all of this.

## Switch it on
1. Run `supabase/migrations/202611170001_analytics.sql` in the Supabase SQL Editor (a table, and two read/clean-up functions, server key only).
2. Optional: in Cloudflare Pages add a variable `ANALYTICS_SALT` (any long random text, encrypted). If it is not set, the admin session
   secret is used, so there is nothing you must add.
3. Deploy. Visits start to be counted; the section fills in as people visit. Open `/admin` once in each browser you use yourself.

## What the section shows
Visitors, page views, pages per visitor, invitation views, a daily chart, visits and publishing activity, and tables by
page, referrer, country, device, browser, system, screen width, language, design looked
at, campaign link and published invitation. Ranges: 7, 30 and 90 days.

Drafts, publishing unlocks and first publications are separate database totals for the selected period. Publishing unlocks include
early access and complimentary publishing. Use confirmed Razorpay payments and refunds for sales. Campaign tags count visits.
The daily anonymous visitor count cannot connect those campaigns to individual payments.

## Cloudflare's own analytics
Cloudflare Pages also has Web Analytics (free, in the Cloudflare dashboard). It can be switched on alongside this for a second opinion
(for example, it also counts visitors who block our script); it is separate from this section.
