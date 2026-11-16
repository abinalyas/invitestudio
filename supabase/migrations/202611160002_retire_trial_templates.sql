-- InviteStudio: retire the five trial designs (Savanna Sunset, Palmera Beach, Curtain Call, Lunaria, Blue Hydrangea).
-- They are no longer in the frontend catalogue or the server allow-list. This switches them off in the database as well,
-- so nothing can create a new draft on them. The rows are kept (not deleted) because existing drafts and invitations point at them.
-- Safe to run more than once. Apply in the Supabase SQL Editor (production).

update public.templates
   set is_active = false
 where id in ('savanna-sunset', 'palmera-beach', 'curtain-call', 'lunaria-moon', 'blue-hydrangea');
