# InviteStudio UX Research Synthesis & Development Plan

Date: 2026-10-21
Product: InviteStudio
Audience: Product, UX/UI, frontend, backend, QA

## Executive summary

InviteStudio has a strong premium visual direction and a guided template-based creation flow. The next milestone should make the complete core journey reliable: create, personalise, save, publish, share, and collect RSVPs. The current implementation is a frontend prototype in important areas: publishing is simulated, RSVP submission is not connected to a backend, and project data is persisted in browser-local storage.

## Research status and confidence

This is a source-informed heuristic review and simulated UK-bride walkthrough, not research with recruited participants. Verified implementation facts are separated from hypotheses that need validation. Do not report proposed success targets as achieved results.

## Findings

| Finding | Evidence | Impact | Priority |
|---|---|---|---|
| Real publishing is unavailable | Source explicitly describes publishing as simulated | Core task cannot be completed | P0 |
| RSVP is not connected to a backend | Preview labels RSVP as preview-only/backend not connected | Couples cannot reliably collect responses | P0 |
| Drafts rely on local browser storage | Current persistence implementation | Cross-device access and recovery are risks | P0 |
| Setup has four stages before editor | Source flow | Possible friction before users see a personalised draft | P1 |
| Intro transition and image-upload controls are duplicated | Theme editor source | Confusing, potentially misleading controls | P1 |
| UK guest logistics need easy support | User need to validate | Guests may miss schedules, venues, travel details | P1 |
| Mobile usability needs real testing | Responsive CSS exists; no observed test evidence | Possible task failure on phones | P1 |
| Advanced animation options may overwhelm beginners | Hypothesis | Users may focus on settings rather than essentials | P2 |
| Pricing, privacy, and collaboration expectations need validation | Research question | Trust and conversion risk | P1 |

## Backlog / acceptance criteria

### US-01 — Real website publishing (P0, release blocker)
User story: As a couple, I want a real public URL for my invitation website so I can share it with guests.
- Define publishing API and hosting strategy.
- Persist and render published sites independently of the editor.
- Support draft, published, and unpublished states.
- Add copy-link, reopen-site, republish, and recoverable error states.
Acceptance: a real URL opens on another device; published content matches the latest saved version; status only says published after successful deployment.

### US-02 — Cloud persistence and recovery (P0)
User story: As a couple, I want to reopen my saved project on another device without losing work.
- Decide account/project-access approach and project data model.
- Add save/load APIs, autosave feedback, recovery and upload handling.
- Plan migration of existing local drafts where feasible.
Acceptance: project survives reload and cross-device reopening; failed saves are visible; no false success states.

### US-03 — Functional RSVP management (P0)
User story: As a couple, I want guest responses collected securely in one place.
- Implement RSVP submission and persistence.
- Define initial fields (attendance, guest name and party size); validate dietary needs and plus-ones for MVP.
- Build response dashboard, confirmation and validation states.
- Add privacy controls and basic abuse prevention.
Acceptance: guest can submit on mobile/desktop; response appears in correct couple dashboard; duplicate/edit policy is explicit; guest data is not publicly exposed.

### US-04 — Shorten onboarding (P1)
- Prototype template → names/date → personalised preview.
- Keep story, events, photos and styling optional and editable later.
Acceptance: personalised preview can be reached without completing optional fields; selections persist between steps.

### US-05 — Wedding schedule and guest logistics (P1)
- Support multiple events with date, time and venue.
- Add optional directions, accommodation, parking, dress code, accessibility and travel details.
- Ensure consistent date/time rendering and British English.
Acceptance: events can be added, edited, reordered and removed; hidden sections are absent from published output; long content works on mobile.

### US-06 — Editor consistency (P1)
- Remove duplicate intro transition and image-upload controls.
- Standardise labels, saving indicators, errors, and preview updates.
Acceptance: each setting appears once; changes persist and preview updates; failed changes are not presented as saved.

### US-07 — Mobile and accessibility validation (P1)
- Test setup, editor, preview, published site and RSVP on phone viewports.
- Check keyboard focus, form labels, error messages, touch targets and reduced motion.
Acceptance: no horizontal overflow in core journeys at supported viewport sizes; key actions work with touch and keyboard; reduced motion is respected.

### US-08 — Progressive disclosure for advanced personalisation (P2)
- Offer simple intro presets and tuck advanced controls under “Customise further”.
- Clarify pricing, privacy, hosting and collaboration at decision points.
Acceptance: beginner can create a polished result without adjusting advanced controls; advanced options remain accessible.

## Proposed delivery sequence

1. Foundation: confirm MVP, hosting, authentication/access rules, project/event/RSVP schema; fix duplicate controls; baseline automated tests.
2. Core workflow: cloud persistence and a real publish vertical slice.
3. Guest workflow: RSVP collection/dashboard and wedding logistics.
4. Validation: moderated usability sessions, mobile/accessibility checks, end-to-end tests.

These are sequencing recommendations, not effort estimates. Engineering should size work after architecture decisions.

## Research plan

Recruit 5–8 UK couples planning weddings, with a mix of technical confidence. Ask them to create a site, add schedule details, publish it, and submit a test RSVP without coaching. Observe hesitation, errors, expectation mismatches, save/publish comprehension, mobile behaviour, and trust concerns. Record behaviour, verbatim quotes, severity, frequency, and recommended response.

## Proposed metrics (targets to validate, not measured results)

- 5/5 participants reach a personalised preview without assistance.
- Median time to personalised preview under 2 minutes.
- 5/5 publish a live site and 5/5 can submit an RSVP.
- 5/5 reopen a saved project on another device.
- 5/5 complete critical tasks on mobile.
- Zero critical failures in observed core journeys.

## Release definition of done

- Reliable project save/recovery.
- Real public URL with accurate published content.
- RSVP submission and secure response management.
- Clear loading, saved, error, and publish states.
- Core accessibility and reduced-motion checks.
- End-to-end tests for create → edit → save → publish → RSVP.
- Usability testing with real UK couples.
- Documented privacy, retention, deletion, and hosting behaviour.

## Immediate ownership

- Product owner: confirm MVP, publishing, pricing and privacy assumptions.
- Tech lead: decide persistence, authentication, hosting and RSVP architecture.
- Product design: prototype shortened onboarding and guest-facing mobile site.
- Frontend: remove duplicate controls and connect editor to persisted data.
- QA: establish core journey and regression test scenarios.
- UX research: recruit UK couples and run baseline/post-change sessions.


## Lead visual and UX design handoff — 2026-10-21

This section translates the heuristic review into implementation-ready design direction. The existing warm editorial/luxury visual language remains the baseline; do not replace it with a generic SaaS dashboard. Treat this as a design specification, not evidence of user-tested outcomes.

### Design principles
1. **Preview early, configure later.** The first meaningful success is seeing a personalised invitation. Template → names and date → preview should be the shortest path. Story, gallery, schedule extras, intro animation and music are optional enhancements.
2. **One primary action per screen.** Use one filled dark button for the main next step; secondary/back/skip actions are outlined or text buttons. Do not give Skip the same visual weight as Continue.
3. **Progress and persistence are explicit.** Show the current step, what is optional, and whether changes are saved. Never display a green “saved/published” state unless the operation actually succeeded. For local-only drafts use “Saved on this device” rather than “Saved”.
4. **Preview is the source of truth.** Use the same typography, image crop, spacing, colours and section order in editor preview and public rendering. Label demo content and unavailable features clearly.
5. **Progressive disclosure.** Keep essential fields visible; group optional travel/logistics under a disclosure labelled “Guest information (optional)” and advanced intro settings under “Customise intro”. Each setting appears once.
6. **Mobile-first guest experience.** Guest-facing invitation, event schedule, venue/directions, RSVP and confirmation are designed for a narrow viewport first. Keep key actions full-width on small screens and prevent horizontal scrolling.

### Visual system
- Canvas: paper `#f7f4ee`; surface `#fffefa`; primary ink `#24231f`; muted text `#79766f`; hairline `#e8e2d8`; warm gold `#b28a59`; soft sage `#dfe7dd`.
- Type: Playfair Display for expressive invitation/section headings; DM Sans for interface copy, labels, controls and utility text. Do not use serif for dense instructions.
- Layout: content max-width approximately 1160px; use consistent 8px rhythm; cards 12–16px radius; reserve shadows for lifted previews/modals rather than every card.
- Controls: minimum 42px button height; clear focus-visible ring; visible labels rather than placeholder-only forms; errors adjacent to the field in plain language.
- Contrast: muted text and gold-on-paper must remain readable. Do not use colour alone for selected, saved, error or publish states.
- Motion: keep transitions short and non-blocking; honour `prefers-reduced-motion`. Intro music must remain opt-in and user initiated.

### Screen-level updates for implementation

#### 1. Home and template discovery
- Keep the editorial hero, strong example invitation and a single primary CTA (“Explore designs” or “Create your invitation”).
- Place occasion shortcuts before the template grid. Keep all six existing occasion categories and make the selected category visibly distinct.
- Provide a labelled search input and a clear empty state with a “Clear filters” action.
- Template cards should expose title, occasion, a concise style descriptor, colour swatches and one consistent preview/select action. Make the entire card keyboard reachable without nesting buttons.
- On mobile, use a 2-column grid where cards remain legible; allow category chips to wrap or horizontally scroll with visible affordance.

#### 2. Short onboarding
- First screen: choose a template and see a real example preview before committing to a long setup.
- Minimum required fields: couple/host names and event date (adapt labels to the selected occasion). Do not block on story, photos, travel or styling.
- Show progress as “Step X of Y” with a short description. Optional steps must say “Optional” in the heading and offer “Skip for now”.
- Back navigation must preserve entered values. Continue validates only the current step and focuses the first invalid field.
- At the end of the minimum path, land in the editor with the user's names/date already applied and an unobstructed preview.

#### 3. Editor layout
- Desktop: editor controls in a stable left panel, invitation preview on the right; keep primary actions (Preview, Save status, Publish) in a consistent toolbar.
- Mobile: switch to a single-column layout with a compact mode switcher for Content / Design / Preview. Never compress the desktop three-column editor to unreadable widths.
- Organise sections in guest-facing order: Welcome, Event details, Story, Gallery, RSVP. Keep each section's visibility toggle and editing controls together.
- Use inline “Saved on this device” feedback and an error/retry state. Do not silently discard unsaved edits.
- Keep optional guest logistics collapsed by default, with a short hint that directions, accommodation, parking and accessibility can be added.
- Intro controls: show a small set of presets first; place timing, transition and custom image controls under “Customise intro”. Keep each setting in one location; preview updates immediately.
- Music: opt-in only, show an explicit Play preview control and a note that browsers require a user gesture. Never autoplay audio.

#### 4. Preview and publish
- Preview should have a clearly labelled Desktop / Tablet / Mobile switcher, with selected state announced to assistive technology.
- Separate “Preview” from “Publish”. Preview never implies that a public URL exists.
- Until backend publishing is implemented, use “Publishing isn’t available in this demo” and a disabled primary publish action or clearly labelled demo mode. Do not allow “Mark as published” to create a misleading published status.
- When real publishing is added, use explicit states: Draft, Saving, Saved, Publishing, Published, Publish failed. Only show Published after server confirmation; provide Copy link, Open live site and Unpublish only when valid.
- Explain what happens to existing guests when a published version is updated.

#### 5. Guest-facing invitation and RSVP
- Prioritise event date/time, venue name/address, directions, schedule and RSVP CTA; avoid burying these under long story copy.
- Make date/time and venue readable at 320px width; long names and addresses wrap naturally.
- RSVP form needs visible labels, party-size bounds, clear required/optional markers, inline errors, submit loading state and a confirmation screen. Preserve safe entered values after recoverable errors.
- Do not collect or store real RSVP data until the backend, privacy notice, abuse controls and response dashboard are connected.
- Empty/hidden sections must not render as blank visual gaps.

#### 6. Privacy and pricing
- Keep Pricing and Privacy discoverable in the site navigation and available near publishing/account decisions.
- Use plain language. State where drafts are stored, whether sync exists, whether publishing is real, and what guest data is collected.
- Avoid implying a paid plan, secure cloud storage or cross-device sync when these do not exist.
- Before payment launches, define actual plan limits, renewal terms, cancellation and refund information; until then explicitly say there are no plans or charges in the prototype.

### Required states to design and implement
For each important form/action provide: default, focused, invalid, submitting/loading, success, recoverable error, empty state, and disabled state where relevant. In particular, cover save failure, image upload failure, no templates match, publish unavailable/failure, RSVP validation/failure, and empty RSVP list.

### Responsive and accessibility acceptance checklist
- Validate at 320, 375, 390, 768 and 1280px widths; no horizontal page overflow.
- Core tasks work by keyboard; visible focus, logical focus order, modal focus containment and Escape-to-close.
- Every form field has a programmatic label; errors are associated with their field and announced.
- Interactive targets are at least 42px high where practical; do not rely on hover for essential actions.
- Contrast meets WCAG AA for body text and controls; selected filters and status include text/icon cues.
- Reduced-motion setting disables non-essential transitions; no audio autoplay.
- Long names, long venue addresses, empty images, missing optional fields and British date formatting are checked.
- Test real mobile browsers before claiming responsive QA complete.

### Design-to-development delivery order
1. Remove misleading prototype publish states and ensure local save wording is accurate.
2. Ship the short template → names/date → personalised preview path.
3. Finalise responsive editor navigation and consolidate advanced controls.
4. Design and implement publish status/error/recovery states alongside the real publishing vertical slice.
5. Complete guest-facing mobile schedule and RSVP states with secure backend behaviour.
6. Run moderated tests with 5–8 UK couples; record task completion, time to personalised preview, errors, confidence and verbatim feedback. The under-2-minute preview and 5/5 completion figures remain proposed targets, not current results.
