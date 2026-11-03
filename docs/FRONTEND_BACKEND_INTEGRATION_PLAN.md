# InviteStudio frontend-to-backend integration plan

Status: Phase 2 draft management in progress
Branch: `phase-2-draft-management`
Audited commit: `a04665a` (`main`)

This document records the current frontend implementation and the work required to introduce backend persistence without changing the existing visual direction or user flow.

## Phase 1 foundation update

The Supabase browser client is now initialised in `supabase-client.js` from
`supabase-config.js`, with the existing local/demo behaviour preserved. This
is client initialisation only; project CRUD, authentication screens and cloud
photo/publish/RSVP operations are intentionally not enabled yet.

Phase 1.2 adds the additive wedding-oriented schema in
`supabase/migrations/202611030001_wedding_backend_foundation.sql`. The schema
design and compatibility decisions are documented in
`docs/DATABASE_SCHEMA.md`.

Phase 1.3 adds `supabase/migrations/202611030002_anonymous_access_and_publishing.sql`.
Customer accounts are not required: anonymous ownership is represented by a
null owner plus expiring hashed edit tokens. Drafts remain private until a
trusted publish operation sets a valid slug, `status = 'published'`,
`visibility = 'public'` and `published_at`.

Phase 1.4 adds a server-only Cloudflare Pages Functions API under `functions/`.
The API creates anonymous drafts, retrieves and updates them using a hashed
edit token, publishes/unpublishes with version checks, and exposes only a safe
read-only public invitation endpoint. The Supabase service-role key is read
only from Cloudflare runtime secrets and is never included in browser code.

Phase 2 adds `cloud-sync.js`. A new website now creates a server-backed draft,
stores the returned edit token only in a browser-local token map, debounces
editor saves to the API, and hydrates cloud drafts when the browser is opened
again. The project payload currently stores event functions and gallery
metadata in the wedding `content` JSONB field; binary photo storage remains a
separate media-upload slice.

## 1. Executive summary

InviteStudio is currently a single-page, static HTML application. The complete UI, CSS, template catalogue, editor state, preview renderer and browser persistence are implemented in `index.html`.

The application is usable as a local prototype, but it is not yet multi-user or production-capable:

- There is no authentication or user identity.
- Projects are stored in one browser `localStorage` key.
- Photos are stored as base64 data URLs inside the project object.
- Templates and starter content are hard-coded in the frontend.
- Publishing opens a local preview only; it does not create a public URL.
- RSVP is a toast/demo interaction and does not persist guest data.
- The browser does not call Supabase or any other backend.

The existing Supabase migration and backend contract are a good starting point. The safest integration sequence is to add a small data-access boundary first, preserve a clearly labelled local/demo mode, then introduce authentication, cloud project persistence, media storage, publishing and RSVP as separate vertical slices.

## 2. Repository and runtime audit

### Relevant files

| File | Current responsibility |
|---|---|
| `index.html` | Entire application: markup shell, CSS, catalogue data, state, views, editor, preview renderer and persistence |
| `qa-regression.js` | Node source-level assertions; does not run a browser |
| `qa-regression.html` | Optional browser harness for selected functions |
| `tests/e2e/invitestudio.spec.js` | Playwright journeys for onboarding, intro settings, publish disclosure and overflow |
| `playwright.config.js` | Starts `python3 -m http.server 4173` for Playwright |
| `BACKEND-INTEGRATION-CONTRACT.md` | Proposed resources, endpoints, responses, security and migration notes |
| `docs/TECHNICAL_ARCHITECTURE_DECISION.md` | Recommended Cloudflare Pages + Supabase architecture and delivery gates |
| `supabase/migrations/202610210001_initial_schema.sql` | Initial Postgres tables, trigger, indexes and RLS policies |
| `_redirects` | SPA fallback, including a planned `/s/*` public invitation path |
| `package.json` | Only `test:e2e` is defined; there is no `test` script |

### Runtime characteristics

- No framework or bundler is used.
- No build command is required for the current frontend.
- There is no module/import boundary; all JavaScript is global script code.
- Rendering is string-based: view functions return HTML strings and assign them to `#app`.
- User interactions use inline `onclick`, `onchange` and `oninput` handlers.
- Modals are rendered separately into `#modal-root`.
- Toasts are rendered into `#toast-root`.
- External images are loaded directly from Unsplash URLs.
- Google Fonts are loaded from Google Fonts.

## 3. Current application routes

The application has no URL router. Routes are values of `state.page`; navigation calls `go(page)` or assigns `state.page` and calls `render()`. A page refresh returns to `home`, because the current page is not persisted in the URL.

| `state.page` | View function | Purpose | Backend relevance |
|---|---|---|---|
| `home` | `home()` | Editorial landing page and entry points | Static; no backend data required |
| `templates` | `templatesPage()` | Occasion catalogue, filters, sorting and template cards | Template catalogue can remain static initially; later move to versioned content/config if needed |
| `setup` | `setupPage()` / `setupContent()` | Four-step project setup: basics, story, schedule and design | Creates or updates a project; must use create/update data APIs |
| `editor` | `editor()` / `editorPanel()` | Sections, content, functions, photos, theme, intro and settings | Main cloud-save integration surface |
| `dashboard` | `dashboard()` | Lists local projects; edit, preview and duplicate actions | Must load only authenticated owner projects |
| `preview` | `previewPage()` / `sitePreview()` | Device-sized invitation preview | Must load a project and use published-safe data for public mode |

### Overlay/modal states

These are not URL routes:

- Template preview: `previewTemplate()` with demo content.
- Function editor: `editFunction()` / `saveFunction()`.
- Publish information: `openPublish()`.
- Pricing/privacy information: `openInfo()`.

### Planned route not yet implemented

`_redirects` already rewrites `/s/*` to `index.html`, but the JavaScript does not inspect `window.location.pathname` or load a slug. Therefore `/s/:slug` currently falls back to the normal home application rather than rendering a public invitation.

The planned public route is documented as:

```text
/s/:slug
```

It needs a dedicated route mode that fetches an allowlisted published projection and never exposes owner-only project fields.

## 4. Template rendering architecture

### Catalogue data

Template and catalogue data are declared in `index.html`:

- `categories`: supported event/category labels.
- `topCategories`: six landing-page collection groups and Unsplash images.
- `templates`: base template records.
- `templates.push(...)`: additional luxury and occasion templates.
- `animatedTemplateDefs`: structured definitions converted into template records.
- A fallback loop adds a starter template for any supported category without a matching template.

Template records currently contain combinations of:

```text
id, name, category, style, desc, image, colors,
tradition, occasion, animation, effect, featured
```

### Catalogue flow

1. `sortedTemplates()` applies category, occasion, style, tradition, animation, palette, search and sort filters.
2. `templateCard(t)` produces a card with preview and choose actions.
3. `previewTemplate(id)` creates a demo project object using hard-coded sample content and calls `sitePreview()`.
4. `chooseTemplate(id)` changes the selected template and either returns to setup or creates/updates a project.

### Invitation rendering

`sitePreview(project, template, full)` is the central invitation renderer. It currently renders:

- Optional intro animation from `invitationIntro()`.
- Navigation/header.
- Hero content from project title, category, message, date, location and theme.
- Welcome section.
- Story section.
- Visible event/function cards.
- Gallery or an explicit empty state.
- RSVP preview button.
- Custom sections.
- Footer.

Section order and visibility are controlled by `project.sections`. Function visibility is controlled by each function's `visible` property. This renderer should remain the single rendering source for editor preview and the future public invitation page; the backend integration should supply data, not create a second template renderer.

## 5. Current localStorage and in-memory dependencies

### Application storage

There is one application storage key:

```text
invitestudio-projects
```

The dependency is concentrated in:

- `load()`: parses the key; if empty, creates a seeded demo project.
- `save()`: serialises `state.projects` and writes the key.
- All editor mutations call `save()` directly or indirectly.

There is no session storage, IndexedDB, cookie-based identity or backend request in the application.

### Test-only storage dependencies

- `qa-regression.html` directly tests writing the application key.
- `tests/e2e/invitestudio.spec.js` clears `localStorage` before each browser test.

These test dependencies should be updated when a repository/data-access adapter is introduced, while preserving a local adapter for demo-mode tests.

### In-memory state

`state` contains both navigation/UI state and project data:

```text
page, category, filter, sort, tradition, animation, palette, search,
selectedTemplate, setupStep, editorTab, activeSection, device,
mobileEditorView, projects, currentId, modal, templateReturnToSetup
```

Only `projects` is persisted. The current page, selected device, editor tab and other UI state are lost on refresh.

### Storage-related risks

- Browser quota can be exceeded by base64 photos.
- `save()` catches write failures but does not provide a backend retry queue.
- The seeded project is created automatically for a new browser.
- Drafts cannot be shared across devices or users.
- Client-side project IDs are generated with `crypto.randomUUID()` and are not server-owned IDs.
- Existing local drafts require explicit opt-in migration; they must not be silently uploaded.

## 6. Mock, seeded and demo-only data

The following data is currently frontend-owned or simulated:

| Area | Current implementation | Backend integration implication |
|---|---|---|
| Template catalogue | Hard-coded template arrays and generated starter templates | Keep static for the first backend slice; use `templateId` as the stable reference |
| Template images | Unsplash URLs in template records | Decide whether these remain CDN assets or move to managed storage |
| New-browser project | `load()` seeds “Meera & Abin” with Kochi event details and three functions | Remove or make opt-in for production; do not create a customer project without intent |
| Default wedding functions | Hard-coded dates, times and venues in `defaultFunctions` | Seed/demo only; real functions belong in `event_functions` JSONB |
| Template preview | `previewTemplate()` constructs “A Day to Remember” style demo project content | Correct for catalogue preview; must never be saved as a customer project |
| RSVP | Preview button calls `toast('RSVP preview only — backend not connected')` | Replace with public RSVP API only after publish and abuse controls exist |
| Publishing | `openPublish()` shows unavailable state; `simulatePublish()` only displays a toast | Replace with trusted publish operation and server-confirmed status |
| Photos | FileReader converts uploads to base64 `data` values | Upload binary assets to Supabase Storage and store metadata/URLs only |
| Intro audio/image | Local file/data URL settings in `introSettings` | Validate and store assets separately if this feature is retained |
| Pricing/privacy | Static explanatory modal copy | Replace with product/legal copy when accounts, storage and pricing exist |

No `fetch`, Supabase client, API client or XMLHttpRequest call is currently present in the frontend.

## 7. Wedding/project information structure

### Current frontend project object

The project object is created in `load()` and `ensureProject()`, then extended by editor actions. Its effective shape is:

```js
{
  id,
  name,
  category,
  templateId,
  status: 'Draft',
  updated: 'Just now',
  title,
  date,
  location,
  message,
  story,
  hosts,
  locale,
  preferences: {
    mood, palette, typography, layout, rsvp, gallery
  },
  culturalPreferences: {
    tradition, region, elements, customText
  },
  theme: {
    background, accent, text
  },
  sections: [
    { id, title, content?, visible, custom? }
  ],
  functions: [
    {
      id, title, date, time, endTime, venue,
      description, dressCode, directionsUrl,
      parking, accommodation, accessibility, visible
    }
  ],
  photos: [
    { data, alt }
  ],
  introSettings: {
    enabled, style, transition, duration, short,
    showDate, image, audio
  },
  animationSettings: {
    enabled, effect, speed
  },
  published: false
}
```

Some fields are optional and are created only after the related editor control is used. Older local drafts may therefore omit fields such as `sections`, `photos`, preferences and intro settings; the renderer currently supplies defaults where needed.

### Existing schema mapping

| Frontend field | Supabase field | Notes |
|---|---|---|
| `id` | `projects.id` | Change from client-generated identity to server-generated UUID; retain a migration map for local drafts |
| `name` | `projects.name` | Dashboard/project label |
| `category` | `projects.category` | Preserve current category strings or define canonical enum values |
| `templateId` | `projects.template_id` | Stable catalogue identifier |
| `title` | `projects.title` | Required by database; current UI can leave it blank temporarily |
| `date` | `projects.event_date` | Rename and send as ISO date or null |
| `location` | `projects.location` | Existing length constraint is 500 characters |
| `message` | `projects.message` | Needs an explicit validation limit before API integration |
| `story` | `projects.story` | Needs an explicit validation limit before API integration |
| `hosts` | `projects.hosts` | Needs an explicit validation limit before API integration |
| `locale` | `projects.locale` | Existing default is English |
| `theme` | `projects.theme` JSONB | Background, accent and text |
| `preferences` | `projects.preferences` JSONB | Mood, palette, typography, layout, RSVP and gallery choices |
| `culturalPreferences` | `projects.cultural_preferences` JSONB | Tradition, region, elements and custom text |
| `sections` | `projects.sections` JSONB | Ordered array; visibility is frontend-controlled |
| `functions` | `projects.event_functions` JSONB | Database uses `event_functions`, frontend uses `functions` |
| `introSettings` | `projects.intro_settings` JSONB | Keep as JSONB initially |
| `animationSettings` | `projects.animation_settings` JSONB | Keep as JSONB initially |
| `status` / `published` | `projects.status`, `slug`, `published_at` | Replace UI `Draft`/boolean with canonical server status |
| `updated` | `projects.updated_at` | Use server timestamp, not “Just now” |
| no frontend field | `owner_id` | Must come from authenticated identity, never browser input |
| no frontend field | `version` | Required for optimistic concurrency |
| `photos[].data` | Storage object + `project_photos` metadata | Do not store base64 data in project JSON |

The migration contains `event_functions`, while the backend contract calls the resource field `functions`. The data-access layer should expose the frontend name and map it to the database column in one place.

## 8. Supabase migration review

`supabase/migrations/202610210001_initial_schema.sql` defines:

### `public.projects`

- Server UUID primary key.
- Required authenticated `owner_id`.
- Core event fields and JSONB settings.
- `draft`, `published` and `unpublished` statuses.
- Optional unique slug with a lowercase hyphenated format constraint.
- Version number for optimistic concurrency.
- Created, updated and published timestamps.
- Trigger that updates `updated_at` and increments `version`.

### `public.project_photos`

- Project-owned metadata rows.
- Storage path rather than image bytes.
- Alt text, dimensions and timestamps.
- Cascade deletion when a project is deleted.

### `public.rsvps`

- Project-owned guest responses.
- Guest name, attendance, party size and optional message.
- Basic length and party-size constraints.
- No direct anonymous insert policy by design.

### Row Level Security

- Authenticated users can only read/create/update/delete projects where `owner_id = auth.uid()`.
- Photo metadata policies verify ownership through the parent project.
- RSVP reads verify project ownership.
- Public RSVP writes are intentionally expected to go through a trusted, rate-limited Edge Function.

### Migration follow-ups before implementation

1. Add and review Supabase Storage bucket/policies for project assets; the SQL file currently covers metadata, not the storage bucket itself.
2. Decide whether the initial `status` check should use `unpublished` or a separate publish-history model.
3. Add explicit length/URL validation for all JSONB text values at the API boundary.
4. Confirm public published-data access strategy. The current owner-only project RLS policy is not sufficient by itself for a public slug route.
5. Add automated RLS tests for cross-user project, photo and RSVP access.
6. Confirm whether `event_functions` JSONB is sufficient for reporting/search or whether events should become a separate table later.

## 9. Backend integration boundary to introduce

Before changing the editor UI, introduce a repository/data-access interface with local and remote implementations. The UI should stop calling `localStorage` directly.

Suggested interface:

```text
auth.currentUser()
auth.signIn(...)
auth.signOut()

projects.list()
projects.create(draft)
projects.get(id)
projects.update(id, patch, version)
projects.remove(id)

photos.upload(projectId, file, metadata)
photos.remove(projectId, photoId)

publishing.publish(projectId, version)
publishing.unpublish(projectId)
publicInvitation.get(slug)
publicInvitation.submitRsvp(slug, input)
rsvps.list(projectId)
```

The first implementation can be a `localRepository` that wraps the current `load()` and `save()` behaviour. A `supabaseRepository` can then use the same methods without forcing the view functions to know whether data is local or remote.

### Save contract

Every remote mutation should:

1. Keep the current in-memory edits until the server confirms success.
2. Send only a validated patch or canonical project payload.
3. Replace the local project with the canonical server response.
4. Store the server `version`, `updated_at` and status.
5. Show saving, saved, failed and retry/conflict states.
6. Never show “Published” or return a public URL before server confirmation.

## 10. Recommended integration sequence

### Phase 1 — Boundary and compatibility

- Extract project serialisation/deserialisation and storage behind a repository adapter.
- Add a normalised project type and migration function for existing local drafts.
- Preserve local demo mode and current design.
- Add unit/source checks for local adapter parity.
- Add an explicit “Import this local draft” action later; do not silently upload it.

### Phase 2 — Authentication and cloud drafts

- Add Supabase Auth.
- Require an authenticated owner for cloud projects.
- Load the authenticated user's projects in the dashboard.
- Create a server project during intentional onboarding or first cloud save.
- Replace `Draft`/`published` boolean with server status and timestamps.
- Add retry, offline and version-conflict handling.

### Phase 3 — Photos

- Validate type, size, dimensions and actual file content server-side.
- Upload to a project-scoped Supabase Storage path.
- Insert/update `project_photos` metadata.
- Render returned URLs, not base64 data.
- Delete remote assets when a photo is removed.
- Keep local base64 photos only in the import/migration path.

### Phase 4 — Public publishing

- Implement trusted publish validation.
- Reserve a unique slug.
- Publish only an allowlisted projection of project data.
- Implement `/s/:slug` route detection and public data loading.
- Add copy-link, open-live-site, republish and unpublish states.
- Ensure unpublish invalidates public access.

### Phase 5 — RSVP

- Render a real labelled RSVP form only on published public pages.
- Submit through a rate-limited Edge Function.
- Validate guest name, attendance, party size and message.
- Add confirmation and recoverable error states.
- Add owner-only RSVP listing/export in the dashboard.

## 11. Unfinished and demo-only functionality

### Release blockers

- Cloud persistence and authentication.
- Real publishing and public slug route.
- Persistent RSVP submission and owner response management.
- Server-side photo storage and validation.
- Cross-user authorization tests.
- Browser/mobile end-to-end evidence.

### Current prototype limitations and follow-ups

- `simulatePublish()` is deliberately non-publishing and should remain so until the backend exists.
- The preview RSVP button only displays a toast.
- The seeded demo project should not be created automatically in a production mode.
- The UI has no project delete action even though the backend contract includes `DELETE /api/projects/:id`.
- Current template preview labels example content and must remain separate from customer projects.
- `uploadIntroImage` is defined twice in `index.html`; consolidate it before asset persistence work.
- The editor stores local photo data under `photos[].data`, while the backend contract expects server URLs and metadata.
- The app's current status text (“Saved on this device”) is accurate for local mode but needs a distinct remote saved state.
- No loading state exists for network operations because no network operations exist yet.
- No conflict resolution exists for concurrent edits.
- The public route rewrite exists, but public route rendering does not.

## 12. Verification baseline

The source-level regression check was run on this branch:

```text
node qa-regression.js
32 passed, 0 failed
```

The repository does not define `npm test`; the available package script is:

```text
npm run test:e2e
```

Browser dependencies are not installed in the cloned repository, so a full Playwright run was not claimed as part of this Phase 0 audit. The QA matrix already records browser, visual, responsive and backend checks as pending or blocked.

## 13. Phase 0 definition of done

- [x] Existing repository reviewed.
- [x] Separate development branch created: `phase-0-backend-preparation`.
- [x] Existing frontend source checks pass.
- [x] Mock, seeded and demo-only data identified.
- [x] `localStorage` dependencies identified.
- [x] Template catalogue and invitation rendering architecture identified.
- [x] Wedding/project information structure identified.
- [x] Supabase migration reviewed.
- [x] Existing application routes documented.
- [x] Unfinished and demo-only functionality documented.
- [x] Frontend-to-backend integration sequence and data mapping documented.

This phase intentionally makes no UI or visual changes. The next implementation task should be the repository/data-access boundary and local-draft normalisation, not direct Supabase calls scattered through the current editor functions.
