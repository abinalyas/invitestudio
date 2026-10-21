-- InviteStudio initial schema
-- Apply with Supabase CLI after linking a provisioned Supabase project.
-- Public RSVP writes must go through a rate-limited Edge Function; do not grant anon INSERT on rsvps.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled wedding',
  category text not null default 'Wedding',
  template_id text not null,
  title text not null,
  event_date date,
  location text,
  message text,
  story text,
  hosts text,
  locale text not null default 'English',
  theme jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  cultural_preferences jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  event_functions jsonb not null default '[]'::jsonb,
  intro_settings jsonb not null default '{}'::jsonb,
  animation_settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  slug text unique,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint projects_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint projects_title_length check (char_length(title) between 1 and 180),
  constraint projects_location_length check (location is null or char_length(location) <= 500)
);

create index if not exists projects_owner_updated_idx
  on public.projects(owner_id, updated_at desc);
create index if not exists projects_published_slug_idx
  on public.projects(slug) where status = 'published';

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create table if not exists public.project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null unique,
  alt text not null default '',
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  constraint photo_alt_length check (char_length(alt) <= 500),
  constraint photo_width_positive check (width is null or width > 0),
  constraint photo_height_positive check (height is null or height > 0)
);
create index if not exists project_photos_project_idx on public.project_photos(project_id);

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  guest_name text not null,
  attending boolean not null,
  party_size integer not null default 1 check (party_size between 1 and 20),
  message text,
  created_at timestamptz not null default now(),
  constraint rsvp_guest_name_length check (char_length(guest_name) between 1 and 160),
  constraint rsvp_message_length check (message is null or char_length(message) <= 2000)
);
create index if not exists rsvps_project_created_idx on public.rsvps(project_id, created_at desc);

alter table public.projects enable row level security;
alter table public.project_photos enable row level security;
alter table public.rsvps enable row level security;

-- Owners can access only their own drafts and published projects.
drop policy if exists "Owners can read own projects" on public.projects;
create policy "Owners can read own projects"
  on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners can create own projects" on public.projects;
create policy "Owners can create own projects"
  on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can update own projects" on public.projects;
create policy "Owners can update own projects"
  on public.projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can delete own projects" on public.projects;
create policy "Owners can delete own projects"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners can read own photo metadata" on public.project_photos;
create policy "Owners can read own photo metadata"
  on public.project_photos for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_photos.project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists "Owners can add own photo metadata" on public.project_photos;
create policy "Owners can add own photo metadata"
  on public.project_photos for insert to authenticated
  with check (exists (
    select 1 from public.projects p
    where p.id = project_photos.project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists "Owners can update own photo metadata" on public.project_photos;
create policy "Owners can update own photo metadata"
  on public.project_photos for update to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_photos.project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_photos.project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists "Owners can delete own photo metadata" on public.project_photos;
create policy "Owners can delete own photo metadata"
  on public.project_photos for delete to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_photos.project_id and p.owner_id = (select auth.uid())
  ));

-- RSVP reads are owner-only. No direct INSERT policy is intentional:
-- a public Edge Function must validate published slug, validate input, and rate-limit.
drop policy if exists "Owners can read RSVPs for own projects" on public.rsvps;
create policy "Owners can read RSVPs for own projects"
  on public.rsvps for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = rsvps.project_id and p.owner_id = (select auth.uid())
  ));

comment on table public.projects is 'Private owner-controlled project data. Public pages must use a safe published-field projection.';
comment on table public.project_photos is 'Asset metadata only; validate storage access separately.';
comment on table public.rsvps is 'Guest responses; public submissions must go through a rate-limited trusted Edge Function.';
