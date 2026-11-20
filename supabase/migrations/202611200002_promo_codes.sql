-- Promo codes: a code that unlocks publishing without a payment, so the paid path can be tried (and a friend or tester can be given a
-- free publish) without taking money. Codes are made by the owner on the admin page, never typed in by hand, so they are long and random.
--
-- A redeemed code unlocks the website as 'complimentary' (the unlock reason that already exists for "unlocked by us"). It is a
-- different thing from a payment: nothing is charged, nothing is recorded as revenue, and the design is not tier-locked.
-- Only the server's own key can touch these tables. Safe to run more than once. Apply in the Supabase SQL Editor before deploying.
create table if not exists public.promo_codes (
  code text primary key,
  note text not null default '',
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promo_codes_code_shape check (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and char_length(code) between 8 and 40),
  constraint promo_codes_note_length check (char_length(note) <= 120),
  constraint promo_codes_uses check (max_uses between 1 and 10000 and used_count >= 0)
);

-- Which website used which code (a website can use a code once; asking again changes nothing).
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.promo_codes(code),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code, wedding_id)
);

-- Wrong guesses, so one website cannot try codes without end. Deleted with the website.
create table if not exists public.promo_attempts (
  id bigint generated always as identity primary key,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists promo_attempts_wedding_idx on public.promo_attempts (wedding_id, attempted_at);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.promo_attempts enable row level security;
revoke all on public.promo_codes, public.promo_redemptions, public.promo_attempts from public, anon, authenticated;
grant select, insert, update on public.promo_codes to service_role;
grant select, insert on public.promo_redemptions to service_role;
grant select, insert, delete on public.promo_attempts to service_role;
comment on table public.promo_codes is 'Codes that unlock publishing without a payment. Service key only; no browser policies.';

-- The one place a code is redeemed. It answers with a status (it does not raise for a wrong code, so the wrong guess is kept):
--   unlocked   the code worked and the website is unlocked now
--   already    the website was already unlocked (paid, early access, complimentary): nothing was used
--   invalid    no such active code (counted as a wrong guess)
--   expired    the code's date has passed
--   used_up    the code has no uses left
--   too_many   ten wrong guesses in the last hour for this website
create or replace function public.redeem_promo_code(p_wedding_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));
  v_wedding public.weddings%rowtype;
  v_promo public.promo_codes%rowtype;
  v_wrong integer;
begin
  select * into v_wedding from public.weddings where id = p_wedding_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_wedding.publish_unlocked_at is not null then
    return pg_catalog.jsonb_build_object('status', 'already');
  end if;

  select pg_catalog.count(*) into v_wrong from public.promo_attempts
   where wedding_id = p_wedding_id and attempted_at > pg_catalog.now() - interval '1 hour';
  if v_wrong >= 10 then
    return pg_catalog.jsonb_build_object('status', 'too_many');
  end if;

  select * into v_promo from public.promo_codes where code = v_code for update;
  if not found or not v_promo.active then
    insert into public.promo_attempts (wedding_id) values (p_wedding_id);
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;
  if v_promo.used_count >= v_promo.max_uses then
    return pg_catalog.jsonb_build_object('status', 'used_up');
  end if;

  insert into public.promo_redemptions (code, wedding_id) values (v_code, p_wedding_id);
  update public.promo_codes set used_count = used_count + 1 where code = v_code;
  update public.weddings
     set publish_unlocked_at = pg_catalog.now(), publish_unlock_reason = 'complimentary'
   where id = p_wedding_id;
  return pg_catalog.jsonb_build_object('status', 'unlocked');
end $$;

revoke all on function public.redeem_promo_code(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text) to service_role;
