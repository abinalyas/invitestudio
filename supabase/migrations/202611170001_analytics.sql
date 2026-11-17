-- Visit statistics (the "Visitors" section of the admin page). First-party and privacy-friendly: no cookies, no IP address, no
-- user-agent string and nothing that identifies a person is stored. A visit is one row: the page (never a query or fragment, so
-- never a private link), the referring site, the country (from Cloudflare), the device kind, browser and system (read from the
-- user-agent on the server, which is then thrown away) and a screen-width bucket. "vid" is a hash of the IP address and browser
-- with a salt that changes every day, so it can count how many different visitors there were in a day but cannot follow anyone
-- from one day to the next, and cannot be turned back into an address.
--
-- Service key only. Rows older than 400 days are removed (analytics_purge, called when the owner opens the Visitors section).
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null default 'pageview' check (kind in ('pageview')),
  path text not null check (char_length(path) <= 120),
  slug text check (slug is null or char_length(slug) <= 60),
  referrer text check (referrer is null or char_length(referrer) <= 120),
  utm_source text check (utm_source is null or char_length(utm_source) <= 60),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 60),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 80),
  country text check (country is null or char_length(country) <= 2),
  device text check (device in ('mobile', 'tablet', 'desktop')),
  browser text check (browser is null or char_length(browser) <= 30),
  os text check (os is null or char_length(os) <= 30),
  screen text check (screen is null or char_length(screen) <= 12),
  lang text check (lang is null or char_length(lang) <= 12),
  vid text not null check (char_length(vid) between 8 and 64)
);
create index if not exists analytics_events_at_idx on public.analytics_events (at desc);
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
grant select, insert, delete on public.analytics_events to service_role;
comment on table public.analytics_events is 'Anonymous visit statistics. Service key only. See docs/ANALYTICS.md.';

create or replace function public.analytics_purge(p_keep_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.analytics_events where at < now() - make_interval(days => greatest(30, coalesce(p_keep_days, 400)));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.analytics_purge(integer) from public, anon, authenticated;
grant execute on function public.analytics_purge(integer) to service_role;

-- Everything the Visitors section shows, for the last p_days days (1 to 365). "Visitors" are counted per day (the same person on two
-- days counts twice), because that is all the daily-changing hash allows.
create or replace function public.analytics_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d integer := greatest(1, least(coalesce(p_days, 30), 365));
  result jsonb;
begin
  with ev as (
    select *, (at at time zone 'UTC')::date as day
    from public.analytics_events
    where at >= now() - make_interval(days => d)
  )
  select jsonb_build_object(
    'days', d,
    'asOf', now(),
    'totals', jsonb_build_object(
      'pageviews', (select count(*) from ev),
      'visitors', (select count(*) from (select distinct day, vid from ev) x),
      'invitationViews', (select count(*) from ev where slug is not null),
      'invitationVisitors', (select count(*) from (select distinct day, vid from ev where slug is not null) x)
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', g.day, 'pageviews', coalesce(s.pageviews, 0), 'visitors', coalesce(s.visitors, 0)) order by g.day)
      from (select generate_series(current_date - (d - 1), current_date, interval '1 day')::date as day) g
      left join (select day, count(*)::int as pageviews, count(distinct vid)::int as visitors from ev group by day) s on s.day = g.day
    ), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select path, count(*)::int as views, count(distinct (day, vid))::int as visitors from ev where slug is null group by path order by views desc limit 15) x), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select slug, count(*)::int as views, count(distinct (day, vid))::int as visitors from ev where slug is not null group by slug order by views desc limit 10) x), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(referrer, 'Direct or unknown') as name, count(distinct (day, vid))::int as visitors from ev group by 1 order by visitors desc limit 10) x), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select utm_source as source, utm_medium as medium, utm_campaign as campaign, count(distinct (day, vid))::int as visitors from ev where utm_source is not null group by 1, 2, 3 order by visitors desc limit 10) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(country, '??') as name, count(distinct (day, vid))::int as visitors from ev group by 1 order by visitors desc limit 10) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(device, 'unknown') as name, count(distinct (day, vid))::int as visitors from ev group by 1 order by visitors desc) x), '[]'::jsonb),
    'browsers', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(browser, 'Other') as name, count(distinct (day, vid))::int as visitors from ev group by 1 order by visitors desc limit 10) x), '[]'::jsonb),
    'systems', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(os, 'Other') as name, count(distinct (day, vid))::int as visitors from ev group by 1 order by visitors desc limit 10) x), '[]'::jsonb),
    'screens', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(screen, 'unknown') as name, count(distinct (day, vid))::int as visitors from ev group by 1 order by visitors desc) x), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(lang, '??') as name, count(distinct (day, vid))::int as visitors from ev group by 1 order by visitors desc limit 8) x), '[]'::jsonb),
    'designs', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select (regexp_match(path, '^/templates/([0-9]+)$'))[1] as number, count(*)::int as views, count(distinct (day, vid))::int as visitors
      from ev where path ~ '^/templates/[0-9]+$' group by 1 order by views desc) x), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'visitors', (select count(*) from (select distinct day, vid from ev) x),
      'viewedADesign', (select count(*) from (select distinct day, vid from ev where path ~ '^/templates/[0-9]+$') x),
      'draftsCreated', (select count(*) from public.weddings where created_at >= now() - make_interval(days => d)),
      'paid', (select count(*) from public.weddings where publish_unlocked_at >= now() - make_interval(days => d)),
      'wentLive', (select count(*) from public.weddings where coalesce(first_published_at, published_at) >= now() - make_interval(days => d))
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.analytics_overview(integer) from public, anon, authenticated;
grant execute on function public.analytics_overview(integer) to service_role;
