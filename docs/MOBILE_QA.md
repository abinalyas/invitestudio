# Phone QA

Most guests, and many couples, use InviteStudio on a phone. This page says how to check every screen and every design on small touch screens without testing them by hand, and what each check is for.

## Run the audit

```bash
npx wrangler pages dev . --port 8788 &     # any running copy of the site works
npm run audit:mobile                       # three phones, every screen that works without a database
```

Set `CHROMIUM_PATH` to use a Chromium that is already installed (sandboxes). Other options:

| Option | What it does |
|---|---|
| `--url https://<preview>.pages.dev` | Audit a preview deployment instead of the local copy |
| `--devices "iPhone 13,Pixel 7"` | Choose phones (names from Playwright's device list). Default: Galaxy S9+ (320 px wide), iPhone 13 (390), Pixel 7 (412) |
| `--only home,setup,editor Minimalist` | Only screens whose name starts with one of these words |
| `--cloud` | Also builds an invitation for every design, uploads four photos, publishes it, and counts how many photos the **public page** shows. Needs the cloud stack (below) |
| `--no-screenshots` | Skip the pictures (faster) |

It writes `mobile-audit/report.md` (findings grouped, worst first), `report.json` and one screenshot per screen and phone in `mobile-audit/screens/`. The folder is not committed. The command exits with 1 when there is a high-severity finding.

### The cloud stack (for `--cloud`)

```bash
PG_BIN_DIR=/usr/lib/postgresql/16/bin node tests/cloud/stack.mjs   # PG_BIN_DIR only if the embedded Postgres cannot run
npm run audit:mobile -- --cloud
```

It starts a throwaway Postgres, applies the migrations, and serves the site and the server functions on port 8788. It never touches a real project.

## What it checks, and why

| Finding | What it means for a person |
|---|---|
| `overflow-x` | The page is wider than the screen, so it wobbles or drags sideways |
| `tap-target` | Buttons or links under 40 px are hard to hit with a thumb |
| `tiny-text` | Text under 11 px is hard to read |
| `scroll-trap` | A big box scrolls by itself and does not pass the scroll on, with almost no space beside it. A finger on it cannot scroll the page |
| `frame-shape` | A phone preview that is nearly square looks like a tablet |
| `covering-bar` | A bar fixed to the screen covers a large part of it |
| `primary-far` | The main button (Continue, Start, Open editor) is more than a screen down and not pinned |
| `broken-image` | A picture did not load |
| `clipped-text` | A heading or button cuts its text off |
| `input-zoom` | A form field with text under 16px: iPhones zoom the page in when it is tapped, and do not zoom back out |
| `placeholder-cut` | A single-line field's hint is wider than the field and is cut off |
| `art-over-text` | A decoration (leaves, flowers) lies on top of text and hurts legibility |
| `zoom-blocked` | The page stops people from pinch-zooming (bad for low vision) |
| `published-404`, `slug-differs` (`--cloud`) | A page answered 404 right after "Your invitation is live", or the invitation was published at a different address from the one typed |
| `photos-missing` (`--cloud`) | The published page shows fewer photos than were uploaded |
| `console`, `failed-request` | The page logged an error, or a request failed |

It does not judge how a screen **looks** (spacing, balance, taste). Open the screenshots for that: the report links each screen. A full audit is worth reading by eye as well: the first full pass found leaf artwork running through a heading and a two-row tools bar that pushed the preview down, neither of which a rule can see. It also uses simulated phones, so check the real thing on a real phone before a release (iOS Safari and Chrome on Android differ in small ways).

## When to run it

- Before merging a change to a screen, a template or the setup steps.
- After adding a design: it is picked up automatically from `figma/islands/shared.tsx`.
- Against a preview deployment (`--url`) after a deploy.

## Tips

- Do not rebuild or edit the site's files while an audit is running: the audit reads them live, and a rebuild in the middle makes a few screens fail to open (`could-not-run`). Re-run those on their own.
- A full pass over both small phones (`--devices "Galaxy S9+,iPhone 13"`) takes about 20 minutes; the `--cloud` photo check about 20 more.
