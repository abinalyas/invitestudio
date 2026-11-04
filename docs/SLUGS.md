# Web addresses (slugs): verification and behaviour

Verified against the code before any change. Only the missing parts were implemented.

| Capability | Status before this change | Where |
|---|---|---|
| Suggested address generated from the title | Existed (client) | `cloud-sync.js` `suggestSlug` |
| Couple can edit the address before publishing | Existed | publish dialog input |
| Format and reserved-word validation | Existed (server and client) | `functions/_shared/api.js` `RESERVED_SLUGS`, publish route |
| Duplicate detection | Existed, at publish time only (409 `SLUG_CONFLICT`) | publish route |
| Address preserved when editing content | Existed (the address is not a writable field) | `allowedFields` in `api.js` |
| Unique public URLs and the public renderer | Existed, unchanged | `/s/<slug>`, `functions/s/[slug].js` |
| Live availability check while typing | **Added** | `GET /api/weddings/:id/slug-availability` |
| Suggested alternatives when taken | **Added** (up to three, `slug-2`…`slug-8`) | availability endpoint and dialog |
| Explicit change of a live address | **Added**, guarded | publish route `confirmSlugChange`, dialog |
| Silent breaking of a live link | **Removed**: a change now needs confirmation and warns that the old link stops working | publish route, dialog |

## Behaviour

- **New invitation.** The address starts as a suggestion from the title. The couple can edit it.
  While they type, the address is checked after a short pause. Publish stays disabled until the
  address is free and the latest changes are saved.
- **Taken address.** The status says it is already in use and offers up to three free alternatives.
  Choosing one checks it again.
- **Own address.** The live address of the same invitation counts as available to it.
- **Editing content.** Changing the title, details or sections never changes the address.
- **Changing a live address.** "Change web address" opens a warning. The old link will stop working,
  so guests need the new link. Publish stays disabled until the warning's checkbox is ticked. The
  server also refuses the change without `confirmSlugChange` (409 `SLUG_CHANGE_CONFIRMATION_REQUIRED`).
- **No redirect.** The old address is not redirected, to avoid keeping an address reserved
  indefinitely. This is a product decision to confirm.

## Security

The availability endpoint requires the website's edit token. An anonymous visitor cannot use it to
probe which addresses exist.
