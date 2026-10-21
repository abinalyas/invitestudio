# InviteStudio technical architecture decision

Status: recommended MVP architecture; requires provisioning of external services before implementation can be completed.
Date: 2026-10-21

## Decision

Use **Cloudflare Pages + Supabase** for the first production-capable release.

- **Frontend and public invitation hosting:** Cloudflare Pages, connected to the GitHub repository. Keep the current static-first frontend and migrate deployment from GitHub Pages when ready to support routed public invitation pages.
- **Database and identity:** Supabase Postgres and Supabase Auth.
- **Media:** Supabase Storage, with server-side upload validation and per-project ownership.
- **Trusted operations:** Supabase Edge Functions for publish/unpublish, public RSVP submission, and any operation that needs privileged validation. Never ship the service-role key to the browser.
- **Client access:** Supabase publishable/anon key only, with Row Level Security (RLS) enabled on every exposed table.
- **Monitoring:** Cloudflare Pages deployment logs plus Supabase logs; add request IDs and user-safe error messages.

### Why this is the recommended fit

1. It supports the existing HTML/CSS/JS application without requiring an immediate full framework rewrite.
2. Postgres fits related data such as projects, event functions, sections, photo metadata, and guest RSVPs.
3. Supabase Auth and RLS provide a practical starting point for private project ownership.
4. Supabase Storage separates photo assets from project JSON, avoiding base64 images in localStorage or database rows.
5. Cloudflare Pages can serve both the editor and public invitation routes at a custom domain and supports deploy previews.
6. It keeps the MVP stack small. Reassess if traffic, cost, compliance or operational requirements change.

This is an architecture recommendation, not a claim that services have been provisioned or connected. The project owner must create the Cloudflare and Supabase projects and configure secrets/domains.

## Environment setup

Create separate development/staging and production environments where practical.

Required configuration:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (safe to expose as a public client key; still protect data with RLS)
- Supabase Edge Function secrets for any provider-specific/private credentials
- Cloudflare Pages project and production domain
- Custom domain/DNS configuration, if required

Do not commit credentials to GitHub. Never use `SUPABASE_SERVICE_ROLE_KEY` in browser code or static build output. Keep any service-role key only in trusted server-side secrets if a function genuinely requires it.

## Data model (initial)

### projects
- `id uuid primary key`
- `owner_id uuid references auth.users not null`
- `name text not null`
- `category text not null`
- `template_id text not null`
- `title text not null`
- `date date null`
- `location text null`
- `message text null`
- `story text null`
- `hosts text null`
- `locale text not null default 'English'`
- `theme jsonb not null default '{}'`
- `preferences jsonb not null default '{}'`
- `cultural_preferences jsonb not null default '{}'`
- `sections jsonb not null default '[]'`
- `functions jsonb not null default '[]'`
- `intro_settings jsonb not null default '{}'`
- `animation_settings jsonb not null default '{}'`
- `status text not null default 'draft' check (status in ('draft','published','unpublished'))`
- `slug text unique null`
- `version integer not null default 1`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `published_at timestamptz null`

### project_photos
- `id uuid primary key`
- `project_id uuid references projects on delete cascade not null`
- `storage_path text not null`
- `alt text not null default ''`
- `width integer null`, `height integer null`, `created_at timestamptz not null default now()`

### rsvps
- `id uuid primary key`
- `project_id uuid references projects on delete cascade not null`
- `guest_name text not null`
- `attending boolean not null`
- `party_size integer not null default 1 check (party_size between 1 and 20)`
- `message text null`
- `created_at timestamptz not null default now()`

Keep guest fields minimal for MVP. Add dietary requirements or per-guest names only after confirming the need and retention policy.

## Access and security rules

- Enable RLS on every exposed table.
- Projects: authenticated owner can select/insert/update/delete only their own rows; set owner ID from the authenticated identity, never trust a client-supplied owner ID.
- Photos: only project owners can list/manage metadata; Storage policies scope objects to the owning project.
- RSVPs: guests do not receive direct select access. Submit through a rate-limited Edge Function that verifies the slug points to a published project and validates fields.
- RSVP listing/export: authenticated owner only, and only for their own project.
- Public invitation route: read only a safe, allowlisted projection of published project fields; never return owner IDs, private settings, draft data, or RSVP records.
- Validate URL schemes, text lengths, file signatures, MIME types, dimensions and upload size. Rate-limit public RSVP submissions and apply spam controls.
- Provide project deletion and define RSVP/photo retention and deletion behaviour before production.
- Do not place secrets in frontend code, repository files, or client logs.

## Publish and URL routing

- Public route format: `/s/:slug` (e.g. `https://<domain>/s/alex-and-jamie`).
- Configure Cloudflare Pages SPA fallback/rewrite so the route loads the frontend shell.
- Public route fetches only published, safe project data by slug.
- Publish operation validates the project, reserves a unique slug, changes status only after successful validation, and returns the canonical URL.
- Unpublish immediately prevents the public route from returning the invitation.
- The current GitHub Pages URL is a prototype URL; do not represent it as production hosting until Cloudflare Pages and domain routing are configured.

## API / operation contract

Implement the endpoints/functions documented in `BACKEND-INTEGRATION-CONTRACT.md`:
- project create/list/read/update/delete
- photo upload/delete
- publish/unpublish
- public invitation read by slug
- public RSVP submission
- owner-only RSVP listing/export

Use optimistic concurrency through a project version or `If-Match`. Return a canonical saved object after successful writes. Use stable error codes and preserve unsaved frontend edits when network calls fail.

## Frontend integration strategy

1. Introduce a small data-access layer so editor UI is not coupled directly to localStorage or Supabase calls.
2. Keep a clearly labelled local demo mode until backend environment variables and health checks are present.
3. Add sign-in and project ownership before enabling private cloud saving.
4. Migrate local drafts through an explicit import flow; do not silently upload private content.
5. Upload images as assets and store URLs/metadata, not base64 blobs in project JSON.
6. Keep publishing and RSVP controls disabled or clearly labelled demo-only until the backend operation is deployed and end-to-end tested.
7. Add loading, saved, retry, conflict, permission and offline states.

## Delivery gates

### Gate A — Infrastructure
- Cloudflare Pages project connected to GitHub.
- Supabase project provisioned; schema migrations tracked in repository.
- Development/staging environment configured without production secrets in Git.
- RLS and storage policies reviewed.

### Gate B — Saved projects
- Authenticated user can create, edit, reload and delete a project.
- Cross-user access tests prove one user cannot read or modify another user's draft.
- Uploads persist and enforce limits.

### Gate C — Publishing
- Unique slug is reserved.
- Public route works in a clean browser and on mobile.
- Only published fields are exposed.
- Unpublish invalidates public access.

### Gate D — RSVP
- Guest can submit to a published slug.
- Invalid or unpublished slug is rejected.
- Rate limiting/spam controls are active.
- Only the owner can read/export responses.

### Gate E — Production
- End-to-end create → save → publish → open public URL → submit RSVP → owner views RSVP passes.
- Privacy, deletion, retention and recovery behaviour is documented.
- Error monitoring and rollback plan are in place.

## Rollout plan

1. Provision Cloudflare and Supabase projects; confirm domain and budget.
2. Implement schema migrations and RLS policies.
3. Build auth and project data-access layer; test cross-account isolation.
4. Migrate media uploads.
5. Implement public invitation routing and publish/unpublish.
6. Implement RSVP Edge Function and owner dashboard.
7. Run staging end-to-end and security tests.
8. Move production domain only after all release gates pass.

## Known decisions still requiring owner confirmation

- Production domain and whether Cloudflare Pages is acceptable.
- Supabase plan/budget and target region based on privacy/legal requirements.
- Authentication options (email magic link/password, OAuth).
- Whether invitation sites should support passwords or unlisted links in MVP.
- RSVP fields, guest edits, plus-ones and retention period.
- Whether collaborative editing by a partner is required in the first release.
