# D0 defects: reproduction, fix and evidence

Approved in `docs/PRODUCT_DECISIONS.md`, section 6. Each defect was reproduced before its fix,
and each fix has regression tests in `tests/cloud/regressions.spec.js` and
`tests/unit/defects.test.mjs`.

## Defect 1: intro media can break saving

**Reproduction (browser, before the fix).** A 800 KB intro image was uploaded through the
Theme tab. The upload was accepted on the client (limit 900,000 bytes) and stored on the
device as a base64 data URL in `introSettings.image`. The next save sent that data in the
PATCH body, which was about 1.09 MB. The API limits request bodies to 1 MB, so the save was
rejected. The server version stayed at 2, and every later save of the draft was blocked.

**Cause.** `cloudPayload` sent `introSettings` (and `preferences`) unchanged. Media was
stored inside invitation JSON, which the architecture forbids, and nothing checked its size.

**Fix.**
- Intro image and intro music uploads are locked (disabled), with the note "Coming with
  media storage". Hero image customisation is locked the same way.
- The client never sends data URLs or the hero image preference. Media already on a device
  stays there, and a server merge keeps it.
- The server refuses data URLs in any JSON field (422, with a message) and refuses an
  oversized field with a clear limit (422, not a generic 413).
- Saving a draft that holds legacy media now removes the media from the server copy.

**Tests.** A locked-controls test; a legacy-media test (1.1 MB on the device, save succeeds,
server copy has no media, local copy keeps it); a server test refusing media (422); unit tests
for nested data URLs, oversized fields and ordinary settings.

## Defect 2: template selection is not explicit

**Reproduction (code, before the fix).** Two cases.
- The frontend `tpl(id)` returned the first catalogue design (`templates[0]`) for any
  unknown ID. A website with an unavailable design was drawn as "Timeless Romance", with no
  indication of the mismatch.
- The server accepted any active database template, including non-wedding designs such as
  `birthday`. Launch scope is weddings only, so those should be refused.

**Correction to the audit.** `docs/DESIGN_COVERAGE_AUDIT.md` said about 47 database templates
had no frontend design. That was wrong: it came from an extraction that read 37 of the 94
catalogue designs. Every seeded database row has a catalogue design. Ten "starter" designs
for non-wedding categories have no database row, and they are not launch designs.

**Note on an earlier test.** The first reproduction test used `south-temple` as an
"unregistered" design. It is a valid wedding design, so that test was wrong and was
corrected to use real cases.

**Fix.**
- `scripts/template-catalogue.mjs` reads the catalogue exactly as the browser builds it.
  `scripts/generate-template-registry.mjs` (`npm run gen:templates`) writes
  `functions/_shared/templates.js`: the 50 wedding designs. A unit test fails if the
  registry is out of date.
- Create and template change accept only registered designs (422 `Choose an available
  design.`). Publishing refuses a wedding whose design is no longer registered (422
  `TEMPLATE_UNAVAILABLE`).
- `tpl(id)` returns an explicit "Design unavailable" entry, not another design. The renderer
  shows "This design is no longer available" with a way to choose a template, and the
  invitation is not drawn.
- Launch scope: the occasion tiles, the setup category picker and the event-category select
  now list weddings only. The home occasion strip is removed (the component stays for later).

**Tests.** API refusals for `birthday` and a starter; a unit test that the registry equals the
catalogue; a unit test that the eight Figma designs are registered; a browser test that
`tpl()` reports an unknown design as unavailable; a browser test that a website with an
unavailable design shows the explicit message.

## Defect 3: projects cannot be deleted

**Reproduction (browser and API, before the fix).** `DELETE /api/weddings/:id` returned 405.
The dashboard had no delete action.

**Cause.** No delete route existed, and no delete action existed in the dashboard.

**Fix.**
- `DELETE /api/weddings/:id` requires the website's own edit token (401 without a token, 403
  with another website's token). It returns 204.
- The cascading foreign keys remove the private links, photo records, events, payments and RSVPs.
  The public address stops working at once.
- Stored files: none exist yet (no media storage). The route is the place where stored files
  will be removed in Phase 5.
- The dashboard's Delete action asks for confirmation. Keeping the website changes nothing.
  Deleting it removes the cloud copy first, then this device's copy, token and draft
  reference, and pending saves. If the server refuses, nothing is removed on this device.
- If this device does not hold the website's private link, the delete is refused with an
  explanation rather than leaving an orphaned cloud copy silently.

**Tests.** Deletion with the token (204, gone, no tokens left); deletion without or with
another website's token (401/403); the public page is 404 after deletion; the dashboard shows
Delete; an end-to-end browser test deletes a website through confirmation and checks that
the database row and the local copy are gone.

## Verification summary

| Suite | Result |
|---|---|
| `npm run test:unit` | 20 / 20 |
| `npm run test:qa` | 46 / 46 |
| `npm run test:e2e` (local) | 10 / 10 |
| `npm run test:cloud` | 60 / 60 |
| `npm run check:figma` | clean |

## Not fixed here (recorded for later phases)

- Hero and intro media need persistent media storage (Phase 5).
- Stored files are not yet removed on deletion, because none are stored.
- Settings for palette, typography, custom sections and RSVP mode remain in the advanced
  editor until the D3 customisation work removes them (see `docs/PRODUCT_DECISIONS.md`, section 5).
