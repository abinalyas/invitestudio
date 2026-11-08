# RSVP plan (draft for review)

Status: draft. Nothing here is built. Decisions 1 to 6 below were made by the product owner; decision 7 and the
points under "Still to confirm" are open. This plan replaces the RSVP part of `docs/PRODUCT_DECISIONS.md` section 2
once approved (the earlier "no per-event, no edits" wording is superseded).

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Meal and access needs | One optional **free-text** field. No couple-defined menus. |
| 2 | Names of extra guests | **Count only.** The guest gives their own name and how many people are in their party. No names for the others. |
| 3 | Replies per event | **In the first version.** If a wedding has several events, the guest says which ones they will attend. |
| 4 | Guests change their reply | **Yes**, with a private link shown on the confirmation. |
| 5 | Notifications to the couple | **None** for now. The dashboard is the only place replies appear. |
| 6 | Retention | Everything is kept for **2 months after the wedding**, then deleted. Longer keeping is a later paid option. |
| 7 | Contact methods for the fallback | **WhatsApp or phone call.** No email. The number is shown publicly on the invitation, and the editor says so. |

## What guests see

- The template's RSVP section holds a button ("Reply") that opens a short form:
  - **Your name** (required)
  - **Will you attend?** yes or no (required). With several events: which events (each yes or no).
  - **How many people in your party** (including you; the couple sets the maximum)
  - **Meal or access needs** (optional, free text, short)
  - **A message for the couple** (optional)
- Nothing else is asked: no email, no phone.
- A line under the form says who sees the reply: "Only the couple can see your reply."
- **Confirmation:** a thank-you that repeats the reply back, and a private "change my reply" link (copyable). For
  guests who said yes: the event details and directions link, and an "add to calendar" file for each event.
- **Closed:** after the couple's reply-by date, or when the couple closes responses, the form is replaced by
  "Replies are closed" and the couple's contact method (if set).
- The form is one platform-owned component, themed by each template's colours and wording keys (the button label and
  headings are editable wording). In the editor preview it works but does not submit.

## What couples control (editor, "Replies" section)

- **Mode** (this already exists as a setting and does nothing today):
  - *Replies online* (name, attending, party size, needs, message)
  - *Attending only* (no party size)
  - *Contact details only* (no form; the template shows the couple's contact)
  - *No response form* (the section is removed)
- Reply-by date (optional) and the maximum party size (default 10).
- A switch to close or reopen responses.
- The contact method for the fallback and for the closed state.

## Couple's dashboard

A "Responses" panel in the editor, opened with the same private edit link as the rest of the draft:

- Totals: attending, not attending, total headcount (and per event).
- The list: name, attending, party size, events, needs, message, when. Search. Newest first.
- Delete one response. **Export to CSV.**
- Close or reopen responses. A banner shows how long the data will be kept (see retention).

## Data model

New table `wedding_rsvps` (the older `rsvps` table keeps its legacy rows):

| Column | Notes |
|---|---|
| `id` uuid | |
| `wedding_id` | references `weddings`, on delete cascade |
| `guest_name` | 1 to 160 characters |
| `attending` | boolean (overall) |
| `party_size` | 1 to 20; 0 when not attending |
| `event_replies` | jsonb: `{ "<event id>": true/false }`, only for weddings with several events |
| `needs` | text, up to 500 characters |
| `message` | text, up to 2000 characters |
| `change_token_hash` | hash of the guest's change link (the link itself is never stored) |
| `created_at`, `updated_at` | |

Settings live with the wedding (`weddings.rsvp_settings` jsonb): `mode`, `maxParty`, `replyBy`, `open`, `contact`
(`{ type: whatsapp|phone|email, value }`). The existing `preferences.rsvp` value maps onto `mode`.

No IP address is stored. Rate limiting uses a short-lived hashed counter.

## API (Cloudflare Pages Functions, same pattern as publishing)

- `POST /api/public-weddings/:slug/rsvp`: a guest submits. Only works for a published wedding with replies open.
  Validates every field, rate limited, returns the confirmation and the change link.
- `PUT /api/public-weddings/:slug/rsvp/:token`: a guest changes their reply with the link.
- `GET /api/weddings/:id/rsvps`, `DELETE /api/weddings/:id/rsvps/:rsvpId`, `GET /api/weddings/:id/rsvps.csv`:
  couple only, with the edit token.
- The public projection of a wedding gains `rsvp`: mode, open or closed, max party, reply-by date, contact method.
  It never includes any reply.

## Abuse and privacy

- Rate limit per invitation and per source (the in-application counter described in `docs/RATE_LIMITING.md`), a daily
  cap per invitation, hidden spam-trap field, strict length limits, plain text only (no links rendered).
- Needs and messages are shown as text only, never as markup.
- Dietary and access needs can be sensitive: they are visible only to the couple, never in the public page or logs,
  and are deleted with everything else.
- Responses are deleted when the wedding is deleted, and by the retention rule below.

## Retention (decision 6)

Everything about a wedding (the invitation page and its replies) is deleted **2 months after the wedding date**. The
date is the last event date, or the wedding date if there are no events.

- A daily scheduled job removes expired weddings.
- Before deletion the couple is warned in the editor (a banner from 14 days before, with the CSV export one click
  away). There is no email channel yet, so a couple who never opens the editor is not warned.
- Weddings with no date: not deleted until a date is set; to confirm (see below).
- Later: a paid option to keep longer.

## Order of work

1. **Contact fallback** (no backend): the "contact" and "none" modes work; the "not open yet" note goes away.
2. **Replies online:** settings, the form, storage, confirmation with the change link, per-event replies.
3. **Dashboard:** totals, list, search, CSV, delete, close or reopen.
4. **Retention job** and the in-editor warning, then the calendar file.

Each step ships with tests (validation, rate limit, privacy of the public projection, closed state, deletion).

## Defaults settled

- Deleting the whole invitation page (not only the replies) 2 months after the wedding date: confirmed.
- Weddings with no date: not deleted until a date is set (revisit when the retention job is built).
- The only warning is the banner in the editor (no email channel).
- No reply-by date unless the couple sets one; maximum party size 10.

## Progress

- **Phase 2 (online replies): built.** Migration `202611080005_wedding_rsvps.sql` (table, rate-limit counters, atomic
  counter function). Guests reply from a Reply button on every design (name, attending, how many, per-event answers
  when there are several events, meal or access needs, a message). Confirmation repeats the reply and gives a private
  change link (`/s/<slug>#reply=<secret>`; the secret is hashed in the database and removed from the address bar when
  used). Limits: 5 replies per hour per device per invitation, 300 per hour per invitation, 1000 replies per
  invitation, a hidden spam-trap field. Settings live in `preferences` (`rsvp`, `rsvpOpen`, `rsvpReplyBy`,
  `rsvpMaxParty`, `rsvpContact`); closed or past the reply-by date, guests see "Replies are closed" and the couple's
  number if given. The editor's RSVP panel holds the settings and a basic replies list (totals, search, delete).
  Still to do in phase 3: CSV export, per-event totals polish. Phase 4: retention job.

- **Phase 1 (contact fallback): built.** "Contact details only" shows the couple's WhatsApp or phone link in the
  RSVP section of every design; "No response form" says nothing; the other two modes still show the honest
  "not open yet" line until online replies exist.
