# Policy pages: terms, refund policy, privacy, contact

Pages: `/terms`, `/refund-policy`, `/privacy`, `/contact`. They are written in `functions/_shared/policies.js`, served by `functions/_middleware.js` (same look as the landing pages), linked from every footer (the home page, the older pages, the guides) and from the payment dialog, and listed in the sitemap.

They are drafted from what the product does today. **They are not legal advice. Have a lawyer or accountant read them before you rely on them.** Razorpay also looks for these pages on the site when it activates a live account, so check its current requirements.

## What you need to confirm or fill in

| What | Where | My default | Why it is yours to decide |
|---|---|---|---|
| Refund window when a customer changes their mind | `REFUND_DAYS` in `policies.js` | 7 days | A business decision, and it affects how much you can lose |
| The three refund cases (our fault, changed mind, charged twice) and "we may take the invitation offline after a refund" | `refund-policy` in `policies.js` | as written | Same |
| Refund speed ("usually 5 to 10 business days") | `refund-policy` | as written | Depends on Razorpay and the customer's bank; check Razorpay's current wording |
| Legal name and address of the seller | `BUSINESS` in `policies.js` | empty (not shown) | Consumer-protection rules and payment providers usually expect them. Fill them in; the contact page then shows them |
| Governing law and where disputes are heard | not in the terms | left out | I must not guess your jurisdiction. Add it after legal advice |
| GST / tax and invoices | not mentioned | n/a | Ask an accountant (docs/PRICING_PLAN.md). Razorpay Payment Links do not issue GST invoices |
| The date shown as "Last updated" | `UPDATED` in `policies.js` | 15 November 2026 | Change it whenever you change a policy |

## Check before you launch

- **Deleting data.** The privacy page says an invitation, its replies, photos and links are deleted 14 days after it closes. Today the cleanup job at `/api/internal/retention-sweep` only **reports** (a dry run; see `functions/README.md`). Switch it to really delete before you rely on that sentence, or change the sentence.
- **Contact details.** They come from `site-config.js` (email and WhatsApp). `policies.js` repeats them for the server-built pages, and `tests/unit/policies.test.mjs` fails if the two differ. Change both together.
- **Third parties named on the privacy page:** Cloudflare, Supabase, Razorpay, Google Fonts. Update the page if you add or remove one (for example analytics).
