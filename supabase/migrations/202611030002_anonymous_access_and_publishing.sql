-- InviteStudio Phase 1.3: anonymous ownership, secure edit access and publish
-- separation.
--
-- Run after:
--   202610210001_initial_schema.sql
--   202611030001_wedding_backend_foundation.sql
--
-- This amendment is safe for the database that already received the initial
-- migration. It removes NOT NULL ownership requirements from the legacy
-- project table and makes the new wedding model explicitly anonymous by
-- default. Anonymous access is still mediated by trusted Edge Functions.

-- ---------------------------------------------------------------------------
-- Legacy projects compatibility
-- ---------------------------------------------------------------------------

alter table public.projects
  alter column owner_id drop not null;

alter table public.projects
  add column if not exists ownership_mode text;

alter table public.projects
  add column if not exists visibility text;

update public.projects
set ownership_mode = case when owner_id is null then 'anonymous' else 'authenticated' end
where ownership_mode is null;

update public.projects
set visibility = case when status = 'published' then 'public' else 'private' end
where visibility is null;

alter table public.projects
  alter column ownership_mode set default 'anonymous',
  alter column ownership_mode set not null,
  alter column visibility set default 'private',
  alter column visibility set not null;

alter table public.projects
  drop constraint if exists projects_ownership_mode_check;
alter table public.projects
  add constraint projects_ownership_mode_check check (
    (ownership_mode = 'anonymous' and owner_id is null)
    or (ownership_mode = 'authenticated' and owner_id is not null)
  );

alter table public.projects
  drop constraint if exists projects_visibility_status_check;
alter table public.projects
  add constraint projects_visibility_status_check check (
    (status = 'published' and visibility = 'public')
    or (status <> 'published' and visibility = 'private')
  );

drop index if exists public.projects_published_slug_idx;
create index if not exists projects_published_slug_idx
  on public.projects(slug)
  where status = 'published' and visibility = 'public';

-- The existing project RLS policies remain owner-only. Anonymous legacy rows
-- are deliberately not directly queryable; use the canonical weddings flow and
-- its token-validated Edge Functions for anonymous access.

-- ---------------------------------------------------------------------------
-- Canonical weddings
-- ---------------------------------------------------------------------------

alter table public.weddings
  alter column owner_id drop not null;

alter table public.weddings
  add column if not exists ownership_mode text;

alter table public.weddings
  add column if not exists visibility text;

alter table public.weddings
  add column if not exists category text;

update public.weddings
set category = 'Wedding'
where category is null;

alter table public.weddings
  alter column category set default 'Wedding',
  alter column category set not null;

update public.weddings
set ownership_mode = case when owner_id is null then 'anonymous' else 'authenticated' end
where ownership_mode is null;

update public.weddings
set visibility = case when status = 'published' then 'public' else 'private' end
where visibility is null;

alter table public.weddings
  alter column ownership_mode set default 'anonymous',
  alter column ownership_mode set not null,
  alter column visibility set default 'private',
  alter column visibility set not null;

alter table public.weddings
  drop constraint if exists weddings_ownership_mode_check;
alter table public.weddings
  add constraint weddings_ownership_mode_check check (
    (ownership_mode = 'anonymous' and owner_id is null)
    or (ownership_mode = 'authenticated' and owner_id is not null)
  );

alter table public.weddings
  drop constraint if exists weddings_visibility_status_check;
alter table public.weddings
  add constraint weddings_visibility_status_check check (
    (status = 'published' and visibility = 'public')
    or (status <> 'published' and visibility = 'private')
  );

drop index if exists public.weddings_published_slug_idx;
create index if not exists weddings_published_slug_idx
  on public.weddings(slug)
  where status = 'published' and visibility = 'public';

-- No anon SELECT policy is granted on weddings. Public pages must use a
-- trusted publish/public-read function that returns an allowlisted projection
-- only. This prevents owner IDs, edit settings, private metadata and RSVP
-- records from leaking through the REST table endpoint.

comment on column public.weddings.owner_id is
  'Optional future authenticated owner. Anonymous drafts use ownership_mode=anonymous and edit_tokens.';
comment on column public.weddings.ownership_mode is
  'anonymous or authenticated; anonymous ownership is proven by a valid edit token.';
comment on column public.weddings.visibility is
  'private until a trusted publish operation sets status=published and visibility=public.';

-- ---------------------------------------------------------------------------
-- Edit-token hardening
-- ---------------------------------------------------------------------------

alter table public.edit_tokens
  drop constraint if exists edit_tokens_expiry_after_creation;
alter table public.edit_tokens
  add constraint edit_tokens_expiry_after_creation check (expires_at > created_at);

drop index if exists public.edit_tokens_active_idx;
create index if not exists edit_tokens_active_idx
  on public.edit_tokens(token_hash, expires_at)
  where revoked_at is null;

comment on table public.edit_tokens is
  'Stores only hashed, expiring edit/preview tokens. Raw token validation is Edge Function only.';
