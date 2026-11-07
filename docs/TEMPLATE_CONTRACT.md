# Template contract (draft for review)

Status: **draft, for review. Nothing in the app changes with this document.**

This describes how fully designed website templates (the four reference designs below, and later ones)
become editable in InviteStudio, and how we keep every template looking its best while couples only
change their content.

Scope decisions already made (from the product owner):

- The four reference templates are the launch set, with the fairy tale one last.
- Fewer than 10 templates in total, so manifests stay small and hand-written.
- A template always looks its best: couples change content and photos, never layout (this extends
  `docs/PRODUCT_DECISIONS.md` section 5).
- A missing photo gets a tasteful designed fallback, not an empty hole and not a stock photo of strangers.
- No Malayalam or other non-Latin text in names or venues for now.
- The time zone is fixed to India for now. A time zone choice comes later, and nothing in this contract should
  need to change when it does.

## 1. Principles

1. **Content and design are separate.** Content is what the couple provides. Design is what the template does with it.
   The same content must work in every template.
2. **One content model for all templates.** A template may use less of it. It may not invent fields of its own.
   Anything a template needs that is not in the model is either a new field for everyone, or template copy (section 6).
3. **Templates are curated.** A template decides its own layout, order, colours and fonts. Couples can show or
   hide the optional sections the template offers, and nothing else about the layout.
4. **Never invent facts.** No made-up times, venues or names. When something is unknown the template shows its own
   "to be announced" wording, or the row disappears.
5. **Platform-owned behaviour, template-owned looks.** Countdown, menu, scroll reveals, the RSVP form and the map link
   are built once and styled by each template. A template never ships its own script.
6. **The preview and the published page are the same code path**, as they are today, so they cannot differ.

## 2. The reference templates

| | Fairy tale ("Once Upon Our Forever") | Cinematic | Minimalist | Modern heritage |
|---|---|---|---|---|
| Source | 1 HTML file, inline CSS and JS | HTML, CSS, JS | HTML, CSS, JS | HTML, CSS, JS |
| Imagery | 6 MB of PNG artwork, no photos | 4 photos used in 8 places | 4 photos (hot-linked) | 7 SVGs and a paper texture, no photos |
| Style | Pastel, script type, layered artwork | Dark, film-like, full-bleed photography | Light, editorial, large serif type | Ivory, forest green, botanical stationery |
| Opening | Intro screen ("Enter our fairytale") | None | None | Announcement bar |
| Led by | Art | Photos | Photos | Art |
| Fonts | Cormorant Garamond, DM Sans, Great Vibes | Cormorant Garamond, Manrope | DM Serif Display, Inter | Cormorant Garamond, Libre Baskerville |
| Special behaviour | Petals while scrolling, auto-closing intro | Scroll reveals | Sticky header | Scroll reveals |

## 3. Content model v1

Every field below is what the couple provides, or what is derived from it. "Today" says where it lives now.

| Field | Format | Today | Change needed |
|---|---|---|---|
| Names | One text field, for example `Meera & Abin` | `title` (and `name`) | None to storage. **Derive** `first`, `second` and `connector` by splitting on the first ` & ` or ` and `. A single name (a celebration title) must work in every template. |
| Date | `YYYY-MM-DD` | `event_date` | None. Each template picks how to show it (see section 3.1). |
| Venue | `Venue, Town, Region` text | `location` | **Derive** `venue` (first part) and `place` (the rest). Optional map link: the first event's directions link, else a map search built from the location. |
| Hosts line | One short line | `hosts` | None. Templates show it as "Together with their families" style text. |
| Welcome note | Short text | `message` | None. |
| Story | Paragraphs | `story` | None. |
| Story heading | Short text | `preferences.storyTitle` | None. |
| Events | List of title, date, time, end time, venue, description, dress code, directions link, parking, stays, access, visible | `functions` (in `content`) | None. A template shows the first N it has room for, and the editor says so. |
| Photos | Library of images, each with alt text | `content.gallery.photos` (up to 4, local only for now) | **Photo storage** and more than 4 photos (section 5). |
| Template copy | Section titles, kickers, hero headline, sign-off, closing line | Not stored | **New**: `content.copy`, a map of copy keys to text (section 6). |
| Section visibility | Show or hide per section | `sections` | Registry gains new section ids (section 4). |
| Guest responses | Name, attending, guests, dietary note, message | `preferences.rsvp` (a mode only) | Built in the RSVP phase. Until then every template shows "Guest responses are not open yet". |

### 3.1 Date and time

- Store one date, as today. Events may carry a time of their own.
- The countdown target is the first visible event that has a time, else **00:00 on the date**, in `Asia/Kolkata`.
  A `timezone` value will be added later (default `Asia/Kolkata`). The widget takes a time zone as input from day one,
  so nothing needs to change when it is added.
- Formats a template may ask for: weekday, day, day with zero, month name, month number, year, in upper or normal case.
  Examples seen in the references: `24 AUGUST 2027`, `August 24, 2027`, `24 · 08 · 2027`, `24.08.2027`, a large `24`.
- No template may hard-code a date or a time. (Today each one does, and one counts down to an invented 10:00 AM.)

### 3.2 Names

- The "&" is the template's to style. Templates that put the names on two lines break after the connector.
- Initials for monograms are derived from the names. The references bake `M`, `A` and the date into SVG files
  (`monogram.svg`, `wedding-crest.svg`, `wedding-stamp.svg`, `envelope.svg`). Those become templated SVGs that
  take initials, names and date, so they update when the couple edits.

## 4. Sections

The registry today has `hero`, `welcome`, `story`, `functions`, `gallery`, `rsvp` and custom text sections.
The references need three more.

| Section id | Reads | Required | Empty rule |
|---|---|---|---|
| `hero` | names, date, venue, hosts line, hero headline, cover photo, countdown (optional) | Yes | Cover falls back (section 5.3) |
| `welcome` | welcome note, signature | No | Hide |
| `story` | story heading, story, story photos | No | Hide when there is no story |
| `countdown` **new** | date, time zone | No | Hide when there is no date |
| `functions` | events | No | Hide when there are no events |
| `venue` **new** | venue, place, map link, venue photo | No | Hide when there is no venue |
| `gallery` | photos with captions | No | Hide when there are no photos |
| `rsvp` | RSVP settings | No | "Guest responses are not open yet" until the RSVP phase |
| `closing` **new** | names, date, closing line | Yes | Names only |

Templates may split one section across the page (for example the countdown inside the hero, or a date block in the
details). A template's manifest says which section ids it has and in which order.

## 5. Photos

### 5.1 Slots

A template does not have a "gallery". It has **photo slots**, named places where a photo goes.

| Template | Slots in the reference |
|---|---|
| Cinematic | `cover`, `story`, `banner`, `venue`, and 4 gallery tiles of different shapes (large, tall, small, wide). The 4 photos fill 8 places. |
| Minimalist | `cover`, `story-1`, `story-2`, `banner` |
| Fairy tale | None (art only). 5 art tiles in the gallery. |
| Modern heritage | None. An empty "memories to come" band. |

Each slot in a manifest has: an id, the section it belongs to, an aspect ratio, whether a caption shows, and what to show
when it is empty (section 5.3).

### 5.2 Assignment

- The couple uploads photos once, to a library.
- Photos fill the slots in order, matched by shape (a landscape photo goes to a wide slot, a portrait to a tall one).
  The couple can drag a photo to another slot, and can pick a focal point for the crop.
- **The same photo may fill several slots** (the cinematic reference does this). If there are fewer photos than slots,
  the template's reuse order decides, and slots with a fallback use it.
- Alt text and an optional caption are per photo.
- Limits to decide: library size (the data model today allows 4) and the largest image (today 1 MB, in the browser).
  Real storage, resizing to WebP and a size cap come with the photo storage work.

### 5.3 Fallbacks (the "tasteful fallback" decision)

A slot declares one of these for when it is empty:

| Fallback | What the guest sees | Used for |
|---|---|---|
| `backdrop` | A designed background from the template's palette (gradient, paper texture, soft light), with the couple's monogram or line art on it | The cover of photo-led templates (cinematic, minimalist) |
| `art` | The template's own illustration | Art-led templates, and decoration in photo-led ones |
| `shrink` | Fewer tiles, laid out for the number of photos that exist | Collages |
| `hide` | The slot, or the whole section, is not rendered | Banners, story photos, galleries |

Rules:

- **Stock photos of other people never appear on a published page.** The references use them (Unsplash photos of
  couples). They may appear in gallery thumbnails and sample previews only.
- **Editor-only hints.** In the editor preview, an empty slot shows a dashed "Add photo" hint. The hint is never published.
- Every photo-led template must have a designed `backdrop` for its cover, reviewed like any other part of the design.
- A template may declare a section as needing a minimum number of photos. With fewer, the section hides instead of
  looking sparse.

## 6. Template copy

Each template has its own voice: "Will you join us?", "Save your place", "Once Upon Our Forever", "A gathering of hearts".
These are **copy keys** with defaults in the manifest. The couple can override any of them in the editor
(stored in `content.copy`), and the editor shows the default as a hint, like the field hints it has today.

Examples of keys: `hero.headline`, `story.kicker`, `story.title`, `story.signoff`, `functions.title`,
`functions.unknownTime`, `venue.title`, `rsvp.title`, `rsvp.intro`, `closing.line`.

Rules:

- Copy defaults must be true for any couple. No names, places or dates inside default copy except through placeholders
  such as `{names}` and `{date}`.
- "Time unknown" and similar wording is a copy key per template (the references use "TIME TO BE ANNOUNCED",
  "COMING SOON", "DETAILS TO FOLLOW" and "TIME TO BE CONFIRMED").
- Copy is text only. The editor limits its length so it cannot break the design.

## 7. Manifest format

One small JSON file per template. This is the shape (the values are for modern heritage and are a sketch).

```json
{
  "id": "modern-heritage",
  "version": 1,
  "name": "Modern Heritage",
  "style": "Botanical",
  "led": "art",
  "tokens": { "background": "#f4eedf", "ink": "#433b32", "accent": "#34493a", "gold": "#a58b62" },
  "fonts": ["Cormorant Garamond", "Libre Baskerville"],
  "sections": [
    { "id": "hero",      "optional": false, "includes": ["countdown"] },
    { "id": "story",     "optional": true },
    { "id": "functions", "optional": true, "variant": "timeline", "max": 3 },
    { "id": "venue",     "optional": true, "variant": "card" },
    { "id": "rsvp",      "optional": true },
    { "id": "gallery",   "optional": true, "variant": "memories-band", "whenEmpty": "art" },
    { "id": "closing",   "optional": false }
  ],
  "slots": [],
  "copy": {
    "hero.headline": "Together with their families",
    "story.title": "Our Story",
    "functions.title": "A Day to Remember",
    "functions.unknownTime": "Coming soon",
    "rsvp.title": "Will you join us?",
    "closing.line": "Back to the beginning"
  },
  "intro": null
}
```

What the manifest controls:

- Which sections exist, their order and whether the couple may hide them.
- How many of a repeating thing it has room for (`max`), and the layout it uses for it (`variant`).
- Its photo slots (empty here), with their fallbacks.
- Its copy keys and defaults.
- Its fixed palette and fonts. There is **no palette or font editor for couples**.
- Whether it has an opening screen (the fairy tale one does).

The editor builds its panels from the manifest: it shows only the sections, photo slots and copy keys that template has.

## 8. Template package

```
templates/<id>/
  manifest.json
  template.html     markup with placeholders and data-* markers
  template.css      all rules scoped under one root class
  sample.json       the demo content (Meera & Abin) used for previews and thumbnails
  assets/           images (WebP), SVGs, self-hosted fonts
```

### 8.1 Markup conventions

- `data-field="names.first"` marks text filled from the content model. `data-copy="rsvp.title"` marks template copy.
  `data-slot="story-1"` marks a photo slot. `data-section="story"` marks a section (the editor already uses
  `data-section` to select a section when the preview is clicked).
- Photos go in as `<img>` with the slot's alt text. If a design needs a CSS background (the cinematic hero does), the
  slot sets a CSS variable instead.
- `data-widget="countdown"`, `"map"`, `"rsvp"` and `"menu"` mark where a platform widget goes.

### 8.2 Rules for template CSS and markup

1. Every rule is scoped under the template's root class. **No `body`, `html`, `:root` or global heading rules.**
   Tokens are CSS variables set on the root.
2. **No `100vh` or fixed positioning.** Inside the editor's device frame, viewport units measure the browser, not the frame.
   Use the root's own height, `sticky`, or container units.
3. **No in-page `#section` links.** Use `data-scroll-to="story"`, which the platform scrolls within the frame.
4. **No scripts, inline or linked.** Behaviour comes from the platform's shared widgets.
5. **No external hosts:** no Google Fonts links, no hot-linked images, no iframes. Fonts are self-hosted (WOFF2).
6. Responsive at 360, 768 and 1280 pixels, with a reduced-motion variant for every animation.
7. Contrast must pass the same checks the app's design tokens use.
8. Every couple-supplied value reaches the page escaped. Links are limited to safe schemes.
9. Weight budget: images in WebP, lazy-loaded below the fold, and a page weight limit per template (to be set from the
   first converted template). The fairy tale reference is 6 MB of PNG today.
10. No leftover placeholders: no `[Reception venue]`, no "replace before publishing" notes, no invented times.

## 9. Platform-owned behaviour

| Widget | Behaviour |
|---|---|
| `countdown` | From the date and time rule in section 3.1. Shows "Today is the day" afterwards. Hidden with no date. |
| `menu` | Header navigation generated from the sections that are shown. Mobile menu toggle. |
| `reveal` | Scroll reveals, off for reduced motion. |
| `map` | A "Get directions" link by default. An embedded map is **not allowed by the site's security policy today** (frames are blocked). Options: keep link-only, or add click-to-load embedding with a policy change. Decision needed. |
| `rsvp` | One form for all templates, styled by the template. Fields follow the product decision: name, attending, number of guests (limit set by the couple), dietary note, message. Not open until the RSVP phase. |
| `intro` | Only templates that declare one. It maps onto the existing intro settings (enable, skip) so the couple can turn it off. |

## 10. The four templates mapped to the contract

### 10.1 Modern heritage (pilot)

- Sections: `hero` (with `countdown`), `story`, `details`, `functions` (timeline of 3), `venue` (card), `rsvp`, `gallery`, `closing`.
  The "details" band (date, ceremony, time) is a layout of `venue` and `functions` data, not a new section.
- Photo slots: none. The gallery is an art-led "memories to come" band that hides until photos exist.
- Conversion work:
  - Template the four SVGs that contain the couple's initials, names and date.
  - The church line art is specific to this venue. Make it optional decoration, or replace it with a neutral illustration.
  - Replace the announcement bar and other fixed sentences with copy keys.
  - Replace the `mailto:` RSVP with the shared widget.
  - Drop the Google Fonts link (self-host).
  - Drop the hard-coded date and venue everywhere, including the metadata at the top.
- Needs no photo storage, which is why it goes first.

### 10.2 Minimalist

- Sections: `hero` (cover photo), `countdown`, `welcome` ("Two lives. One beautiful promise."), `story` (2 photos), date block, `gallery` (one banner), `functions` (list of 2), `venue` (map and link), `rsvp`, `closing`.
- Photo slots: `cover`, `story-1`, `story-2`, `banner`.
- Fallbacks: `cover` uses a `backdrop` with the monogram. `story-1` and `story-2` hide the photo column and set the text full width. `banner` hides.
- Conversion work: remove the Unsplash hot-links, replace the map iframe, replace the RSVP form, self-host the fonts, replace the 10:00 AM countdown time.
- Needs photo storage.

### 10.3 Cinematic

- Sections: `hero` (cover photo), `welcome` (the opening note), `story`, a wide photo banner, `gallery` (4 captioned tiles), `countdown` (with large date), `functions` (3 rows), `venue` (photo, map link), `closing` with RSVP link.
- Photo slots: `cover`, `story`, `banner`, `venue`, and the 4 gallery tiles, which reuse photos.
- Fallbacks: `cover` and `banner` use a dark `backdrop`. The gallery uses `shrink` and hides under 2 photos. `venue` photo hides.
- Conversion work: the hero and date images are CSS backgrounds (use slot variables), remove the "Venue image is a temporary visual reference" note, the map iframe, the `mailto:` RSVP, the Google Fonts link.
- Needs photo storage.

### 10.4 Fairy tale (last)

- Sections: intro screen, `hero` (headline, names, countdown), `story`, `functions` (2 event cards), `gallery` (5 tiles), `rsvp`, `closing`.
- The hero headline "Once Upon Our Forever" is template copy (`hero.headline`), and the names sit below it.
- Photo slots: the 5 gallery tiles, hidden until there are photos. The artwork around them stays.
- Conversion work: convert about 6 MB of PNG artwork to WebP, move the inline CSS and JS out, map the intro screen to the intro settings, keep the petals as a platform `reveal` variant (off for reduced motion), remove `[Reception venue]` (an unknown reception row must disappear), fix the hero's stray inline style, drop Google Fonts (self-host Great Vibes too).
- Art assets include "soft edge remnants" per its own README, so each crop needs a visual check.

## 11. Platform changes this implies (no implementation here)

- **Content model:** parse names, venue and map link as derived values; add `content.copy`; add the `countdown`, `venue` and `closing` section ids.
- **Photos:** real storage, resizing, a library with slot assignment, and photos on the public page (today the public page leaves photos out).
- **Editor:** panels generated from the manifest; a Photos panel by slot; copy overrides with default hints; click a photo in the preview to replace it.
- **Renderer:** a template loader that produces the same output for the editor preview and the public page. The existing scene template renderer is the model (it takes a project and a template and returns scoped markup).
- **Catalogue:** each template still needs its catalogue entry, a row in `public.templates` (a migration), an entry in the server allow-list, a thumbnail and a phone cover, as for the four scene templates.
- **Security policy:** unchanged unless we choose click-to-load map embeds. Google Fonts are allowed today but should be self-hosted anyway.
- **Not needed:** database changes for the first templates. `content` is a free-form JSON column.

## 12. Quality gate

Run automatically for every template, in CI, on its `sample.json` and on edge cases:

1. Full content, names only, and maximum content (long names and venue, 12 events, long story).
2. No photos, one photo and a full set.
3. Widths 360, 768 and 1280.
4. No requests to any host except our own.
5. No global CSS leaks (the editor and public page are unchanged by the template being loaded).
6. Contrast, weight budget and reduced motion.
7. Screenshot comparisons against the approved design, reviewed by a person when they change.

## 13. Order of work

1. **This document** reviewed, with the open points below decided.
2. **Pilot: modern heritage.** Registry additions, derived names and venue, the countdown and RSVP-not-open widgets, the manifest, a minimal manifest-driven editor, and the quality gate.
3. **Photo storage and slots**, in parallel with 2.
4. **Minimalist**, then **cinematic**.
5. **Fairy tale.**
6. Later: time zone choice, and couple-visible layout variants if ever wanted.

## 14. Open points

- **Map:** link only, or click-to-load embed (needs a security policy change)?
- **Church illustration:** keep as optional decoration, or replace it with a neutral one?
- **Library size and image limits:** how many photos, how large?
- **Copy limits:** how long may each copy key be?
- **Names with "&" inside a single name** (for example a business or a family): do we need a manual "second name" field?
- **Reception row:** should a template list a reception only when the couple adds one, or does a template always offer a reception slot?

## 15. Pilot findings (Modern Heritage, implemented)

The first template is built to this contract; what changed against the plan:

- **Package**: `templates/modern-heritage/{manifest.json,template.html,template.css,sample.json,assets/}`. `npm run build:templates` writes `templates/templates.generated.js` and the inline `packaged-templates-css` block in `index.html` (same reason as the scene CSS: the editor preview is a shadow root). Renderer: `packaged-templates.js`. Shared behaviour: `template-widgets.js` (countdown, menu, scroll-to).
- **The designer writes ordinary page CSS and markup.** The build scopes every selector under `.tpl-mh` and prefixes every class (`.button` becomes `.mh-button`). The prefix matters: the editor copies the app's own styles into the preview, and generic names such as `.eyebrow` or `.hero-copy` were picking up their rules.
- **Container queries, not media queries**: `@container` and `cqw` replace the reference's `@media` and `vw`, so the phone frame in the editor lays out like a real phone. `position: fixed` and `100vh` are not used. The root uses `overflow: clip` so the sticky header still works.
- **Baked-in text in artwork is templated**: the monogram, crest and stamp SVGs are inline and take initials, the numeric date and the names. The church line art is replaced by the stamp (a church only fits one couple).
- **Sections**: the venue card is part of `welcome` (with the details band). `story`, `functions` and `gallery` are left out when empty; so are the countdown (no date) and the directions button (no place). Menu links follow what is shown.
- **RSVP**: the reference's mail form is replaced by a "not open yet" note until responses exist.
- **Wording**: `content.copy` is stored, validated (key pattern, 300 characters, 60 keys) and returned on the public page. Each manifest copy key carries a `section`, and the editor shows a "Wording" panel per section. Empty wording means the template's own text.
- **Not in the pilot**: scroll-reveal animations, photo slots (gallery shows the couple's photos in a plain grid), time zones (the countdown counts to local midnight of the date), map embeds (link only).
- **Colours**: the reference's gold and muted text failed 4.5:1 on ivory, so text colours were darkened; the quality gate (`tests/unit/packaged-templates.test.mjs`) checks every text/background pair, scoping, markup safety, escaping, the minimal-content and long-name cases, and that the built files are current.

### 15.1 Second template: Minimalist (implemented)

Built with the same pipeline and no changes to the contract, which showed the photo rules work:

- **Photo-led, but never photo-dependent.** The reference's cover photo, two story photos and gallery banner are stock photos of other people, which never ship. The cover uses the `backdrop` fallback (a tonal panel with the couple's initials and date); if the couple has a photo it becomes the cover and the rest go to the gallery. Story photos are dropped (`hide`) and the story is set as text. The gallery appears only when there are photos beyond the cover.
- **Map embed** replaced by a typographic place panel plus the directions link (the CSP blocks map frames).
- **Per-template data moved into the manifest**: `heroPhoto`, `contrast` (text/background pairs the quality gate checks, which must be colours the stylesheet uses) and `thumbnail` (how to crop the picture shown in the gallery).
- **Wording** is the same mechanism (`content.copy`); the section tags that carried numbers ("01 — Our story") lost them because sections can be hidden.
