// Phone-screen audit: visits the public pages, every template page, the setup steps, the editor and (with --cloud) published
// invitations at several phone sizes, measures what goes wrong on a small touch screen, and writes a report with screenshots.
//
//   npx wrangler pages dev . --port 8788 &            # or any running copy of the site
//   node scripts/mobile-audit.mjs                     # http://127.0.0.1:8788, three phones, everything that works without a database
//   node scripts/mobile-audit.mjs --cloud             # also upload photos, publish and audit the public page (needs the cloud stack:
//                                                     #   node tests/cloud/stack.mjs, see docs/MOBILE_QA.md)
//   node scripts/mobile-audit.mjs --only home,setup   # a part of it (scenario names start with these words)
//   node scripts/mobile-audit.mjs --url https://claude-xyz.invitestudio-a3r.pages.dev --devices "iPhone 13"
//
// It writes mobile-audit/report.md, report.json and one screenshot per screen and phone. Exit code 1 when there is a high
// severity finding, so it can gate a pull request. What it checks, and why, is in docs/MOBILE_QA.md.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

const BASE = option('url', 'http://127.0.0.1:8788').replace(/\/$/, '');
const OUT = join(root, option('out', 'mobile-audit'));
const CLOUD = flag('cloud');
const ONLY = option('only', '').split(',').map(s => s.trim()).filter(Boolean);
const DEVICE_NAMES = option('devices', 'Galaxy S9+,iPhone 13,Pixel 7').split(',').map(s => s.trim());
const SHOTS = !flag('no-screenshots');

// The photos used for the photo scenarios (plain coloured pictures, written once).
const PHOTO_DIR = join(OUT, 'sample-photos');

// ---- Template list: read from the source of truth so a new design is audited automatically ---------------------------------
function readTemplates() {
  const source = readFileSync(join(root, 'figma/islands/shared.tsx'), 'utf8');
  const blocks = source.slice(source.indexOf('export const galleryTemplates')).split(/\n  \{\n    id: /).slice(1);
  return blocks.map(block => ({
    id: Number(/^(\d+)/.exec(block)[1]),
    backendId: /backendId: "([^"]+)"/.exec(block)[1],
    title: /title: "([^"]+)"/.exec(block)[1]
  }));
}
const TEMPLATES = readTemplates();

// ---- Measurements, run inside the page (they also look inside the open shadow roots the design islands use) -----------------
function measureInPage(options) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const findings = [];
  const add = (rule, severity, message, detail) => findings.push({ rule, severity, message, detail });

  const all = [];
  (function walk(node) {
    for (const el of node.querySelectorAll('*')) {
      all.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  })(document);

  const describe = el => {
    const text = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`;
  };
  const visible = el => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // 1. Sideways scroll: the page is wider than the screen, so it wobbles or can be dragged left and right.
  const docWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  if (docWidth > vw + 1) {
    const wide = all.filter(el => visible(el) && el.getBoundingClientRect().right > vw + 2 && getComputedStyle(el).position !== 'fixed')
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 3);
    add('overflow-x', 'high', `The page is ${docWidth}px wide on a ${vw}px screen`, wide.map(describe).join(' | '));
  }

  // 2. Tap targets: controls smaller than 44px are hard to hit with a thumb (Apple and WCAG 2.5.5 guidance).
  const controls = all.filter(el => el.matches('a[href], button, input:not([type=hidden]):not([type=file]), select, textarea, [role=button], [role=tab], [role=menuitem], summary') && visible(el));
  const small = controls.filter(el => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) return false;
    if (el.tagName === 'A' && el.closest('p, li, span, small') && !el.classList.contains('button')) return false; // a link inside a sentence
    return r.width < 40 || r.height < 40;
  });
  if (small.length) {
    add('tap-target', small.length > 6 ? 'medium' : 'low', `${small.length} controls are smaller than 40px (hard to tap)`,
      small.slice(0, 5).map(el => { const r = el.getBoundingClientRect(); return `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`; }).join(' | '));
  }

  // 3. Tiny text.
  const tiny = all.filter(el => {
    if (!visible(el) || !el.childNodes.length) return false;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2);
    return own && parseFloat(getComputedStyle(el).fontSize) < 11;
  });
  if (tiny.length > 3) add('tiny-text', 'low', `${tiny.length} pieces of text are under 11px`, tiny.slice(0, 3).map(describe).join(' | '));

  // 4. Scroll traps: a big box that scrolls by itself and refuses to pass the scroll on to the page. With a finger on it the page
  //    cannot be scrolled, and only the thin strip beside it is left.
  const traps = all.filter(el => {
    if (!visible(el)) return false;
    const s = getComputedStyle(el);
    if (!['auto', 'scroll'].includes(s.overflowY) || el.scrollHeight <= el.clientHeight + 20) return false;
    const r = el.getBoundingClientRect();
    return r.width >= vw * 0.6 && r.height >= vh * 0.35;
  });
  for (const el of traps) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const contained = s.overscrollBehaviorY === 'contain' || s.overscrollBehaviorY === 'none';
    const gutter = Math.max(0, Math.min(r.left, vw - r.right));
    const tall = r.height >= vh * 0.72;
    if (contained && gutter < 24) add('scroll-trap', 'high', 'A scrolling box stops the page from scrolling and leaves almost no space beside it', `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}, ${Math.round(gutter)}px free beside it`);
    else if (tall && gutter < 24) add('scroll-trap', 'medium', 'A tall scrolling box fills the screen width, so the page can be hard to scroll past it', `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}, ${Math.round(gutter)}px free beside it`);
  }

  // 5. Device frames: a phone preview should look like a phone (about 0.46 wide to tall), not a tablet.
  for (const el of all.filter(el => el.matches('.detail-device, .setup-device, .device-frame.mobile') && visible(el))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width / r.height > 0.62) add('frame-shape', 'high', 'The phone preview is nearly square, so it looks like a tablet', `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)} (ratio ${(r.width / r.height).toFixed(2)})`);
  }

  // 6. Bars fixed to the screen that cover a lot of it.
  for (const el of all.filter(el => visible(el) && ['fixed', 'sticky'].includes(getComputedStyle(el).position))) {
    const r = el.getBoundingClientRect();
    if (r.width >= vw * 0.8 && r.height > vh * 0.3 && r.top >= 0 && r.top < vh && !el.matches('[role=dialog], [aria-modal=true], dialog, [data-intro]') && !el.closest('[role=dialog], [aria-modal=true], [data-intro]')) { // an opening screen is meant to cover the page
      add('covering-bar', 'medium', `A fixed bar covers ${Math.round(r.height / vh * 100)}% of the screen`, describe(el));
    }
  }

  // 7. The main button: how many screens down is it? (A person should not have to hunt for "Continue".)
  if (options.primary) {
    const re = new RegExp(options.primary, 'i');
    const buttons = controls.filter(el => re.test((el.innerText || el.getAttribute('aria-label') || '').trim()));
    if (buttons.length) {
      const reach = el => {
        const s = getComputedStyle(el);
        const fixed = [el, ...(function* () { let p = el.parentElement; while (p) { yield p; p = p.parentElement; } })()].some(n => ['fixed', 'sticky'].includes(getComputedStyle(n).position));
        const r = el.getBoundingClientRect();
        return fixed ? 0 : (r.top + window.scrollY) / vh;
      };
      const best = Math.min(...buttons.map(reach));
      if (best > 1.6) add('primary-far', 'high', `The main button is ${best.toFixed(1)} screens down and not pinned`, options.primary);
      else if (best > 1.0) add('primary-far', 'medium', `The main button is ${best.toFixed(1)} screens down and not pinned`, options.primary);
    } else if (options.primaryRequired) add('primary-missing', 'high', 'The main button was not found', options.primary);
  }

  // 8. Pictures that did not load.
  const broken = all.filter(el => el.tagName === 'IMG' && el.complete && el.naturalWidth === 0 && el.currentSrc && visible(el));
  if (broken.length) add('broken-image', 'high', `${broken.length} pictures did not load`, broken.slice(0, 3).map(el => el.currentSrc.slice(-60)).join(' | '));

  // 9. Text running outside its box (cut off or spilling).
  const clipped = all.filter(el => visible(el) && el.matches('h1, h2, h3, button, a.button, label') && el.scrollWidth > el.clientWidth + 4 && ['hidden', 'clip'].includes(getComputedStyle(el).overflowX));
  if (clipped.length) add('clipped-text', 'medium', `${clipped.length} headings or buttons cut their text off`, clipped.slice(0, 3).map(describe).join(' | '));

  return { findings, viewport: { width: vw, height: vh }, pageHeight: document.documentElement.scrollHeight };
}

// ---- Scenarios -----------------------------------------------------------------------------------------------------------
const settle = (page, ms = 900) => page.waitForTimeout(ms);
async function openHome(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForSelector('.figma-island-host, #app > *', { timeout: 15000 }).catch(() => {});
  await settle(page, 1500);
}
async function startDraft(page, templateTitle, { api = false } = {}) {
  await page.addInitScript(enabled => { if (enabled) window.INVITESTUDIO_API_ENABLED = true; }, api);
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Meera & Arjun');
  await page.locator('#projectDate').fill('2027-02-14');
  await page.locator('#projectLocation').fill('Kochi');
  const next = () => page.getByRole('button', { name: /^Continue/ }).first();
  await next().click(); await settle(page, 400);
  if (templateTitle) {
    await page.getByRole('button', { name: new RegExp('^\\s*' + templateTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
    await settle(page, 300);
  }
}
async function setupStep(page, templateTitle, step, api) {
  await startDraft(page, templateTitle, { api });
  // The wizard is now on step 2 (Template). Step n is reached by pressing Continue n-2 more times.
  for (let i = 2; i < step; i += 1) { await page.getByRole('button', { name: /^Continue/ }).first().click(); await settle(page, 500); }
  await settle(page, 1200);
}
async function openEditor(page, templateTitle, api) {
  await startDraft(page, templateTitle, { api });
  for (let i = 0; i < 2; i += 1) { await page.getByRole('button', { name: /^Continue/ }).first().click(); await settle(page, 400); }
  const open = page.getByRole('button', { name: /open editor/i });
  await open.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => { const b = [...document.querySelector('.figma-island-host').shadowRoot.querySelectorAll('button')].find(x => /open editor/i.test(x.innerText)); return b && !b.disabled; }, null, { timeout: 15000 }).catch(() => {});
  await open.click();
  await settle(page, 2500);
  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 1500 }).catch(() => {});
}

function scenarios() {
  const list = [];
  const S = (name, run, primary, extra = {}) => list.push({ name, run, primary, ...extra });
  S('home', page => openHome(page, '/'), 'start your invitation');
  S('templates', page => openHome(page, '/templates'));
  for (const t of TEMPLATES) S(`template-page ${t.title}`, page => openHome(page, `/templates/${t.id}`), 'start with this design');
  S('guide wedding-invitation-website', page => openHome(page, '/wedding-invitation-website'));
  S('policy refund-policy', page => openHome(page, '/refund-policy'));
  S('policy contact', page => openHome(page, '/contact'));
  const stepNames = { 1: 'essentials', 2: 'template', 3: 'story', 4: 'ready' };
  for (const step of [1, 2, 3, 4]) {
    S(`setup-${stepNames[step]}`, async page => {
      if (step === 1) { await page.addInitScript(() => {}); await page.goto(`${BASE}/`, { waitUntil: 'load' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await page.evaluate(() => startCreate('Wedding')); await settle(page, 1500); }
      else await setupStep(page, 'Minimalist', step, false);
    }, step < 4 ? '^continue' : 'open editor');
  }
  for (const t of TEMPLATES) {
    for (const tab of ['preview', 'sections', 'edit']) {
      S(`editor ${t.title} ${tab}`, async page => {
        await openEditor(page, t.title, false);
        await page.getByRole('tab', { name: new RegExp(tab, 'i') }).click().catch(() => {});
        await settle(page, 800);
      });
    }
  }
  if (CLOUD) {
    // One photo and four photos: some designs only show a gallery once there are two, so one is the case that goes wrong.
    for (const t of TEMPLATES) {
      for (const count of [1, 4]) {
        S(`public ${t.title} ${count} photo${count === 1 ? '' : 's'}`, async (page, context, state) => {
          const url = await publishWithPhotos(page, t.title, count, state);
          await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
          await scrollThrough(page);
        }, undefined, { onePhone: true });
      }
    }
  }
  return list;
}

// A design's opening screen holds the page still while it plays, and pictures below it do not load. Guests wait it out (or tap
// through it), so the audit does too before it looks at the page.
async function waitForOpening(page) {
  const done = () => !document.querySelector('[data-intro]:not([data-done])');
  if (await page.evaluate(done)) return;
  for (const selector of ['[data-intro-start]', '[data-intro-open]', '[data-intro-skip]']) {
    await page.locator(selector).first().click({ timeout: 1500 }).catch(() => {});
  }
  await page.waitForFunction(done, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function scrollThrough(page) {
  await waitForOpening(page);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height + 800; y += 450) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(110); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

// Cloud only: build an invitation, add some photos, look at the editor preview, publish, and report how many of the photos each shows.
async function publishWithPhotos(page, templateTitle, count, state) {
  await openEditor(page, templateTitle, true);
  await page.getByRole('tab', { name: /Sections/ }).click(); await settle(page, 300);
  await page.locator('button', { hasText: /^Photos/ }).first().click(); await settle(page, 600);
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles(Array.from({ length: count }, (_, i) => join(PHOTO_DIR, `photo${i + 1}.jpg`)));
  await settle(page, 2500 + count * 900);
  await page.getByRole('tab', { name: /Preview/ }).click(); await settle(page, 1200);
  await scrollEditorPreview(page);
  state.previewShown = await countUploadedPhotos(page, '.editor-site');
  await page.getByRole('button', { name: /Share invitation/ }).first().click();
  await page.locator('#publishSlug').waitFor({ timeout: 8000 });
  const slug = `audit-${Math.random().toString(36).slice(2, 8)}`;
  await page.locator('#publishSlug').fill(slug);
  await page.getByRole('button', { name: /Make it live/ }).click();
  await page.locator('#modal-root').getByText(/is live/i).first().waitFor({ timeout: 15000 });
  state.expectPhotos = count;
  return `/s/${slug}`;
}

// The editor preview scrolls inside its own frame (and the page scrolls on a phone): move through both so lazy pictures load.
async function scrollEditorPreview(page) {
  await page.evaluate(async () => {
    const root = document.querySelector('.figma-island-host').shadowRoot;
    const boxes = [...root.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 50 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY));
    for (const box of boxes) { for (let y = 0; y < box.scrollHeight; y += 400) { box.scrollTop = y; await new Promise(r => setTimeout(r, 90)); } box.scrollTop = 0; }
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
    window.scrollTo(0, 0);
  });
}

// How many different uploaded photos can be seen in this part of the page (pictures, CSS backgrounds, and pictures drawn by ::before and ::after).
const countUploadedPhotos = (page, scope) => page.evaluate(scopeSelector => {
  const found = new Set();
  const take = value => { const m = value && String(value).match(/\/media\/w\/[^"')\s]+/); if (m) found.add(m[0].split('/').pop().replace(/-(full|thumb)\.(webp|jpg)$/, '')); };
  const visit = el => {
    if (el.tagName === 'IMG' && el.naturalWidth > 0) take(el.currentSrc || el.src);
    take(getComputedStyle(el).backgroundImage);
    take(getComputedStyle(el, '::before').backgroundImage);
    take(getComputedStyle(el, '::after').backgroundImage);
  };
  // `inScope` carries through shadow roots: an element inside the preview's own shadow root is in scope when its host is.
  (function walk(root, inScope) {
    for (const el of root.querySelectorAll('*')) {
      const here = inScope || !scopeSelector || el.matches(scopeSelector);
      if (here) visit(el);
      if (el.shadowRoot) walk(el.shadowRoot, here);
    }
  })(document, !scopeSelector);
  return found.size;
}, scope || null);

// ---- Run -------------------------------------------------------------------------------------------------------------------
function writeSamplePhotos() {
  // Tiny valid JPEGs would need an encoder; use the canvas in the browser instead (see makePhotos).
  mkdirSync(PHOTO_DIR, { recursive: true });
}
async function makePhotos(browser) {
  const page = await browser.newPage();
  await page.goto('about:blank');
  const files = await page.evaluate(async () => {
    const colours = ['#c85a5a', '#508cc8', '#5aaa6e', '#dcb446'];
    const out = [];
    for (const [i, colour] of colours.entries()) {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
      const g = c.getContext('2d'); g.fillStyle = colour; g.fillRect(0, 0, 1600, 1200);
      g.fillStyle = '#fff'; g.font = '200px sans-serif'; g.fillText(`Photo ${i + 1}`, 420, 660);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      out.push([...new Uint8Array(await blob.arrayBuffer())]);
    }
    return out;
  });
  files.forEach((bytes, i) => writeFileSync(join(PHOTO_DIR, `photo${i + 1}.jpg`), Buffer.from(bytes)));
  await page.close();
}

const SEVERITY = { high: 3, medium: 2, low: 1 };

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'screens'), { recursive: true });
  writeSamplePhotos();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
  if (CLOUD) await makePhotos(browser);
  const all = scenarios().filter(s => !ONLY.length || ONLY.some(prefix => s.name.toLowerCase().startsWith(prefix.toLowerCase())));
  const results = [];
  console.log(`Auditing ${all.length} screens on ${DEVICE_NAMES.join(', ')} at ${BASE}`);

  for (const deviceName of DEVICE_NAMES) {
    const device = devices[deviceName];
    if (!device) { console.error(`Unknown device "${deviceName}". Known: ${Object.keys(devices).filter(n => !n.includes('landscape')).slice(0, 12).join(', ')} ...`); continue; }
    for (const scenario of all) {
      if (scenario.onePhone && deviceName !== (DEVICE_NAMES.includes('iPhone 13') ? 'iPhone 13' : DEVICE_NAMES[0])) continue;
      const context = await browser.newContext({ ...device });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(`script error: ${error.message.slice(0, 120)}`));
      page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|favicon/i.test(message.text())) errors.push(message.text().slice(0, 140)); });
      const failedRequests = [];
      page.on('response', response => { if (response.status() >= 400 && !/favicon|\/api\/pricing/.test(response.url())) failedRequests.push(`${response.status()} ${response.url().replace(BASE, '').slice(0, 80)}`); });
      const state = {};
      const entry = { screen: scenario.name, device: deviceName, findings: [] };
      try {
        await scenario.run(page, context, state);
        const measured = await page.evaluate(measureInPage, { primary: scenario.primary, primaryRequired: Boolean(scenario.primary) && !/^setup/.test(scenario.name) });
        entry.findings.push(...measured.findings);
        entry.pageHeight = measured.pageHeight;
        if (state.expectPhotos) {
          const shown = await countUploadedPhotos(page);
          entry.photos = { uploaded: state.expectPhotos, shown, preview: state.previewShown };
          if (shown < state.expectPhotos) entry.findings.push({ rule: 'photos-missing', severity: 'high', message: shown === 0 ? `The published page shows none of the ${state.expectPhotos} uploaded photo${state.expectPhotos === 1 ? '' : 's'}` : `The published page shows ${shown} of ${state.expectPhotos} uploaded photos`, detail: '' });
          if (state.previewShown < state.expectPhotos) entry.findings.push({ rule: 'photos-missing-preview', severity: 'high', message: state.previewShown === 0 ? `The editor preview shows none of the ${state.expectPhotos} uploaded photo${state.expectPhotos === 1 ? '' : 's'}` : `The editor preview shows ${state.previewShown} of ${state.expectPhotos} uploaded photos`, detail: '' });
        }
        for (const error of [...new Set(errors)].slice(0, 3)) entry.findings.push({ rule: 'console', severity: 'medium', message: 'Browser error', detail: error });
        for (const request of [...new Set(failedRequests)].slice(0, 3)) entry.findings.push({ rule: 'failed-request', severity: 'medium', message: 'A request failed', detail: request });
        if (SHOTS) {
          const file = `${deviceName.replace(/[^a-z0-9]+/gi, '')}-${scenario.name.replace(/[^a-z0-9]+/gi, '-')}.png`;
          await page.screenshot({ path: join(OUT, 'screens', file) });
          entry.screenshot = `screens/${file}`;
        }
      } catch (error) {
        entry.findings.push({ rule: 'could-not-run', severity: 'high', message: 'The screen could not be opened or driven', detail: String(error.message).split('\n')[0].slice(0, 160) });
      }
      results.push(entry);
      const worst = entry.findings.reduce((m, f) => Math.max(m, SEVERITY[f.severity] || 0), 0);
      console.log(`${worst === 3 ? 'HIGH' : worst === 2 ? 'med ' : worst === 1 ? 'low ' : 'ok  '}  ${deviceName.padEnd(12)} ${scenario.name}${entry.findings.length ? `  (${entry.findings.length})` : ''}`);
      await context.close();
    }
  }
  await browser.close();
  writeReport(results);
  const high = results.reduce((n, r) => n + r.findings.filter(f => f.severity === 'high').length, 0);
  console.log(`\nReport: ${join(OUT, 'report.md')}  (${high} high severity findings)`);
  process.exitCode = high ? 1 : 0;
}

function writeReport(results) {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));
  // Group the same finding across phones and screens, so a layout problem on 14 template pages reads as one line.
  const groups = new Map();
  for (const r of results) {
    for (const f of r.findings) {
      const key = `${f.rule}|${f.message.replace(/\d+(\.\d+)?/g, 'N')}`;
      if (!groups.has(key)) groups.set(key, { rule: f.rule, severity: f.severity, message: f.message, where: [], detail: f.detail });
      const group = groups.get(key);
      group.where.push(`${r.screen} (${r.device})`);
      if (SEVERITY[f.severity] > SEVERITY[group.severity]) group.severity = f.severity;
    }
  }
  const sorted = [...groups.values()].sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity] || b.where.length - a.where.length);
  const lines = [`# Phone audit`, '', `${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${BASE} · ${DEVICE_NAMES.join(', ')} · ${results.length} screen checks`, ''];
  const counts = { high: 0, medium: 0, low: 0 };
  for (const g of sorted) counts[g.severity] += 1;
  lines.push(`**${counts.high} high, ${counts.medium} medium, ${counts.low} low** (distinct findings).`, '');
  for (const severity of ['high', 'medium', 'low']) {
    const part = sorted.filter(g => g.severity === severity);
    if (!part.length) continue;
    lines.push(`## ${severity[0].toUpperCase() + severity.slice(1)}`, '');
    for (const g of part) {
      const unique = [...new Set(g.where)];
      lines.push(`- **${g.message}** [${g.rule}] on ${unique.length} screen${unique.length === 1 ? '' : 's'}`);
      if (g.detail) lines.push(`  - e.g. ${g.detail}`);
      lines.push(`  - ${unique.slice(0, 6).join('; ')}${unique.length > 6 ? `; and ${unique.length - 6} more` : ''}`);
    }
    lines.push('');
  }
  if (CLOUD) {
    lines.push('## Photos: uploaded, and shown in the editor preview and on the published page', '', '| Design | Uploaded | Editor preview | Published page |', '|---|---|---|---|');
    for (const r of results.filter(r => r.photos)) lines.push(`| ${r.screen.replace('public ', '').replace(/ \d+ photos?$/, '')} | ${r.photos.uploaded} | ${r.photos.preview} | ${r.photos.shown} |`);
    lines.push('');
  }
  writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
}

main().catch(error => { console.error(error); process.exit(2); });
