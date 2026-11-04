# Design coverage audit

Status: audit for review. No UI changes are made by this document.
Branch: `feature/figma-make-frontend-integration`.

## 0. How to read this

The Figma Make export is a design foundation: an exploration that sets the visual
direction and covers a few key screens. It is not a finished product specification.
Its placeholders, sample content, prices, template cards and mappings are not approved.

The functional source of truth is the existing application (state machine in
`index.html`, cloud flows in `cloud-sync.js`, API in `functions/`, and the migrations).
Where the export and the application disagree, this audit records the conflict and
proposes a resolution. It does not pick one silently.

Status labels used below:

- **Designed**: the export covers it and the island adaptation is in place.
- **Adapted, needs design**: the island exists, but states, sections or behaviour
  were carried over without a designed treatment.
- **Legacy**: the existing vanilla screen, still in the older visual system.
- **Missing design**: no export coverage and no island.
- **Not built**: the product feature does not exist yet.

## 1. Visual language established by the export

### 1.1 Tokens (from `figma/source/src/index.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0b2f20` | Headings, primary text |
| `--green` | `#145c37` | Primary buttons, active states |
| `--green-dark` | `#083a23` | Hover/pressed, dark panels |
| `--pale` | `#f7f1e9` | Warm panel backgrounds |
| `--cream` | `#fbf7f2` | Page background |
| `--gold` | `#a67d24` | Eyebrows, accents, emphasis |
| `--line` | `#ded9d0` | Borders, dividers |
| `--shadow` | `0 18px 50px rgba(37,46,37,.1)` | Cards, floating panels |

Typography: Playfair Display (headings, italic emphasis) and DM Sans (body, UI).
Body 15px / 1.5. Eyebrows are small uppercase gold labels (`section-kicker`).

Components in the export: `.button` (filled, `.small`, `.outline`, `.light`),
`.template-card`, `.plan` (with `.popular-badge`), `.faq-item`, `.benefit-grid article`,
`.toggle` (monthly/yearly segmented control), pill filters, editor panels with
`.editor-panel-heading`, `.device-switcher`, `.draft-badge`, `.editing-note`.

Motifs: botanical petals and leaves (`.hero-petal`, `.hero-botanical`,
`.card-flower`, `.detail-botanical`), an envelope with seal (`.envelope`, `.seal`),
and a gold-rule eyebrow. Decorative, low-contrast, used at section edges.

### 1.2 Conflict: two visual systems in the application

The application still uses its own system (`.topbar`, `.btn`, `.container`, the
champagne/sage palette `#f4eee4`, `#a77d4d`, `#28241f`). The Figma islands use the green
and gold tokens above. Both use Playfair and DM Sans, so typography is consistent, but
colour, buttons and spacing are not. Until the legacy screens are adapted, the product
shows two different brands on one site.

**Recommendation:** adopt the export tokens as the product system. Keep per-template
palettes only inside the invitation design (the guest-facing output), which is a product
feature, not part of the app chrome.

## 2. Screen coverage matrix

| # | Screen / state | Route | Export coverage | Current implementation | Status | Action |
|---|---|---|---|---|---|---|
| S1 | Home | `/` | HomePage | Island; occasion strip and recovery banner added (not designed) | Adapted, needs design | Design occasion strip and recovery banner in the export language; replace placeholder content (see §4) |
| S2 | Templates browse (8 designs) | `/templates` | TemplatesPage (filters, sort, favourites, recent) | Island; shows 8 designs only | Designed, with placeholder data | Review filters against the real catalogue; decide whether favourites and recent persist (currently in-memory) |
| S3 | Full catalogue (37 designs, categories, traditions) | state `templates` | None | Legacy, old system | Legacy | Adapt to export language; keep category and tradition filters (existing functionality) |
| S4 | Template detail | `/templates/:n` | TemplateDetailPage | Island; "Use this template" creates draft | Designed, with placeholder data | Confirm detail content (copy, tags, gallery) per design |
| S5 | Template preview modal | state `modal:template` | None | Legacy modal | Legacy | Consolidate with S4 so there is one detail experience |
| S6 | Setup wizard, 4 steps | state `setup` | None | Legacy (step 0 essentials, then style, optional details, ready) | Missing design | Design all four steps; include skip paths and validation states |
| S7 | Designer editor | `/editor/:n` | EditorPage (home hero fields, pages rail, device switch) | Island; binds to cloud draft | Adapted, needs design | Design the Events, Gallery, RSVP, Travel and Story page editors (see §3) |
| S8 | Advanced editor | state `editor`, `editorMode=advanced` | None | Legacy six-tab rail: Sections, Content, Events/Functions, Photos, Theme, Settings | Legacy | Adapt; decide which tabs move into the designer and which remain advanced |
| S9 | Preview (desktop, tablet, mobile) | state `preview` | None | Legacy "Website preview" with device pills | Missing design | Design device frames and the preview toolbar |
| S10 | Publish dialog | modal `publish` (cloud) | None | Vanilla dialog: slug field, publish, take offline, copy link, errors | Missing design | Design: draft, saving, publishing, live, slug taken, reserved, conflict, offline |
| S11 | Public invitation (guest) | `/s/<slug>` | sitePreview only (legacy renderer) | Vanilla renderer; not designed as a guest page | Missing design | Design the guest experience per template (see §5). Highest-priority screen |
| S12 | Public not available | `/s/<unknown>` | None | Vanilla message | Missing design | Design the not-available state with a clear next step |
| S13 | Dashboard (my websites) | state `dashboard` | None | Legacy cards: open, duplicate, preview | Missing design | Design project cards with status tags (Draft, Published, Unpublished) |
| S14 | Private link recovery | `/edit#<token>`, `/edit/<token>` | None | Loads draft into the designer; no dedicated screen | Missing design | Design "Opening your draft" and invalid, expired and revoked link states |
| S15 | Share and manage access | editor settings section | None | Vanilla: copy link, regenerate, revoke all | Missing design | Design the access panel with clear consequences for each action |
| S16 | Pricing | info modal `pricing` | Plans section (Free, Pro, Pro+, ₹ prices) | Modal says there are no paid plans | Conflict (see §4.2) | Product decision first, then design |
| S17 | Privacy and how your data works | info modal `privacy` | None | Vanilla modal copy | Missing design | Design; copy must match real retention and deletion behaviour |
| S18 | Support, Terms, Privacy pages | footer links | Footer links point to `#` | Not built | Not built | Decide scope; design static legal pages |
| S19 | Save states and notices | everywhere | Not designed | Vanilla status text (see §6) and toasts | Missing design | Design status indicator, conflict, retry, offline, backend-not-configured |
| S20 | Empty states | dashboard, gallery, events | Gallery and events empty copy exist in the application only | Vanilla text | Missing design | Design empty states for each collection |
| S21 | Errors | all | None | Vanilla toasts and inline text | Missing design | Design error patterns (field, form, page, network) |
| S22 | RSVP section on invitation | guest page, Phase 7 | Export shows RSVP as an editor page | Placeholder toast, no backend | Not built | Design the guest form and the owner's response dashboard together |
| S23 | RSVP dashboard (owner) | Phase 7 | None | None | Not built | Design alongside S22 |
| S24 | Photo manager | Phase 5 | Gallery editor page only | Legacy base64 photos in local storage, no cloud upload | Not built | Design upload, reorder, delete, progress and limits |
| S25 | Payment and purchase | Phase 6 | None | None | Not built | Design only after the pricing decision |

## 3. Editor coverage

The export's designer covers the hero fields (pre-title, names, date, location, button
label), a pages rail, a device switcher and a hero image control. The application stores
more than that. Each item below needs a designed home or a deliberate decision to stay in
the advanced editor.

| Area | Stored in backend | In designer | Decision needed |
|---|---|---|---|
| Hero fields | `title`, `event_date`, `location`, `preferences` | Yes | None |
| Our Story | `story`, `preferences.storyTitle`, section visibility | Yes (text and toggle) | None |
| Events and functions (name, date, time, venue, dress code, description, directions, parking, accommodation, accessibility, visibility, add, reorder, duplicate, presets) | `content.functions` | No, advanced only | Design the events list and event sheet (high priority, core to the product) |
| Gallery | `content.gallery` metadata; photos not uploaded | No | Design with Phase 5 (S24) |
| Sections (add custom, reorder, hide) | `sections` | Toggle only | Design section list; decide whether custom sections stay |
| Theme (palette, accent, text, background) | `theme`, `preferences.palette` | No | Decide whether palette is per template or user-changeable |
| Typography and layout preferences | `preferences.typography`, `preferences.layout` | No | Confirm each setting visibly changes the invitation; remove settings that do not |
| Intro (style, transition, duration, image, audio) | `intro_settings` | No | Design; see §4.1 for a size bug in the image and audio upload |
| RSVP preference (count, RSVP only, contact only, none) | `preferences.rsvp` | No | Tied to S22; design with the RSVP feature |
| Pre-title, button label | `preferences` | Yes | None |
| Publish, unpublish, slug | `slug`, `status`, `visibility` | Button and dialog | Design (S10) |

## 4. Incomplete, placeholder and conflicting functionality

### 4.1 Defects found during the audit (code-level, to be verified in a browser)

1. **Intro media can make a draft unsaveable.** `uploadIntroImage` accepts up to 900 KB
   and stores it as a base64 data URL in `introSettings.image`. `cloudPayload` sends
   `introSettings` with every save. A 900 KB image is about 1.2 MB as base64, and the
   API rejects request bodies over 1 MB with 413. Every later save of that draft would
   then fail. Audio (700 KB) has the same exposure. The architecture contract says
   images must not be stored as base64 in project JSON. **Priority: high.** Fix before
   any further design work relies on intro media.
2. **No way to delete a project.** The dashboard has open, duplicate and preview, but no
   delete. The architecture requires project deletion and a retention policy before
   production.
3. **Database-only templates render with the wrong design.** The migrations seed about 50
   template IDs that have no frontend definition (for example `kerala-kasavu`,
   `south-temple`). `tpl()` falls back to the first catalogue entry, so a draft created
   with one of these IDs would render as "Timeless Romance". **Priority: high.** Either
   restrict selectable templates to ones with a design, or deactivate the unused rows.

### 4.2 Conflicts that need a product decision

- **Pricing.** The export shows Free, Pro and Pro+ with yearly and monthly prices in
  rupees, and promises features such as custom domain and RSVP management. The
  application says "no paid plans or charges are available" and does not implement any
  of those features. Decide the commercial model before designing S16 and S25.
- **Home copy and claims.** Export claims include "Set up in minutes", "Works on all
  devices", "Collect RSVPs, meal choices and event attendance" and "Share instantly".
  Meal choices are not in the backend, and cross-device behaviour has not been tested on
  real devices. Claims need to match what the product does.
- **RSVP fields.** The export mentions meal choices. The architecture decision limits
  RSVP to name, attendance, party size and message. Decide before designing S22.

### 4.3 Placeholder content in the export (not approved)

- Four sample template cards on the home page (static, not linked to details).
- The testimonial (stock photo and an invented quote attributed to a named couple).
- FAQ answers and the closing call to action.
- Social links point to `#instagram`, `#youtube`, `#pinterest`; footer links point to `#`.
- "See it in action" links to the "How it works" anchor, not a demo.
- The editor's sample names, date and location are example data.
- Template card images are Unsplash stock photos used as design placeholders.

### 4.4 Placeholders in the application

- RSVP section: a toast saying "RSVP preview only — backend not connected".
- Photos: "Photos will be added here." No upload. Photos stored locally only.
- Legacy copy saying prototype or demo in the privacy modal.
- The preview page label "Preview only" with a note that publishing is not available. Stale
  wording for cloud drafts.

## 5. Template designs and mappings

### 5.1 The export's eight designs

The export's eight designs are cards and hero images. The invitation a guest sees is
produced by the application's renderer, using the mapped backend template's palette and
its own stock image. The Figma hero imagery therefore does not appear on the invitation
yet. This is a real gap: a couple who picks "Forest Elegance" sees a different invitation
from the card they chose.

| Figma design | Tags | Mapped backend template | Backend style and palette | Suitability | Next step |
|---|---|---|---|---|---|
| 1 Forest Elegance | Floral, Modern | `romantic-garden-wedding` | Botanical; sage and taupe | Fair | Design the invitation itself, using the Forest imagery and palette |
| 2 Kerala Traditions | Traditional, Regional | `ivory-heirloom` | Classic; ivory and grey-green | **Poor (temporary)** | Commission a Kerala design: traditional motifs, kasavu-style border, gold-on-white palette. Not an approved mapping |
| 3 Spring Blossom | Floral, Romantic | `soft-pastels-wedding` | Romantic; blush and lilac | Good | Confirm palette and motifs against the Spring imagery |
| 4 Evening Soirée | Modern, Elegant | `black-tie-wedding` | Luxury; dark with gold | Good, but dark invitations need a contrast check for text | Accessibility check on dark palette |
| 5 Coastal Romance | Destination, Minimal | `destination-wedding` | Nature; sea-green and sand | Good | Confirm imagery; check coastal motifs exist |
| 6 Modern Minimal | Minimal, Elegant | `modern-minimal-wedding` | Minimal; neutral greys | Good | Confirm typography |
| 7 Lotus Reverie | Traditional, Floral | `contemporary-floral-wedding` | Botanical; rose and sage | **Weak** — duplicates design 1's style | Design a distinct lotus or South-Indian floral treatment |
| 8 Destination Hills | Modern, Destination | `contemporary-editorial-wedding` | Editorial; charcoal and bronze | **Weak** — no landscape or hills expression | Design a hills or landscape treatment |

### 5.2 Catalogue coverage gaps

- The frontend catalogue has 37 designs. 15 are in the Wedding category, and 10 of those
  carry the "General" tradition. There are no designs for specific wedding traditions in the
  catalogue (the database has Kerala, South Indian, Christian, Muslim and Sikh IDs with
  no visual design).
- The occasions list has nine categories. Only weddings have a mapped design set in the
  export. Engagement, Baptism, Birthday, Anniversary, Graduation, Baby shower, Bridal
  shower, Housewarming and others have catalogue entries but no coherent design family.
- Each design is a palette plus a stock image plus a style label. There is no per-design
  layout variation, so templates differ mainly by colour. Decide whether that is
  acceptable for launch.

### 5.3 Decision

Do not treat any of the eight mappings as final. Review each design against the
invitation it produces, not the card. Start with the two weak mappings (Lotus Reverie and
Destination Hills) and the Kerala gap.

## 6. States and interactions to design

Every screen needs these states designed, not left to default browser or toast behaviour:

- **Loading**: initial load, creating a draft, opening a link, loading a public page.
- **Save**: saved, saving, pending, retrying, conflict (reload needed), failed with local
  copy safe, token missing, offline.
- **Validation**: required fields, slug format, reserved slug, slug taken, date format,
  event end before start, image link not allowed.
- **Access**: link invalid, link expired, link revoked, regenerate confirmation, revoke
  confirmation, wrong draft.
- **Publish**: not saved yet, publishing, live, unpublished, slug changed, conflict.
- **Public page**: loading, ready, not available, unavailable temporarily, RSVP open and
  closed (Phase 7).
- **Empty**: no drafts, no events, no photos, no RSVPs.
- **Errors**: network, backend not configured, payload too large, unknown route.
- **Responsive**: 320, 375, 768 and 1280 px. Each new screen needs a checked layout at
  these widths, as the island tests already do.

## 7. Screen-by-screen design completion plan

Work proceeds in design phases. A phase is complete when its screens are designed in the
export language, implemented, and covered by tests (including the states in §6). Each
phase ends with a sign-off checkpoint before the next one starts.

### Phase D0: decisions (before any design)

- Commercial model and what is shown on pricing (S16). Blocks S25.
- RSVP fields (S22). Blocks S23.
- Kerala design direction and whether it is a launch template (§5.1).
- Occasions at launch: wedding only, or the full nine (§5.2).
- Whether template palettes are user-changeable (§3).
- Whether custom sections and typography settings stay (§3).
- Whether favourites and recent templates persist (S2).
- Defects §4.1 items 1–3 are fixed first (they affect what can be built on).

### Phase D1: foundations

- Token sheet from §1.1, one source for app and islands.
- Component set: buttons (filled, outline, light, small), inputs and textareas with
  error states, toggles, segmented control, status tags (Draft, Published, Unpublished),
  cards, modal, toast, empty state, inline alert, page header, panel heading.
- Motif library: petals, leaves, envelope, seal, card flowers, with reduced-motion
  variants.
- Responsive grid and spacing scale at 320, 375, 768 and 1280.
- Accessibility baseline: contrast checks for all token pairs, focus rings, 44 px touch
  targets, labels on every control.

Acceptance: a single component page renders every component in every state, and the
legacy screens are restyled from the same tokens.

### Phase D2: core creation flow

- S6 Setup wizard (four steps, skip paths, validation).
- S8 Advanced editor: restyle to the system; decide tab placement (§3).
- S1 Home: replace placeholder content; design occasion strip and recovery banner.
- S3 Full catalogue and S5 template modal, consolidated with S4.

Acceptance: a new visitor can go from home to a saved draft with no legacy screens.

### Phase D3: designer completion

- S7 Designer: add Events (list and event sheet), Gallery placeholder (until Phase 5),
  Story, RSVP and Travel pages; theme and typography controls only where they change the
  invitation.
- S9 Preview with device frames.
- S10 Publish dialog in all states.
- S15 Access panel (copy, regenerate, revoke) with consequences stated.
- S19 and S20 save and empty states.

Acceptance: every field in §3 has a designed home, and every state in §6 is shown.

### Phase D4: guest experience

- S11 Public invitation, designed per template family (not just recoloured). Include
  events, story, gallery placeholder, and an intro that can be skipped.
- S12 Not-available page.
- Open Graph image design for link previews (WhatsApp is the main channel).
- Verify each template on mobile, including contrast for dark designs.

Acceptance: each approved template renders a complete, responsive invitation with all
sections.

### Phase D5: dashboard, recovery and legal

- S13 Dashboard with status tags, duplicate, preview, open, and delete (once §4.1 item 2
  is built).
- S14 Recovery and invalid-link states.
- S17 Privacy and data page written to match real behaviour.
- S18 Footer pages (Support, Terms, Privacy).

Acceptance: a returning user reaches a draft from any entry point, and every
access-related outcome is explained.

### Phase D6: templates

- Review all eight mappings against rendered invitations (§5.1).
- Design the Kerala template and decide whether it launches.
- Replace the two weak mappings (Lotus Reverie, Destination Hills).
- Deactivate or hide database-only template IDs (§4.1 item 3).
- Design occasion families for the launch occasions.

Acceptance: every selectable template has a visual design and a reviewed invitation.

### Phase D7: marketing surfaces

- Home: replace sample cards with real templates linked to details; replace the
  testimonial; align claims with product (§4.2); add real footer links.
- Pricing page to the decision in D0.

Acceptance: no placeholder text or dead links on public pages.

### Designed-but-not-built screens

Design S22, S23, S24 and S25 during the phases that build them, not before. Keep the
visual language identical so they slot in without rework.

## 8. Extensibility rules

- New screens start from the component set in D1. Do not add a new button, input or card
  style without adding it to the set first.
- Every screen lists its states in §6 before design starts.
- Template designs are data (palette, imagery, motifs, layout variant), not separate
  stylesheets. Adding a template must not require changing app chrome.
- Each island stays behind the bridge. New features call the existing application
  functions through the bridge, and never talk to the API or the cloud directly.

## 9. Open questions

1. Is the commercial model decided, and what should the pricing page say today?
2. Which RSVP fields are in scope for launch?
3. Is Kerala a launch template? If so, who designs it and by when?
4. Launch occasions: weddings only, or the full list?
5. Should couples be able to change palettes, or is palette fixed per template?
6. Do custom sections and typography settings stay in the product?
7. Is there a designer for the remaining screens, and what is the sign-off process?
