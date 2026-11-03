# InviteStudio server API

These Cloudflare Pages Functions are the server-side boundary for anonymous
drafts. They use the Supabase service-role key only through Cloudflare runtime
secrets. The key is never imported by `index.html` or any browser script.

## Endpoints

### Create an anonymous draft

```http
POST /api/weddings
Content-Type: application/json

{
  "templateId": "eternal",
  "title": "Mira & Arun",
  "category": "Wedding",
  "date": "2027-01-20",
  "functions": [{
    "title": "Wedding ceremony",
    "date": "2027-01-20",
    "time": "10:00",
    "venue": "The Garden Estate",
    "visible": true
  }],
  "gallery": {
    "preference": "gallery",
    "photos": [{"alt": "Engagement portrait"}]
  }
}
```

The response returns the wedding record and a random `editToken` once. Store it
securely in the client session or in a customer-provided edit link; it is not
stored in the database in raw form.

The browser recovery client accepts private links in the form
`https://your-invitestudio-host/edit/<edit-token>`. The token is resolved by
`GET /api/edit-links/<edit-token>`, used for the token-authorised request, and
removed from the address bar immediately.

The editor's event list and gallery metadata are saved in `weddings.content`.
The current phase does not upload local image bytes; `wedding_photos` and
Supabase Storage are reserved for the media-upload phase.

### Retrieve a private draft

```http
GET /api/weddings/<uuid>
Authorization: Bearer <editToken>
```

Private links can also be resolved without knowing the wedding ID:

```http
GET /api/edit-links/<editToken>
```

The token is looked up by its SHA-256 hash and can return only the wedding
associated with that token.

### Update a private draft

```http
PATCH /api/weddings/<uuid>
Authorization: Bearer <editToken>
Content-Type: application/json

{
  "version": 1,
  "title": "Mira & Arun",
  "message": "We cannot wait to celebrate with you."
}
```

The server validates fields and uses the version for optimistic concurrency.
The response returns the canonical saved wedding and the incremented version.

### Read a published invitation

```http
GET /api/public-weddings/<slug>
```

Only rows with `status = 'published'` and `visibility = 'public'` are returned.
This route has no update operation and does not accept an edit token.

### Publish and unpublish

```http
POST /api/weddings/<uuid>/publish
Authorization: Bearer <editToken>
Content-Type: application/json

{"version": 1, "slug": "mira-and-arun"}
```

Publishing is server-controlled and returns a public URL only after the
database confirms the published state. `POST /api/weddings/<uuid>/unpublish`
uses the edit token and current version to return the invitation to private
state.

### Regenerate or revoke private links

```http
POST /api/weddings/<uuid>/edit-token
Authorization: Bearer <currentEditToken>

POST /api/weddings/<uuid>/edit-token/revoke
Authorization: Bearer <currentEditToken>
```

Regeneration returns one new raw token and revokes previous tokens. Revocation
invalidates every active private edit link for the draft.

## Cloudflare configuration

Configure these as Cloudflare Pages environment variables/secrets:

- `SUPABASE_URL` — regular environment variable
- `SUPABASE_SERVICE_ROLE_KEY` — encrypted secret, server-only
- `ALLOWED_ORIGIN` — the deployed InviteStudio origin

For local Pages Functions development, copy `.dev.vars.example` to `.dev.vars`
and put the real service-role key there. Never commit `.dev.vars`.

The Supabase migrations must be applied before the API is deployed:

1. `202610210001_initial_schema.sql`
2. `202611030001_wedding_backend_foundation.sql`
3. `202611030002_anonymous_access_and_publishing.sql`
4. `202611030003_template_catalogue_compatibility.sql`
