# Policy pages: terms, refund policy, privacy, contact

Pages: `/terms`, `/refund-policy`, `/delivery-policy`, `/privacy`, `/contact`. They are written in `functions/_shared/policies.js`, served by `functions/_middleware.js` (same look as the landing pages), linked from every footer (the home page, the older pages, the guides) and from the payment dialog, and listed in the sitemap.

They are drafted from what the product does today. **They are not legal advice. Have a lawyer or accountant read them before you rely on them.** Razorpay also looks for these pages on the site when it activates a live account, so check its current requirements.

## What you need to confirm or fill in

| What | Where | My default | Why it is yours to decide |
|---|---|---|---|
| Refund window when a customer changes their mind | `REFUND_DAYS` in `policies.js` | 7 days | A business decision, and it affects how much you can lose |
| The three refund cases (our fault, changed mind, charged twice) and "we may take the invitation offline after a refund" | `refund-policy` in `policies.js` | as written | Same |
| Refund speed ("usually 5 to 10 business days") | `refund-policy` | as written | Depends on Razorpay and the customer's bank; check Razorpay's current wording |
| The delivery policy (digital service, delivered online when you publish, what you receive, custom designs agreed before paying) | `delivery-policy` in `policies.js` | as written | Payment providers such as Razorpay usually expect a shipping or delivery policy even for digital services. It carries its own `updated` date. Check that the "usually under a minute" wording and the custom design line match how you work |
| Legal name and address of the seller | `BUSINESS` in `policies.js` | "InviteStudio", "Kochi, Kerala, India" (shown on the contact page) | Only a city, not a full street address. Consumer-protection rules (India's e-commerce rules, UK and EU trader rules) and payment providers usually expect the legal name and full registered address, so ask your accountant whether this is enough, and replace both with the registered details if not |
| Governing law and where disputes are heard | not in the terms | left out | I must not guess your jurisdiction. Add it after legal advice |
| GST / tax and invoices | not mentioned | n/a | Ask an accountant (docs/PRICING_PLAN.md). Razorpay Payment Links do not issue GST invoices |
| The date shown as "Last updated" | `UPDATED` in `policies.js` | 15 November 2026 | Change it whenever you change a policy |

## Check before you launch

- **Closing and deleting.** The terms and privacy pages now say the plan is to close invitations after the event and delete their data, but that it is **not switched on yet**, because the cleanup job only reports (a dry run; see `functions/README.md` and `docs/RETENTION_PLAN.md`, step 4). When you switch closing and deleting on, change both pages to say so, and drop the `not switched on yet` check in `tests/unit/policies.test.mjs`.
- **Contact details.** They come from `site-config.js` (email and WhatsApp). `policies.js` repeats them for the server-built pages, and `tests/unit/policies.test.mjs` fails if the two differ. Change both together.
- **Third parties named on the privacy page:** Cloudflare, Supabase, Razorpay, Google Fonts. Update the page if you add or remove one (for example analytics).
