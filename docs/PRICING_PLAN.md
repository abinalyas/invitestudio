# Pricing and payments plan

Status: phase 1 (prices) and phase 2 (taking payment with Razorpay) are built. Payments stay off until `PAYMENTS_MODE=live`.
This replaces the "free beta, no prices" decision in `docs/PRODUCT_DECISIONS.md` section 1.

## Decisions (product owner)

| Question | Decision |
|---|---|
| What is priced | **Each design**, grouped into three **tiers**: Classic, Premium, Signature. New designs join a tier; prices live with the tier. |
| What payment unlocks | **Publishing.** Building, previewing and the private preview link stay free. One payment publishes the invitation. |
| One-time or subscription | **One-time.** The price covers keeping the page online until 2 months after the event (and no longer than 8 months after first publishing), as in `docs/RETENTION_PLAN.md`. Keeping it longer is a separate, later extension. |
| Prices by country | A **price table set by hand per region** (India, United States, United Kingdom, Europe, Gulf, rest of world), each in its own currency. Not converted live from one currency. |
| Payment provider | **Razorpay** (Payment Links). Others can be added later behind the same `payments` table. |

## Phase 1: prices (built)

- `functions/_shared/pricing.js` is the only place that says what a design costs: the tiers and their wording, which tier each design is in,
  the price of each tier in each region (whole numbers in the currency's minor unit: paise, cents, pence), and which countries belong to which
  region. A design that is not listed is **Classic**, so a new design can never be free by accident. **The amounts in it are placeholders until the
  product owner confirms them.**
- `GET /api/pricing` (`functions/api/pricing.js`) returns the tiers and prices for the visitor. The country is read **on the server** from
  Cloudflare (`request.cf.country`, or the `CF-IPCountry` header); the page never says where the visitor is. Unknown places (`XX`, Tor) and
  countries not listed get the rest-of-world price. The response is `no-store`, so one visitor's price is never served to another.
  There is **no country or currency picker**: the price simply follows where the visitor is, and a `region` in the address or a checkout is ignored,
  so a cheaper region cannot be chosen. (A visitor who is travelling, or on a VPN, sees the price of where they appear to be.)
- The pages (`figma/islands/pricing.ts`): the home page's Pricing section shows the three tiers, the price in the visitor's currency, which designs
  each tier holds; each template's page and each gallery card show the design's tier and price. If the prices cannot be loaded,
  **no numbers are shown** ("Prices are shown when you choose a design"); a wrong price is worse than none.
- `PAYMENTS_MODE`: while it is not `live` (the default), the pages say "Publishing is free during early access while we finish setting up
  payments. These are the prices that will apply afterwards." Nothing is charged and nothing is gated in phase 1.
- Changing prices: edit `functions/_shared/pricing.js` (amounts, tier of a design, region of a country) and deploy. Tests
  (`tests/unit/pricing.test.mjs`) check that every offered design has a tier, every tier has a price in every region and the tiers rise.

## Phase 2: taking payment with Razorpay (built; off until `PAYMENTS_MODE=live`)

**Provider: Razorpay**, through **Payment Links** (the guest pays on Razorpay's own page and is sent back). Why a hosted link and not the
pop-up checkout: the pop-up needs Razorpay's script and frames allowed in the site's Content-Security-Policy on every page, including guests'
invitations, and the policy deliberately allows only the site's own scripts. A link keeps that policy unchanged, keeps card and UPI details off the
site entirely, and works well on phones (UPI apps). Switching to the pop-up later is possible if the policy is widened on purpose.

### How it works

1. **Publish** (`POST /api/weddings/<id>/publish`): with `PAYMENTS_MODE=live`, a website that is not unlocked and not already live gets
   `402 PAYMENT_REQUIRED`. The dialog then makes its main button "Pay ₹X and continue" (it already does when the price note says payments are live).
2. **Checkout** (`POST /api/weddings/<id>/checkout`, edit-token authorised): the server works out the price for the wedding's design and region
   (`quote()`), writes a `payments` row (`pending`, amount and currency **locked**), and creates a Razorpay Payment Link for exactly that amount,
   with `reference_id` = our payment id and a 2-hour expiry. The browser sends **no amount and no region**. A second press within
   30 minutes reuses the open link. The page navigates to the link only if its address is on `razorpay.com` or `rzp.io`.
3. **Return** (`/?payment=<our payment id>`): the page matches the id to the draft it started the payment from (kept in local storage), reopens
   the publish dialog, and calls **verify** (`POST /api/weddings/<id>/payments/<paymentId>/verify`). The server finds its own payment row (for this
   wedding only), **asks Razorpay for the link**, and only when Razorpay says it is paid for exactly the locked amount and currency, with our payment
   id as its reference, does it unlock. A paid link that does not match is refused with `409 PAYMENT_MISMATCH` and logged.
4. **Webhook** (`POST /api/payments/razorpay-webhook`): Razorpay's signed `payment_link.paid` event does the same unlock independently, so a guest who
   pays and never comes back is still unlocked. The signature is the HMAC-SHA256 of the exact body with the webhook secret, compared in constant
   time. A signature failure is `400`; a payment that does not match what we created is logged and answered `200` (so Razorpay stops retrying); a database failure is
   `5xx` (so it retries). `refund.processed` for the full amount marks the payment `refunded`; publishing is **not** taken away automatically.
5. **The only way to unlock** is the database function `mark_payment_paid` (service role only; the browser roles cannot run it or write payments). It
   is idempotent, locks the row, refuses a different amount, currency or link, and sets `weddings.publish_unlocked_at` and
   `publish_unlock_reason = 'paid'` once.
6. **Early access**: while payments are not live, publishing a website marks it `early-access` unlocked, and the migration marks websites that are
   already published or were published. They are **never asked to pay later**. (A deliberate choice: anyone who publishes during early access keeps
   that free. Change it by not recording the unlock in `publish.js` if you would rather ask them later.)

### Switching it on (nothing is charged until step 6)

1. Apply `supabase/migrations/202611130001_razorpay_payments.sql` in Supabase. **This must happen before step 6**: without the new
   column every website would look locked.
2. In Razorpay, use **Test mode** first. Generate API keys (Settings, API Keys).
3. In Cloudflare Pages, set these as **secrets** (a preview environment can be live with test keys while production is not):
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (any long random string you also give Razorpay), and optionally
   `PUBLIC_ORIGIN` (the site's address, for the return page).
4. In Razorpay (Settings, Webhooks), add `https://<your-site>/api/payments/razorpay-webhook` with that secret and the events
   `payment_link.paid` and `refund.processed`.
5. For prices in other currencies, **enable International Payments** on the Razorpay account (Settings, Payment Methods) and check which currencies
   and payment methods your account supports, including the settlement currency. The price table (`pricing.js`) lists only regions/currencies you can take.
6. With test keys and `PAYMENTS_MODE=live` on a preview: pay with Razorpay's test cards and UPI test IDs; try a failed payment, an abandoned
   link, a refund, and a webhook that arrives twice. Then put the **live** keys in production and set `PAYMENTS_MODE=live` there. (Setting it back
   to anything else switches payments off again at once; websites already unlocked stay unlocked.)

### Safety properties (tested)

- No price, amount or paid status ever comes from the browser (`tests/unit/payments.test.mjs`, `tests/e2e/payments.spec.js`).
- A wrong signature, an unknown link, a different amount or currency, another wedding's payment, a replayed webhook: none unlocks anything.
- The secrets never appear in a response or in a log; Razorpay's error body is not logged, only its status and code.
- The payment rules run in a real PostgreSQL in `tests/db/payments.test.mjs` (`npm run test:db`): idempotence, mismatches, role privileges.
- Checkout needs the private edit token, writes at most one open payment per wedding and price, and calls Razorpay once; add a Cloudflare rate-limit rule
  for `/api/weddings/*/checkout` with the other writes (`docs/RATE_LIMITING.md`).

### Not built

- **Tax invoices and GST.** Razorpay does not issue GST invoices for payments taken this way. Decide with an accountant whether prices include GST,
  and how invoices are produced.
- **Moving to a higher tier after paying** (paying the difference).
- **A check of the card's country against the chosen region** (regional price abuse): Razorpay's payment record carries whether the card is
  international; comparing it with the region is possible later.
- **Refund handling beyond marking the payment**; refunds are issued from the Razorpay dashboard.
- **A paid-extension flow** for keeping a website online longer (`docs/RETENTION_PLAN.md`).

## Things the code cannot decide

- **Razorpay account and terms.** Which countries, currencies and payment methods the owner's account supports, international card fees (reported
  at about 3% plus GST) and the settlement currency, to be confirmed in the Razorpay dashboard and against its current terms.
- **Tax.** GST in India, VAT or sales tax abroad. A merchant of record handles it for a higher fee; otherwise an accountant must advise on whether
  prices are shown including tax (usual in India, the UK and Europe) and on invoices.
- **The amounts**, and whether the rest-of-world price should be in US dollars.
- **Terms of sale, refund policy and privacy wording** linked at checkout.
- **Regional price abuse.** Someone can switch region or use a VPN to see a lower price. At phase 2 the provider's billing-country or card-country
  check can be compared with the chosen region, and a mismatch charged at the higher price; the choice of how strict to be is the owner's.
- **Currencies the provider cannot settle.** The region table must only list currencies the chosen provider supports.

## Test mode first

Exercise it in Razorpay's test mode (test cards, UPI test IDs, refunds, failed and abandoned payments, a webhook that arrives twice or out of order)
before `PAYMENTS_MODE` is ever set to `live` in production. The automated tests use a stand-in for Razorpay, so they cannot catch a difference between
the stand-in and the real service: Razorpay's current documentation (Payment Links, webhooks) should be checked against `functions/_shared/razorpay.js` during that test.
