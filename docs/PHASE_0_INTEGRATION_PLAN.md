# Phase 0 — Frontend-to-backend integration plan

Status: approved direction, implementation in progress on branch `feature/figma-make-frontend-integration`.
Supersedes the discovery notes in `docs/FRONTEND-BACKEND-INTEGRATION-MAP.md` and the status in `docs/FRONTEND_BACKEND_INTEGRATION_PLAN.md` (which still says Phase 2 is in progress).

This document records what the code does today, the decisions taken, the audit evidence behind them, and what remains unverified. It does not claim that any production service has been changed.

## 1. Current architecture (verified from the repository)

| Layer | What exists | Notes |
|---|---|---|
| Frontend | Single `index.html` (~169 KB, no framework). Global `state`, `render()` builds HTML strings. | 111 inline event-handler attributes (`onclick=` etc.). |
| Browser adapters | `backend-api.js` (fetch wrapper for `/api`), `cloud-sync.js` (autosave, token map, private-link recovery, wraps `load`/`save`/`render`). | These two files are the integration seam. |
| Unused client | `supabase-client.js` creates a Supabase client; nothing calls it. `supabase-config.js` holds only the publishable key. | Loading `@supabase/supabase-js@2` from jsdelivr is unused and is removed in this phase. |
| Server | Cloudflare Pages Functions in `functions/api/` with shared helpers in `functions/_shared/api.js`. Service-role key via runtime secret. | Endpoints listed in `BACKEND-INTEGRATION-CONTRACT.md`. |
| Database | Four migrations in `supabase/migrations/`, applied in order. RLS enabled on every table; anonymous drafts are mediated only by Edge/Pages Functions. | See section 6 for deployment status. |
| Tests | `qa-regression.js` (43 source-level checks, passes); `tests/e2e/invitestudio.spec.js` (8 browser checks in local mode, pass). | Neither exercises cloud mode. Gap closed in Phase 4 of this plan (section 5). |

## 2. Decisions

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D1 | Public URL | `/s/<slug>` | Already used by the API response, `_redirects`, and the architecture doc. No compelling reason to change. |
| D2 | Event store | `content.functions` is the single source of truth. `wedding_events` is kept in the database but no longer read or written by the application. | Audit (section 3) found no writer anywhere. Table and migrations are retained; dropping them is a separate decision. |
| D3 | Edit-token storage | Keep raw token in `localStorage` for MVP same-device recovery. Apply the controls in section 4. | Anonymous users need recovery without sign-up. |
| D4 | Live database | Migration status is **unverified**. No change is applied to production without an explicit approval step (section 6). | Repository alone cannot prove what was applied. |
| D5 | Edit links | Links move from path form `/edit/<token>` to fragment form `/edit#<token>` for new links. Legacy `/edit/<token>` links are still accepted and immediately rewritten. | Path segments are sent to the server and recorded in Cloudflare request logs. Fragments are never sent to the server. This conflicts with the stated rule "never expose edit tokens in public URLs or logs", so the rule wins. **Please confirm D5; it changes the link format users see.** |
| D6 | Edit-link resolution API | `GET /api/edit-links/:token` is replaced by `POST /api/edit-links` with the token in the JSON body. | Tokens in request paths end up in logs. Pre-production, so no compatibility window is needed. |
| D7 | Create idempotency | Client sends an `Idempotency-Key` header; server stores only its SHA-256 hash in the creation token's `metadata`. A replay within 24 h returns the same draft with a freshly issued token and revokes older tokens. | Prevents duplicate drafts on retry without a schema change (see section 4.5 for the residual race). |
| D8 | CSP | Ship a CSP that removes all unused third-party scripts and blocks framing, object embeds and cross-origin form posts. Script inline execution is allowed (`'unsafe-inline'`) for now. | 111 inline handlers make a no-`unsafe-inline` policy a refactor of the whole editor. Tracked as future work (section 4.2). |

## 3. Audit: `wedding_events` dependency (evidence)

Searched every `.js`, `.html`, `.sql` and `.md` file (excluding `node_modules`):

- **Writers:** none. No `POST`/`PATCH`/`DELETE` against `wedding_events` in any function or browser file.
- **Readers:**
  - `functions/_shared/api.js` `getWeddingChildren()`: feeds `events` in `GET /api/weddings/:id` and `GET /api/edit-links/:token`.
  - `functions/api/public-weddings/[slug].js`: returns `events` on the public route.
  - `cloud-sync.js` `mergeRecoveredChildren()`: used only when `project.functions` is empty.
- **RLS:** an owner-only policy exists (`202611030001`). No anonymous path can write rows.

Conclusion: `content.functions` is the only populated event source. Application reads of `wedding_events` will be removed.

**Backward-compatibility check still required (run in the live project, read-only):**

```sql
select count(*) as wedding_event_rows from public.wedding_events;
```

If the result is non-zero, rows exist that the application would stop showing. Stop and review before deploying the read-path removal.

## 4. Security controls for MVP token storage (D3)

### 4.1 What is protected, and how

- Only the SHA-256 of an edit token is stored (`edit_tokens.token_hash`). Raw tokens are never logged.
- Token-bearing requests use `Cache-Control: no-store`, `Referrer-Policy: no-referrer` on the private edit page, and `X-Content-Type-Options: nosniff` on all API responses.
- The token never appears in a request path after this phase (D5, D6). Legacy path links are rewritten out of the address bar before any network request is made.
- Public routes (`GET /api/public-weddings/:slug`) select an explicit allowlist of columns. They never return `id`, `owner_id`, `ownership_mode`, `content.gallery.photos[].storagePath`, RSVP data, tokens or token hashes. Hidden functions (`visible: false`) are filtered out.
- No analytics or third-party scripts are loaded.

### 4.2 Content Security Policy

Shipped via `_headers` for Cloudflare Pages:

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` — **trade-off**, see below
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
- `font-src 'self' https://fonts.gstatic.com`
- `img-src 'self' data: blob: https://images.unsplash.com`
- `connect-src 'self'`
- `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`

**Trade-off:** `'unsafe-inline'` on scripts means CSP does not block injected inline script. Its remaining value is blocking external script loads, framing, plugin embeds, base-tag injection and form exfiltration. Removing `'unsafe-inline'` requires moving the 111 inline handlers to `addEventListener` and the one inline `<script>` block to a file. That is a planned future step, not part of MVP.

### 4.3 Future improvements (ranked)

1. Remove `'unsafe-inline'` after handler migration; use a nonce or hash for the remaining bootstrap script.
2. Move edit-token storage to a same-site cookie with `HttpOnly`, `Secure`, `SameSite=Strict`. Requires a server-issued session and a CSRF check on writes.
3. Add expiring, single-use "recovery links" sent by email (Phase 3.3 email delivery, not built).
4. Add Subresource Integrity for any third-party asset that remains.
5. Add a `report-uri`/`report-to` endpoint once a log destination is chosen.

### 4.4 Public APIs never return private tokens

Enforced by the allowlisted projection in `publicWeddingProjection()` and by a test that asserts the public response contains no field named `*token*`, `owner_id`, `storagePath` or `id`.

### 4.5 Create idempotency — residual risk

The idempotency lookup and insert are not atomic. Two identical requests in flight at the same instant can both create a draft. Closing this needs a unique index on the key hash; that requires a migration, which is pending approval (section 6). Until then the window is a few milliseconds and the outcome is one extra orphaned draft, not data loss.

## 5. Integration plan (execution order)

1. **Phase 0 (this document).**
2. **Boot crash and stale copy.** Null-guard the private-link parser; replace copy that claims drafts are device-only or publishing is unavailable; stop seeding a demo draft into real storage.
3. **Create idempotency** (D7), with a client-side key that survives reloads.
4. **Cloud-mode test harness.** `wrangler pages dev` against a real Postgres (embedded binaries) that has the four migrations applied, fronted by a PostgREST-compatible HTTP shim, plus a Playwright suite that enables cloud mode. The shim is a test-only substitute; the real Supabase test project is the final gate.
5. **Figma Make frontend integration.** Blocked: no export exists in the repository, and the Figma connector is refused by the sandbox proxy. Needs the export.
6. **Phase 4 public invitation renderer, publish UI, status model.**
7. **End-to-end journey test:** create → edit → save → preview → publish → share.

Each step is a separate commit on `feature/figma-make-frontend-integration`. No merge to `main`, no production deploy, without approval.

## 6. Unverified items (require action outside the repository)

| Item | Status | How to verify | Who approves |
|---|---|---|---|
| Migrations 202610210001–202611030003 applied to the live Supabase project | **Unknown** | Supabase dashboard → SQL editor: `select to_regclass('public.weddings'), to_regclass('public.edit_tokens'), to_regclass('public.templates');` and `select count(*) from public.templates;` (expect ≥ 88 seeded rows if migration 3 ran). Or Supabase CLI `supabase migration list` against the linked project. | Project owner |
| `wedding_events` has no rows | Unknown | Query in section 3. | Project owner |
| Pages Function environment (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGIN`) configured | Unknown | Cloudflare Pages settings. | Project owner |
| Figma Make export | **Not in repository** | Provide the export (zip or repository path). | Project owner |

**Pending database changes (none applied):** none are required for this plan. The unique index for create idempotency (section 4.5) is an optional future migration and would be proposed separately before any application.

## 7. Known stale documents

- `docs/TECHNICAL_ARCHITECTURE_DECISION.md` describes Supabase Auth ownership (`projects.owner_id`) and `/s/:slug`. The anonymous model in `BACKEND-INTEGRATION-CONTRACT.md` is current. Updating this file is tracked in step 2.
- `docs/FRONTEND_BACKEND_INTEGRATION_PLAN.md` states Phase 2 is in progress.
- `README.md` states "No backend is connected", which is no longer true.
