// Each design has its own WhatsApp card (share-card.js CARDS + assets/share-cards/<id>.webp): the right size, with the couple's words on it.
// Set SHARE_CARD_OUT=<folder> to also save every card as a picture to look at.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ids = ['minimalist', 'cinematic', 'fairy-tale', 'bloom-reveal', 'velvet-reveal', 'under-the-same-moon', 'golden-butterfly', 'cherry-blossom', 'lantern-night'];
const cases = {
  normal: { names: 'Daniel & Amelia', event: { title: 'Wedding', date: '2026-11-28', time: '19:30', venue: 'Govindmani Lawns, Thane' } },
  long: { names: 'Alexandria-Rose & Bartholomew', event: { title: 'Reception Dinner', date: '2027-02-06', time: '', venue: 'The Grand Imperial Convention Centre and Banquet Hall, MG Road, Kochi, Kerala' } },
  none: { names: 'Meera', event: { title: '', date: '', time: '', venue: '' } }
};

async function draw(page, templateId, data) {
  return page.evaluate(async ({ templateId, data }) => {
    const card = window.InviteShareCard;
    const blob = await card.draw({ templateId, art: card.cardArt(templateId), names: data.names, event: data.event });
    const bitmap = await createImageBitmap(blob);
    // How many pixels differ from the artwork alone: zero would mean no words were drawn.
    const blank = await createImageBitmap(await (await fetch(card.cardArt(templateId))).blob());
    const read = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const a = read(bitmap), b = read(blank);
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) changed++;
    const url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
    return { width: bitmap.width, height: bitmap.height, changed, url };
  }, { templateId, data });
}

for (const id of ids) {
  test(`${id}: a card of the right size with the couple's words on it`, async ({ page }) => {
    await page.goto('/');
    const spec = await page.evaluate(i => ({ w: window.InviteShareCard.cards[i].w, h: window.InviteShareCard.cards[i].h }), id);
    for (const [name, data] of Object.entries(cases)) {
      const out = await draw(page, id, data);
      expect([out.width, out.height]).toEqual([spec.w, spec.h]);
      expect(out.changed, `${id} ${name}: words drawn`).toBeGreaterThan(name === 'none' ? 2000 : 12000);
      if (process.env.SHARE_CARD_OUT) {
        fs.mkdirSync(process.env.SHARE_CARD_OUT, { recursive: true });
        fs.writeFileSync(path.join(process.env.SHARE_CARD_OUT, `${id}-${name}.png`), Buffer.from(out.url.split(',')[1], 'base64'));
      }
    }
  });
}
