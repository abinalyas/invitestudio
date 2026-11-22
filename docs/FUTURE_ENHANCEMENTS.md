# Future enhancements

Items that are deliberately out of the current release. Each needs a product decision or
backend work before it is built. Nothing here is a promise of a date.

## Designer

- **Reorder events.** Events appear in the order they were added. Reordering needs a
  position field in the backend and an up/down or drag control. Deferred from D3 by decision.
- **Edit the default copy as a field, not a fallback.** Today an empty pre-title or section
  heading shows the default ("THE WEDDING OF", "Our Story"). A way to hide the line entirely
  would need an explicit "hidden" value.

## Media

- **Photo storage.** Gallery and hero photos stay disabled until persistent storage exists.
  No upload control is shown before then.

## Guests and RSVP

- **Live guest responses.** The RSVP preference is stored, but no responses are collected yet.
- **Travel beyond events.** Travel details live on each event. Broader travel information
  (for example a venue-wide page) would be a new section, not a change to the event data.

## From couples' questions (Reddit, November 2026)

Noted from r/weddingplanning threads where couples asked which wedding website to use. Their guests kept phoning
with the same questions: hotel block, whether kids are invited, dress code, what time to arrive. Event fields today
cover dress code, venue, directions, parking, accommodation and accessibility (`event-fields.js`). The items below are
not built.

### Guest information

- **Kids policy.** A clear "adults only" / "children welcome" / "family only" choice, with a kind default wording.
  Today it can only be written into a description. Couples said this is the question that causes the most awkward calls.
- **Hotel block details.** Accommodation is free text today. Add a booking link, a group code and a **booking cutoff
  date**, which guests most often miss.
- **Arrival time.** A "please arrive by" time shown separately from the start time (usually 20–30 minutes earlier).
- **FAQ section.** Question and answer pairs for anything that does not fit an event (gifts, plus-ones, photos during the
  ceremony, weather plan).

### RSVP

- **RSVP deadline.** A "please reply by" date shown on the invitation and the RSVP form, set a few weeks before the
  caterer needs final numbers. After it passes: close the form or show a message (decide which).
- **Reminder to guests who have not replied** (needs a contact channel; decide email or WhatsApp share first).

### Sharing

- **QR code for printed invitations.** Download a QR code of the invitation link to print on paper cards, so the website
  works alongside printed invites.

### Pricing and positioning

- Couples asking for "free if possible" compare us with Zola and Joy, which have free websites with RSVP. Decide whether
  to answer that with a comparison page, a clearer "free to build and preview" message, or a limited free tier. Our
  difference is animated, invitation-style designs and Indian multi-event weddings, not price.

### Content (marketing, not product)

- **"What to put on your wedding website" checklist**: basics and arrival time, hotel block with cutoff date, dress code,
  kids policy, RSVP with deadline, parking and transport, FAQ. Use as a blog post (SEO), an Instagram carousel and an
  answer for Reddit threads. Ideally each item maps to a field in the editor.
