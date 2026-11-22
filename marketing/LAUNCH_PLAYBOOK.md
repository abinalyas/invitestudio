# InviteStudio launch playbook: first 30 days

Owner: marketing lead. Reader: CEO and the whole team. Written 22 November 2026.
Companion files: `marketing/INSTAGRAM_30_DAYS.md` (every post, with captions), `docs/PROMOTION_KIT.md` (message rules and outreach scripts),
`docs/OUTREACH_PLAN.md` (directories and press), `marketing/README.md` (the assets and how to remake them).

## 1. Where we really are

| What we have | What we are missing |
|---|---|
| A finished product: 9 animated designs in the gallery, events, photos, RSVP with a spreadsheet, private preview, one link, pay once | **Any audience.** The Instagram page is empty, no couple has been featured, there is no public demo link |
| Payments (Razorpay), prices by country, promo codes, a `/admin` page that counts visits, drafts, payments and live invitations, campaign tags | **Proof.** Not one real couple, not one real quote (the home page's quotes are placeholders and hidden) |
| Good written plans (`PROMOTION_KIT`, `OUTREACH_PLAN`, `SEO_PLAN`, landing copy) | **Execution.** Almost none of those plans has been carried out |
| | **A word-of-mouth loop.** Until today, a live invitation said nowhere where it was made (fixed: see section 3) |

**Timing matters.** It is late November: the middle of the Indian wedding season, and couples are planning weddings for January to May
right now. Each week we wait, couples choose a printed card or a video invitation. Speed beats polish for the next 30 days.

## 2. Who we sell to, and what we say

**First customer: Indian couples, Kerala first.** Our contact number is Indian, payments run on Razorpay with UPI, the sample couples
are Kerala couples, and a Kerala design is part of the launch plan. Second: Malayali families in the Gulf (we already have a Gulf price)
and their relatives at home, because an invitation link travels where a printed card cannot.

**Who also decides:** in many Indian families, **parents and siblings** send the invitations. Talk to them too, not only to the couple.

**The category people already know is the "wedding invitation video"** sent on WhatsApp. We do not fight it; we beat it:

> **It opens like a video. Then guests can find the venue, see every event, and tell you they're coming.**

| A video invitation | An InviteStudio invitation |
|---|---|
| Plays once, then it is over | Opens with the same cinematic moment, then stays useful |
| No map, no schedule, no RSVP | Every event with time, venue and directions, plus RSVP |
| A change means a new video | Change the page and every guest sees the latest |
| A heavy file in the family group | One light link with a preview card |

Rules that do not bend (from `docs/PROMOTION_KIT.md`): only true claims, no fake reviews or couple counts, no competitor names,
no prices in posts (they differ by country), every link tagged.

## 3. Shipped today: every invitation now advertises us

A live invitation (`/s/<name>`) now ends with one quiet line below the couple's own footer:
*"Invitation made with InviteStudio · Planning a wedding? Build and preview yours free"*. It is never over the design, it says nothing
about price, and its link is tagged `utm_source=invitation`, so `/admin` shows exactly how many couples it brings.

**Why this is the most important growth decision in this plan:** an Indian wedding invitation is opened by **hundreds of guests**, and a
good share of them are engaged, about to be, or the parent or sibling of someone who is. Every couple we win becomes an advert seen by
hundreds of the right people, at no cost. Nothing else on this list compounds like it.
(Tested: `tests/cloud/public-page.spec.js`. If a paying couple asks for it to be removed, say yes, and track how often that happens.)

## 4. The goal and how we measure it

**North-star number: paid, live invitations per week.** Everything else is a means to it.

| By | Target (my estimate; recalibrate after week 2 with real numbers) |
|---|---|
| Day 7 | Instagram live with 12+ posts; 20 founding couples contacted personally; 10 vendors contacted |
| Day 14 | 10 invitations live (founding couples, free publish); 3 written testimonials with permission |
| Day 30 | **30 paid invitations**; 1,000 Instagram followers; 5 vendor partners sending couples |
| Day 90 | 300 paid invitations, with half of new drafts coming from invitations, vendors and referrals (not from ads) |

**Weekly scorecard (every Monday, from `/admin` → Visitors, 7 days, plus the campaign-link table):**
visitors → looked at a design → started a draft → paid → made it live, **split by campaign tag**. One rule decides the budget:
*more money and time go to whatever brings paid invitations, not likes.*

## 5. The channels, in the order we work them

### 5.1 Founding 20 couples (week 1 to 2): proof first

Without one real couple, nothing else converts. So we buy proof with free publishes.

1. Every team member lists everyone they know who is getting married in the next 6 months, plus their siblings and cousins.
2. Message each one personally (script: `PROMOTION_KIT` section 1). Offer: **we build it with you on a call, and publishing is free, in return
   for honest feedback and, only if they are happy, permission to show their invitation.**
3. Make one promo code per couple in `/admin` → Promo codes (1 use, 30 days).
4. When they go live: ask for a 1 to 2 sentence quote and written permission (`OUTREACH_PLAN` template 4). Never post without the written yes.
5. Their guests see the credit line. Their invitations become our best Instagram content (with permission).

### 5.2 Done-for-you on WhatsApp (start day 1): for people who will not build it themselves

Many buyers, especially parents, will never open an editor. Offer: **"Send us your names, dates, venues and photos on WhatsApp. We'll build
your invitation and send you the private preview within 24 hours. You pay only if you publish."** The team builds it in the editor and sends
the preview link. This costs time, not money, converts the highest-intent buyers, and teaches us exactly where the editor confuses people.
Put this offer in the Instagram bio and in every vendor conversation.

### 5.3 Wedding vendors (week 1 onwards): the people couples already trust

Photographers, videographers, make-up artists, planners, decorators and venue managers in Kerala talk to couples **months before the
wedding**, exactly when invitations are decided.

- **The offer to a vendor:** "Add a free animated invitation to your packages. We give you codes; your couples get their invitation free, built
  with your photos, and your name is in the thanks." It costs us only hosting, and it makes the vendor look generous.
- **How:** search Instagram for `kerala wedding photographer`, `kochi wedding planner`, `kerala bridal makeup`, `thrissur wedding`, `trivandrum
  wedding`, and similar. Pick active accounts with 2k to 50k followers (small enough to reply). Message 10 a day (script: `PROMOTION_KIT` section 5).
- **Give every vendor:** a tagged link (`utm_campaign=<vendor-name>`) and a 5-use promo code. Build a sample invitation with *their* portfolio photos
  (with their permission) so they can show couples what they would get.
- **Later (product work, see section 8):** a revenue share needs payments tied to a vendor. Do not promise commission until that exists.

### 5.4 Instagram (day 1 onwards): the shop window

Full calendar and captions: `marketing/INSTAGRAM_30_DAYS.md`. The short version:

- **Ready to post today:** 9 vertical Reels (`marketing/clips/`), one per design, each showing the real opening, then the story, events, photos
  and RSVP, then an end card. 9 feed posts (`marketing/posts/`) and a profile picture.
- **One Reel a day for 30 days**, plus Stories every day. Reels are what reach people who do not follow us yet.
- **Add trending audio inside the Instagram app** when posting. The clips are silent on purpose; trending sound is chosen in the app and reaches more people.
- **Week 2 onwards:** a team member on camera. Faces build trust much faster than screen recordings. Formats: "I made my sister's wedding invitation
  in one evening", "What guests see when they open it", "Video invitation vs invitation website".
- **Collabs:** use Instagram's Collab post with every founding couple and vendor partner, so the post shows on both accounts.
- **Handle:** `@invite__studio.co` is hard to say and type (double underscore). If `@invitestudio` or `@invitestudio.in` can be claimed, switch before
  we start growing; the follower count is near zero, so switching now costs nothing.

### 5.5 Meta ads (from day 10, only after posts exist): pour fuel on what already works

- **Budget for the test:** ₹1,000 a day for 10 days (₹10,000). Promote the 3 Reels with the best saves and shares, not the ones we like most.
- **Who:** India, Kerala first, then Tamil Nadu and Karnataka; ages 22 to 35; interests around weddings and wedding planning. Also test a
  "parents" set (40 to 60) with the done-for-you offer. Use whatever wedding and life-event targeting Ads Manager offers at the time; options change.
- **Where the ad goes:** a design page (`/templates/<id>`), tagged `utm_source=meta&utm_medium=paid&utm_campaign=<reel-name>`.
- **Decide with numbers (from `/admin`):** keep an ad only if it produces drafts at under ₹150 each, and paid invitations at under a third of the
  price paid. Switch off anything worse after ₹3,000. Double what passes.

### 5.6 Search, directories and press (ongoing, 2 hours a week)

The SEO groundwork is built (`docs/SEO_PLAN.md`). Still to do, and owner-only: verify Google Search Console and submit the sitemap. Then work
through `docs/OUTREACH_PLAN.md`: WedMeGood, WeddingWire India, ShaadiSaga, WeddingSutra vendor listings first; Product Hunt and other software
directories second.

## 6. The 30-day plan

| Days | Do | Who |
|---|---|---|
| 1 | Profile picture, bio and link set; post the first 3 Reels and 3 posts (so a visitor never sees an empty page); Story highlights "Designs", "How it works", "RSVP" | Marketing |
| 1 | Publish one polished **demo invitation** with a fictional couple, labelled "sample"; put its link in the bio and the home page's "See a live example" | Product |
| 1 to 3 | Every team member sends the founding-couple message to their own network (target: 50 messages, 20 couples) | Everyone |
| 1 to 30 | One Reel a day; Stories daily; answer every comment and message within 1 hour, 9 am to 10 pm | Marketing |
| 2 to 30 | 10 vendor messages a day; follow up once after 3 to 4 days | Marketing |
| 3 to 14 | Build invitations with the founding couples on calls; fix every confusing step they hit (log them) | Product + marketing |
| 7 | First Monday scorecard | CEO + marketing |
| 8 to 14 | First team member on camera; first couple Collab post; collect 3 testimonials | Marketing |
| 10 to 20 | Meta ads test (section 5.5) | Marketing |
| 15 | Replace placeholder testimonials on the home page with real ones (with written permission) | Product |
| 15 to 30 | Scale whatever the scorecard says works; drop the rest; submit to 2 directories a week | Marketing |
| 30 | Review against section 4; set the next 60 days | CEO + marketing |

## 7. Budget for month 1 (proposal)

| Item | Amount | Why |
|---|---|---|
| Meta ads test, then scale only what passes | ₹30,000 | ₹10,000 test, ₹20,000 held back for winners |
| Small creator and wedding-page collaborations | ₹15,000 | 3 to 5 Kerala wedding pages or creators with engaged followers |
| Free publishes (founding couples, vendors) | ₹0 cash | Costs hosting only; it is the cheapest proof we can buy |
| **Total** | **₹45,000** | Nothing is spent on ads before the profile has 12+ posts |

## 8. Product changes that would help marketing (in priority order)

1. **Shipped:** the credit line on live invitations (section 3).
2. **A "Real invitations" page** on the site, filled with founding couples who agreed (`OUTREACH_PLAN` section 4).
3. **A referral reward:** a couple who brings another couple gets something. Needs payments tied to a referral code.
4. **Vendor attribution:** promo codes that give a discount (not only a free publish) and tie a payment to a vendor, so we can pay a commission.
5. **Optional music** on the clips and in the editor, licensed properly, since Reels and video invitations live on sound.

## 9. What I need from you, the CEO, this week

1. **Are payments switched on in production** (`PAYMENTS_MODE=live`), and **are the prices final?** `functions/_shared/pricing.js` still calls them
   placeholders. We cannot sell until this is a yes.
2. **Approve the ₹45,000 month-1 budget** (section 7).
3. **Approve free publishes** for the founding 20 couples and 5-use codes for vendor partners.
4. **One team member on camera** from week 2. It need not be you, but someone has to be the face.
5. **Instagram handle:** try to claim a cleaner one (section 5.4) before we grow the current one.
6. **Merge the pull request** with the credit line, the clips and this plan, and deploy it.
