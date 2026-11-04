# Rate limiting: current state and options

Status: review document. Nothing in this document changes production settings.

## Current state

No rate limiting exists in the application code or in the Cloudflare configuration checked
into the repository.

## Endpoints and their exposure

| Endpoint | Who can call it | Risk | Notes |
|---|---|---|---|
| `GET /api/public-weddings/:slug` | Anyone | Enumeration of published addresses; database load | Returns only the public projection |
| `GET /s/:slug` | Anyone | Database load per request | Serves the shell with preview metadata |
| `GET /api/weddings/:id/slug-availability` | Edit-token holders only | Low | Not usable by strangers |
| `POST /api/edit-links` | Anyone with a token | Low: tokens are 256-bit random | Still adds database load |
| `POST /api/weddings/:id/publish` and other writes | Edit-token holders only | Low | Protected by the token |
| RSVP submission (Phase 4B / 7) | Anyone | High: spam and abuse | Needs an in-application counter |

## Options

1. **Cloudflare rate-limiting rules (WAF).** Configured in the Cloudflare dashboard, applied
   before requests reach Pages Functions. Good for the public read endpoints and `/s/*`.
   The available counts, periods and actions depend on the account's plan. **This could not
   be verified from the repository or this environment.** The account owner must check the
   plan's rate-limiting entitlements before anything is configured.
2. **In-application counter.** A small table and an atomic SQL function, called from a
   Pages Function. Needed for RSVP submissions because they write data, and it works on any
   plan. It is part of the RSVP migration when that is approved.
3. **Durable Objects.** Precise per-key counters, with more moving parts and cost. Not
   proposed now.

## Recommendation

- Now: option 1 for the public read endpoints and `/s/*`, once the plan is confirmed. This is
  a manual production change, so it needs your approval.
- With RSVP: option 2 for writes, applied per hashed IP address and per website.
- Either way, watch the rate-limited (429) counts in Cloudflare analytics after enabling a rule.

## Proposed starting thresholds (to confirm)

- Public invitation reads: 300 requests per minute per IP address.
- `/s/*` reads: 120 requests per minute per IP address.
- RSVP submissions (Phase 4B / 7): 5 per hour per IP address, and 300 per hour per website.

## Verification

Automated tests cannot exercise Cloudflare rules from the local stack. Verify manually after
any change: request a protected endpoint above the threshold from one address and confirm a
429 response, then confirm normal use is unaffected.
