# Product decisions (D0)

Status: approved by the product owner. These decisions set scope for the design
completion plan (`docs/DESIGN_COVERAGE_AUDIT.md`) and the implementation that follows.

## 1. Commercial model

- Launch as a **free beta / early access** product.
- No pricing plans, no paid tiers, and no commercial claims (no plan names, prices,
  "free forever" or similar) until product usage, hosting costs and demand are validated.
- The website may say that invitations are **free during early access**.
- The pricing page and the pricing modal are reworked to say this, and nothing else.

## 2. RSVP scope (initial launch)

Supported fields:

| Field | Required | Notes |
|---|---|---|
| Guest name | Yes | |
| Attending / Not attending | Yes | |
| Number of guests | No | Limit is configurable per invitation (couple sets the maximum) |
| Dietary preferences | No | Free text, short |
| Message to the couple | No | Free text, short |

- Simple and mobile-first. No seating, no meal menus, no advanced guest management.
- Built in Phase 7 of the plan. Not built as part of D0 or D1.
- **Updated:** the fields above are refined, and guest edits, per-event replies and retention are decided, in
  `docs/RSVP_PLAN.md` (draft). Where they differ, that plan applies once approved: the guest gives a count only (no
  names for others), the dietary field is "meal or access needs", replies can be changed with a private link, replies
  can be per event, and everything is deleted 2 months after the wedding.

## 3. Kerala wedding design

- Kerala weddings are part of the initial launch.
- `ivory-heirloom` is **not** approved as the Kerala design. It is a temporary mapping.
- Direction: kasavu ivory, gold, deep green. Subtle, traditional Kerala-inspired motifs.
  Elegant and contemporary rather than heavily decorative.
- The design is shown as rendered guest invitations for review before it is finalised.

## 4. Launch occasions

- **Weddings only** at launch.
- The architecture stays extensible for other occasions, but the public product does not
  expose the other categories until their experiences are designed and implemented.

## 5. Customisation model

Curated, template-based customisation. The product principle is: **couples customise
their invitation content, not redesign the template.**

Included at launch:

- Edit invitation content and the supported event details.
- Choose a template, and change it later.
- Show or hide supported sections.
- Each template keeps its own curated colour palette and typography.

Not included at launch:

- Free-form palette editor.
- Custom sections.
- Typography controls.
- Hero image customisation, until persistent image storage exists. Intro image and
  intro music follow the same rule.

Advanced settings are limited to functionality that genuinely exists.

## 6. Defect and fix scope (approved)

These were reproduced before fixing, and each fix has regression tests:

1. Intro media (image and music) must not break saving. Payload size is controlled, and
   uploads are gated until persistent media storage exists.
2. Template selection is explicit. Unknown or unavailable templates are refused, and
   the UI shows an explicit unavailable state rather than a silent fallback design.
3. Project deletion is available, with confirmation and data cleanup.

## 7. Not decided here

- Monetisation after early access.
- **Keeping time and extensions:** see `docs/RETENTION_PLAN.md` (2 months by default, longer on request or for a fee, all of it configurable).
- Image storage provider and limits (needed before hero and intro media). **Decided: Cloudflare R2; see `docs/MEDIA_PLAN.md`** (limits there are suggestions to confirm).
- Guest-facing RSVP form design (Phase 7 design work).
