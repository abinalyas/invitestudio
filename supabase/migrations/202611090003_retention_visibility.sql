-- Retention step 2 (see docs/RETENTION_PLAN.md): what couples and guests can be told.
-- Additive. Still nothing here hides or deletes a website; it only lets the editor show the end date, remembers the
-- date a couple was shown, and has a place to record a website that has been closed by the cleanup (used in step 4).

alter table public.weddings
  add column if not exists retention_hidden_at timestamptz;
comment on column public.weddings.retention_hidden_at is 'Set by the cleanup (step 4) when it closes the public page. Guests are then told the invitation has ended.';

-- The latest end date each couple has been shown. It lives in its own table so that recording it never touches the
-- website row (a change to that row bumps its version and would make the editor's next save look like a conflict).
create table if not exists public.retention_shown (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  ends_on date not null,
  shown_at timestamptz not null default now()
);
alter table public.retention_shown enable row level security;
comment on table public.retention_shown is 'The latest end date shown to a couple. The end date is never earlier than this. Service key access only.';

-- The rule from step 1, now also never earlier than the date the couple was shown.
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
  shown date;
  base date;
begin
  if w.keep_until is not null then
    return w.keep_until;
  end if;
  select * into s from public.retention_settings where id;
  select * into t from public.templates where id = w.template_id;
  select r.ends_on into shown from public.retention_shown r where r.wedding_id = w.id;
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
  return greatest(base, w.retention_floor, shown);
end $$;

-- What the editor shows one couple. Working out the date and remembering that it was shown happen together, so the
-- date they see is the date that is protected. Only ever moves the remembered date later.
create or replace function public.wedding_retention_shown(p_wedding_id uuid, p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.weddings;
  s public.retention_settings;
  t public.templates;
  ends date;
  last_event date;
  estimate date;
  source text;
  stage text;
begin
  select * into w from public.weddings where id = p_wedding_id;
  if not found then return null; end if;
  select * into s from public.retention_settings where id;
  select * into t from public.templates where id = w.template_id;
  ends := public.wedding_ends_on(w);
  last_event := public.wedding_last_event_date(w);

  if ends is not null then
    insert into public.retention_shown (wedding_id, ends_on) values (w.id, ends)
    on conflict (wedding_id) do update set ends_on = excluded.ends_on, shown_at = now()
      where public.retention_shown.ends_on < excluded.ends_on;
  end if;

  -- Not published yet: what the end date would be if it were published today (for the publish screen).
  if ends is null and last_event is not null then
    estimate := least(
      (last_event + make_interval(months => coalesce(t.retention_months, 2)))::date,
      case when t.max_months_from_publish is null then null
           else (p_today + make_interval(months => t.max_months_from_publish))::date end
    );
  end if;

  source := case
    when w.keep_until is not null then 'keep_until'
    when last_event is null then 'no_date'
    when ends is null then 'none'
    when ends < (last_event + make_interval(months => coalesce(t.retention_months, 2)))::date then 'cap'
    else 'event' end;
  stage := case
    when ends is null then 'no_clock'
    when p_today < ends then 'keep'
    when p_today < ends + s.grace_days then 'hidden'
    else 'delete_due' end;

  return jsonb_build_object(
    'hasClock', ends is not null,
    'endsOn', ends,
    'deleteOn', case when ends is null then null else ends + s.grace_days end,
    'stage', stage,
    'daysLeft', case when ends is null then null else ends - p_today end,
    'graceDays', s.grace_days,
    'warnDays', s.warn_days,
    'source', source,
    'lastEventDate', last_event,
    'endsBeforeEvent', last_event is not null and ends is not null and ends < last_event,
    'estimatedEndsOn', estimate,
    'estimateBeforeEvent', estimate is not null and estimate < last_event,
    'closed', w.retention_hidden_at is not null
  );
end $$;

revoke all on function public.wedding_retention_shown(uuid, date) from public, anon, authenticated;
grant execute on function public.wedding_retention_shown(uuid, date) to service_role;
