# InviteStudio QA test matrix

Status values are intentionally conservative. Source checks are not equivalent to browser execution.

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| QA2-01 | Full browser regression | Complete journey exercised in supported browsers with evidence | BLOCKED / NOT RUN in this environment |
| QA2-02 | Change event category | Compatible template and category remain consistent | Source check passed; browser not run |
| QA2-03 | Setup navigation/template switch | Data persists and save failure blocks navigation | Source check passed; browser not run |
| QA2-04 | Reopen locale | Saved locale restored; default English if absent | Source check passed; browser not run |
| QA2-05 | Empty gallery | Clear empty state in preview | Source check passed; browser not run |
| QA2-06 | Photo capacity/save failure | Remaining capacity respected; failed save rolls back | Source check passed; browser not run |
| QA2-07 | Save/publish failure | No false success state | Source check passed; browser not run |
| QA-FLOW-01 | Home → category → gallery → template preview → setup → editor | User can complete creation journey | NOT RUN in browser |
| QA-FLOW-02 | Dashboard create/edit/duplicate/reopen | Each project retains its own data | NOT RUN in browser |
| QA-FLOW-03 | Preview device modes | Desktop/tablet/mobile controls update preview width | NOT RUN in browser |
| QA-RESP-01 | 320×568, 375×812, 390×844, 768×1024, 1280×800, 1440×900, 1920×1080 | No overflow, clipping or overlap | NOT RUN in browser |
| QA-A11Y-01 | Keyboard-only flow and focus visibility | All actions reachable and focus visible | CSS hardening added; manual test pending |
| QA-DATA-01 | Storage unavailable/quota exceeded | Save failure visible; no success claim | Source save guard present; browser test pending |
| QA-BACKEND-01 | Public publishing and RSVP persistence | Real URL and server-stored RSVP | BLOCKED: no backend connected |

## Automated source-level checks

Run `node qa-regression.js`. The current script reports 13 source-level checks passing. This confirms syntax and selected implementation patterns only; it does not confirm visual fidelity, runtime behavior, responsive layout, accessibility conformance, or backend behavior.

## Release gate

Do not approve backend-integration readiness until QA2-01 has a completed browser run, the core user journey passes, responsive checks have evidence, and API contract decisions are agreed. Publishing and RSVP remain prototype-only in this package.


## Follow-up coverage (2026-10-21)

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| QA-PUBLISH-01 | Draft dialog → View my preview | Closes dialog and opens the existing mobile invitation preview | Source assertion added; CI run pending |
| QA-INTRO-01 | Change each intro style | Matching profile and signature transition resolve in the renderer | Source assertions added; browser animation test NOT RUN |
| QA-INTRO-02 | Change transition option | Only compatible alternatives are offered and renderer uses selected compatible transition | Source assertions added; browser test NOT RUN |
| QA-INTRO-03 | Replay/skip intro | Full sequence replays once; skip reaches invitation without blocking interaction | Controls exist in source; end-to-end behaviour NOT RUN |
| QA-DEPLOY-01 | Latest source commits | GitHub Pages build and deploy completes successfully | Pages deployment succeeded for commit a249b953; new QA workflow added after that run |
| QA-RESP-02 | Compare design reference at desktop/mobile sizes | No overflow; hierarchy and composition match designer's eight screens | NOT RUN: no browser screenshot evidence |

A separate GitHub Actions workflow now runs `node qa-regression.js` on pushes and pull requests. This workflow verifies source-level assertions only; it is not a substitute for browser visual regression or end-to-end tests.
