# Landing page copy: launch version

> **Superseded for the home page (22 November 2026).** The home page was rebuilt into six sections with the owner's approval
> (`marketing/LAUNCH_PLAYBOOK.md`): headline "Your wedding invitation, in one link", every design playing its opening, "It opens like
> a video. Then it stays useful.", three steps, "Rather we build it for you?", one compact price section and five questions.
> The source is `figma/islands/Home.tsx`; the rules below (true claims only, no invented testimonials) still apply.

Status: decisions made by the product owner. Applied: hero subhead, problem strip, closing call to action, two new FAQ questions (home page and `functions/_shared/seo.js`), and the "in minutes" claim removed from the closing call to action and the `/wedding-invitation-website` heading. Not applied, with reasons, in the list below.

**Decisions:** (1) keep the current main headline; the subhead change is approved. (2) Payments are live, so no early-access wording. (3) No "in minutes" claim until a first-time build is timed.

## Rules this copy follows

- Only claims the product supports today (`docs/PRODUCT_DECISIONS.md`, `docs/PRICING_PLAN.md`, `docs/OUTREACH_PLAN.md`): animated templates, events and photos, RSVP with spreadsheet download, private preview, one shareable link, pay once to publish, no subscription, weddings only, no custom domains yet.
- No prices (they differ by region and are placeholders).
- No invented testimonials, couple counts, awards or ratings. The testimonials section already hides itself when empty; keep it that way until we have real quotes with written permission.
- No competitor names.
- Needs a check before use: any time claim such as "in minutes". Time a first-time user building one invitation, then use the real number.

## Hero

**Eyebrow:** Wedding invitation websites

**Headline:** Create a wedding website your guests will love *(unchanged, by decision)*

**Subhead:** An animated invitation with your events, photos and RSVP, all in one link guests open on their phone. Build and preview it free. Pay once, only when you publish.

**Primary button:** Start your invitation
**Secondary button:** See a live example *(link to a published demo invitation; make this before launch)*

**Trust row:**
- Free to build and preview
- Pay once. No subscription
- Guests need no app or account

## Problem strip (new, one short section under the hero)

**Heading:** Wedding details shouldn't live in twelve chat threads

Three short columns:
1. **The card has no room.** Venues, schedules and travel details end up in separate messages.
2. **Changes mean resending.** A new time or venue should reach every guest at once.
3. **Replies get lost.** Counting who is coming shouldn't mean scrolling through WhatsApp.

**Bridge line:** Put it all on one page instead.

## How it works

Keep the current four steps and their "Free" / "One-time payment" tags. They are accurate and the "you only pay at step 4" promise is our best trust builder.

**Subhead tweak:** From first look to shared link in four steps. You only pay at the last one.

## Features: "Everything you need for your big day"

Lead with the benefit, then the detail. Six tiles:

| Tile | Copy |
|---|---|
| Animated openings | Curtains that part, falling blossom, a date to scratch away. The first five seconds are the ones guests remember. |
| Every event in one place | Mehendi to reception: times, venues and travel details, all on one page. |
| Replies in one list | Guests give their name, whether they're coming and how many. You see every reply and download a spreadsheet. |
| Made for phones | Most guests will open it on their phone, so every design is built for that first. |
| Share anywhere | Send one link by WhatsApp, text or email. The preview shows your names and date. |
| Change it anytime | A time moves? Update the page and every guest sees the latest. |

Remove "on every plan" from the section subhead. It implies plans that don't exist. Use: *All the essentials, with every design.*

## Templates strip

**Heading:** Find the design that feels like you
**Subhead:** Open any design and see it exactly as your guests will. Every template is preview-ready, free.
**Link text:** Browse all designs

## Pricing section

**Heading:** Simple pricing. Pay once, when you publish.
**Body:** Building and previewing are free. When you're happy, one payment publishes your invitation and keeps it online until 2 months after your wedding. No subscription, no renewal.
**Tier line:** Classic, Premium and Signature designs. The price follows the design you choose.
**Fine print:** Prices are shown in your currency when you pick a design.

## Cultural fit (new, short; supports the Kerala launch)

**Heading:** Designed for the weddings we know
**Body:** From a quiet minimalist invitation to a kasavu-and-gold Kerala design, pick a look that fits your families and your traditions. *(Use the Kerala line only once the Kasavu design is approved and offered; it is still under review.)*

## Social proof (hold until real)

Show the section only when there are real quotes. Until then, replace with a plain line under the templates: **Be one of our first couples.** Early couples get hands-on help from us. *(Only if we really offer that.)*

## FAQ: edits and additions

Keep the existing questions and add:

- **Do my guests need an app or an account?** No. They open the link in their phone's browser and reply with their name.
- **Can I see it before guests do?** Yes. Preview it privately as often as you like and publish only when you're happy.
- **What happens after the wedding?** Your invitation stays online until 2 months after your event, then it and the replies are deleted.
- **Can I use my own domain?** Not yet. Every invitation gets its own InviteStudio link.
- **Do you do other occasions?** Weddings only for now.

## Closing call to action

**Heading:** Ready to send something they'll remember?
**Body:** Start with a design you love. It's free until you publish.
**Button:** Start your invitation

## SEO

**Title (keep under 60 chars):** InviteStudio: Animated Wedding Invitation Websites
**Meta description (under 155):** Build an animated wedding invitation with events, photos and RSVP. Preview free, pay once to publish, share one link on WhatsApp.

## To do before this goes live

1. Time a first-time build and replace any "minutes" claim with the measured number.
2. Publish one polished demo invitation and wire the secondary button to it.
3. Apply the remaining sections (problem strip, feature tiles, FAQ additions, closing call to action) once approved.
4. Apply to `figma/islands/Home.tsx` and `functions/_shared/seo.js`, run `npm run build:figma`, `npm run stamp` and `npm run test:unit` (the SEO tests check page copy).

## Not applied, and why

- **Feature tiles, templates strip, pricing section:** the live page already has accurate versions (the tiers are real plans: Classic, Premium, Signature). The pricing copy there is better than my draft, so it stays.
- **Features subhead:** my earlier "no plans" change was wrong and is reverted.
- **Kerala "cultural fit" section:** wait until the Kasavu design is approved and offered.
- **Social proof:** see below.
- **"See a live example" button:** needs a published demo invitation first.

## Placeholder testimonials: kept by decision

`figma/islands/shared.tsx` holds three dummy testimonials (Priya & Arjun, Anjali & Rahul, Meera & Abin), marked "DUMMY PLACEHOLDERS ... replace before launch". The product owner decided to proceed with them as they are. They are still not real quotes, so the section says "From couples we have made websites for", which is not true of them. Replace them with real, permitted quotes as soon as we have any; an empty list hides the section.
