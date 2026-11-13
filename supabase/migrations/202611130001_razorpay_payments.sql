-- InviteStudio: payments with Razorpay (docs/PRICING_PLAN.md, phase 2).
-- Publishing is unlocked once, for a wedding, by a verified payment. Only the server (service role) writes payment state:
-- the browser never marks anything paid. Safe to run more than once. Apply in the Supabase SQL Editor before deploying.

-- 1. When publishing was unlocked, and why.
alter table public.weddings
  add column if not exists publish_unlocked_at timestamptz,
  add column if not exists publish_unlock_reason text;

alter table public.weddings drop constraint if exists weddings_publish_unlock_reason_check;
alter table public.weddings
  add constraint weddings_publish_unlock_reason_check
  check (publish_unlock_reason is null or publish_unlock_reason in ('paid', 'early-access', 'complimentary'));

comment on column public.weddings.publish_unlocked_at is 'Set once, when publishing was unlocked by a payment, by early access or by us (complimentary). Never cleared.';
comment on column public.weddings.publish_unlock_reason is 'paid | early-access | complimentary';

-- 2. Websites that are, or have been, published before payments open keep working without a payment.
update public.weddings
   set publish_unlocked_at = coalesce(first_published_at, published_at, pg_catalog.now()),
       publish_unlock_reason = 'early-access'
 where publish_unlocked_at is null
   and (status = 'published' or published_at is not null or first_published_at is not null);

-- 3. Payments: the Razorpay payment link is stored as provider_payment_id (unique with the provider), the link's own
--    payment id in metadata.razorpayPaymentId once paid. Look-ups by our payment id and by Razorpay's payment id.
create index if not exists payments_razorpay_payment_idx
  on public.payments ((metadata ->> 'razorpayPaymentId'))
  where provider = 'razorpay';

-- 4. The one place a payment becomes paid. Called by the server after it has verified the payment with Razorpay (the
--    verify route fetches the link; the webhook checks Razorpay's signature). Idempotent: a payment that is already paid
--    is returned unchanged, so a webhook that arrives twice, or after the page's own check, does nothing more.
--    It refuses a payment whose link, amount or currency is not the one we created.
create or replace function public.mark_payment_paid(
  p_payment_id uuid,
  p_provider_ref text,
  p_amount bigint,
  p_currency text,
  p_provider_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
begin
  select * into v_pay
    from public.payments
   where id = p_payment_id and provider = 'razorpay'
     for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_pay.status = 'paid' then
    return jsonb_build_object('payment_id', v_pay.id, 'wedding_id', v_pay.wedding_id, 'status', 'paid', 'already', true);
  end if;
  if v_pay.status not in ('pending', 'failed', 'cancelled') then
    raise exception 'PAYMENT_NOT_PENDING';
  end if;
  if v_pay.provider_payment_id is distinct from p_provider_ref then
    raise exception 'PAYMENT_REFERENCE_MISMATCH';
  end if;
  if v_pay.amount_minor <> p_amount or v_pay.currency <> p_currency then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  update public.payments
     set status = 'paid',
         paid_at = pg_catalog.now(),
         metadata = v_pay.metadata || pg_catalog.jsonb_build_object('razorpayPaymentId', p_provider_payment_id)
   where id = v_pay.id;

  update public.weddings
     set publish_unlocked_at = coalesce(publish_unlocked_at, pg_catalog.now()),
         publish_unlock_reason = case when publish_unlocked_at is null then 'paid' else publish_unlock_reason end
   where id = v_pay.wedding_id;

  return jsonb_build_object('payment_id', v_pay.id, 'wedding_id', v_pay.wedding_id, 'status', 'paid', 'already', false);
end $$;

revoke all on function public.mark_payment_paid(uuid, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid, text, bigint, text, text) to service_role;
