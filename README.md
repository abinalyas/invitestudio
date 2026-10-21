# InviteStudio frontend prototype

Standalone frontend prototype for InviteStudio. No backend is connected; project drafts and demo images use this browser's local storage.

## Run locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## QA and integration docs

- Run source-level checks: `node qa-regression.js`.
- `qa-regression.html` is an optional browser test harness.
- `QA-TEST-MATRIX.md` records what is verified vs. pending.
- `BACKEND-INTEGRATION-CONTRACT.md` proposes the data model, endpoints, error shape and security requirements for backend implementation.

## Important limitations

- The 13 regression checks are source-level checks, not a browser end-to-end suite.
- Browser automation was blocked by the current execution environment's navigation policy. QA2-01 remains open until a supported browser run is completed.
- Publishing and RSVP are demo-only. No public site, server storage, authentication, or RSVP submission persistence is created.
- Production readiness, real device/browser compatibility, and visual parity have not been certified.


## Latest design-fidelity pass

- Reworked the landing page hierarchy with a more editorial headline, invitation/laptop-style hero treatment, phone mockup, eight event shortcuts, and a four-item benefits strip.
- Added small-screen layout adjustments for the hero, category shortcuts, benefits strip, and template cards.
- Reworked template preview into a split, image-led detail panel with theme swatches and a clear “Use this template” action.
- Added lazy image loading where the shared image helper supports it.
- Improved empty template search result copy.

These changes are committed to the `main` branch. After GitHub Pages finishes deploying, review the live site on desktop and mobile. This is a design iteration, not a claim that every storyboard panel is pixel-identical or that browser regression has passed.
