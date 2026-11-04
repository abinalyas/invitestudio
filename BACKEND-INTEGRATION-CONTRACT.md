# InviteStudio backend integration contract (draft)

Status: implementation contract; Cloudflare Pages Functions and Supabase implement the anonymous draft slice. See [Technical Architecture Decision](docs/TECHNICAL_ARCHITECTURE_DECISION.md) for deployment, schema, access-control, and rollout decisions.

## Wedding resource

`Wedding` should contain:
- `id` (server-generated UUID), optional `ownerId`, `ownershipMode`, `name`, `category`, `templateId`
- `title`, `date` (ISO `YYYY-MM-DD` or null), `location`, `message`, `story`, `hosts`, `locale`
- `theme: { background, accent, text }`
- `sections: [{ id, title, content?, visible, custom? }]`
- `functions: [{ id, title, date?, time?, endTime?, venue?, description?, dressCode?, directionsUrl?, visible }]`
- `photos: [{ id, url, alt, width?, height? }]` — use server URLs, not base64 in project JSON
- `status: draft | published | unpublished`, `visibility: private | public`, `slug?`, `createdAt`, `updatedAt`, `publishedAt?`, `version`

Customer accounts are not required for the initial release. Anonymous drafts
use `ownershipMode: anonymous`, no `ownerId`, and an expiring edit token. The
raw token is returned once by the trusted create operation and only its hash
is stored in `edit_tokens`.

## API endpoints

Implemented by the Cloudflare Pages Functions in `functions/api/`:

- `POST /api/weddings` — create an anonymous draft; returns `201`, the canonical wedding and a raw edit token once.
- `GET /api/weddings/:id` — read a draft with `Authorization: Bearer <edit-token>`.
- `PATCH /api/weddings/:id` — validated partial update with a required `version`.
- `POST /api/edit-links` — resolve a private edit link (token in the JSON body, never in the path) to its associated draft; the token is hash-validated server-side.
- `POST /api/weddings/:id/edit-token` — regenerate the edit token after validating the current token; previous links are revoked.
- `POST /api/weddings/:id/edit-token/revoke` — revoke all edit tokens for the draft.
- `POST /api/weddings/:id/publish` — validate slug and publish atomically with a version check.
- `POST /api/weddings/:id/unpublish` — return a published wedding to private state.
- `GET /api/public-weddings/:slug` — public, read-only published invitation projection.

Planned follow-up endpoints:

- `POST /api/weddings/:id/photos` and photo delete — validate and store assets.
- `POST /api/public-weddings/:slug/rsvps` — rate-limited public RSVP submission.
- `GET /api/weddings/:id/rsvps` — token-authorized RSVP listing/export.

## Response and error behavior

Success responses should return JSON with canonical saved state. Errors should use a stable shape such as:
`{ "error": { "code": "VALIDATION_ERROR", "message": "Please correct the highlighted fields.", "fields": { "title": "Required" }, "requestId": "..." } }`.

Use appropriate HTTP status codes (`400/422` validation, `401` unauthenticated, `403` unauthorized, `404` missing, `409` version conflict, `413` too large, `429` rate limited, `5xx` server failure). Never return a public URL until publish succeeds. The frontend must preserve unsaved edits on network failures and provide retry/conflict resolution.

## Security and privacy requirements

- Validate edit tokens server-side and scope every draft operation to the token's wedding; never rely on client-side visibility.
- Keep the Supabase service-role key in server runtime secrets only; never expose it in browser code.
- Public routes must allow reads only for `status = published` and `visibility = public`.
- Validate/sanitize text and URLs, including direction links; only allow safe URL schemes.
- Restrict upload type/size, inspect actual file contents, and store assets outside executable web roots.
- Apply rate limits and spam protection to public RSVP endpoints.
- Collect only necessary guest data and document retention/deletion behavior.
- Do not put secrets in frontend code or logs.

## Frontend migration notes

Current prototype uses `localStorage` and base64 photos. Backend integration must migrate local drafts explicitly (opt-in import/export), upload photos as separate assets, and map server IDs/version fields. Demo publishing and RSVP controls must remain labelled as non-production until the endpoints above exist and are tested.
