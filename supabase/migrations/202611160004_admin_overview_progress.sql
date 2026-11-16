-- Adds to the overview: how far along each website is (events, photos, story) and two counts for finding people who need
-- a nudge: private drafts not edited for 7+ days, and events within 30 days that are not live yet. Replaces the previous
-- admin_overview; run after 202611160003_admin_overview.sql.
--
-- The owner's overview (the /admin page): how many websites are private, live or offline, which designs they use,
-- payments, and a list of websites with how many replies each has received.
--
-- Guest replies are only COUNTED here. No guest name, phone number, note or message leaves the database through this
-- function. Only the server's own key may run it (never the public key).
create or replace function public.admin_overview(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  with reply as (
    select wedding_id,
           count(*)::int as replies,
           count(*) filter (where attending)::int as attending,
           coalesce(sum(party_size), 0)::int as guests
    from public.wedding_rsvps
    group by wedding_id
  ),
  paid as (
    select wedding_id, sum(amount_minor)::bigint as amount_minor, max(currency) as currency
    from public.payments
    where status = 'paid'
    group by wedding_id
  ),
  pics as (
    select wedding_id, count(*)::int as photos from public.wedding_photos group by wedding_id
  ),
  site as (
    select w.id, w.title, w.slug, w.status, w.visibility, w.template_id, t.name as template_name,
           w.event_date, w.location, w.created_at, w.updated_at,
           coalesce(w.first_published_at, w.published_at) as first_published_at,
           (w.publish_unlocked_at is not null) as unlocked, w.version,
           coalesce(r.replies, 0) as replies, coalesce(r.attending, 0) as attending, coalesce(r.guests, 0) as guests,
           coalesce(p.amount_minor, 0) as paid_minor, p.currency as paid_currency,
           jsonb_array_length(case when jsonb_typeof(w.content->'functions') = 'array' then w.content->'functions' else '[]'::jsonb end) as events,
           coalesce(ph.photos, 0) as photos,
           (btrim(coalesce(w.story, '')) <> '') as has_story
    from public.weddings w
    left join public.templates t on t.id = w.template_id
    left join reply r on r.wedding_id = w.id
    left join paid p on p.wedding_id = w.id
    left join pics ph on ph.wedding_id = w.id
  )
  select jsonb_build_object(
    'asOf', now(),
    'totals', jsonb_build_object(
      'sites', (select count(*) from site),
      'live', (select count(*) from site where status = 'published' and visibility = 'public'),
      'private', (select count(*) from site where status = 'draft'),
      'offline', (select count(*) from site where status in ('unpublished', 'archived')),
      'unlocked', (select count(*) from site where unlocked),
      'createdToday', (select count(*) from site where created_at >= date_trunc('day', now())),
      'idleDrafts7d', (select count(*) from site where status = 'draft' and updated_at < now() - interval '7 days'),
      'eventSoonNotLive', (select count(*) from site where event_date between current_date and current_date + 30 and not (status = 'published' and visibility = 'public')),
      'created7d', (select count(*) from site where created_at >= now() - interval '7 days'),
      'created30d', (select count(*) from site where created_at >= now() - interval '30 days'),
      'liveSince7d', (select count(*) from site where first_published_at >= now() - interval '7 days'),
      'replies', (select coalesce(sum(replies), 0) from site),
      'attendingReplies', (select coalesce(sum(attending), 0) from site),
      'guestsComing', (select coalesce(sum(guests), 0) from site)
    ),
    'revenue', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'amountMinor', total, 'payments', n))
      from (select currency, sum(amount_minor)::bigint as total, count(*)::int as n from public.payments where status = 'paid' group by currency) x
    ), '[]'::jsonb),
    'byDesign', coalesce((
      select jsonb_agg(jsonb_build_object('id', template_id, 'name', coalesce(template_name, template_id), 'sites', sites, 'live', live, 'paid', paid) order by sites desc)
      from (select template_id, template_name, count(*)::int as sites,
                   (count(*) filter (where status = 'published' and visibility = 'public'))::int as live,
                   (count(*) filter (where unlocked))::int as paid
            from site group by template_id, template_name) d
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'created', created, 'live', live) order by day)
      from (
        select g.day::date as day,
               (select count(*) from site s where s.created_at::date = g.day::date)::int as created,
               (select count(*) from site s where s.first_published_at::date = g.day::date)::int as live
        from generate_series(current_date - 29, current_date, interval '1 day') as g(day)
      ) d
    ), '[]'::jsonb),
    'sites', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.updated_at desc)
      from (select * from site order by updated_at desc limit greatest(1, least(coalesce(p_limit, 500), 2000))) s
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_overview(integer) from public, anon, authenticated;
grant execute on function public.admin_overview(integer) to service_role;
