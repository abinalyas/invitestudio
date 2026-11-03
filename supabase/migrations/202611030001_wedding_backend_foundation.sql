-- InviteStudio Phase 1.2: wedding-oriented backend foundation
--
-- This migration is additive. The original prototype tables (projects,
-- project_photos and the legacy project-linked rsvps rows) remain intact so
-- local/demo integration is not disrupted. New cloud integrations should use
-- weddings and the wedding_* tables defined below.
--
-- Important security notes:
-- * edit_tokens stores only a cryptographic hash, never a raw access token.
-- * Anonymous drafts are accessed through hashed edit tokens and trusted Edge
--   Functions; no anonymous table writes are granted.
-- * The service role must never be shipped to the browser.

create extension if not exists pgcrypto;

-- The original migration's set_updated_at() also increments a version column.
-- These catalogue/child tables intentionally do not have a version column, so
-- they use this timestamp-only trigger instead.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create table if not exists public.templates (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null default 'Wedding',
  style text,
  description text,
  preview_image_url text,
  colors jsonb not null default '[]'::jsonb,
  animation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_id_format check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint templates_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint templates_name_length check (char_length(name) between 1 and 180)
);

create index if not exists templates_active_sort_idx
  on public.templates(is_active, sort_order, name);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
before update on public.templates
for each row execute function public.touch_updated_at();

alter table public.templates enable row level security;

drop policy if exists "Anyone can read active templates" on public.templates;
create policy "Anyone can read active templates"
  on public.templates for select to anon, authenticated
  using (is_active = true);

-- Template writes are intentionally reserved for migrations/admin tooling.
-- No browser insert/update/delete policy is granted.

-- Stable IDs already used by the current frontend catalogue. Additional
-- catalogue entries can be inserted without changing wedding records.
insert into public.templates (id, slug, name, category, style, description, colors, metadata)
values
  ('eternal', 'eternal', 'Eternal Bloom', 'Wedding', 'Elegant', 'Soft florals and timeless typography.', '["#ede2cf", "#a4b5a0", "#c8a26a"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('golden', 'golden-hour', 'Golden Hour', 'Wedding', 'Editorial', 'Warm, cinematic and beautifully understated.', '["#dfc59b", "#8a795f", "#f8f1e6"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('modern', 'modern-classic', 'Modern Classic', 'Engagement', 'Minimal', 'Clean lines with a romantic touch.', '["#eee6dc", "#8e9c8a", "#c8a26a"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('pastel', 'pastel-dreams', 'Pastel Dreams', 'Baptism', 'Colorful', 'Gentle colours for a meaningful day.', '["#f2dfd9", "#d5c8e7", "#b8cbb3"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('whisper', 'whisper', 'Whisper', 'Wedding', 'Minimal', 'An intimate invitation with space to breathe.', '["#f4eee4", "#d4c3ad", "#a4a79b"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('terracotta', 'terracotta', 'Terracotta', 'Engagement', 'Modern', 'Earthy tones and relaxed elegance.', '["#b97452", "#e8d1b8", "#7d8265"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('garden', 'garden-tale', 'Garden Tale', 'Birthday', 'Colorful', 'A fresh, joyful design full of life.', '["#e9d6c3", "#7f9a76", "#e5b5a9"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('midnight', 'midnight', 'Midnight', 'Anniversary', 'Elegant', 'Deep tones and a little evening magic.', '["#1d2b2a", "#c7a16f", "#f3ead9"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('little-star', 'little-star', 'Little Star', 'Baptism', 'Minimal', 'A gentle, modern celebration.', '["#f2e8d8", "#b8c8c1", "#d8b6a1"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('birthday', 'make-a-wish', 'Make a Wish', 'Birthday', 'Colorful', 'Bright, playful and full of personality.', '["#f2c6b4", "#d6c4ec", "#f1d98a"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('anniversary', 'golden-years', 'Golden Years', 'Anniversary', 'Elegant', 'A warm design for a life well celebrated.', '["#e8d5ad", "#c6a36b", "#f6f0e4"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb),
  ('gathering', 'gather-together', 'Gather Together', 'Other Event', 'Modern', 'A versatile design for your kind of gathering.', '["#e8e3d7", "#9aa891", "#bd9b70"]'::jsonb, '{"source":"frontend-catalogue"}'::jsonb)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  category = excluded.category,
  style = excluded.style,
  description = excluded.description,
  colors = excluded.colors,
  metadata = excluded.metadata,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Weddings: canonical cloud project record
-- ---------------------------------------------------------------------------

create table if not exists public.weddings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  ownership_mode text not null default 'anonymous',
  name text not null default 'Untitled wedding',
  category text not null default 'Wedding',
  slug text unique,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'unpublished', 'archived')),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  template_id text not null references public.templates(id),
  title text not null default 'Untitled wedding',
  event_date date,
  location text,
  message text,
  story text,
  hosts text,
  locale text not null default 'English',
  theme jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  cultural_preferences jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  intro_settings jsonb not null default '{}'::jsonb,
  animation_settings jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint weddings_slug_format check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint weddings_ownership_mode_check check (
    (ownership_mode = 'anonymous' and owner_id is null)
    or (ownership_mode = 'authenticated' and owner_id is not null)
  ),
  constraint weddings_visibility_status_check check (
    (status = 'published' and visibility = 'public')
    or (status <> 'published' and visibility = 'private')
  ),
  constraint weddings_name_length check (char_length(name) between 1 and 180),
  constraint weddings_title_length check (char_length(title) between 1 and 180),
  constraint weddings_location_length check (location is null or char_length(location) <= 500)
);

create index if not exists weddings_owner_updated_idx
  on public.weddings(owner_id, updated_at desc);
create index if not exists weddings_published_slug_idx
  on public.weddings(slug) where status = 'published' and visibility = 'public';

drop trigger if exists weddings_set_updated_at on public.weddings;
create trigger weddings_set_updated_at
before update on public.weddings
for each row execute function public.set_updated_at();

alter table public.weddings enable row level security;

drop policy if exists "Owners can read own weddings" on public.weddings;
create policy "Owners can read own weddings"
  on public.weddings for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners can create own weddings" on public.weddings;
create policy "Owners can create own weddings"
  on public.weddings for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can update own weddings" on public.weddings;
create policy "Owners can update own weddings"
  on public.weddings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can delete own weddings" on public.weddings;
create policy "Owners can delete own weddings"
  on public.weddings for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Passwordless edit access
-- ---------------------------------------------------------------------------

create table if not exists public.edit_tokens (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  token_hash text not null unique,
  token_hint text,
  purpose text not null default 'edit'
    check (purpose in ('edit', 'preview')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint edit_tokens_hash_length check (char_length(token_hash) between 40 and 128),
  constraint edit_tokens_hint_length check (token_hint is null or char_length(token_hint) <= 32)
);

create index if not exists edit_tokens_wedding_idx
  on public.edit_tokens(wedding_id, created_at desc);
create index if not exists edit_tokens_active_idx
  on public.edit_tokens(token_hash, expires_at)
  where revoked_at is null;

alter table public.edit_tokens enable row level security;
-- No direct browser policies. Token creation, lookup, revocation and use must
-- happen in a trusted Edge Function. Raw tokens are returned only at issuance.

-- ---------------------------------------------------------------------------
-- Wedding photos
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_photos (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  storage_path text not null unique,
  alt text not null default '',
  width integer,
  height integer,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wedding_photos_alt_length check (char_length(alt) <= 500),
  constraint wedding_photos_width_positive check (width is null or width > 0),
  constraint wedding_photos_height_positive check (height is null or height > 0)
);

create index if not exists wedding_photos_wedding_idx
  on public.wedding_photos(wedding_id, sort_order, created_at);

alter table public.wedding_photos enable row level security;

drop policy if exists "Owners can read own wedding photos" on public.wedding_photos;
create policy "Owners can read own wedding photos"
  on public.wedding_photos for select to authenticated
  using (exists (
    select 1 from public.weddings w
    where w.id = wedding_photos.wedding_id and w.owner_id = (select auth.uid())
  ));

drop policy if exists "Owners can manage own wedding photos" on public.wedding_photos;
create policy "Owners can manage own wedding photos"
  on public.wedding_photos for all to authenticated
  using (exists (
    select 1 from public.weddings w
    where w.id = wedding_photos.wedding_id and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.weddings w
    where w.id = wedding_photos.wedding_id and w.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Wedding events / ceremonies
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  title text not null,
  event_date date,
  start_time time,
  end_time time,
  venue text,
  description text,
  dress_code text,
  directions_url text,
  parking text,
  accommodation text,
  accessibility text,
  visible boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wedding_events_title_length check (char_length(title) between 1 and 180),
  constraint wedding_events_url_scheme check (
    directions_url is null or directions_url ~* '^https?://'
  )
);

create index if not exists wedding_events_wedding_idx
  on public.wedding_events(wedding_id, sort_order, event_date, start_time);

drop trigger if exists wedding_events_set_updated_at on public.wedding_events;
create trigger wedding_events_set_updated_at
before update on public.wedding_events
for each row execute function public.touch_updated_at();

alter table public.wedding_events enable row level security;

drop policy if exists "Owners can manage own wedding events" on public.wedding_events;
create policy "Owners can manage own wedding events"
  on public.wedding_events for all to authenticated
  using (exists (
    select 1 from public.weddings w
    where w.id = wedding_events.wedding_id and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.weddings w
    where w.id = wedding_events.wedding_id and w.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'INR',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payments_provider_id_unique unique (provider, provider_payment_id)
);

create index if not exists payments_wedding_idx
  on public.payments(wedding_id, created_at desc);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.touch_updated_at();

alter table public.payments enable row level security;

drop policy if exists "Owners can read own wedding payments" on public.payments;
create policy "Owners can read own wedding payments"
  on public.payments for select to authenticated
  using (exists (
    select 1 from public.weddings w
    where w.id = payments.wedding_id and w.owner_id = (select auth.uid())
  ));

-- Payment creation, verification and status changes belong to trusted payment
-- webhooks/Edge Functions. No browser insert/update/delete policies are given.

-- ---------------------------------------------------------------------------
-- RSVP compatibility bridge
-- ---------------------------------------------------------------------------

-- The initial migration created rsvps.project_id. Add wedding_id rather than
-- replacing the table, so existing prototype rows remain readable while new
-- cloud RSVPs use the canonical wedding relationship.

alter table public.rsvps
  add column if not exists wedding_id uuid references public.weddings(id) on delete cascade;

alter table public.rsvps
  alter column project_id drop not null;

alter table public.rsvps
  drop constraint if exists rsvps_one_parent;
alter table public.rsvps
  add constraint rsvps_one_parent check (
    (project_id is not null and wedding_id is null)
    or (project_id is null and wedding_id is not null)
  );

create index if not exists rsvps_wedding_created_idx
  on public.rsvps(wedding_id, created_at desc);

drop policy if exists "Owners can read RSVPs for own projects" on public.rsvps;
create policy "Owners can read RSVPs for own projects"
  on public.rsvps for select to authenticated
  using (
    (project_id is not null and exists (
      select 1 from public.projects p
      where p.id = rsvps.project_id and p.owner_id = (select auth.uid())
    ))
    or
    (wedding_id is not null and exists (
      select 1 from public.weddings w
      where w.id = rsvps.wedding_id and w.owner_id = (select auth.uid())
    ))
  );

-- There is intentionally still no anonymous INSERT policy. Public RSVP writes
-- must validate the published slug, rate-limit requests and insert via a
-- trusted Edge Function.

comment on table public.templates is 'Versioned InviteStudio template catalogue; browser reads active templates only.';
comment on table public.weddings is 'Canonical cloud wedding website/project record.';
comment on table public.edit_tokens is 'Hashed passwordless edit tokens; raw tokens are never stored.';
comment on table public.wedding_photos is 'Metadata for files stored in project-scoped Supabase Storage.';
comment on table public.wedding_events is 'Ordered ceremony and event details shown to guests.';
comment on table public.payments is 'Provider verification records; writes are trusted-operation only.';
comment on table public.rsvps is 'Legacy project-linked and new wedding-linked guest responses.';
