# InviteStudio

A wedding-invitation website builder. The editor is a static site. Cloud drafts, publishing and public invitations run on Cloudflare Pages Functions backed by Supabase. See `docs/PHASE_0_INTEGRATION_PLAN.md` for the architecture and decisions.

Without cloud configuration, drafts stay in the browser.

## Tests

```bash
npm install
npm run test:unit    # backend and security unit tests
npm run test:qa      # source-level checks
npm run test:e2e     # local browser checks
npm run test:cloud   # cloud stack: Pages Functions + Postgres + test shim
```

`test:cloud` starts a local Postgres from the embedded binaries, applies the repository migrations to a fresh database, and runs `wrangler pages dev`. It never uses a real Supabase project. Set `CHROMIUM_PATH` to use a pre-installed Chromium.

## Run locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## Supabase foundation

The browser-safe Supabase client is initialised by `supabase-client.js` using
the public configuration in `supabase-config.js`. The current editor continues
to use local/demo persistence until the repository methods are connected to
authenticated Supabase queries.

The publishable key is designed for browser use. Never replace it with a
`service_role` or secret key. Before enabling cloud data, apply
`supabase/migrations/202610210001_initial_schema.sql` in the Supabase SQL
Editor and verify the Row Level Security policies.

The Phase 1.2 wedding-oriented schema is in
`supabase/migrations/202611030001_wedding_backend_foundation.sql`. Apply it
after the initial migration. Then apply
`supabase/migrations/202611030002_anonymous_access_and_publishing.sql` for
anonymous ownership, edit-token access and publishing separation. The table
design is documented in
`docs/DATABASE_SCHEMA.md`.

Before using the editor's full template catalogue with cloud drafts, also run
`supabase/migrations/202611030003_template_catalogue_compatibility.sql`.

New projects now create a cloud draft and autosave through `cloud-sync.js`.
The edit token is kept only in a browser-local token map so the same browser
can recover the draft later. Local browser storage remains as an offline copy.
Duplicated projects receive their own cloud draft rather than sharing the
source project's draft ID.

Returning visitors see a **Continue editing** prompt for the current draft.
The app also accepts private recovery links in the form
`/edit/<edit-token>` and removes the token from the address bar after it is
accepted.

For a different Supabase project, update `supabase-config.js` with its Project
URL and publishable/anon key. Do not commit database passwords or secret keys.

## Server API

Anonymous cloud drafts are handled by the Cloudflare Pages Functions in
`functions/api/`. Configure `SUPABASE_URL`, the encrypted server-only
`SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGIN` in Cloudflare Pages before
deploying. See `functions/README.md` for endpoint examples. The service-role
key must never be placed in `supabase-config.js`, `backend-api.js` or any
browser bundle.

## QA and integration docs

- Run source-level checks: `node qa-regression.js`.
- `qa-regression.html` is an optional browser test harness.
- `QA-TEST-MATRIX.md` records what is verified vs. pending.
- `BACKEND-INTEGRATION-CONTRACT.md` proposes the data model, endpoints, error shape and security requirements for backend implementation.

## Scene templates

Savanna Sunset, Palmera Beach, Curtain Call and Lunaria are full length, phone shaped designs drawn by
`scene-templates.js` instead of the shared layout. A catalogue entry opts in with a `scene` key, and
`sitePreview()` hands those projects to `window.renderSceneTemplate()`. The couple's names, date,
location, message, story, events and section switches all feed the design; guest responses stay
"not open yet", as for every other design.

- Styles live in `scene-templates.css` and are copied inline into `index.html` (the editor preview is a
  shadow root that only copies inline styles). Run `npm run build:scene-css` after editing the file.
- Catalogue thumbnails are rendered from the real renderer: `npm run thumbs:scenes`.
- After adding a design, run `npm run gen:templates` and apply a migration that inserts its id into
  `public.templates` (see `supabase/migrations/202611070001_scene_templates.sql`).

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
