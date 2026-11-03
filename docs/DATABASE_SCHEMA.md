# InviteStudio Phase 1.2 database schema

Migrations:

- `supabase/migrations/202611030001_wedding_backend_foundation.sql`
- `supabase/migrations/202611030002_anonymous_access_and_publishing.sql`
- `supabase/migrations/202611030003_template_catalogue_compatibility.sql`

## Canonical cloud model

The current prototype uses `projects` and browser `localStorage`. The backend
model uses `weddings` as the canonical customer-owned invitation website. The
new migration is additive so the existing prototype can continue to run while
the data-access layer is built.

| Table | Purpose | Browser access |
|---|---|---|
| `templates` | Active invitation template catalogue | Public read of active rows; admin/migration writes only |
| `weddings` | Main invitation website and wedding information | Private by default; token-validated Edge Function or optional authenticated owner |
| `edit_tokens` | Hashed passwordless edit/preview access | No direct browser access; trusted Edge Function only |
| `wedding_photos` | Photo metadata linked to Storage objects | Authenticated owner CRUD; binary storage policies still required |
| `wedding_events` | Ordered ceremonies and event details | Authenticated owner CRUD |
| `payments` | Payment provider verification records | Owner read; trusted webhook/Edge Function writes |
| `rsvps` | Guest responses | Owner read; trusted public RSVP function writes |

## Structured versus flexible fields

Important query and security fields remain structured:

- IDs and foreign keys
- `slug`
- `status`
- `template_id`
- `owner_id`
- `ownership_mode`
- dates, times and visibility
- payment provider/status/amount/currency
- token hash and expiry
- timestamps and optimistic-concurrency `version`

Content that may evolve as the editor grows uses JSONB:

- `weddings.theme`
- `weddings.preferences`
- `weddings.cultural_preferences`
- `weddings.content`
- `weddings.sections`
- `weddings.intro_settings`
- `weddings.animation_settings`
- `wedding_photos.metadata`
- `wedding_events.metadata`
- `payments.metadata`

## Security decisions

### Owner and anonymous access

Customer accounts are not required. Anonymous drafts use
`ownership_mode = 'anonymous'`, `owner_id = NULL`, and one or more expiring
records in `edit_tokens`. The browser must never choose an authenticated owner
ID. Optional authenticated ownership remains available for a future account
flow, but rows without an authenticated owner must be created and accessed
through a trusted Edge Function.

### Edit tokens

`edit_tokens.token_hash` stores a SHA-256 (or stronger one-way) hash of a
cryptographically random token. The raw token should be shown only once when
the Edge Function issues it. Token lookup should hash the presented token,
check `revoked_at` and `expires_at`, and then perform the requested operation
server-side. Do not expose the table through the browser API.

### Photos

`wedding_photos` stores metadata and a Storage path, not base64 image data.
Supabase Storage bucket and object policies must be added before photo upload
is enabled. Upload type, size, dimensions and file contents must be validated
by a trusted operation.

### Payments

The frontend must never mark a payment as paid. A payment provider webhook or
trusted Edge Function verifies the provider response and updates `payments`.
Do not store card numbers, CVV, secrets or unnecessary payment payloads in
`metadata`.

### RSVPs

The existing `rsvps` table is kept for compatibility. The new migration adds
`wedding_id` while retaining legacy `project_id` rows. New rows must reference
exactly one parent. Anonymous inserts remain disabled; a rate-limited Edge
Function must validate the published slug and write the RSVP.

### Public/private separation

New weddings default to `status = 'draft'` and `visibility = 'private'`. A
trusted publish operation must atomically set a valid slug, `status =
'published'`, `visibility = 'public'` and `published_at`. Unpublishing must
restore private visibility. There is no anonymous `SELECT` policy on the full
`weddings` table; the public route must return an allowlisted projection via a
trusted public-read operation so private settings and edit tokens are never
exposed.

## Migration and rollout

1. Run `202611030001_wedding_backend_foundation.sql` after
   `202610210001_initial_schema.sql`.
2. Run `202611030002_anonymous_access_and_publishing.sql`.
3. Verify the seven tables and RLS policies in Supabase Table Editor.
4. Add Storage bucket/object policies for `wedding_photos`.
5. Implement the repository adapter and map the existing frontend project
   object to `weddings` plus child tables.
6. Add token, publish, payment webhook and RSVP Edge Functions before allowing
   public writes or claiming production readiness.

The current Phase 1.4 implementation provides the equivalent token and draft
operations through Cloudflare Pages Functions in `functions/api/`. Configure
the server-only `SUPABASE_SERVICE_ROLE_KEY` secret before deploying them.

## Known compatibility decisions

- Existing `projects` is not dropped or renamed in Phase 1.2/1.3.
- Legacy `projects.owner_id` is now nullable for anonymous compatibility, but
  the legacy table is not opened to anonymous REST access.
- Existing `project_photos` is not dropped; new cloud photo work uses
  `wedding_photos`.
- Existing project-linked RSVPs remain readable.
- The initial template seed contains stable IDs already used by the current
  frontend. The full frontend catalogue can be synchronised in a later seed
  migration without changing `weddings.template_id` values.
