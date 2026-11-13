# Pricing and payments plan

Status: phase 1 (prices) is built; phase 2 (taking payment) is planned and waits on a payment provider decision.
This replaces the "free beta, no prices" decision in `docs/PRODUCT_DECISIONS.md` section 1.

## Decisions (product owner)

| Question | Decision |
|---|---|
| What is priced | **Each design**, grouped into three **tiers**: Classic, Premium, Signature. New designs join a tier; prices live with the tier. |
| What payment unlocks | **Publishing.** Building, previewing and the private preview link stay free. One payment publishes the invitation. |
| One-time or subscription | **One-time.** The price covers keeping the page online until 2 months after the event (and no longer than 8 months after first publishing), as in `docs/RETENTION_PLAN.md`. Keeping it longer is a separate, later extension. |
| Prices by country | A **price table set by hand per region** (India, United States, United Kingdom, Europe, Gulf, rest of world), each in its own currency. Not converted live from one currency. |
| Payment provider | **Not decided.** Phase 1 is provider-independent. |

## Phase 1: prices (built)

- `functions/_shared/pricing.js` is the only place that says what a design costs: the tiers and their wording, which tier each design is in,
  the price of each tier in each region (whole numbers in the currency's minor unit: paise, cents, pence), and which countries belong to which
  region. A design that is not listed is **Classic**, so a new design can never be free by accident. **The amounts in it are placeholders until the
  product owner confirms them.**
- `GET /api/pricing` (`functions/api/pricing.js`) returns the tiers and prices for the visitor. The country is read **on the server** from
  Cloudflare (`request.cf.country`, or the `CF-IPCountry` header); the page never says where the visitor is. Unknown places (`XX`, Tor) and
  countries not listed get the rest-of-world price. The response is `no-store`, so one visitor's price is never served to another.
  A visitor can pick another region with `?region=in|us|gb|eu|gulf|row` (people travel and use VPNs). The pages remember the choice on the device
  (`invitestudio-region`).
- The pages (`figma/islands/pricing.ts`): the home page's Pricing section shows the three tiers, the price in the visitor's currency, which designs
  each tier holds and a region picker; each template's page and each gallery card show the design's tier and price. If the prices cannot be loaded,
  **no numbers are shown** ("Prices are shown when you choose a design"); a wrong price is worse than none.
- `PAYMENTS_MODE`: while it is not `live` (the default), the pages say "Publishing is free during early access while we finish setting up
  payments. These are the prices that will apply afterwards." Nothing is charged and nothing is gated in phase 1.
- Changing prices: edit `functions/_shared/pricing.js` (amounts, tier of a design, region of a country) and deploy. Tests
  (`tests/unit/pricing.test.mjs`) check that every offered design has a tier, every tier has a price in every region and the tiers rise.

## Phase 2: taking payment (not built; needs a provider)

1. **Checkout** `POST /api/weddings/<id>/checkout` (authorised by the private edit token, like publishing). The server **recomputes the price**
   with `quote(templateId, region)` for the wedding's design, creates a `payments` row (`pending`, amount and currency **locked**) and starts a
   payment with the provider. The browser sends no amount.
2. **Webhook** `POST /api/payments/webhook/<provider>`: verifies the provider's signature, is **idempotent** (the table already has a unique
   `(provider, provider_payment_id)`), and marks the payment `paid`. Only this route may mark a payment as paid (`docs/DATABASE_SCHEMA.md`).
3. **Entitlement**: a paid payment sets `weddings.paid_at` (one new column and migration). `publish.js` returns `402 PAYMENT_REQUIRED` for an
   unpaid wedding **only when `PAYMENTS_MODE=live`**. A wedding published during early access stays published; it is not asked to pay later
   unless the owner decides so.
4. **Changing design after paying**: moving to a cheaper or same-tier design is free; a higher tier asks for the difference (computed from the
   two `quote`s in the currency already paid).
5. **Refunds** go through the provider; the webhook marks the payment `refunded`. The policy (a short window, for example 7 days) is a product decision.
6. **Receipts and invoices** come from the provider, or are sent by us if the provider cannot.

## Things the code cannot decide

- **The provider.** Options discussed: Razorpay for India (UPI, cards, netbanking) with Stripe elsewhere; Razorpay alone; or a merchant of record
  (for example Paddle) who also collects and files tax. To be confirmed against the owner's business registration and the provider's current
  terms, including which countries and payment methods each supports.
- **Tax.** GST in India, VAT or sales tax abroad. A merchant of record handles it for a higher fee; otherwise an accountant must advise on whether
  prices are shown including tax (usual in India, the UK and Europe) and on invoices.
- **The amounts**, and whether the rest-of-world price should be in US dollars.
- **Terms of sale, refund policy and privacy wording** linked at checkout.
- **Regional price abuse.** Someone can switch region or use a VPN to see a lower price. At phase 2 the provider's billing-country or card-country
  check can be compared with the chosen region, and a mismatch charged at the higher price; the choice of how strict to be is the owner's.
- **Currencies the provider cannot settle.** The region table must only list currencies the chosen provider supports.

## Test mode first

Phase 2 is built and exercised in the provider's test mode (test cards, UPI test IDs, refunds, failed and abandoned payments, a webhook that
arrives twice or out of order) before `PAYMENTS_MODE` is ever set to `live`.
