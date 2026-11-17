# Session recordings (Microsoft Clarity)

Watch how real visitors use the **public marketing pages**: where they click, how far they scroll, where they give up. Heatmaps
too. Free (Clarity has no traffic limit). Not live: a recording appears in Clarity a few minutes after the visit.

## What is recorded, and what never is
- **Only** the home page, the templates page, the design pages and the search landing pages (the guides).
- **Never** the setup steps, the editor, previews, the dashboard, any dialog (publish, payment details, replies) or a published
  invitation: they hold names, dates, phone numbers and guests' details. The page watches which screen is showing and switches
  recording off, and marks the page `data-clarity-mask`, the moment a visitor enters one. Direct visits to those screens never get the script.
- **Not** for visitors in the European Economic Area, the United Kingdom or Switzerland (recording them would need a consent banner),
  **nor** for visitors whose country is unknown. In Cloudflare terms: the decision is made on the server from the visitor's country.
- **Not** for Do Not Track or Global Privacy Control visitors, and not in a browser where you have opened `/admin`.
- The privacy policy describes this.

## Switch it on
1. Create a free project at <https://clarity.microsoft.com> (sign in with a Microsoft, Google or Facebook account). Add your site's
   address. You do NOT paste Clarity's code anywhere: we load it ourselves.
2. In Clarity, **Settings, Setup (or Masking): set the masking mode to *Strict*.** This is a second safety net: all text and images are
   hidden in recordings (you still see layout, clicks, scrolling and heatmaps). If you later want to read the marketing text in the
   recordings, switch to *Balanced*; the pages that hold personal details are not recorded either way.
3. Copy the **Project ID** (Settings, Overview; a short code of letters and numbers).
4. Cloudflare Pages, Settings, Variables and Secrets, **Production**: add `CLARITY_PROJECT_ID` = that code. Redeploy.
5. Visit your site from a phone on a network in a non-European country, wait a few minutes, and open Clarity: the recording appears under
   **Recordings**. Then check the safety: during that visit go into setup or the editor, and confirm the recording shows nothing from
   those screens (it should stop or be blank/masked). **Please do this check once; it is the one part we cannot test from here.**

To remove it: delete `CLARITY_PROJECT_ID` and redeploy. Nothing is loaded and the policy header goes back to strict.

## Telling your own visits from real customers' (Clarity side)
- Your browsers where you have opened `/admin` are not recorded.
- In Clarity: **Settings, IP blocking** (block your home/office address), and filter recordings by device, country and source.
- A friend's phone: open `/admin`'s sign-in screen is not possible for them; use Clarity's filters, or ask for the "don't count me" link
  (not built yet).

## How it is wired
- `functions/_shared/replay.js`: decides per page (page kind, project configured, visitor's country known and outside the EEA/UK/CH) and
  widens the security policy (`script-src`, `connect-src`, `img-src`: `https://*.clarity.ms https://c.bing.com`) **only on those
  pages**. Every other page keeps the strict policy.
- `functions/_middleware.js` and `functions/_shared/landing.js`: add `<meta name="invitestudio-replay" content="<id>">` (and, on landing
  pages, the script) only when allowed.
- `replay.js`: reads that meta, loads Clarity, and stops/masks it on any private screen (see above).
