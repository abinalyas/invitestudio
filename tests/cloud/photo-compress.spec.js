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
