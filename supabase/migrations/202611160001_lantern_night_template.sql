-- InviteStudio: register the Lantern Night template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('lantern-night', 'lantern-night', 'Lantern Night', 'Wedding', 'Cinematic',
   'A film of a thousand floating lanterns plays behind the whole invitation, lanterns rise past your names, and the date waits under dark gold foil.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
