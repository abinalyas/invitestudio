// Makes the Instagram feed posts (1080x1350) and profile picture from the recorded clips in marketing/clips.
// Each post: the design's opening and a moment further in, side by side as two phones, with a hook. Run after record-openings.
// Usage: node scripts/make-social-posts.mjs
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readCatalogue } from './template-catalogue.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req(join(execSync('npm root -g').toString().trim(), 'playwright'))); } catch { ({ chromium } = await import('@playwright/test')); }
const clips = join(root, 'marketing', 'clips'), out = join(root, 'marketing', 'posts'), tmp = mkdtempSync(join(tmpdir(), 'posts-'));
mkdirSync(out, { recursive: true });
const font = f => 'data:font/woff2;base64,' + readFileSync(join(root, 'assets', 'scene-fonts', f)).toString('base64');

// Hooks come from docs/PROMOTION_KIT.md: say only what the design does.
const HOOKS = {
  'velvet-reveal': ['The curtains part on your names', 'Then guests scratch gold foil to find the date.'],
  'cherry-blossom': ['Tap three times to find the date', 'Petals fall past your names.'],
  'golden-butterfly': ['Golden butterflies open your invitation', 'Black and gold, with a countdown guests check daily.'],
  'lantern-night': ['A thousand lanterns behind your names', 'Floating lanterns play behind the whole invitation.'],
  'under-the-same-moon': ['A moonlit lake and your love story', 'Made for evening weddings.'],
  'fairy-tale': ['Once upon our forever', 'A pink sunset sky and a castle on the hill.'],
  'bloom-reveal': ['Flowers bloom in from the corners', 'Watercolour peonies and roses, soft script names.'],
  'minimalist': ['Quiet, editorial, yours', 'Large serif names, one olive accent, plenty of space.'],
  'cinematic': ['Your wedding, like the opening of a film', 'Big names, a golden countdown, quiet scenes.']
};
const frame = (id, t) => { const f = join(tmp, `${id}-${t}.png`); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', join(clips, `${id}.mp4`), '-frames:v', '1', f]); return 'data:image/png;base64,' + readFileSync(f).toString('base64'); };
const css = `@font-face{font-family:P;src:url(${font('playfair-display-latin-variable.woff2')})}@font-face{font-family:S;src:url(${font('dm-sans-latin-500-normal.woff2')})}@font-face{font-family:S6;src:url(${font('dm-sans-latin-600-normal.woff2')})}*{box-sizing:border-box;margin:0}`;
const phone = src => `<div style="width:380px;height:676px;border-radius:44px;padding:12px;background:#0d0d0d;box-shadow:0 30px 60px rgba(0,0,0,.35)"><img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:top;border-radius:33px;display:block"></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
// Only designs couples can choose in the public gallery (functions/_shared/seo.js lists them); anything else is not promoted.
for (const t of readCatalogue().templates.filter(t => t.packaged && HOOKS[t.packaged])) {
  const [bg, accent, ink] = t.colors.split ? t.colors.split(',') : t.colors;
  const dark = parseInt(bg.slice(1, 3), 16) < 90;
  const [hook, sub] = HOOKS[t.packaged] || [t.name, ''];
  await page.setContent(`<style>${css}</style><body style="width:1080px;height:1350px;background:${bg};color:${dark ? '#f6f0e5' : ink};display:flex;flex-direction:column;align-items:center;padding:70px 60px 0;overflow:hidden">
    <div style="font:15px S6;letter-spacing:.3em;text-transform:uppercase;color:${accent}">${t.name} · InviteStudio</div>
    <div style="font:500 58px/1.12 P;text-align:center;margin-top:22px;max-width:900px">${hook}</div>
    <div style="font:26px/1.4 S;text-align:center;margin-top:16px;opacity:.8">${sub}</div>
    <div style="display:flex;gap:44px;margin-top:52px">${phone(frame(t.packaged, 2.5))}<div style="margin-top:70px">${phone(frame(t.packaged, 12))}</div></div>
  </body>`);
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode())]));
  writeFileSync(join(out, `${t.packaged}.jpg`), await page.screenshot({ type: 'jpeg', quality: 90 }));
  console.log('post', t.packaged);
}
// Profile picture: the brand mark, readable at 110 px in a circle.
await page.setViewportSize({ width: 1080, height: 1080 });
await page.setContent(`<style>${css}</style><body style="width:1080px;height:1080px;background:#123d2c;color:#f7f0df;display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div style="font:400 300px/1 P;color:#ead8b9">❀</div><div style="font:500 112px/1 P;margin-top:10px">Invite</div><div style="font:30px S6;letter-spacing:.42em;margin-top:22px;color:#ead8b9">STUDIO</div></body>`);
await page.evaluate(() => document.fonts.ready);
writeFileSync(join(out, 'profile-picture.png'), await page.screenshot());
await browser.close();
