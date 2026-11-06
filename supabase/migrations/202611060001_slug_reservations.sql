-- =====================================================================
-- M1 candidate v8 (PostgreSQL 17 / non-superuser migration role): slug reservations, slug_owner, publish_wedding_slug, resolve_public_slug,
--   and the M1-window transition capture triggers (weddings_slug_transition_before / _after).
-- v8 changes: (1) transition capture triggers, so the legacy direct PATCH path keeps every previous and new address
--   reserved to its wedding and cannot take an address reserved to another wedding; (2) publish_wedding_slug takes the
--   same per-address advisory lock as the triggers; (3) the trigger functions are owned by slug_owner (SECURITY DEFINER).
-- M1 refuses if slug_owner already exists and never adopts it. Section D creates the role only.
-- One-time. Additive. Run once by the migration role.
-- Repository migration. Applies after 202611030003. Production application is a separate, approved step
-- (see the M1/C1/M2 deployment runbook); adding this file does not deploy anything.
-- Rollback is NOT in supabase/migrations (it would run on every deploy). It is kept outside this folder.
-- =====================================================================
begin;

-- 0. One-time guard. Runs before any other statement.
do $$
begin
  if to_regclass('public.slug_reservations') is not null then
    raise exception 'M1 has already been applied (public.slug_reservations exists). No changes were made.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- A. Pre-checks: the schema must match what this migration assumes
-- ---------------------------------------------------------------------
do $$
declare n integer;
begin
  -- M1 creates slug_owner. It never adopts an existing role of that name: adoption required attribute and
  -- membership changes that the rollback cannot restore exactly. Refuse before any change.
  if exists (select 1 from pg_roles where rolname = 'slug_owner') then
    raise exception 'precheck: role slug_owner already exists. M1 creates slug_owner and never adopts an existing role. No changes were made.';
  end if;

  -- The migration role must be able to create roles. It need not be a superuser (Supabase's
  -- postgres role is not). A CREATEROLE creator receives an automatic ADMIN-only membership in
  -- the new role; that residual membership is accepted and checked below.
  if not (select rolcreaterole from pg_roles where rolname = current_user) then
    raise exception 'precheck: M1 must be applied by a role with CREATEROLE (current role % does not have it)', current_user;
  end if;

  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.weddings'::regclass
       and t.tgname = 'weddings_set_updated_at'
       and t.tgenabled <> 'D' and not t.tgisinternal
  ) then
    raise exception 'precheck: trigger weddings_set_updated_at missing or disabled';
  end if;

  -- Preconditions for an exact rollback. Each is checked before any change.
  -- (1) service_role already has SELECT on weddings. M1 does not grant it, so the rollback has nothing to undo.
  if not has_table_privilege('service_role', 'public.weddings', 'SELECT') then
    raise exception 'precheck: service_role has no SELECT on public.weddings. M1 does not grant it; stop, report, and grant it outside M1 before rerunning. No changes were made.';
  end if;
  -- (2) set_updated_at and touch_updated_at exist with no configuration, so the rollback's RESET restores the original state.
  if (select count(*) from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('set_updated_at', 'touch_updated_at')
         and p.proconfig is null) <> 2 then
    raise exception 'precheck: set_updated_at and touch_updated_at must both exist with no configuration (proconfig null). M1 does not overwrite existing settings. No changes were made.';
  end if;

  -- Functions in public owned by an extension are managed by that extension, not by this inventory.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prokind = 'f'
     and p.proconfig is null
     and p.proname not in ('set_updated_at', 'touch_updated_at')
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
  if n <> 0 then
    raise exception 'precheck: % non-extension public functions without search_path; inventory differs', n;
  end if;

  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosecdef
     and p.proname <> 'publish_wedding_slug'
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
  if n <> 0 then
    raise exception 'precheck: % existing SECURITY DEFINER functions in public; inventory differs', n;
  end if;

  select count(*) into n from public.weddings
   where slug is not null and slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
  if n <> 0 then raise exception 'precheck: % live slugs violate the format', n; end if;

  select count(*) - count(distinct slug) into n from public.weddings where slug is not null;
  if n <> 0 then raise exception 'precheck: % duplicate live slugs', n; end if;

  -- An invalid or partial index on weddings must not be mistaken for a usable one
  select count(*) into n from pg_index i
   where i.indrelid = 'public.weddings'::regclass and not i.indisvalid;
  if n <> 0 then raise exception 'precheck: % invalid indexes on weddings', n; end if;
end $$;

-- ---------------------------------------------------------------------
-- B. Live slug uniqueness: REQUIRED, never created by M1. A valid, non-partial, single-column unique
--    index on weddings(slug) (drafts included) must already exist. If none does, M1 refuses before any change.
--    M1 does not create weddings_slug_key: the rollback could not remove a constraint exactly if M1 created it.
--    Detection compares the indexed attribute number with the attribute of slug. Array comparison is avoided:
--    int2vector and int2[] differ in lower bound.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = 'public.weddings'::regclass
       and i.indisunique
       and i.indisvalid
       and i.indpred is null
       and i.indexprs is null
       and i.indnatts = 1
       and i.indnkeyatts = 1
       and a.attname = 'slug'
  ) then
    raise exception 'precheck: weddings.slug has no valid, non-partial, single-column unique index. M1 does not create one. Create and verify it outside M1, then rerun. No changes were made.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- C. Counter of successful address moves
-- ---------------------------------------------------------------------
alter table public.weddings
  add column if not exists slug_change_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.weddings'::regclass
       and conname = 'weddings_slug_change_count_range'
  ) then
    alter table public.weddings
      add constraint weddings_slug_change_count_range check (slug_change_count between 0 and 10);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- D. The slug_owner role. M1 always creates it (section A refuses if it already exists).
--    NOLOGIN and NOINHERIT. SUPERUSER, BYPASSRLS, CREATEDB and CREATEROLE stay at their defaults (false).
--    CREATE ROLE by a CREATEROLE migration role gives that role an automatic ADMIN-only membership.
--    The check below accepts only that residual row, and refuses anything else (including a self-granted row).
-- ---------------------------------------------------------------------
create role slug_owner nologin noinherit;

do $$
begin
  -- Same rule after creation: only the migration role's residual ADMIN-only row may exist.
  if exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
              where r.rolname = 'slug_owner'
                and not (m.member = (select oid from pg_roles where rolname = current_user)
                         and m.admin_option and not m.set_option and not m.inherit_option))
     or exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.member
                 where r.rolname = 'slug_owner') then
    raise exception 'slug_owner must have no role memberships in either direction, except the migration role''s residual ADMIN-only membership';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- E. Reservation table (owned by the migration role, never by slug_owner)
-- ---------------------------------------------------------------------
create table if not exists public.slug_reservations (
  slug text primary key,
  wedding_id uuid references public.weddings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slug_reservations_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create index if not exists slug_reservations_wedding_idx on public.slug_reservations(wedding_id);

-- ---------------------------------------------------------------------
-- F. Backfill: every existing live address gets its owner's reservation
-- ---------------------------------------------------------------------
do $$
declare n integer;
begin
  select count(*) into n from public.slug_reservations;
  if n <> 0 then
    raise exception 'backfill: slug_reservations is not empty (% rows); refusing to backfill', n;
  end if;
end $$;

lock table public.weddings in share row exclusive mode;

insert into public.slug_reservations (slug, wedding_id)
select slug, id from public.weddings where slug is not null;

do $$
declare bad integer;
begin
  select count(*) into bad from (
    (select slug, id as wedding_id from public.weddings where slug is not null)
    except
    (select slug, wedding_id from public.slug_reservations)
  ) x;
  if bad <> 0 then raise exception 'backfill: % live addresses lack a matching reservation', bad; end if;

  select count(*) into bad from (
    (select slug, wedding_id from public.slug_reservations)
    except
    (select slug, id as wedding_id from public.weddings where slug is not null)
  ) y;
  if bad <> 0 then raise exception 'backfill: % reservations do not match a live wedding', bad; end if;

  select count(*) into bad from public.weddings w
   where w.slug is not null
     and not exists (select 1 from public.slug_reservations r
                      where r.slug = w.slug and r.wedding_id = w.id);
  if bad <> 0 then raise exception 'backfill: % live weddings without an owning reservation', bad; end if;

  select count(*) into bad from public.slug_reservations where wedding_id is null;
  if bad <> 0 then raise exception 'backfill: % orphaned reservations', bad; end if;
end $$;

-- ---------------------------------------------------------------------
-- G. RLS and grants
-- ---------------------------------------------------------------------
alter table public.slug_reservations enable row level security;

revoke all on public.slug_reservations from public, anon, authenticated, service_role;
grant select on public.slug_reservations to service_role;

drop policy if exists slug_owner_select on public.slug_reservations;
create policy slug_owner_select on public.slug_reservations
  for select to slug_owner using (true);
drop policy if exists slug_owner_insert on public.slug_reservations;
create policy slug_owner_insert on public.slug_reservations
  for insert to slug_owner with check (true);
drop policy if exists slug_owner_update on public.slug_reservations;
create policy slug_owner_update on public.slug_reservations
  for update to slug_owner using (true) with check (true);

revoke all on all tables in schema public from slug_owner;
grant usage on schema public to slug_owner;
grant select, update on public.weddings to slug_owner;
grant select, insert, update on public.slug_reservations to slug_owner;

drop policy if exists slug_owner_select_weddings on public.weddings;
create policy slug_owner_select_weddings on public.weddings
  for select to slug_owner using (true);
drop policy if exists slug_owner_update_weddings on public.weddings;
create policy slug_owner_update_weddings on public.weddings
  for update to slug_owner using (true) with check (true);

-- M1 grants nothing on public.weddings to service_role. Its SELECT is a precondition (section A), so there is no grant to undo.

-- ---------------------------------------------------------------------
-- G2. M1-window transition capture (v8). Legacy direct PATCH of weddings.slug keeps working for legitimate
--     addresses, but every address is reserved to its wedding as it is set and as it is replaced:
--     * BEFORE: an address reserved to ANOTHER wedding, or to nobody (deleted wedding), is refused with 23505.
--               The legacy handler maps 23505 to SLUG_CONFLICT. Taking the advisory lock first serialises it
--               against publish_wedding_slug and the AFTER trigger for the same address.
--     * AFTER:  the previous address is reserved to this wedding (never reassigned), and so is the new address.
--               ON CONFLICT DO NOTHING plus an ownership check: an existing reservation for another wedding raises.
--     Both functions are SECURITY DEFINER and owned by slug_owner (transferred in section J), so they run as
--     slug_owner: the guards of M2 allow that role, and it has the INSERT/SELECT grants on slug_reservations.
--     Triggers never reject a legitimate change. They keep every live and previous address reserved.
-- ---------------------------------------------------------------------
create or replace function public.weddings_slug_transition_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_found boolean := false;
begin
  if new.slug is null then return new; end if;
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.slug));
  select r.wedding_id, true into v_owner, v_found
    from public.slug_reservations r
   where r.slug = new.slug;
  if v_found and v_owner is distinct from new.id then
    raise exception 'SLUG_CONFLICT: this address is reserved to another wedding' using errcode = '23505';
  end if;
  return new;
end $$;

create or replace function public.weddings_slug_transition_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The previous address stays reserved to this wedding (permanent history).
  if tg_op = 'UPDATE' and old.slug is not null and old.slug is distinct from new.slug then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(old.slug));
    insert into public.slug_reservations (slug, wedding_id) values (old.slug, old.id)
      on conflict (slug) do nothing;
    if not exists (select 1 from public.slug_reservations r where r.slug = old.slug and r.wedding_id = old.id) then
      raise exception 'SLUG_CONFLICT: previous address is reserved to another wedding; ownership must not change' using errcode = '23505';
    end if;
  end if;
  -- The new address is reserved to this wedding as soon as it is set.
  if new.slug is not null and (tg_op = 'INSERT' or new.slug is distinct from old.slug) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.slug));
    insert into public.slug_reservations (slug, wedding_id) values (new.slug, new.id)
      on conflict (slug) do nothing;
    if not exists (select 1 from public.slug_reservations r where r.slug = new.slug and r.wedding_id = new.id) then
      raise exception 'SLUG_CONFLICT: this address is reserved to another wedding' using errcode = '23505';
    end if;
  end if;
  return null;
end $$;

create trigger weddings_slug_transition_before
  before insert or update of slug on public.weddings
  for each row execute function public.weddings_slug_transition_before();
create trigger weddings_slug_transition_after
  after insert or update of slug on public.weddings
  for each row execute function public.weddings_slug_transition_after();

-- ---------------------------------------------------------------------
-- H. Trigger functions: fixed search_path. Section A guarantees both had no proconfig, so the rollback's
--    RESET restores the original state. The rollback also checks the setting is still exactly search_path = "".
-- ---------------------------------------------------------------------
alter function public.set_updated_at() set search_path = '';
alter function public.touch_updated_at() set search_path = '';

-- ---------------------------------------------------------------------
-- I. Public lookup (read-only). SECURITY INVOKER, runs as service_role.
-- ---------------------------------------------------------------------
create or replace function public.resolve_public_slug(p_slug text)
returns table (kind text, target_slug text, title text, event_date date, location text)
language sql
stable
security invoker
set search_path = ''
as $$
  select x.kind, x.target_slug, x.title, x.event_date, x.location
    from (
      select 'live'::text as kind, w.slug as target_slug,
             w.title, w.event_date, w.location, 1 as priority
        from public.weddings w
       where p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
         and w.slug = p_slug
         and w.status = 'published' and w.visibility = 'public'
      union all
      select 'redirect'::text, w.slug, null::text, null::date, null::text, 2
        from public.slug_reservations r
        join public.weddings w on w.id = r.wedding_id
       where p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
         and r.slug = p_slug
         and w.slug is not null and w.slug <> p_slug
         and w.status = 'published' and w.visibility = 'public'
    ) x
   order by x.priority
   limit 1
$$;

revoke all on function public.resolve_public_slug(text) from public, anon, authenticated;
grant execute on function public.resolve_public_slug(text) to service_role;

-- ---------------------------------------------------------------------
-- J. Publish RPC: the only path that changes weddings.slug or writes reservations.
--    Order for a new or moved address: format and length, reserved word, then AVAILABILITY
--    (taken = SLUG_CONFLICT), then confirmation, then the change limit, then the atomic claim.
--    The claim (primary key) still decides races; the availability read only orders the errors.
-- ---------------------------------------------------------------------
create or replace function public.publish_wedding_slug(
  p_wedding_id uuid,
  p_version integer,
  p_slug text,
  p_confirm_slug_change boolean
) returns public.weddings
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.weddings%rowtype;
  v_claimed text;
  is_move boolean;
  v_confirm boolean := coalesce(p_confirm_slug_change, false);
  reserved constant text[] := array['api','admin','edit','s','w','assets','static','public',
    'login','signup','dashboard','templates','pricing','privacy','terms','support','help',
    'www','mail','root','null','undefined'];
begin
  if p_wedding_id is null then raise exception 'VALIDATION_ERROR'; end if;
  if p_version is null or p_version < 1 then raise exception 'VALIDATION_ERROR'; end if;
  if p_slug is null or length(p_slug) = 0 then raise exception 'VALIDATION_ERROR'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'VALIDATION_ERROR'; end if;

  select * into w from public.weddings where id = p_wedding_id for update;
  if not found or w.version is distinct from p_version then
    raise exception 'PUBLISH_CONFLICT';
  end if;

  is_move := w.slug is not null and p_slug is distinct from w.slug;

  if p_slug is distinct from w.slug then
    -- Same per-address lock as the transition triggers: claims on one address are serialised.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_slug));
    if char_length(p_slug) > 60 then raise exception 'VALIDATION_ERROR'; end if;
    if p_slug = any (reserved) then raise exception 'VALIDATION_ERROR'; end if;

    -- Availability: live on another wedding, or reserved to another wedding (or to none).
    if exists (select 1 from public.weddings x where x.slug = p_slug and x.id <> p_wedding_id)
       or exists (select 1 from public.slug_reservations r
                   where r.slug = p_slug and r.wedding_id is distinct from p_wedding_id) then
      raise exception 'SLUG_CONFLICT';
    end if;

    if w.status = 'published' and w.slug is not null and not v_confirm then
      raise exception 'SLUG_CHANGE_CONFIRMATION_REQUIRED';
    end if;
    if is_move and w.slug_change_count >= 10 then
      raise exception 'SLUG_CHANGE_LIMIT_REACHED';
    end if;

    -- Atomic claim. The primary key arbitrates races. A lost race is SLUG_CONFLICT.
    insert into public.slug_reservations as r (slug, wedding_id)
    values (p_slug, p_wedding_id)
    on conflict (slug) do update
      set wedding_id = excluded.wedding_id,
          updated_at = pg_catalog.now()
      where r.wedding_id = p_wedding_id
    returning r.slug into v_claimed;

    if v_claimed is null then
      raise exception 'SLUG_CONFLICT';
    end if;
  end if;

  -- Publish. The version is bumped by the weddings_set_updated_at trigger, not here.
  update public.weddings
     set slug = p_slug,
         slug_change_count = slug_change_count + case when is_move then 1 else 0 end,
         status = 'published',
         visibility = 'public',
         published_at = pg_catalog.now()
   where id = p_wedding_id
  returning * into w;

  return w;
exception
  when unique_violation then
    raise exception 'SLUG_CONFLICT';
  when deadlock_detected then
    raise exception 'PUBLISH_CONFLICT';
end $$;

-- ---------------------------------------------------------------------
-- Ownership of publish_wedding_slug, for a NON-superuser migration role.
-- ALTER ... OWNER requires (validated on PostgreSQL 17.11):
--   (a) the migration role can SET ROLE to the new owner, and
--   (b) the new owner has CREATE on the function's schema.
-- Both are granted only for this transaction, then removed. The migration role's own SET grant is
-- revoked by the same role that made it. The residual ADMIN-only membership is not removable by the
-- migration role, and the section K post-checks accept only that residual row.
-- ---------------------------------------------------------------------
-- Execute privileges are set while the migration role still owns the function. After the transfer the
-- migration role is no longer the owner and cannot change them (verified: those statements only warn).
revoke all on function public.publish_wedding_slug(uuid, integer, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_wedding_slug(uuid, integer, text, boolean) to service_role;

grant slug_owner to current_user with set true, inherit false;
grant create on schema public to slug_owner;
revoke all on function public.weddings_slug_transition_before() from public, anon, authenticated, service_role;
revoke all on function public.weddings_slug_transition_after() from public, anon, authenticated, service_role;
alter function public.publish_wedding_slug(uuid, integer, text, boolean) owner to slug_owner;
alter function public.weddings_slug_transition_before() owner to slug_owner;
alter function public.weddings_slug_transition_after() owner to slug_owner;
revoke create on schema public from slug_owner;
revoke slug_owner from current_user;   -- removes only the row this transaction granted (grantor = current_user)


-- ---------------------------------------------------------------------
-- K. Post-checks: ownership, privileges, membership-free end state, function settings
-- ---------------------------------------------------------------------
do $$
declare fn text := 'public.publish_wedding_slug(uuid,integer,text,boolean)';
begin
  if (select count(*) from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proowner = (select oid from pg_roles where rolname = 'slug_owner')) <> 3 then
    raise exception 'postcheck: slug_owner must own exactly three functions in public (publish_wedding_slug and the two transition functions)';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.weddings_slug_transition_before()'::regprocedure
                  and p.proowner = (select oid from pg_roles where rolname = 'slug_owner') and p.prosecdef
                  and p.proconfig @> array['search_path=""']) then
    raise exception 'postcheck: weddings_slug_transition_before must be owned by slug_owner, SECURITY DEFINER, search_path = ""';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.weddings_slug_transition_after()'::regprocedure
                  and p.proowner = (select oid from pg_roles where rolname = 'slug_owner') and p.prosecdef
                  and p.proconfig @> array['search_path=""']) then
    raise exception 'postcheck: weddings_slug_transition_after must be owned by slug_owner, SECURITY DEFINER, search_path = ""';
  end if;
  if (select count(*) from pg_trigger t where t.tgrelid = 'public.weddings'::regclass and not t.tgisinternal
       and t.tgname in ('weddings_slug_transition_before', 'weddings_slug_transition_after') and t.tgenabled = 'O') <> 2 then
    raise exception 'postcheck: both transition capture triggers must be installed and enabled';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.publish_wedding_slug(uuid,integer,text,boolean)'::regprocedure
                    and p.proowner = (select oid from pg_roles where rolname = 'slug_owner')) then
    raise exception 'postcheck: slug_owner must own public.publish_wedding_slug';
  end if;
  if exists (select 1 from pg_class c join pg_roles r on r.oid = c.relowner where r.rolname = 'slug_owner') then
    raise exception 'postcheck: slug_owner owns a relation';
  end if;
  if has_schema_privilege('slug_owner', 'public', 'CREATE') then
    raise exception 'postcheck: slug_owner has CREATE on schema public';
  end if;
  if (select rolsuper or rolbypassrls or rolcanlogin from pg_roles where rolname = 'slug_owner') then
    raise exception 'postcheck: slug_owner is superuser, bypasses RLS, or can log in';
  end if;
  if exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid
              where r.rolname = 'slug_owner'
                and not (m.member = (select oid from pg_roles where rolname = current_user)
                         and m.admin_option and not m.set_option and not m.inherit_option))
     or exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.member
                 where r.rolname = 'slug_owner') then
    raise exception 'postcheck: slug_owner has memberships other than the residual ADMIN-only membership of the migration role';
  end if;
  -- A non-superuser migration role must keep exactly one residual row (the one CREATE ROLE created).
  -- NOT EXERCISED BY ANY TEST. A residual row whose grantor is the migration role cannot be produced in the
  -- test environment (see R6b). The reproducible refusal for a self-granted row (createrole_self_grant) happens
  -- earlier, in section D, and is tested (R6a). If this branch ever fires, the whole migration rolls back.
  if not (select rolsuper from pg_roles where rolname = current_user) and (
       select count(*) from pg_auth_members m join pg_roles r on r.oid = m.roleid
        where r.rolname = 'slug_owner' and m.member = (select oid from pg_roles where rolname = current_user)) <> 1 then
    raise exception 'postcheck: a non-superuser migration role must keep exactly one residual membership of slug_owner';
  end if;
  -- slug_owner must not be able to create databases or roles.
  if (select rolcreatedb or rolcreaterole from pg_roles where rolname = 'slug_owner') then
    raise exception 'postcheck: slug_owner must have CREATEDB = false and CREATEROLE = false';
  end if;

  -- The migration role's residual membership must be exactly one row with ADMIN true, SET false, INHERIT false.
  if not (select rolsuper from pg_roles where rolname = current_user) then
    if (select count(*) from pg_auth_members m join pg_roles r on r.oid = m.roleid
         where r.rolname = 'slug_owner' and m.member = (select oid from pg_roles where rolname = current_user)
           and m.admin_option and not m.set_option and not m.inherit_option) <> 1 then
      raise exception 'postcheck: the migration role''s residual membership must be exactly one row with ADMIN true, SET false, INHERIT false';
    end if;
  end if;

  -- Row-level security must stay enabled on both tables the RPC and guards depend on.
  if not (select relrowsecurity from pg_class where oid = 'public.slug_reservations'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.weddings'::regclass) then
    raise exception 'postcheck: row-level security must be enabled on weddings and slug_reservations';
  end if;

  if not has_function_privilege('service_role', 'public.resolve_public_slug(text)', 'EXECUTE') then
    raise exception 'postcheck: service_role must be able to execute resolve_public_slug';
  end if;

  -- Trigger functions carry exactly the search_path set in section H, and nothing else.
  if (select count(*) from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('set_updated_at', 'touch_updated_at')
         and p.proconfig = array['search_path=""']) <> 2 then
    raise exception 'postcheck: set_updated_at and touch_updated_at must have exactly search_path = ""';
  end if;

  if has_function_privilege('anon', fn, 'EXECUTE')
     or has_function_privilege('authenticated', fn, 'EXECUTE')
     or not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'postcheck: publish_wedding_slug EXECUTE grants are wrong';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = fn::regprocedure and p.prosecdef
                    and p.proconfig @> array['search_path=""']) then
    raise exception 'postcheck: publish_wedding_slug must be SECURITY DEFINER with search_path = ""';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.resolve_public_slug(text)'::regprocedure
                    and not p.prosecdef
                    and p.proconfig @> array['search_path=""']) then
    raise exception 'postcheck: resolve_public_slug must be SECURITY INVOKER with search_path = ""';
  end if;
  if has_function_privilege('anon', 'public.resolve_public_slug(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.resolve_public_slug(text)', 'EXECUTE') then
    raise exception 'postcheck: resolve_public_slug is executable by anon or authenticated';
  end if;
end $$;

commit;
