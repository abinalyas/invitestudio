-- Drafts that are never published are removed after 30 days without a change (docs/RETENTION_PLAN.md, "Idle drafts").
-- Additive, and it still hides and deletes nothing: it only moves the date a draft is said to end, tells the editor and the
-- My invitations cards, and adds the draft counts to the dry-run report. The deleting step stays switched off.
--
--   draft_idle_days  30  days after its last change that a never-published draft ends
--   draft_warn_days   7  days before that the couple is warned (the existing grace_days, 14, then applies before deletion)
--
-- A draft ends draft_idle_days after its last save. Saving again moves the date out, and the date a couple has been shown
-- is never brought forward. A website that has been published keeps the rule from the earlier migrations.

alter table public.retention_settings
  add column if not exists draft_idle_days integer not null default 30,
  add column if not exists draft_warn_days integer not null default 7;
alter table public.retention_settings drop constraint if exists retention_settings_draft_idle_days_range;
alter table public.retention_settings add constraint retention_settings_draft_idle_days_range check (draft_idle_days between 1 and 365);
alter table public.retention_settings drop constraint if exists retention_settings_draft_warn_days_range;
alter table public.retention_settings add constraint retention_settings_draft_warn_days_range check (draft_warn_days between 0 and 365);

-- The rule, in one place (with the draft case added)
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
  is_draft boolean;
begin
  if w.keep_until is not null then
    return w.keep_until;
  end if;
  select * into s from public.retention_settings where id;
  select * into t from public.templates where id = w.template_id;
  select r.ends_on into shown from public.retention_shown r where r.wedding_id = w.id;
  last_event := public.wedding_last_event_date(w);
  is_draft := w.first_published_at is null and w.published_at is null and w.status <> 'published';

  -- A draft that has never been published is removed after draft_idle_days without a change (the last save counts as a
  -- change). Any later change moves the date out again; the date a couple was shown is never brought forward.
  if is_draft then
    base := ((w.updated_at at time zone 'UTC')::date + make_interval(days => coalesce(s.draft_idle_days, 30)))::date;
    return greatest(base, w.retention_floor, shown);
  end if;

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

-- What the editor and the cards show one couple
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
  is_draft boolean;
begin
  select * into w from public.weddings where id = p_wedding_id;
  if not found then return null; end if;
  select * into s from public.retention_settings where id;
  select * into t from public.templates where id = w.template_id;
  ends := public.wedding_ends_on(w);
  last_event := public.wedding_last_event_date(w);
  is_draft := w.first_published_at is null and w.published_at is null and w.status <> 'published';

  if ends is not null then
    insert into public.retention_shown (wedding_id, ends_on) values (w.id, ends)
    on conflict (wedding_id) do update set ends_on = excluded.ends_on, shown_at = now()
      where public.retention_shown.ends_on < excluded.ends_on;
  end if;

  -- Not published yet: what the end date would be if it were published today (for the publish screen).
  if (ends is null or is_draft) and last_event is not null then
    estimate := least(
      (last_event + make_interval(months => coalesce(t.retention_months, 2)))::date,
      case when t.max_months_from_publish is null then null
           else (p_today + make_interval(months => t.max_months_from_publish))::date end
    );
  end if;

  -- A draft with no event date: published today it would stay online no_date_months from now.
  if is_draft and last_event is null then
    estimate := (p_today + make_interval(months => coalesce(s.no_date_months, 4)))::date;
  end if;

  source := case
    when w.keep_until is not null then 'keep_until'
    when is_draft then 'draft_idle'
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
    'warnDays', case when is_draft then s.draft_warn_days else s.warn_days end,
    'draft', is_draft,
    'draftIdleDays', s.draft_idle_days,
    'source', source,
    'lastEventDate', last_event,
    'endsBeforeEvent', not is_draft and last_event is not null and ends is not null and ends < last_event,
    'estimatedEndsOn', estimate,
    'estimateBeforeEvent', estimate is not null and estimate < last_event,
    'closed', w.retention_hidden_at is not null
  );
end $$;

-- The dry-run report (counts drafts separately)
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
           (w.first_published_at is null and w.published_at is null and w.status <> 'published') as is_draft,
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
      'endingWithinWarning', count(*) filter (where not is_draft and stage = 'keep' and ends_on <= p_today + s.warn_days),
      'endsBeforeEvent', count(*) filter (where not is_draft and last_event is not null and ends_on is not null and ends_on < last_event),
      -- Drafts that were never published: removed after draft_idle_days without a change (warned draft_warn_days before).
      'drafts', jsonb_build_object(
        'total', count(*) filter (where is_draft),
        'endingWithinWarning', count(*) filter (where is_draft and stage = 'keep' and ends_on <= p_today + s.draft_warn_days),
        'inGrace', count(*) filter (where is_draft and stage = 'hidden'),
        'wouldDelete', count(*) filter (where is_draft and stage = 'delete_due')
      )
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
                                          'draft', d.is_draft, 'wouldHide', d.status = 'published', 'wouldDelete', d.stage = 'delete_due')
                       order by d.ends_on, d.id)
        from (select * from staged where stage in ('hidden', 'delete_due') order by ends_on, id limit greatest(p_limit, 0)) d
    ), '[]'::jsonb)
  ) into result
  from staged;
  return result;
end $$;

revoke all on function public.wedding_retention_shown(uuid, date) from public, anon, authenticated;
grant execute on function public.wedding_retention_shown(uuid, date) to service_role;
revoke all on function public.retention_preview(date, integer) from public, anon, authenticated;
grant execute on function public.retention_preview(date, integer) to service_role;
