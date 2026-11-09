-- Retention settings and a dry-run preview (see docs/RETENTION_PLAN.md, step 1).
--
-- This migration only ADDS settings, one function that works out when a website ends, and a preview that REPORTS what a
-- cleanup would do. Nothing in it hides or deletes anything, and nothing calls it yet except the protected dry-run
-- address (functions/api/internal/retention-sweep.js).

-- ---------------------------------------------------------------------------
-- Settings: per design, per website, and the few global numbers
-- ---------------------------------------------------------------------------

alter table public.templates
  add column if not exists retention_months integer not null default 2,
  add column if not exists max_months_from_publish integer default 8,
  add column if not exists tier text not null default 'standard';

alter table public.templates drop constraint if exists templates_retention_months_range;
alter table public.templates add constraint templates_retention_months_range check (retention_months between 0 and 60);
alter table public.templates drop constraint if exists templates_max_months_range;
alter table public.templates add constraint templates_max_months_range
  check (max_months_from_publish is null or max_months_from_publish between 1 and 120);

comment on column public.templates.retention_months is 'Months a website of this design stays after its last event date.';
comment on column public.templates.max_months_from_publish is 'Cap: months after first publishing. Empty means no cap.';
comment on column public.templates.tier is 'Label for pricing tiers (standard, premium ...). Not used for any rule yet.';

alter table public.weddings
  add column if not exists first_published_at timestamptz,
  add column if not exists keep_until date,
  add column if not exists retention_floor date;

comment on column public.weddings.first_published_at is 'Set once, the first time the website is published. Never changed, so republishing cannot restart the clock.';
comment on column public.weddings.keep_until is 'Set by us (after a payment or an agreement). When set it is the end date, earlier or later than the rule.';
comment on column public.weddings.retention_floor is 'The latest end date the couple has been shown. The end date is never earlier than this.';

create table if not exists public.retention_settings (
  id boolean primary key default true check (id),
  no_date_months integer not null default 4 check (no_date_months between 1 and 60),
  grace_days integer not null default 14 check (grace_days between 0 and 365),
  warn_days integer not null default 14 check (warn_days between 0 and 365),
  slug_hold_months integer not null default 6 check (slug_hold_months between 0 and 60),
  batch_limit integer not null default 20 check (batch_limit between 1 and 500),
  brake_limit integer not null default 10 check (brake_limit between 1 and 500)
);
insert into public.retention_settings (id) values (true) on conflict (id) do nothing;

-- One line per cleanup run: counts only, no names, replies or photos.
create table if not exists public.retention_runs (
  id bigserial primary key,
  run_at timestamptz not null default now(),
  dry_run boolean not null,
  summary jsonb not null default '{}'::jsonb
);

alter table public.retention_settings enable row level security;
alter table public.retention_runs enable row level security;
comment on table public.retention_runs is 'Cleanup run summaries (counts only). Service key access only; no browser policies.';

-- ---------------------------------------------------------------------------
-- first_published_at: set once
-- ---------------------------------------------------------------------------

create or replace function public.weddings_set_first_published()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.first_published_at is not null then
    new.first_published_at := old.first_published_at;   -- never changes
  elsif new.first_published_at is null and (new.status = 'published' or new.published_at is not null) then
    -- On an update that republishes, the previous published_at is the better record of the first publish.
    new.first_published_at := case
      when tg_op = 'UPDATE' then coalesce(old.published_at, new.published_at, now())
      else coalesce(new.published_at, now())
    end;
  end if;
  return new;
end $$;

drop trigger if exists weddings_set_first_published on public.weddings;
create trigger weddings_set_first_published
before insert or update on public.weddings
for each row execute function public.weddings_set_first_published();

-- ---------------------------------------------------------------------------
-- The rule, in one place
-- ---------------------------------------------------------------------------

-- A date that is written down badly never stops the cleanup: it is ignored.
create or replace function public.retention_safe_date(value text)
returns date
language plpgsql
immutable
as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return value::date;
exception when others then
  return null;
end $$;

-- The last event date: the later of the wedding date and every event's date.
create or replace function public.wedding_last_event_date(w public.weddings)
returns date
language sql
stable
as $$
  select greatest(
    w.event_date,
    (select max(public.retention_safe_date(item->>'date'))
       from jsonb_array_elements(
              case when jsonb_typeof(w.content->'functions') = 'array' then w.content->'functions' else '[]'::jsonb end
            ) as item)
  )
$$;

-- When a website ends, or null while it has no clock.
--   keep_until set                       -> that date (it always wins)
--   no event date                        -> its last change + no_date_months
--   event date, never published          -> no clock yet
--   event date, published                -> the earlier of
--                                             last event date + the design's retention_months
--                                             first publish + the design's max_months_from_publish (if any)
-- and never earlier than retention_floor (the latest date the couple has been shown).
create or replace function public.wedding_ends_on(w public.weddings)
returns date
language plpgsql
stable
as $$
declare
  s public.retention_settings;
  t public.templates;
  last_event date;
  first_pub date;
  base date;
begin
  if w.keep_until is not null then
    return w.keep_until;
  end if;
  select * into s from public.retention_settings where id;
  select * into t from public.templates where id = w.template_id;
  last_event := public.wedding_last_event_date(w);
  first_pub := (coalesce(w.first_published_at, w.published_at) at time zone 'UTC')::date;

  if last_event is null then
    base := ((w.updated_at at time zone 'UTC')::date + make_interval(months => coalesce(s.no_date_months, 4)))::date;
  elsif first_pub is null then
    return null;
  else
    base := least(
      (last_event + make_interval(months => coalesce(t.retention_months, 2)))::date,
      case when t.max_months_from_publish is null then null
           else (first_pub + make_interval(months => t.max_months_from_publish))::date end
    );
  end if;
  return greatest(base, w.retention_floor);
end $$;

-- ---------------------------------------------------------------------------
-- The dry-run preview: reports, changes nothing
-- ---------------------------------------------------------------------------

-- stage: keep (not ended), hidden (ended, inside the grace period), delete_due (grace over), no_clock.
-- would_hide: the page is still public and would be closed. would_delete: everything would be removed.
create or replace function public.retention_preview(p_today date default current_date, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.retention_settings;
  result jsonb;
begin
  select * into s from public.retention_settings where id;
  with rows as (
    select w.id, w.status, public.wedding_ends_on(w) as ends_on,
           public.wedding_last_event_date(w) as last_event,
           (coalesce(w.first_published_at, w.published_at) at time zone 'UTC')::date as first_pub
      from public.weddings w
  ), staged as (
    select r.*,
           case when r.ends_on is null then 'no_clock'
                when p_today < r.ends_on then 'keep'
                when p_today < r.ends_on + s.grace_days then 'hidden'
                else 'delete_due' end as stage
      from rows r
  )
  select jsonb_build_object(
    'asOf', p_today,
    'settings', jsonb_build_object('graceDays', s.grace_days, 'warnDays', s.warn_days, 'batchLimit', s.batch_limit, 'brakeLimit', s.brake_limit),
    'totals', jsonb_build_object(
      'websites', count(*),
      'keep', count(*) filter (where stage = 'keep'),
      'noClock', count(*) filter (where stage = 'no_clock'),
      'hidden', count(*) filter (where stage = 'hidden'),
      'deleteDue', count(*) filter (where stage = 'delete_due'),
      'wouldHide', count(*) filter (where stage in ('hidden', 'delete_due') and status = 'published'),
      'wouldDelete', count(*) filter (where stage = 'delete_due'),
      'endingWithinWarning', count(*) filter (where stage = 'keep' and ends_on <= p_today + s.warn_days),
      'endsBeforeEvent', count(*) filter (where last_event is not null and ends_on is not null and ends_on < last_event)
    ),
    -- How far ahead of the event websites were published (months): the numbers the 8-month cap should be tuned from.
    'publishLeadMonths', jsonb_build_object(
      'under2', count(*) filter (where last_event is not null and first_pub is not null and last_event - first_pub < 61),
      'from2to4', count(*) filter (where last_event is not null and first_pub is not null and last_event - first_pub >= 61 and last_event - first_pub < 122),
      'from4to6', count(*) filter (where last_event is not null and first_pub is not null and last_event - first_pub >= 122 and last_event - first_pub < 183),
      'from6to8', count(*) filter (where last_event is not null and first_pub is not null and last_event - first_pub >= 183 and last_event - first_pub < 244),
      'over8', count(*) filter (where last_event is not null and first_pub is not null and last_event - first_pub >= 244)
    ),
    -- Ids and dates only: no names, addresses, replies or photos.
    'due', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'stage', d.stage, 'endsOn', d.ends_on, 'deleteOn', d.ends_on + s.grace_days,
                                          'wouldHide', d.status = 'published', 'wouldDelete', d.stage = 'delete_due')
                       order by d.ends_on, d.id)
        from (select * from staged where stage in ('hidden', 'delete_due') order by ends_on, id limit greatest(p_limit, 0)) d
    ), '[]'::jsonb)
  ) into result
  from staged;
  return result;
end $$;

-- Records that a run happened (counts only).
create or replace function public.retention_record_run(p_dry_run boolean, p_summary jsonb)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.retention_runs (dry_run, summary) values (p_dry_run, coalesce(p_summary, '{}'::jsonb)) returning id
$$;

-- Only the server's own key may run these. The public key must never see even ids and dates.
revoke all on function public.retention_preview(date, integer) from public, anon, authenticated;
revoke all on function public.retention_record_run(boolean, jsonb) from public, anon, authenticated;
grant execute on function public.retention_preview(date, integer) to service_role;
grant execute on function public.retention_record_run(boolean, jsonb) to service_role;
