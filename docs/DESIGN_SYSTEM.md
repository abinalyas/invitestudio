# InviteStudio design system (D1, for review)

Status: proposed foundation for review. Not final sign-off. Values marked **proposed** change
the export's tokens so that text and controls meet WCAG 2.1 AA. The reasons are measured below.

Source of truth: this document. The application's tokens are kept in sync with it when the
review is approved. Figma export values are shown as the baseline.

## 1. Principles

1. Couples customise content, not design. Components have few variants on purpose.
2. Calm and editorial: generous space, serif headings, quiet borders, soft shadows.
3. Every state is designed: default, hover, focus, active, disabled, loading, error, success.
4. Mobile first. Layouts are checked at 320, 375, 768 and 1280 px.
5. Accessible by default: AA contrast, visible focus, 44 px touch targets, labels on every control.

## 2. Colour tokens

| Token | Value | Use | Contrast (measured) |
|---|---|---|---|
| `--ink` | `#0b2f20` | Headings, primary text | 13.66:1 on cream |
| `--green` | `#145c37` | Primary buttons, active states | white on it 8.03:1 |
| `--green-dark` | `#083a23` | Pressed, dark panels | white on it 12.81:1 |
| `--pale` | `#f7f1e9` | Warm panels | ink on it 12.98:1 |
| `--cream` | `#fbf7f2` | Page background | |
| `--gold` | `#a67d24` | Decorative accents, rules, icons | 3.53:1 on cream: **decorative only** |
| `--gold-text` | `#86681c` (**proposed**) | Eyebrows and any small gold text | 4.91:1 on cream, 4.64:1 on ivory |
| `--muted` | `#79766f` (export) | Secondary text | 4.25:1 on cream: **fails AA for body text** |
| `--muted-text` | `#6b6760` (**proposed**) | Secondary body text | 5.27:1 on cream |
| `--line` | `#ded9d0` | Decorative dividers, card edges | 1.32:1: **decorative only** |
| `--line-strong` | `#8a8276` (**proposed**) | Input and control borders (WCAG 1.4.11, 3:1) | 3.56:1 on cream |
| `--danger` | `#9b5147` | Errors | 5.38:1 on cream |
| `--success` | `#2f6b45` (**proposed**) | Saved and published confirmations | checked on pale: see §10 |
| `--shadow` | `0 18px 50px rgba(37,46,37,.1)` | Floating panels | |

Template palettes are separate. Each template keeps its own curated palette inside the
invitation (see §8). They do not change the application's chrome.

## 3. Typography

- Headings: **Playfair Display** (500 and 600; 500 italic for emphasis).
- Interface and body: **DM Sans** (400, 500, 600, 700).
- Scale (desktop / mobile): display 64/40, h1 48/34, h2 36/28, h3 24/22, body 15/15, small 13/13,
  eyebrow 12/12 uppercase with 0.16em tracking.
- Line height: 1.5 for body, 1.1–1.2 for display.
- Minimum body size 15 px. Nothing functional below 12 px.

Template typography: each template chooses one of the two families and a size/tracking pair
from this scale. Templates do not add new font families (see §8).

## 4. Spacing, layout and breakpoints

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Container: 1120 px maximum content width; 16 px side gutter on phones.
- Breakpoints: 480 (phone), 768 (tablet), 1024 (laptop), 1280 (desktop).
- Section rhythm: 64 px vertical on desktop, 40 px on phones.
- Radii: 8 px controls, 12 px cards, 999 px pills.

## 5. Components and states

Each component is specified with every state it can be in.

| Component | Variants | States to design |
|---|---|---|
| Button | filled, outline, light, small | default, hover, focus-visible, active, disabled, loading |
| Text input / textarea | single, multi-line, date, URL | default, focus, filled, error (with message), disabled, read-only |
| Field group | label, hint, error text | required marker, helper text, error |
| Toggle (segmented) | monthly/yearly style | default, selected, focus, disabled |
| Checkbox / visibility switch | section visibility | on, off, focus, disabled |
| Status tag | Draft, Published, Unpublished, Design unavailable | one per status (colour plus text, never colour alone) |
| Save indicator | saving, saved, pending, retrying, conflict, failed, offline | each with an icon and text |
| Card | template card, website card | default, hover, focus, selected, unavailable |
| Modal | confirm, form, publish, delete | open, focus trap, error, busy, dismissed |
| Toast | success, info, error | auto-dismiss only for success; errors stay until dismissed |
| Inline alert | info, success, error | with and without action |
| Empty state | no websites, no events, no photos | illustrated motif, one clear action |
| Section kicker (eyebrow) | gold-text on cream | |
| Page header | with and without back link | |

Interaction rules:
- Focus is always visible (2 px outline in `--green`, 2 px offset).
- Touch targets are at least 44 px.
- Destructive actions use a confirmation dialog that names the item and states the outcome.
- Motion respects `prefers-reduced-motion`.

## 6. Motif library

Motifs are decoration at section edges and in template layers. They never carry information and
are `aria-hidden`.

| Motif | Source | Use |
|---|---|---|
| Botanical petals and leaves | Figma export (`.hero-petal`, `.hero-botanical`) | Home, empty states |
| Envelope and seal | Figma export (`.envelope`, `.seal`) | Home hero, publish confirmation |
| Card flowers | Figma export (`.card-flower`) | Template previews |
| Kasavu frame | Kerala review (`.motif-kasavu-frame`) | Kerala invitation hero (under review) |
| Lamp (nilavilakku) | Kerala review (`.motif-lamp`) | Kerala invitation hero (under review) |

Motif rules: one primary motif per screen; motifs stay at low contrast; no motif overlaps text.

## 7. Iconography

Line icons from the export's icon set (stroke 1.6–2, 18–22 px). One icon style only. Icons next to
text are decorative (`aria-hidden`) unless they are the only label, in which case they need text.

## 8. Template design specification

A template is data plus at most one motif. It is not a separate stylesheet.

| Property | Rule |
|---|---|
| Palette | Three curated colours (background, accent, text). Text colour must reach 4.5:1 on the background. |
| Typography | One family pair from §3, with a size and tracking pair from the scale. |
| Motif | Zero or one motif from §6, placed at the template's fixed slots. |
| Imagery | A stock or uploaded hero image (uploads wait for media storage). |
| Reveal | One animation from the existing set (fade, petals, curtain, and others). |
| Layout | Fixed section order from the renderer. Templates do not reorder sections. |

Customisation the couple may do: content, event details, section visibility, and choosing or
changing the template. They may not change a template's palette, typography, motif, layout,
reveal or section order (`docs/PRODUCT_DECISIONS.md`, section 5).

## 9. Template review status

| Design | Status | Notes |
|---|---|---|
| Kasavu Heritage (`kerala-kasavu`, Kerala) | Under review, rendered | Palette `#f7f1e1 / #b48a3a / #173f2e`. Button label needs the proposed `#7c5e1a` for AA. Richer border and typography to be explored. Not offered until approved. |
| The other 49 launch wedding designs | Registered, not individually reviewed | Review each against its rendered invitation (audit §5). |
| Figma mappings (8) | Mapping under review | See audit §5.1. Forest, Spring, Evening, Coastal and Modern Minimal are reasonable. Kerala, Lotus and Destination Hills need design. |

## 10. Accessibility checks

Measured with WCAG 2.1 relative luminance.

- `--success` `#2f6b45`: 5.65:1 on pale, 5.95:1 on cream, 6.34:1 on white, 5.31:1 on the sage
  tint `#e6ede2`. All pass AA for body text.
- `--muted-text` `#6b6760`: 5.27:1 on cream, 5.01:1 on pale, 4.71:1 on the sage tint.

Still to check before sign-off: the focus ring against every background, and the dark template
palettes (for example the black-tie design) for body text.

## 11. Extensibility rules

1. New components start from §5. A new variant needs a state list before design starts.
2. New tokens are added here first, with their contrast measured.
3. New templates use §8. A template that needs a new layout is a product decision, not a token change.
4. Occasions beyond weddings use the same components. Their motifs and designs are designed only
   when the occasion is opened for launch (`docs/PRODUCT_DECISIONS.md`, section 4).

## 12. Decisions for review

1. Approve the proposed token changes in §2 (gold text, muted text, control borders, Kerala button).
2. Approve the Kasavu Heritage direction (§9) and choose which richer treatment to explore next.
3. Confirm one motif per screen (§6), or allow two on the home page.
4. Confirm that template typography is limited to the two families (§3, §8).
