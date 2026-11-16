-- The buyer's contact details, asked for once before paying (name, email, optional phone, and an optional tick for tips and
-- reminders), and a log of when the owner looks at them from the admin page.
--
-- Drafts are anonymous; this is the only place a person's name, email or phone is kept. It is not part of the website row, so it
-- can never travel with the invitation or its public page. Only the server's own key can read or write it. Deleted with the website.
create table if not exists public.customer_contacts (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint customer_contacts_email_shape check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  constraint customer_contacts_phone_shape check (phone is null or phone ~ '^\+?[0-9]{7,15}$')
);
alter table public.customer_contacts enable row level security;
revoke all on public.customer_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.customer_contacts to service_role;
comment on table public.customer_contacts is 'Buyer contact details. Service key only; no browser policies. Deleted with the website.';

create or replace function public.save_customer_contact(p_wedding_id uuid, p_name text, p_email text, p_phone text, p_marketing boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.customer_contacts (wedding_id, name, email, phone, marketing_opt_in)
  values (p_wedding_id, btrim(p_name), p_email, nullif(p_phone, ''), coalesce(p_marketing, false))
  on conflict (wedding_id) do update
    set name = excluded.name, email = excluded.email, phone = excluded.phone,
        marketing_opt_in = excluded.marketing_opt_in, updated_at = now();
$$;
revoke all on function public.save_customer_contact(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.save_customer_contact(uuid, text, text, text, boolean) to service_role;

-- Who looked at what in the admin page (contact details). One row per look.
create table if not exists public.admin_access_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  admin_email text not null,
  action text not null,
  wedding_id uuid references public.weddings(id) on delete set null
);
alter table public.admin_access_log enable row level security;
revoke all on public.admin_access_log from public, anon, authenticated;
grant select, insert on public.admin_access_log to service_role;
