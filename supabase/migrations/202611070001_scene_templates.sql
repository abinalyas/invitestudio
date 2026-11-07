-- InviteStudio: register the four scene templates so weddings.template_id accepts them.
-- Matches the frontend catalogue entries added in index.html (savanna-sunset, palmera-beach,
-- curtain-call, lunaria-moon). Safe to run more than once.
-- Apply in the Supabase SQL Editor (production) before deploying the frontend change.

insert into public.templates (id, slug, name, category, style, description, metadata)
values
  ('savanna-sunset', 'savanna-sunset', 'Savanna Sunset', 'Wedding', 'Nature',
   'Golden dunes, acacia silhouettes and a script title at sunset.', '{"source":"frontend-catalogue","renderer":"scene"}'::jsonb),
  ('palmera-beach', 'palmera-beach', 'Palmera Beach', 'Wedding', 'Nature',
   'A sunlit beach inside an arch, framed by palms and hibiscus.', '{"source":"frontend-catalogue","renderer":"scene"}'::jsonb),
  ('curtain-call', 'curtain-call', 'Curtain Call', 'Wedding', 'Classic',
   'Theatre curtains that open on tap to reveal the invitation.', '{"source":"frontend-catalogue","renderer":"scene"}'::jsonb),
  ('lunaria-moon', 'lunaria-moon', 'Lunaria', 'Wedding', 'Botanical',
   'Dusty blue linen, a moon and an arch of leaves and water lilies.', '{"source":"frontend-catalogue","renderer":"scene"}'::jsonb)
on conflict (id) do nothing;
