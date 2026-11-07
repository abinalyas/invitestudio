-- InviteStudio: register the Minimalist template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('minimalist', 'minimalist', 'Minimalist', 'Wedding', 'Modern',
   'Quiet editorial layout: large serif names, one olive accent and plenty of space.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
