// Renders each packaged template's cover with the real renderer and writes the catalogue thumbnails:
// assets/templates/<id>.png (a phone sized cover on a palette coloured card), assets/templates/<id>-wide.jpg (the artwork
// alone, for the template gallery, which overlays the couple's names itself) and assets/templates/<id>-phone.jpg (the cover
// as a phone shaped picture for the home page strip and the template detail page).
// Run `npm run thumbs:scenes` after changing a template's design or its catalogue entry.
// Exception: designs in SUPPLIED_WIDE have a finished picture (names included) made by the designer as their -wide.jpg. It is
// left alone here; replace the file itself to change it (and keep `fullArt` set for the design in figma/islands/shared.tsx).
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { readCatalogue } from './template-catalogue.mjs';
import { loadTemplates } from './build-templates.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPPLIED_WIDE = new Set(['cherry-blossom', 'cinematic', 'golden-butterfly', 'minimalist', 'bloom-reveal', 'under-the-same-moon', 'fairy-tale', 'lantern-night']);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const sample = {
  title: 'Daniel & Amelia', category: 'Wedding', date: '2027-01-21', location: 'Olare Kopje Camp, Maasai Mara, Kenya',
  sections: [{ id: 'hero', visible: true }], functions: [], photos: []
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, path === '/' ? 'blank.html' : path);
  if (path === '/' ) { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><body style="margin:0">'); return; }
  if (!file.startsWith(root) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// Packaged templates: the real renderer and the template's own stylesheet. The phone picture is the top of the
// page; the wide picture is the page's paper and botanical corners without text (the gallery adds the names).
const packaged = loadTemplates();
for (const t of readCatalogue().templates.filter(t => t.packaged)) {
  const thumb = packaged.find(p => p.manifest.id === t.packaged).manifest.thumbnail;
  const open = async (width, height, scale) => {
    // Reduced motion: the picture shows each design settled, never mid-animation. The template page's sample photographs
    // (showcase) fill the cover, as they do on the template page itself.
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
    await page.goto(`${base}/`);
    // The page's loader fetches the design, its CSS and the shared template code, as a visitor's page does.
    await page.addScriptTag({ url: `${base}/template-loader.js` });
    await page.evaluate(id => InviteTemplates.need({ id, packaged: id }), t.packaged);
    await page.evaluate(([project, template]) => { document.body.innerHTML = window.renderPackagedTemplate(project, template, { sample: true, showcase: true }); }, [sample, t]);
    await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(img => img.decode().catch(() => {}))]));
    await page.waitForTimeout(300);
    return page;
  };
  const phone = await open(360, 720, 2);
  await phone.addStyleTag({ content: thumb.phone });
  const phoneShot = await phone.screenshot({ type: 'jpeg', quality: 88 });
  writeFileSync(join(root, t.image.replace(/\.png$/, '-phone.jpg').replace(/^\//, '')), phoneShot);
  const cover = (await phone.screenshot()).toString('base64');
  await phone.close();
  const wide = await open(400, 275, 3);
  await wide.addStyleTag({ content: thumb.wide });
  // The gallery card writes the couple's names over this picture, so the picture carries no words of its own.
  await wide.addStyleTag({ content: 'h1,h2,h3,h4,p,time,address,blockquote,[class*="eyebrow"],[class*="kicker"],[class*="-sub"],[class*="date"],[class*="name"],[class*="amp"],[class*="tagline"]{visibility:hidden!important}' });
  const wideShot = await wide.screenshot({ type: 'jpeg', quality: 86 });
  if (!SUPPLIED_WIDE.has(t.packaged)) writeFileSync(join(root, t.image.replace(/\.png$/, '-wide.jpg').replace(/^\//, '')), wideShot);
  await wide.close();
  const card = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  await card.setContent(`<body style="margin:0;width:1000px;height:750px;background:${t.colors[0]};display:grid;place-items:center"><img style="height:640px;border-radius:28px;box-shadow:0 24px 60px #0004" src="data:image/png;base64,${cover}">`);
  writeFileSync(join(root, t.image.replace(/^\//, '')), await card.screenshot({ type: 'png' }));
  await card.close();
  console.log('thumbnail', t.id);
}
await browser.close();
server.close();
