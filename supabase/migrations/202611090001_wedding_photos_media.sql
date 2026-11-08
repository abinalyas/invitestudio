-- Photo storage (see docs/MEDIA_PLAN.md). The files live in Cloudflare R2; this table keeps the details of each photo.
-- Additive: existing rows (there are none in use) are untouched. The old storage_path column holds the full-size key.

alter table public.wedding_photos
  add column if not exists full_key text,
  add column if not exists thumb_key text,
  add column if not exists full_bytes integer,
  add column if not exists thumb_bytes integer,
  add column if not exists format text;

alter table public.wedding_photos drop constraint if exists wedding_photos_format_known;
alter table public.wedding_photos
  add constraint wedding_photos_format_known check (format is null or format in ('webp', 'jpeg'));

alter table public.wedding_photos drop constraint if exists wedding_photos_bytes_positive;
alter table public.wedding_photos
  add constraint wedding_photos_bytes_positive check (
    (full_bytes is null or full_bytes > 0) and (thumb_bytes is null or thumb_bytes > 0)
  );

comment on column public.wedding_photos.full_key is 'R2 object key of the full-size picture (also stored in storage_path).';
comment on column public.wedding_photos.thumb_key is 'R2 object key of the thumbnail.';
