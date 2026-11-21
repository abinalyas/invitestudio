-- Deleting idle drafts (docs/RETENTION_PLAN.md, "Idle drafts" and step 4 for drafts only).
-- Additive. Nothing here deletes anything by itself: it adds the OFF switch, the audit table and the functions the protected
-- cleanup address calls. Deletion happens only when draft_deletion_enabled is turned on (it starts off) AND that address
-- is called with its confirmation word.
--
-- What may be deleted, and nothing else: a website that was NEVER published, whose end date plus the grace period has
-- passed, and which has no paid or refunded payment, no unlocked publishing, no promo code, no keep_until date and is not
-- closed. It is checked again at the moment of deleting, with the row locked, so a draft saved a second ago is left alone.

alter table public.retention_settings
  add column if not exists draft_deletion_enabled boolean not null default false;
comment on column public.retention_settings.draft_deletion_enabled is 'Master switch for deleting idle drafts. Starts off. Turn on with: update retention_settings set draft_deletion_enabled = true;';

-- One line for each deletion: ids and dates only, no names, replies or photos. It answers "what happened to my draft?".
create table if not exists public.retention_log (
  id bigserial primary key,
  logged_at timestamptz not null default now(),
  wedding_id uuid not null,            -- deliberately not a foreign key: the website is gone
  action text not null check (action in ('delete_draft')),
  rule text not null default 'draft_idle',
  last_change date,
  ended_on date,
  grace_days integer
);
alter table public.retention_log enable row level security;
revoke all on public.retention_log from public, anon, authenticated;
comment on table public.retention_log is 'What the cleanup did, by website id and dates only. Service key access only.';

-- Is this website one the cleanup may delete today? The single place the rule for deleting lives.
create or replace function public.retention_draft_deletable(w public.weddings, p_today date default current_date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.retention_settings;
  ends date;
begin
  if w.first_published_at is not null or w.published_at is not null or w.status = 'published' then return false; end if;
  if w.keep_until is not null or w.publish_unlocked_at is not null or w.retention_hidden_at is not null then return false; end if;
  if exists (select 1 from public.payments p where p.wedding_id = w.id and p.status in ('paid', 'refunded')) then return false; end if;
  if exists (select 1 from public.promo_redemptions r where r.wedding_id = w.id) then return false; end if;
  select * into s from public.retention_settings where id;
  ends := public.wedding_ends_on(w);
  return ends is not null and p_today >= ends + s.grace_days;
end $$;

-- What a run would do: the switch, the limits, how many drafts are due and the first batch of them (ids only).
create or replace function public.retention_draft_plan(p_today date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.retention_settings;
  total integer;
  ids jsonb;
begin
  select * into s from public.retention_settings where id;
  select count(*)::integer into total from public.weddings w where public.retention_draft_deletable(w, p_today);
  select coalesce(jsonb_agg(d.id order by d.ends, d.id), '[]'::jsonb) into ids
    from (select w.id, public.wedding_ends_on(w) as ends
            from public.weddings w
           where public.retention_draft_deletable(w, p_today)
           order by 2, 1
           limit s.batch_limit) d;
  return jsonb_build_object(
    'asOf', p_today,
    'enabled', s.draft_deletion_enabled,
    'batchLimit', s.batch_limit,
    'brakeLimit', s.brake_limit,
    'eligible', total,
    'ids', ids
  );
end $$;

-- Deletes one draft, if it is still due. Returns true when it deleted, false when it did not (switched off, edited since,
-- paid, published...). Locks the row first so a save that is in flight either lands before (and keeps the draft) or waits.
-- The stored photos are removed by the cleanup address afterwards; everything else goes with the row (links, events, previews).
create or replace function public.retention_delete_draft(p_wedding_id uuid, p_today date default current_date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.retention_settings;
  w public.weddings;
  ends date;
begin
  select * into s from public.retention_settings where id;
  if not s.draft_deletion_enabled then return false; end if;
  select * into w from public.weddings where id = p_wedding_id for update;
  if not found then return false; end if;
  if not public.retention_draft_deletable(w, p_today) then return false; end if;
  ends := public.wedding_ends_on(w);
  insert into public.retention_log (wedding_id, action, rule, last_change, ended_on, grace_days)
    values (w.id, 'delete_draft', 'draft_idle', (w.updated_at at time zone 'UTC')::date, ends, s.grace_days);
  delete from public.weddings where id = w.id;
  return true;
end $$;

-- Only the server's own key may run any of these.
revoke all on function public.retention_draft_deletable(public.weddings, date) from public, anon, authenticated;
revoke all on function public.retention_draft_plan(date) from public, anon, authenticated;
revoke all on function public.retention_delete_draft(uuid, date) from public, anon, authenticated;
grant execute on function public.retention_draft_deletable(public.weddings, date) to service_role;
grant execute on function public.retention_draft_plan(date) to service_role;
grant execute on function public.retention_delete_draft(uuid, date) to service_role;
