# The admin page (`/admin`)

A private overview for the owner: how many websites are live, private (draft) or offline, which designs people use, payments,
a 30 day chart, and a searchable list of websites with the number of guest replies each has received.

- **Only the Google account(s) you list can open it.** Everyone else sees a sign-in button and, after signing in with another
  account, "That Google account does not have access."
- **Guest replies are only counted.** No guest name, phone number, note or message is sent to the page.
- The page is kept out of search engines and is never cached.
- **Private link (for support).** Each website has a *Create link* button. It makes a NEW private editing link on request: the
  couple's own links are stored only as hashes, so an existing one can never be shown. The new link works for 90 days, does not
  replace or revoke the couple's link, and the database records that it was issued from the admin page and by which account
  (`edit_tokens.metadata`). **Whoever holds the link can edit the website and see its guest replies**, so use it only to help
  a couple and do not share it.

## Switch it on (once)

1. **Run the migrations** in the Supabase SQL Editor, in this order: `supabase/migrations/202611160003_admin_overview.sql`, then
   `supabase/migrations/202611160004_admin_overview_progress.sql` (adds the progress columns and the idle / event-soon counts).
2. **Create a Google sign-in** (Google Cloud Console, <https://console.cloud.google.com/>):
   1. APIs & Services, OAuth consent screen: User type *External*, app name *InviteStudio admin*, your email. Add yourself as a *test user*.
      (You can leave it in "Testing": only listed test users can sign in, which is what you want.)
   2. APIs & Services, Credentials, *Create credentials*, *OAuth client ID*, type *Web application*.
   3. *Authorised redirect URIs*: `https://invitestudio.co/api/admin/callback` (use your real domain; add the same path on
      `https://<your-preview>.pages.dev` only if you want to use it there too).
   4. Copy the *Client ID* and *Client secret*.
3. **Cloudflare Pages, Settings, Variables and Secrets** (Production). Make the secrets *Encrypted*:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | the Client ID |
   | `GOOGLE_CLIENT_SECRET` | the Client secret (encrypted) |
   | `ADMIN_EMAILS` | your Google email; several separated by commas |
   | `ADMIN_SESSION_SECRET` | a long random text, at least 32 characters (encrypted), for example the output of `openssl rand -base64 48` |

4. Redeploy, then open `https://invitestudio.co/admin`.

Until the four settings exist, `/admin` says it is not set up and no data is shown.

## Visitors

The **Visitors** section shows anonymous visit statistics: visitors, page views, devices, browsers, countries, where people come from,
which designs they look at, and the path from visit to a live website. How it works and what it keeps: `docs/ANALYTICS.md`.
Run `supabase/migrations/202611170001_analytics.sql` first (until then the section says it is not available yet).

## Buyers' contact details

Before the Razorpay page, the payment dialog asks for **name, email, optional phone or WhatsApp, and an optional tick for tips and
reminders** (off by default). They are:
- checked on the server and kept in their own table, `customer_contacts` (not in the website row, so they can never travel with the
  invitation or its public page), readable only with the server key, and deleted with the website;
- passed to Razorpay when the payment link is made, so its page is already filled in (a bare Indian mobile number gets +91; a phone
  without a country code outside India is left for the person to type there);
- shown here only after you click **Show contact** on a website. Each look is written to `admin_access_log` (who, what, when).
  The list itself never carries them. Websites whose owner never reached payment have none.

**Run `supabase/migrations/202611160005_customer_contacts.sql` BEFORE this is deployed** (it only adds things). Until it exists, the
payment step cannot save the details and will fail.

## Finding people who need help

- **Progress** column: whether the story is written, how many events and photos, how long the website has been idle, and how
  many days until the event (for websites that are not live).
- Filters: **Idle 7+ days** (a private draft nobody has edited for a week) and **Event within 30 days** (the event is close and
  the website is not live yet). Sort by *Longest idle* or *Event date, soonest*. Two cards at the top count the same things.
- **Helping without their link:** *Create link*, then *Open editor* (best in a private window, so it does not mix with your own drafts).
- The system does not hold an email address or phone number for a couple: a draft is anonymous. Names, place and date are
  what identify one. (A couple may have typed a contact number for their guests under RSVP; that is for guests, and is not shown here.)

## How sign-in works

`/api/admin/login` sends you to Google. Google sends you back to `/api/admin/callback` with a one-time code; the server swaps
it for your verified email, checks it is in `ADMIN_EMAILS`, and sets a signed, HttpOnly cookie that lasts 8 hours.
`/api/admin/overview` checks that cookie on every request. Changing `ADMIN_SESSION_SECRET` signs everyone out.
To remove someone's access, take their email out of `ADMIN_EMAILS` (the cookie stops working at once).
