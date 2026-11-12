-- InviteStudio: register the Cherry Blossom template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('cherry-blossom', 'cherry-blossom', 'Cherry Blossom', 'Wedding', 'Botanical',
   'A short film of blossom, petals that fall past your names, and a date to uncover with three taps and a soft chime.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
