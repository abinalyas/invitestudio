// Records each packaged design's real opening as a vertical (9:16) clip for Instagram Reels, Stories, Pinterest and WhatsApp status.
// Uses the same renderer as the thumbnails script, with animation on. Each design's own fictional sample couple (templates/<id>/sample.json) and the sample photographs, never real people.
// Usage: node scripts/record-openings.mjs [raw-output-dir] [design-id ...]   then see marketing/README.md for the ffmpeg step.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
// Prefer the machine's global Playwright (it ships its own video encoder); fall back to the project's copy.
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req(join(execSync('npm root -g').toString().trim(), 'playwright'))); } catch { ({ chromium } = await import('@playwright/test')); }
import { readCatalogue } from './template-catalogue.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'marketing', 'raw');
// Default: the designs offered in the public gallery. Name design ids after the folder to record others.
const PUBLIC = ['minimalist', 'cinematic', 'fairy-tale', 'bloom-reveal', 'velvet-reveal', 'under-the-same-moon', 'golden-butterfly', 'cherry-blossom', 'lantern-night'];
const only = process.argv.length > 3 ? process.argv.slice(3) : PUBLIC;
mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><body style="margin:0">'); return; }
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const t of readCatalogue().templates.filter(t => t.packaged && only.includes(t.packaged))) {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, recordVideo: { dir: join(out, '_tmp'), size: { width: 540, height: 960 } } });
  const page = await ctx.newPage();
  await page.goto(`${base}/`);
  await page.addScriptTag({ url: `${base}/template-loader.js` });
  await page.evaluate(id => InviteTemplates.need({ id, packaged: id }), t.packaged);
  await page.evaluate(([p, tpl]) => { document.body.innerHTML = window.renderPackagedTemplate(p, tpl, { sample: true, showcase: true }); }, [{ category: 'Wedding', ...JSON.parse(readFileSync(join(root, 'templates', t.packaged, 'sample.json'), 'utf8')) }, t]);
  // Load every photograph now, so a fast scroll never passes an empty frame.
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); })]));
  // 6 s of the opening untouched, then a slow scroll through the invitation (events, story, RSVP), then a beat at the end.
  await page.waitForTimeout(6000);
  await page.evaluate(async () => {
    const el = document.scrollingElement; const end = Math.min(el.scrollHeight - innerHeight, innerHeight * 8);
    const t0 = performance.now(), dur = 9000;
    await new Promise(done => { const step = now => { const k = Math.min(1, (now - t0) / dur); el.scrollTop = end * (0.5 - Math.cos(Math.PI * k) / 2); k < 1 ? requestAnimationFrame(step) : done(); }; requestAnimationFrame(step); });
  });
  await page.waitForTimeout(800);
  // End card: the call to action, faded in over the invitation. No price (prices differ by country).
  await page.evaluate(name => {
    const card = document.createElement('div');
    card.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;background:rgba(18,61,44,.94);color:#f7f0df;opacity:0;transition:opacity .7s ease;font-family:Georgia,serif;padding:40px';
    card.innerHTML = '<div style="font-size:15px;letter-spacing:.28em;text-transform:uppercase;color:#ead8b9">' + name + '</div>'
      + '<div style="font-size:44px;line-height:1.15">Your wedding,<br>in one link</div>'
      + '<div style="font-family:system-ui,sans-serif;font-size:19px;line-height:1.5;color:#dfe7dc">Events · photos · RSVP<br>Free to build and preview</div>'
      + '<div style="margin-top:14px;font-family:system-ui,sans-serif;font-size:22px;font-weight:600;background:#ead8b9;color:#123d2c;border-radius:999px;padding:14px 30px">invitestudio.co</div>';
    document.body.appendChild(card); requestAnimationFrame(() => requestAnimationFrame(() => { card.style.opacity = '1'; }));
  }, t.name || t.packaged);
  await page.waitForTimeout(3200);
  const v = page.video();
  await ctx.close();
  renameSync(await v.path(), join(out, `${t.packaged}.webm`));
  console.log('recorded', t.packaged);
}
await browser.close(); server.close();
