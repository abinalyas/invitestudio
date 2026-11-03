-- InviteStudio Phase 3.3: optional email destination for cross-device recovery.
-- The email is private wedding metadata and is never included in public
-- invitation projections.

alter table public.weddings
  add column if not exists recovery_email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weddings_recovery_email_check'
  ) then
    alter table public.weddings
      add constraint weddings_recovery_email_check check (
        recovery_email is null
        or (
          char_length(recovery_email) between 3 and 254
          and recovery_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      );
  end if;
end $$;

create index if not exists weddings_recovery_email_idx
  on public.weddings(recovery_email)
  where recovery_email is not null;
