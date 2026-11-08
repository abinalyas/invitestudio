-- InviteStudio: register the Fairy Tale template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('fairy-tale', 'fairy-tale', 'Fairy Tale', 'Wedding', 'Romantic',
   'A pink sunset sky, a castle on the hill and script lettering: once upon a time, with a countdown to forever.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
