-- Guest replies (RSVP). See docs/RSVP_PLAN.md.
--
-- Replies belong to a wedding and are deleted with it. Only trusted server code (the service key) reads or writes
-- them: row level security is on and there are no browser policies, so the public key can never see a reply.
-- The guest's private "change my reply" link is stored only as a hash.

create table if not exists public.wedding_rsvps (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  guest_name text not null,
  attending boolean not null,
  party_size integer not null default 1,
  event_replies jsonb not null default '{}'::jsonb,
  needs text not null default '',
  message text not null default '',
  change_token_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wedding_rsvps_name_length check (char_length(btrim(guest_name)) between 1 and 160),
  constraint wedding_rsvps_party_size check (party_size between 0 and 20),
  constraint wedding_rsvps_party_matches check ((attending and party_size >= 1) or (not attending and party_size = 0)),
  constraint wedding_rsvps_event_replies_object check (jsonb_typeof(event_replies) = 'object'),
  constraint wedding_rsvps_needs_length check (char_length(needs) <= 500),
  constraint wedding_rsvps_message_length check (char_length(message) <= 2000)
);

create index if not exists wedding_rsvps_wedding_idx
  on public.wedding_rsvps(wedding_id, created_at desc);

alter table public.wedding_rsvps enable row level security;

comment on table public.wedding_rsvps is
  'Guest replies. Service-key access only; no browser policies. Deleted with the wedding.';

-- Short-lived counters for rate limiting reply submissions. A bucket name is a hash plus the hour, so no IP address
-- is stored.
create table if not exists public.rsvp_rate_limits (
  bucket text primary key,
  hits integer not null default 0,
  expires_at timestamptz not null
);

alter table public.rsvp_rate_limits enable row level security;

-- Adds one hit to a bucket atomically and returns the new count. Expired buckets are cleaned up now and then.
create or replace function public.rsvp_rate_hit(p_bucket text, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  if p_bucket is null or char_length(p_bucket) > 200 or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'RSVP_RATE_BAD_INPUT';
  end if;
  if random() < 0.05 then
    delete from public.rsvp_rate_limits where expires_at < now();
  end if;
  insert into public.rsvp_rate_limits as r (bucket, hits, expires_at)
  values (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update set hits = r.hits + 1
  returning hits into total;
  return total;
end;
$$;

revoke all on function public.rsvp_rate_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rsvp_rate_hit(text, integer) to service_role;
