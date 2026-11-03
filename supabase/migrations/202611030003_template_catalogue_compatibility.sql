-- InviteStudio Phase 2: make every frontend template ID valid for cloud drafts.
-- The visual catalogue remains in index.html for now. These compatibility
-- rows satisfy weddings.template_id while the catalogue is eventually moved to
-- an admin-managed template seed.

insert into public.templates (id, slug, name, category, style, description, metadata)
select
  template_id,
  template_id,
  initcap(replace(template_id, '-', ' ')),
  'Wedding',
  'Editorial',
  'InviteStudio template from the frontend catalogue.',
  '{"source":"frontend-catalogue-compatibility"}'::jsonb
from unnest(array[
  'timeless-romance', 'modern-minimal-wedding', 'romantic-garden-wedding',
  'black-tie-wedding', 'soft-pastels-wedding', 'contemporary-editorial-wedding',
  'destination-wedding', 'royal-elegance-wedding', 'vintage-romance-wedding',
  'contemporary-floral-wedding', 'eternal', 'golden', 'modern', 'pastel',
  'whisper', 'terracotta', 'garden', 'midnight', 'little-star', 'birthday',
  'anniversary', 'gathering', 'velvet-noir', 'ivory-heirloom',
  'botanical-atelier', 'rosewater', 'champagne-toast', 'little-moon',
  'baby-in-bloom', 'little-luxe', 'confetti-club', 'forever-us', 'new-chapter',
  'something-blue', 'open-doors', 'summit', 'studio-profile',
  'haldi-marigold', 'mehendi-mandala', 'sangeet-lights', 'phera-doors',
  'roka-rose', 'sagai-gold', 'ganesh-blessing', 'chooda-crimson',
  'baraat-procession', 'kerala-kasavu', 'kerala-monsoon', 'south-temple',
  'south-mogra', 'christian-vows', 'orthodox-candle', 'catholic-cathedral',
  'sikh-anand', 'muslim-noor', 'interfaith-harmony', 'destination-coast',
  'haldi-sunshine', 'mehendi-emerald', 'sangeet-midnight', 'vidaai-rose',
  'reception-gold', 'custom-celebration', 'birthday-cosmos', 'first-birthday',
  'baby-clouds', 'baptism-dove', 'bridal-afterglow', 'anniversary-film',
  'house-blessing', 'graduation-motion', 'summit-motion', 'reunion-garden',
  'haldi-bloom', 'mehendi-vines', 'sangeet-velvet', 'tilak-saffron',
  'ganesh-lotus', 'chooda-rose-gold', 'baraat-royal', 'phera-sacred',
  'vidaai-dusk', 'reception-chandelier', 'custom-rituals'
]) as ids(template_id)
on conflict (id) do nothing;
