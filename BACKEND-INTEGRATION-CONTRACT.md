# InviteStudio backend integration contract (draft)

Status: implementation contract; no backend is connected in this package. Recommended infrastructure: Cloudflare Pages + Supabase. See [Technical Architecture Decision](docs/TECHNICAL_ARCHITECTURE_DECISION.md) for deployment, schema, access-control, and rollout decisions.

## Project resource

`Project` should contain:
- `id` (server-generated UUID), `ownerId`, `name`, `category`, `templateId`
- `title`, `date` (ISO `YYYY-MM-DD` or null), `location`, `message`, `story`, `hosts`, `locale`
- `theme: { background, accent, text }`
- `sections: [{ id, title, content?, visible, custom? }]`
- `functions: [{ id, title, date?, time?, endTime?, venue?, description?, dressCode?, directionsUrl?, visible }]`
- `photos: [{ id, url, alt, width?, height? }]` — use server URLs, not base64 in project JSON
- `status: draft | published`, `slug?`, `createdAt`, `updatedAt`, `publishedAt?`, `version`

## Suggested REST endpoints

- `POST /api/projects` — create a draft; returns `201` and the canonical project.
- `GET /api/projects` — list only projects the authenticated user can access.
- `GET /api/projects/:id` — read one authorized project.
- `PATCH /api/projects/:id` — partial update; support optimistic concurrency using `version` or `If-Match`.
- `DELETE /api/projects/:id` — delete after confirmation; return `204`.
- `POST /api/projects/:id/photos` — validate MIME type, size, dimensions and ownership; return asset metadata/URL.
- `DELETE /api/projects/:id/photos/:photoId` — remove an owned asset.
- `POST /api/projects/:id/publish` — validate and publish; return canonical public URL only after success.
- `POST /api/projects/:id/unpublish` — unpublish and invalidate public access.
- `GET /s/:slug` — public, read-only published invitation.
- `POST /api/public/:slug/rsvps` — validate and persist guest RSVP.
- `GET /api/projects/:id/rsvps` — authenticated owner-only RSVP listing/export.

## Response and error behavior

Success responses should return JSON with canonical saved state. Errors should use a stable shape such as:
`{ "error": { "code": "VALIDATION_ERROR", "message": "Please correct the highlighted fields.", "fields": { "title": "Required" }, "requestId": "..." } }`.

Use appropriate HTTP status codes (`400/422` validation, `401` unauthenticated, `403` unauthorized, `404` missing, `409` version conflict, `413` too large, `429` rate limited, `5xx` server failure). Never return a public URL until publish succeeds. The frontend must preserve unsaved edits on network failures and provide retry/conflict resolution.

## Security and privacy requirements

- Enforce authentication and project ownership server-side; never rely on client-side visibility.
- Validate/sanitize text and URLs, including direction links; only allow safe URL schemes.
- Restrict upload type/size, inspect actual file contents, and store assets outside executable web roots.
- Apply rate limits and spam protection to public RSVP endpoints.
- Collect only necessary guest data and document retention/deletion behavior.
- Do not put secrets in frontend code or logs.

## Frontend migration notes

Current prototype uses `localStorage` and base64 photos. Backend integration must migrate local drafts explicitly (opt-in import/export), upload photos as separate assets, and map server IDs/version fields. Demo publishing and RSVP controls must remain labelled as non-production until the endpoints above exist and are tested.
