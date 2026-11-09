// A large, detailed phone-style photo must come out within what the server accepts (full <= 600 KB, thumb <= 100 KB,
// edges <= 1800 / 600 px) instead of being refused.
const { test, expect } = require('@playwright/test');

test('a large noisy photo is compressed to fit the server limits', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4032; c.height = 3024; // an iPhone-sized picture
    const ctx = c.getContext('2d'); const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    const file = new File([blob], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const p = await window.InviteMedia.prepare(file);
    return { source: file.size, full: p.full.size, thumb: p.thumb.size, w: p.width, format: p.format };
  });
  console.log(JSON.stringify(out));
  expect(out.full).toBeLessThanOrEqual(600 * 1024);
  expect(out.thumb).toBeLessThanOrEqual(100 * 1024);
  expect(out.full + out.thumb).toBeLessThanOrEqual(800 * 1024 - 8 * 1024);
});

// iPhone photos are HEIC. Chromium cannot open them itself, so this exercises the converter, under the site's real
// security policy (it is loaded from this site's own /vendor/ folder).
test('an iPhone HEIC photo is converted and prepared for upload', async ({ page }) => {
  const fs = require('node:fs');
  const bytes = [...fs.readFileSync(require('node:path').join(__dirname, '..', 'fixtures', 'iphone-sample.heic'))];
  const violations = [];
  page.on('console', m => { if (/content security policy|refused to/i.test(m.text())) violations.push(m.text()); });
  await page.goto('/');
  const out = await page.evaluate(async b => {
    const file = new File([new Uint8Array(b)], 'IMG_1234.HEIC', { type: 'image/heic' });
    const loadedBefore = Boolean(window.libheifReady);
    const p = await window.InviteMedia.prepare(file);
    return { loadedBefore, loadedAfter: Boolean(window.libheifReady), full: p.full.size, thumb: p.thumb.size, w: p.width, format: p.format, type: p.full.type };
  }, bytes);
  console.log(JSON.stringify(out));
  expect(out.loadedBefore).toBe(false);            // downloaded only when a HEIC photo is chosen
  expect(out.loadedAfter).toBe(true);
  expect(['image/webp', 'image/jpeg']).toContain(out.type);
  expect(out.full).toBeLessThanOrEqual(600 * 1024);
  expect(out.thumb).toBeLessThanOrEqual(100 * 1024);
  expect(violations).toEqual([]);
});

test('a HEIC file with no type from the browser is still recognised, and a broken one gets a clear message', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const noType = new File([new Uint8Array(10)], 'IMG_9.heic', { type: '' });
    const broken = new File([new Uint8Array(500)], 'IMG_9.heic', { type: 'image/heic' });
    let message = '';
    try { await window.InviteMedia.prepare(broken); } catch (e) { message = e.message; }
    return { recognised: window.InviteMedia.isHeic(noType), pdf: window.InviteMedia.isHeic(new File([new Uint8Array(1)], 'a.pdf', { type: 'application/pdf' })), message };
  });
  expect(out.recognised).toBe(true);
  expect(out.pdf).toBe(false);
  expect(out.message).toMatch(/HEIC photo could not be converted/);
});
