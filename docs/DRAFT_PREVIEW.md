# Draft preview links

Couples can send a read-only link to their draft to family and friends before publishing, to get opinions. The page is
clearly marked as a draft, so it cannot be used as the real invitation, and it doubles as an advert for InviteStudio.

## What the couple sees (editor)

- In the **Share invitation** dialog, before going live: **Not ready yet? Show family first**, with **Get preview link**
  (then **Copy preview link**) and **Stop sharing** (asks first). After going live the card shows only while a link is still
  on, so it can be turned off.
- The "Share invitation" guide above the editor adds: "Want opinions first? Copy a draft preview link".
- It is not in the left panel: that panel is designed to fit a laptop screen without scrolling (`tests/e2e/panel-fits.spec.js`).
- Only for drafts saved online (the same condition as the private edit link and publishing).
- Copying sends any unsaved change first, so the link opens the draft as it is now. The link always shows the latest saved
  draft; it is not a snapshot.

## What someone opening the link sees (`/draft#<token>`)

- The draft, rendered with the same design as the live page.
- A banner at the top that stays in view: **Draft preview · Not the final invitation**, "details may still change, and
  replies open once it is published", and **Made with InviteStudio · Create your own, free** (links to the home page with
  `utm_source=draft-preview&utm_medium=banner&utm_campaign=share-draft`, so sign-ups from previews show in the visit statistics).
- A watermark over the whole page ("DRAFT PREVIEW · MADE WITH INVITESTUDIO", repeated diagonally). It ignores taps, so the
  invitation still works underneath, and it shows on light and dark sections (dark letters with a faint light outline).
- Replies cannot be sent: the page is not marked as a live invitation, so the reply form opens in its preview mode, which
  says replies open once the couple publishes.
- If the invitation is already published, the banner says it is an old draft and links to the live page.
- A wrong, expired or turned-off link: "This preview link is not working", with a way to make your own invitation.
- The page is never indexed (`X-Robots-Tag` and a robots meta tag, and `/draft` is in robots.txt). Its link preview
  (WhatsApp and so on) says only "Draft invitation preview — InviteStudio", never the couple's names.

## Rules

- **One link per draft.** Making a link turns off any earlier one. **Stop sharing** turns it off for everyone.
- **Lasts 30 days** (`PREVIEW_LINK_LIFETIME_DAYS`). The editor shows until when. A link within a day of expiring is replaced
  the next time the couple copies it.
- **It can never edit.** Preview tokens are stored in `edit_tokens` with `purpose = 'preview'` (allowed by the schema
  since the first migration, so no migration was needed). Edit access only accepts `purpose = 'edit'`.
- **The token stays secret from servers.** It is in the address fragment, which browsers do not send, and the page asks
  for the draft with the token in a POST body (`/api/draft-previews`), never in a URL. Only its SHA-256 hash is stored. The
  raw token is returned once, when the link is made; this device keeps it (`invitestudio-preview-links` in local storage,
  by draft) so the couple can copy the same link again.
- **Only public fields.** The answer is the same allowlisted projection a published page gets (`publicWeddingProjection`):
  no ids, tokens, private notes or hidden events.
- An invitation closed by the cleanup (`retention_hidden_at`) is closed for previews too.
- Deleting the draft deletes its preview links (the table cascades).

## Code

| Part | File |
|---|---|
| Token helpers | `functions/_shared/api.js` (`issuePreviewToken`, `revokePreviewTokens`, `requirePreviewToken`) |
| Make / stop a link (edit token required) | `functions/api/weddings/[id]/preview-link.js` (`POST`, `DELETE`) |
| Open a draft by its link | `functions/api/draft-previews/index.js` (`POST { token }`) |
| The `/draft` page shell | `functions/draft.js` |
| Banner, watermark, error states | `public-invitation.js` |
| Copy / stop, and the Share dialog card | `cloud-sync.js` (`copyDraftPreviewLink`, `stopDraftPreviewLink`, `paintPublishDialog`) |
| Share guide link | `figma/islands/Editor.tsx`, `figma-host.js`, `figma/islands/bridge.ts` |
| Tests | `tests/cloud/draft-preview.spec.js`, `tests/unit/api.test.mjs` |
