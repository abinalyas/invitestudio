-- InviteStudio: register the Under the Same Moon template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('under-the-same-moon', 'under-the-same-moon', 'Under the Same Moon', 'Wedding', 'Celestial',
   'A moonlit lake under a slowly turning moon, a gold foil to scratch for the date, lantern-lit story and a countdown to forever.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
