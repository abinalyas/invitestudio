// Photos from a phone, through the real UI and the real cloud stack (Pages Functions + Postgres + local R2):
// the upload option stays after the first photo, the published page shows a photo even when no story was written, and a photo can
// be replaced or removed by tapping it in the preview.
const { test, expect, devices } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

// A phone-sized, touch screen (the browser stays the one the suite is configured with).
const { defaultBrowserType, ...phone } = devices['iPhone 13'];
test.use(phone);
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; }); });

const makeJpeg = (page, label) => page.evaluate(async text => {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
  const g = canvas.getContext('2d'); g.fillStyle = `hsl(${text.length * 47 % 360} 60% 55%)`; g.fillRect(0, 0, 1200, 900);
  g.fillStyle = '#fff'; g.font = '120px sans-serif'; g.fillText(text, 300, 480);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return [...new Uint8Array(await blob.arrayBuffer())];
}, label).then(bytes => ({ name: `${label}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) }));

async function openEditor(page, design) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(id => window.InviteStudioBridge.startSetup(id), design.toLowerCase().replace(/ /g, '-'));
  await page.locator('#projectTitle').fill(`Photo Couple ${randomUUID().slice(0, 4)}`);
  for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: /^Continue/ }).first().click();
  const open = page.getByRole('button', { name: /open editor/i });
  await expect(open).toBeEnabled({ timeout: 15000 });
  await open.click();
  await page.getByRole('button', { name: 'Got it' }).click({ timeout: 4000 }).catch(() => {});
  await expect(page.getByRole('tab', { name: /Sections/ })).toBeVisible({ timeout: 15000 });
}
const openPhotos = async page => { await page.getByRole('tab', { name: /Sections/ }).click(); await page.locator('button', { hasText: /^Photos/ }).first().click(); };
const photoIds = page => page.evaluate(() => [...document.querySelector('.figma-island-host').shadowRoot.querySelectorAll('.photo-list li img')].map(img => img.src.match(/([0-9a-f-]{36})-thumb/)[1]));

test('after the first photo the editor still offers a place to add the next, and the published page shows it without a story', async ({ page, browser }) => {
  await openEditor(page, 'Fairy Tale'); // a photo added with the main button goes to the gallery, not to the story picture
  await openPhotos(page);
  await page.getByLabel('Add photos').setInputFiles(await makeJpeg(page, 'first'));
  await expect(page.locator('.photo-list li')).toHaveCount(1, { timeout: 20000 });
  await expect(page.getByTestId('photo-usage')).toContainText('1 of 12 photos');
  await expect(page.getByText('Add more to the gallery')).toBeVisible();

  await page.getByRole('tab', { name: /Preview/ }).click();
  await expect(page.locator('.editor-site [data-photo-add]').first()).toBeVisible(); // still a tile to tap for the next photo

  await page.getByRole('button', { name: /Share invitation/ }).first().click();
  const slug = `photos-${randomUUID().slice(0, 6)}`;
  await page.locator('#publishSlug').fill(slug);
  await page.getByRole('button', { name: 'Make it live' }).click();
  await expect(page.locator('#modal-root')).toContainText(/is live/i, { timeout: 20000 });

  const guest = await browser.newContext(phone);
  const guestPage = await guest.newPage();
  await guestPage.goto(`/s/${slug}`);
  await expect.poll(() => guestPage.locator('img[src*="/media/w/"]').count(), { timeout: 20000 }).toBeGreaterThan(0);
  await guest.close();
});

test('a photo is replaced in place, and removed, by tapping it in the preview', async ({ page }) => {
  await openEditor(page, 'Minimalist');
  await openPhotos(page);
  await page.getByLabel('Add photos').setInputFiles([await makeJpeg(page, 'one'), await makeJpeg(page, 'twotwo')]);
  await expect(page.locator('.photo-list li')).toHaveCount(2, { timeout: 25000 });
  const [firstBefore, secondBefore] = await photoIds(page);

  await page.getByRole('tab', { name: /Preview/ }).click();
  const photo = page.locator('.editor-site img[src*="/media/w/"]').first();
  await photo.scrollIntoViewIfNeeded();
  await photo.click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Replace this photo' }).click()]);
  await chooser.setFiles(await makeJpeg(page, 'replacement'));

  await openPhotos(page);
  await expect.poll(async () => (await photoIds(page))[0], { timeout: 25000 }).not.toBe(firstBefore);
  const after = await photoIds(page);
  expect(after).toHaveLength(2);
  expect(after[1]).toBe(secondBefore); // the other photo kept its place

  await page.getByRole('tab', { name: /Preview/ }).click();
  const again = page.locator('.editor-site img[src*="/media/w/"]').first();
  await again.scrollIntoViewIfNeeded();
  await again.click();
  await page.getByRole('button', { name: 'Remove this photo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove photo' }).click();
  await openPhotos(page);
  await expect.poll(async () => (await photoIds(page)).length, { timeout: 15000 }).toBe(1);
});
