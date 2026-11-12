-- InviteStudio: register the Golden Butterfly template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('golden-butterfly', 'golden-butterfly', 'Golden Butterfly', 'Wedding', 'Cinematic',
   'A short film of golden butterflies opens a black-and-gold invitation with floating butterflies, a countdown and venues on ivory paper.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
