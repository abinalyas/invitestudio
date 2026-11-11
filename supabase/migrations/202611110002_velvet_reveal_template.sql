-- InviteStudio: register the Velvet Reveal template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('velvet-reveal', 'velvet-reveal', 'Velvet Reveal', 'Wedding', 'Cinematic',
   'Emerald velvet curtains part on a full-screen opening, then a gold foil to scratch away to find the date, with a live countdown.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
