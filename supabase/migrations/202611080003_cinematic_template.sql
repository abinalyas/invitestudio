-- InviteStudio: register the Cinematic template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('cinematic', 'cinematic', 'Cinematic', 'Wedding', 'Modern',
   'A dark, film-like invitation: big names, a golden countdown and quiet scenes.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
