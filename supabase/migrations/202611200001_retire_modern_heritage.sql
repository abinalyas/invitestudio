-- InviteStudio: take Modern Heritage off the shelf.
-- It is no longer in the frontend catalogue (gallery, home, setup), so nobody can pick it. This switches it off in the database
-- too, so nothing can create a new draft on it. The row is kept (not deleted), and the design stays in the server's allow-list, because
-- existing drafts and published invitations still use it and must keep showing and publishing.
-- Safe to run more than once. Apply in the Supabase SQL Editor (production).

update public.templates
   set is_active = false
 where id = 'modern-heritage';
