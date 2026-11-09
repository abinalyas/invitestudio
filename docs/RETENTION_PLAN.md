# Retention plan: how long a website is kept, and how to keep it longer

Status: plan for review. Nothing here is built. It replaces the "Retention" section of `docs/RSVP_PLAN.md` and covers
photos too (`docs/MEDIA_PLAN.md`).

The rules below are **settings, not hard-wired behaviour**, because the pricing model is not settled. Everything that
may change (how long, how much, which designs cost what) lives in one place, so changing it later is an edit, not a
rebuild.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Default keeping time | Every website is available until **2 months after the last event date**, but **no longer than 8 months after it was first published** (both are settings). Included with every design. |
| 2 | Keeping it longer | Paid, and the price **depends on the design** (some designs are higher tiers). Not built yet: handled by contacting us, one website at a time, until the model is settled. |
| 3 | Something unique | A **"talk to us"** route for custom work. Same contact route as extensions. |
| 4 | What "kept" covers | The invitation page, replies, photos, private edit links: everything, as in `docs/RSVP_PLAN.md`. |
| 5 | Changing the rules later | Yes, expected. See "Built to change". |
| 7 | Settled answers | 8-month cap from first publishing. No event date: kept **4 months** after the last change. 14-day grace period and 14-day warning. A freed web address is held **6 months**. Contact route: **email and WhatsApp** (the details are set in one place in the site's settings, not written into pages). |
| 6 | Publishing very early | The cap counted from the publish date means a very early publisher pays to keep the page live through their event. The app tells them the closing date when they publish. |

## What happens, in order

1. **Before:** from **14 days before** the end date, the editor shows a banner: "Your website is kept until 14 March.
   Download your replies, or ask us to keep it longer." It links to the replies spreadsheet and to the contact route.
2. **End date:** the public page stops opening ("This invitation is no longer available"). Nothing is deleted yet.
3. **Grace period, 14 days:** the couple can still open the editor, download replies, and ask us to bring the page
   back. If we agree, we set a new end date and the page returns.
4. **After the grace period:** everything is deleted for good: the website, replies, photos (stored files too), private
   links and its web address.

The grace period costs nothing and prevents most regrets. It can be set to 0.

## How the end date is worked out

Two settings, both changeable later:

- **After the event:** 2 months after the last event date.
- **Cap from publishing:** 8 months after the website was **first published**.

The website closes at the **earlier** of the two dates, unless we have set a later date for that website (for example
after a couple pays), which always wins.

Why both? Counting only 2 months from publishing would close the page *before* the wedding for anyone who publishes
early (published 3 months ahead, closed 1 month ahead), so guests could not reach the schedule or reply. Counting only
from the event gives very early publishers a long free stay. Using both covers the event for almost everyone and only
asks the very early to pay.

| Published before the event | The page stays up for | What happens |
|---|---|---|
| 2 months | 4 months | Free, until 2 months after the event |
| 4 months | 6 months | Free, until 2 months after the event |
| 6 months | 8 months | Free, until 2 months after the event |
| 10 months | closes 2 months **before** the event | Needs an extension, which is paid |

- **At publishing:** the app shows the closing date. If it falls before the event, it says so and offers the paid
  extension (or "talk to us"), so it is never a surprise.
- **Not published yet:** a draft with a date has no cap clock. A draft with no date is removed by the no-event-date rule below (4 months after its last change).
- **Unpublish and publish again:** the cap counts from the **first** publish, so it cannot be restarted.
- **Why a cap at all:** keeping a website costs very little (photos are capped at about 3 MB per website), so this is a
  decision about what is free, not about cost. It is a setting for that reason.
- **Tuning:** the audit log records how far ahead of the event each website was published. After a few weeks of real use
  the cap can be set from data instead of a guess. (The "most people publish within 3 months" idea has not been
  checked against real customers; destination weddings often publish much earlier.)

## Built to change

- **Per design:** each design in the `templates` table gets `retention_months` (default 2, the time after the event),
  `max_months_from_publish` (default 8, empty means no cap) and a `tier` label (for example `standard`, `premium`).
  Changing a design's keeping time is one edit.
- **Per website:** `weddings.keep_until` (a date, empty by default). We set it when a couple pays or we agree
  something special. It always wins over the design's rule, and can be later or earlier.
- **One place computes the end date:** a database function `wedding_ends_on(wedding)` = `keep_until` if set, otherwise
  the earlier of (last event date + the design's `retention_months`) and (first publish date + the design's
  `max_months_from_publish`). The banner, the public page, the publish screen and the cleanup job all call it, so they
  cannot disagree. This needs one more column, `weddings.first_published_at`, set once and never changed.
- **Changing the rule does not surprise anyone:** when the default or a design's months change, the new rule applies
  to websites **created afterwards**. Existing websites keep the end date they were told, unless we run a recompute
  with a preview first. The cleanup job never deletes anything earlier than the date a couple has already been shown.
- **Prices:** none are stored or promised in the app yet. When the model is settled, the tier maps to a price in one
  table, and a payment can set `keep_until` automatically (the `payments` table already exists).

## The cleanup job

- A daily job calls a protected address on the site, `POST /api/internal/retention-sweep`, with a secret token. It is a
  scheduled **GitHub Actions** workflow, so no new service is needed and it is free. (Cloudflare Pages cannot run
  scheduled code on its own, which is why the schedule lives in GitHub.)
- Each run handles a small batch (20 websites) in two steps: hide the ones past their end date; delete the ones past
  the end date plus the grace period. Deleting removes the stored photos first, then the database rows (replies, photo
  details, links are removed with them).
- **Dry run first:** until we turn deletion on, the job only reports what it *would* do, to a log. We read the first
  few weeks of reports before enabling real deletion.
- **A safety brake:** if one run would delete more than a set number of websites (for example 10), it stops and reports
  instead. Something has probably gone wrong (a wrong date, a bad rule change).
- **An audit trail:** a `retention_log` table records, for each hide or delete, the website's id, the dates and the rule
  used. It holds **no names, replies or photos**, so it is safe to keep. It answers "what happened to my website?"
  when a couple writes to us.
- The secret token lives in Cloudflare and GitHub secrets. The address refuses everything without it.

## Rules for the awkward cases

| Case | Proposed rule (to confirm) |
|---|---|
| **No event date** | A website with **no date** is kept **4 months after its last change** (decided), then handled like any other (hidden, 14 days grace, deleted). Setting a date moves it onto the normal rule. |
| **Several events** | The **last** event date counts. |
| **Date changed later** | The end date moves with it (still within the cap), but never earlier than a date the couple was already shown. |
| **Draft never published** | Same rule: no date means 4 months after its last change. A draft with a date has no clock until it is published, then follows the normal rule. |
| **Unpublished by the couple** | Same end date. Unpublishing does not extend or shorten it. |
| **Deleted by the couple** | Deleted at once, as today (this already removes photos and replies). |
| **Web address (slug)** | Freed when the website is deleted. A deleted address could be taken by anyone, so we may hold it for 6 months first (to confirm). |

## No email, so warnings are limited

We hold no email address for couples, so the only warning is the editor banner. A couple who never opens the editor is
not warned. The grace period, and publishing the end date up front, are the safeguards. If an email option is added
later (an optional "remind me" address), the same job can send the reminder. Until then, say this plainly in the
terms and on the pricing page.

## Contact route

A "Talk to us" link, used for: keeping a website longer, custom designs ("something unique"), and getting a removed
website back during the grace period. **Decided: email and WhatsApp, both offered.** The WhatsApp link opens a message
with the website's address pre-filled; the email link does the same, so we know which website it is without asking.

The two contact details are stored **once, in the site's settings**, and every place that shows them reads from there,
so changing a number or address later is one edit. They are not written into the plan or into page text. They will be
public on the site, so use ones you are happy to publish.

## What to say on the website (when decided)

The pricing and questions pages currently list plans and prices written before this model. Before launch they must say
what is true: "Every website is available for 2 months after your event (and up to 8 months from when you publish). Keep it longer from [price], or talk to us."
They are left as they are until the prices are decided.

## Progress

- **Step 1 (settings and a safe preview): built.** Migration `202611090002_retention.sql` adds the per-design settings
  (`retention_months`, `max_months_from_publish`, `tier`), the per-website ones (`first_published_at`, `keep_until`,
  `retention_floor`), a settings row (4 months with no date, 14-day grace and warning, 6-month address hold, batch of 20,
  safety brake at 10), `wedding_ends_on()` (the one place the rule lives) and `retention_preview()`, a report that
  changes nothing. `POST /api/internal/retention-sweep` (secret `RETENTION_SWEEP_TOKEN`) runs the report and records a
  one-line, counts-only summary. **No code hides or deletes anything yet.** The rules are tested in a real Postgres
  (`npm run test:db`, run by hand like the cloud suite). The report's counts include how far ahead of the event websites
  were published, for tuning the cap.

## Order of work

1. **The rule and a safe preview:** policy columns, `wedding_ends_on`, `retention_log`, and the sweep address in dry-run
   mode. One migration. Nothing is hidden or deleted.
2. **What couples see:** the editor banner (14 days before and during the grace period), the "no longer available" page,
   the "Talk to us" link.
3. **The schedule:** the daily GitHub workflow, in dry-run. Read its reports.
4. **Turn on hiding, then deleting**, after the reports look right.
5. **Later:** price per tier, paying to extend (setting `keep_until`), an admin screen to set it without SQL, an
   optional reminder email.

Each step ships with tests: the end-date rule for each case above (including the table of early publishing), the batch limit and safety brake, photo files
removed with the wedding, the address refusing a missing or wrong token, and the banner timing.

## What you need to do outside the code

- Choose the contact route (address or number).
- When step 3 is ready: add one secret, `RETENTION_SWEEP_TOKEN`, to Cloudflare and to GitHub (I will give the exact
  steps), and run the migration.

## Settled (was "still to confirm")

- 8-month cap from first publishing, for every design for now (it can differ by tier later).
- No-date rule: 4 months after the last change.
- 14-day grace period after the end date, and a 14-day warning before it.
- A freed web address is held for 6 months.
- Contact route: email and WhatsApp.

## Still open

- Which designs go in which tier, and the prices. Nothing in steps 1 to 4 needs them.
