# Protecting the templates

Anything a browser shows can be copied, so this is about making copying harder, easy to prove and legally actionable. It does not make copying impossible. The real value is the service around the templates (editor, hosting, replies, payments), which a copied page does not have.

## What is in place

1. **Terms.** The Terms of use have "Our templates and designs" and "Copies of our templates": templates are licensed only for an invitation built on InviteStudio; no copying, extracting, re-hosting, scraping or building a competing library. The Contact page has "Report a copy of our templates". (This is plain wording, not legal advice: have a lawyer read it when you can.)
2. **Copyright notices.** Every footer says the templates and designs are protected by copyright. The template scripts, styles and every design bundle in `templates/dist/` start with a licence notice, and so does `index.html`.
3. **Other sites cannot embed our artwork.** `_headers` sends `Cross-Origin-Resource-Policy: same-site` for the artwork, fonts, hero pictures, samples and music, so a browser refuses to show them on another site. The production files in `templates/<id>/assets/` and the music are also kept out of search (`X-Robots-Tag: noindex`). The small gallery previews in `assets/templates/` stay open to search engines, which show them as thumbnails.
4. **A hidden marker in every design.** Each rendered invitation starts with an HTML comment such as `<!-- © InviteStudio · template velvet-reveal · ref is-1a2b3c4d · licensed for use on InviteStudio only -->` (`templateMark()` in `index.html`). The `ref` is fixed per template. A page saved or copied from an invitation normally keeps it. The designs also use their own class names (for example `tpl-vr`), which are just as telling.

## Finding a copy

Search for the marker and the class names, for example:

- `"licensed for use on InviteStudio only"`
- `"ref is-"` together with `InviteStudio`
- the template's class prefix from `templates/<id>/manifest.json` (`prefix`)
- an image search on a gallery preview (`assets/templates/<id>-phone.jpg`)

## When you find one

1. Save the page and its address, with the date, as evidence.
2. Find the host (the site's footer, or a "who hosts this" lookup) and send their abuse or copyright contact the address of the copy, the address of the original (`https://invitestudio.co/templates/<number>`), and a short statement that the design is yours and used without permission. Most hosts and marketplaces have a copyright form.
3. Search engines have a removal form for copied pages.

## Steps in the Cloudflare dashboard (not in the code)

These need the account, so they are yours to switch on:

- **Hotlink protection** (Scrape Shield): turn it on for the domain, so other sites cannot load our images from the server side either.
- **Rate limiting**: add a rule on `/assets/*` and `/templates/*/assets/*`, for example 100 requests per minute per visitor, to slow down bulk downloading.
- **Bot Fight Mode** (Security, Bots): turn it on for the domain.

## Not done, on purpose

Code obfuscation, blocking right-click or "save image", and similar tricks. They annoy honest visitors and do not stop anyone who knows the browser's developer tools.

5. **Only the design a page needs is sent.** Designs load on demand (`template-loader.js`, `templates/dist/<id>.js`). A visitor to one invitation downloads that design and the shared template code, not the whole library; the home page and the gallery download no design at all. There is no longer one file that holds every design. A published invitation's page names its design in a `<meta name="invitestudio-template">` tag so the browser fetches it at once.
