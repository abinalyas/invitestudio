-- InviteStudio: register the Modern Heritage template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('modern-heritage', 'modern-heritage', 'Modern Heritage', 'Wedding', 'Classic',
   'Ivory paper, deep green and gold botanical details, with a live countdown to the day.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
