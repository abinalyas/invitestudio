-- InviteStudio: register the Bloom Reveal template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('bloom-reveal', 'bloom-reveal', 'Bloom Reveal', 'Wedding', 'Botanical',
   'A watercolour border of peonies and roses that blooms in from the corners, with a live countdown and soft script lettering.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
