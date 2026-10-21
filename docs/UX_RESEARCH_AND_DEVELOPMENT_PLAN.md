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
