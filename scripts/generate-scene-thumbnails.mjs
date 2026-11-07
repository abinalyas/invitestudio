// Renders each scene template's cover with the real renderer and writes the catalogue thumbnail
// to assets/templates/<id>.png (a phone sized cover on a palette coloured card), plus
// assets/templates/<id>-wide.jpg: the artwork alone, without text, for the template gallery
// (the gallery overlays the couple's names itself).
// Run `npm run thumbs:scenes` after changing scene-templates.js, scene-templates.css or the catalogue entries.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { readCatalogue } from './template-catalogue.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' };
// Which band of the 720 unit tall artwork the wide thumbnail shows (top of the band).
const wideOffset = { savanna: 330, palmera: 340, lunaria: 100, curtain: 0 };
const sample = {
  title: 'Daniel & Amelia', category: 'Wedding', date: '2027-01-21', location: 'Olare Kopje Camp, Maasai Mara, Kenya',
  sections: [{ id: 'hero', visible: true }], functions: [], photos: []
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(root, path === '/' ? 'blank.html' : path);
  if (path === '/' ) { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/scene-templates.css"><script src="/scene-templates.js"></script><body style="margin:0">'); return; }
  if (!file.startsWith(root) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const scenes = readCatalogue().templates.filter(t => t.scene);
for (const t of scenes) {
  const page = await browser.newPage({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/`);
  await page.evaluate(([project, template]) => { document.body.innerHTML = window.renderSceneTemplate(project, template); }, [sample, t]);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const cover = (await page.locator('.sx-cover').screenshot()).toString('base64');
  await page.close();
  const wide = await browser.newPage({ viewport: { width: 400, height: 275 }, deviceScaleFactor: 3 });
  await wide.goto(`${base}/`);
  await wide.evaluate(([project, template]) => { document.body.innerHTML = window.renderSceneTemplate(project, template); }, [sample, t]);
  await wide.addStyleTag({ content: `.sx{max-width:none}.sx-cover{min-height:0!important;height:275px}.sx-cv-top,.sx-cv-mid,.sx-cv-bot,.sx-chev,.sx-emboss,.sx-hint,.sx-stage-content{display:none!important}.sx-art svg{height:800px;transform:translateY(-${Math.round(wideOffset[t.scene] * 800 / 720)}px)}` });
  await wide.evaluate(() => document.fonts.ready);
  writeFileSync(join(root, t.image.replace(/\.png$/, '-wide.jpg').replace(/^\//, '')), await wide.locator('.sx-cover').screenshot({ type: 'jpeg', quality: 86 }));
  await wide.close();
  const card = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  await card.setContent(`<body style="margin:0;width:1000px;height:750px;background:${t.colors[0]};display:grid;place-items:center"><img style="height:640px;border-radius:28px;box-shadow:0 24px 60px #0004" src="data:image/png;base64,${cover}">`);
  writeFileSync(join(root, t.image.replace(/^\//, '')), await card.screenshot({ type: 'png' }));
  await card.close();
  console.log('thumbnail', t.id);
}
await browser.close();
server.close();
