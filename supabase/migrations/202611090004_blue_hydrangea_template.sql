-- InviteStudio: register the Blue Hydrangea template so weddings.template_id accepts it.
-- Matches the frontend catalogue entry added in index.html. Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('blue-hydrangea', 'blue-hydrangea', 'Blue Hydrangea', 'Wedding', 'Botanical',
   'A pale blue sky framed by hydrangea and orchid garlands, with a countdown in a scalloped frame and a soft, garden-party feel.', '{"source":"frontend-catalogue","renderer":"packaged"}'::jsonb)
on conflict (id) do nothing;
