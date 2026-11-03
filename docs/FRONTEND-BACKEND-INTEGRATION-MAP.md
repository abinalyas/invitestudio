# Frontend ↔ Supabase integration map

Status: integration discovery, based on the current `main` source and the checked-in initial migration. This document is not evidence that the live Supabase project has been connected or that deployed Edge/Pages Functions exist.

Working branch: `integration/approved-design-supabase`

## Current repository findings

- The production entry point is still the standalone `index.html` application. `design-preview.html` is a separate visual reference and must not replace the application entry point.
- The current app initializes projects from `localStorage` key `invitestudio-projects`; `load()` creates a sample project when no local projects exist.
- `save()` serializes the entire `state.projects` array back to localStorage.
- The dashboard, setup flow, editor, preview, photo handling, project duplication and template selection all mutate this in-memory project shape.
- Photo uploads currently use FileReader and store base64 data in `p.photos[].data`.
- Publish and public RSVP are deliberately unavailable in the UI.
- The checked-in Supabase migration defines `projects`, `project_photos` and `rsvps`, with RLS. The `projects` policies require an authenticated Supabase user.
- The checked-in docs describe REST-style endpoints as a proposed contract; no Supabase JS client, Cloudflare Pages Function, or Supabase Edge Function implementation was found in the source files inspected for this pass.

## Existing frontend project shape

The frontend currently uses these fields (not all are populated on every project):

| Frontend field | Current use |
|---|---|
| `id` | Client-generated UUID |
| `name`, `title`, `category`, `templateId` | Project identity and template selection |
| `date`, `location`, `message`, `story`, `hosts`, `locale` | Invitation content |
| `theme`, `preferences`, `culturalPreferences` | Visual and cultural configuration |
| `sections`, `functions` | Page visibility/content and event schedule |
| `introSettings`, `animationSettings` | Intro and motion settings |
| `photos[]` | Currently local base64 data plus alt text |
| `status`, `published`, `updated` | UI-level status and display metadata |

## Mapping to the checked-in SQL schema

| Frontend field | Supabase `projects` column | Integration note |
|---|---|---|
| `id` | `id` | Prefer server-generated UUID on create; retain returned ID as canonical. |
| authenticated identity | `owner_id` | Must come from Supabase Auth/session, never from a form field. |
| `name` | `name` | Direct mapping. |
| `category` | `category` | Direct mapping; normalize only if product taxonomy requires it. |
| `templateId` | `template_id` | Direct mapping. |
| `title` | `title` | Direct mapping. |
| `date` | `event_date` | ISO date string or null. |
| `location` | `location` | Direct mapping. |
| `message` | `message` | Direct mapping. |
| `story` | `story` | Direct mapping. |
| `hosts` | `hosts` | Direct mapping. |
| `locale` | `locale` | Direct mapping. |
| `theme` | `theme` | JSONB. |
| `preferences` | `preferences` | JSONB. |
| `culturalPreferences` | `cultural_preferences` | JSONB; convert camelCase ↔ snake_case in one adapter. |
| `sections` | `sections` | JSONB. Preserve stable section IDs. |
| `functions` | `event_functions` | JSONB; map frontend `functions` to SQL `event_functions`. |
| `introSettings` | `intro_settings` | JSONB; adapter required for casing. |
| `animationSettings` | `animation_settings` | JSONB; adapter required for casing. |
| `status` | `status` | SQL permits `draft`, `published`, `unpublished`; current UI has legacy `Draft` display strings. Normalize at boundary. |
| `published` | derived from `status` | Do not persist a second conflicting boolean. |
| `slug` | `slug` | Server assigned/reserved during publish, not trusted from client. |
| `version` | `version` | Use for optimistic concurrency. |
| `updated` | `updated_at` | Server timestamp; format for UI at display boundary. |
| `photos[]` | `project_photos` + Supabase Storage | Upload binary separately; persist storage path, alt, width, height. Never write base64 into project JSON. |

## Integration boundaries

Create a small repository/service module and keep UI rendering independent from the storage implementation:

- `ProjectRepository.list()`
- `ProjectRepository.get(id)`
- `ProjectRepository.create(input)`
- `ProjectRepository.update(id, patch, expectedVersion)`
- `ProjectRepository.remove(id)`
- `PhotoRepository.upload(projectId, file)`
- `PhotoRepository.remove(projectId, photoId)`
- `PublishingService.publish(projectId)`
- `PublishingService.unpublish(projectId)`
- `RsvpService.submit(slug, response)`
- `RsvpService.list(projectId)`

Use a temporary local adapter for existing demo behavior and a Supabase adapter for authenticated cloud projects. Do not silently switch existing local drafts to remote storage. Add an explicit migration/import path after cloud saving works.

## Important schema and product decisions to resolve before wiring

1. **Authentication / ownership:** the migration requires `auth.users`. Confirm the chosen sign-in or passwordless edit-link design and ensure it produces a trusted owner identity compatible with RLS. A public publishable key alone does not grant safe owner access.
2. **Backend operations:** confirm whether project CRUD and storage operations will use Supabase client + RLS directly, Cloudflare Pages Functions, or Supabase Edge Functions. Privileged publish/unpublish and public RSVP validation must remain server-side.
3. **Photo storage:** confirm the bucket name and Storage policies before enabling uploads.
4. **Schema source of truth:** compare the deployed Supabase schema with `supabase/migrations/202610210001_initial_schema.sql`; do not assume the checked-in migration is already applied or current.
5. **Legacy data:** the seeded sample project and local drafts must not be uploaded automatically or mistaken for user-owned cloud projects.
6. **Template data:** templates are currently a frontend registry. Persist the stable `templateId`, and keep the public renderer compatible with the same registry/versioned template definitions.

## Safe implementation order

1. Add a typed/validated project serializer and deserializer with round-trip tests against the SQL column names.
2. Add environment/config validation and Supabase client initialization without embedding service-role secrets.
3. Implement Auth/session handling and owner-scoped project list/create/read/update/delete.
4. Connect dashboard and editor autosave through the repository adapter; preserve local draft fallback and surface offline/conflict states.
5. Move photo uploads to Supabase Storage and store metadata in `project_photos`.
6. Implement a single invitation renderer for editor preview and public published pages.
7. Add server-side publish/unpublish and public safe-field lookup.
8. Add rate-limited public RSVP submission and owner-only RSVP management.
9. Complete browser E2E, responsive, accessibility, security and cross-account isolation tests before production cutover.

## Release safety

- Keep `main` and the current deployed experience untouched until reviewed PRs are merged.
- Do not commit `.env`, Supabase service-role keys, Cloudflare tokens, or private edit tokens.
- Never show a “saved” or “published” state before the server confirms success.
- Keep local drafts intact when network writes fail; allow retry and resolve version conflicts.
- Public routes must return only allowlisted published fields, never owner IDs, private settings, drafts or RSVP data.
