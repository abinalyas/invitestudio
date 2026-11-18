// The phone frame's rounded screen is clean at the top corners for every design: nothing from the design is painted over the bezel.
const { test, expect } = require('@playwright/test');

const DESIGNS = ['minimalist', 'bloom-reveal', 'fairy-tale', 'modern-heritage', 'cherry-blossom', 'cinematic', 'velvet-reveal', 'lantern-night'];

for (const templateId of DESIGNS) {
  test(`${templateId}: the corners of the phone screen show only the bezel`, async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto('/');
    await page.evaluate(templateId => {
      localStorage.clear();
      localStorage.setItem('invitestudio-edit-hint-seen', '1');
      const p = { id: 'e1', name: 'Q', category: 'Wedding', templateId, status: 'Draft', title: 'Q & Q', date: '2027-06-19', location: 'Kochi', message: '', hosts: '', story: '', photos: [], functions: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' } };
      localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
      // eslint-disable-next-line no-undef
      state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
    }, templateId);
    const frame = page.locator('.device-frame.mobile');
    await expect(frame).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
    const box = await frame.boundingBox();
    const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: 80 } });
    // Points in the corner between the square screen box and its rounded edge: the bezel colour (#1d1f1c) must be there.
    const colours = await page.evaluate(async ({ data, width }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const g = canvas.getContext('2d');
      g.drawImage(bitmap, 0, 0);
      const at = (x, y) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
      return [at(16, 16), at(18, 14), at(14, 18), at(width - 17, 16), at(width - 19, 14), at(width - 15, 18)];
    }, { data: Array.from(png), width: box.width });
    for (const [r, g, b] of colours) {
      expect(Math.abs(r - 29) + Math.abs(g - 31) + Math.abs(b - 28)).toBeLessThan(18);
    }
  });
}
