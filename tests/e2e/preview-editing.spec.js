// Editing straight on the editor preview: click text to change it, add events and photos, move or remove events.
// The photo tests run the real browser-side pipeline (resize, form upload, list) against a small fake photo API.
const zlib = require('node:zlib');
const { test, expect, devices } = require('@playwright/test');

const PACKAGED = ['minimalist', 'modern-heritage', 'cinematic', 'fairy-tale', 'blue-hydrangea'];
const SCENES = ['savanna-sunset', 'palmera-beach', 'curtain-call', 'lunaria-moon'];
const ALL = [...PACKAGED, ...SCENES];

const snapshot = page => page.evaluate(() => window.InviteStudioBridge.snapshot());

// Opens the editor on a fresh draft of one design (the same state the app holds after setup).
async function openEditor(page, templateId, extra = {}) {
  await page.goto('/');
  await page.evaluate(({ templateId, extra }) => {
    localStorage.clear();
    const event = (n, title, venue) => ({
      id: `ev${n}`, title, date: `2027-06-1${n}`, time: '16:00', endTime: '', venue, visible: true,
      description: `about ${n}`, dressCode: `dress ${n}`, directionsUrl: '', parking: '', accommodation: '', accessibility: ''
    });
    const project = {
      id: `e2e-${templateId}`, name: 'Ava and Ben', category: 'Wedding', templateId, status: 'Draft', updated: 'Just now',
      title: 'Ava & Ben', date: '2027-06-19', location: 'The Garden Estate, Kent', message: 'Please join us', hosts: 'Mr and Mrs Shah',
      story: 'We met in March.', photos: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }, published: false,
      functions: extra.withEvents ? [event(1, 'Mehndi', 'Hall 1'), event(2, 'Sangeet', 'Hall 2'), event(3, 'Wedding', 'Hall 3')] : [],
      ...(extra.project || {})
    };
    if (extra.hintSeen !== false) localStorage.setItem('invitestudio-edit-hint-seen', '1');
    if (extra.tokens) localStorage.setItem('invitestudio-edit-tokens', JSON.stringify(extra.tokens));
    localStorage.setItem('invitestudio-projects', JSON.stringify([project]));
    // eslint-disable-next-line no-undef
    state.projects = [project]; state.currentId = project.id; state.page = 'editor'; render();
  }, { templateId, extra });
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
}

async function typeInto(page, locator, text, { multiline = false } = {}) {
  await locator.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press(multiline ? 'Control+Enter' : 'Enter');
}

for (const id of ALL) {
  test.describe(`${id}: editing on the preview`, () => {
    test('clicking the names and the welcome message edits them in place', async ({ page }) => {
      await openEditor(page, id);
      await typeInto(page, page.locator('[data-edit="names:first"]').first(), 'Mia');
      await expect.poll(async () => (await snapshot(page)).title).toBe('Mia & Ben');
      await typeInto(page, page.locator('[data-edit="message"]').first(), 'Dinner to follow');
      await expect.poll(async () => (await snapshot(page)).message).toBe('Dinner to follow');
      // Escape cancels
      const message = page.locator('[data-edit="message"]').first();
      await message.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('This should not stick');
      await page.keyboard.press('Escape');
      await expect(message).toContainText('Dinner to follow');
      expect((await snapshot(page)).message).toBe('Dinner to follow');
    });

    test('"+ Add event" adds a quick-add event, or a custom one that opens ready to rename', async ({ page }) => {
      await openEditor(page, id);
      await page.locator('[data-add-event]').first().click();
      await page.getByRole('button', { name: 'Welcome gathering' }).first().click();
      await expect.poll(async () => (await snapshot(page)).events.map(event => event.title)).toEqual(['Welcome gathering']);
      await page.locator('[data-add-event]').first().click();
      await page.getByRole('button', { name: 'Custom event' }).first().click();
      await expect(page.locator('[data-edit="event:title"][contenteditable="true"]')).toBeVisible();
      await page.keyboard.type('Sangeet night');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await snapshot(page)).events.map(event => event.title)).toEqual(['Welcome gathering', 'Sangeet night']);
    });
  });
}

for (const id of ['minimalist', 'savanna-sunset']) {
  test(`${id}: an event can be moved, removed, and put back with Undo`, async ({ page }) => {
    await openEditor(page, id, { withEvents: true });
    const titles = async () => (await snapshot(page)).events.map(event => event.title);
    const second = () => page.locator('[data-edit="event:title"][data-id="ev2"]').first();
    await second().hover();
    await page.locator('[data-event-move="-1"]').click();
    await expect.poll(titles).toEqual(['Sangeet', 'Mehndi', 'Wedding']);
    // the bar follows the event, so it can be moved again
    await second().hover();
    await page.locator('[data-event-move="1"]').click();
    await expect.poll(titles).toEqual(['Mehndi', 'Sangeet', 'Wedding']);
    await second().hover();
    await page.locator('[data-event-remove]').click();
    await expect.poll(titles).toEqual(['Mehndi', 'Wedding']);
    await expect(page.locator('.edit-hint-pill')).toContainText('Removed "Sangeet"');
    await page.locator('[data-hint-action]').click();
    // back in the same place, with every detail
    await expect.poll(async () => (await snapshot(page)).events.map(event => `${event.title}/${event.venue}`)).toEqual(['Mehndi/Hall 1', 'Sangeet/Hall 2', 'Wedding/Hall 3']);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('invitestudio-projects'))[0].functions[1]);
    expect(stored).toMatchObject({ description: 'about 2', dressCode: 'dress 2' });
  });
}

test('the design\'s example events are shown with their wording but cannot be edited', async ({ page }) => {
  await openEditor(page, 'minimalist');
  await expect(page.locator('[data-add-event]')).toHaveCount(1);
  await expect(page.locator('[data-edit^="event:"]')).toHaveCount(0);
  await expect(page.getByText('Wedding ceremony').first()).toBeVisible();
});

test.describe('photos', () => {
  test('a placeholder explains why photos are unavailable when the invitation is not saved online', async ({ page }) => {
    await openEditor(page, 'minimalist');
    await page.locator('[data-photo-add]').first().click();
    await expect(page.locator('.edit-hint-pill')).toContainText('saved online');
  });

  // A solid-colour PNG, built without any image library.
  function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c = (crc ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function png(width, height, [r, g, b]) {
    const chunk = (type, data) => {
      const body = Buffer.concat([Buffer.from(type), data]);
      const out = Buffer.alloc(8 + data.length + 4);
      out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
      return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
    const raw = Buffer.concat(Array.from({ length: height }, () => row));
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }

  function multipart(buffer, contentType) {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
    const boundary = '--' + (match[1] || match[2]);
    const parts = {};
    for (const chunk of buffer.toString('latin1').split(boundary).slice(1, -1)) {
      const at = chunk.indexOf('\r\n\r\n');
      const head = chunk.slice(0, at), body = chunk.slice(at + 4).replace(/\r\n$/, '');
      parts[/name="([^"]+)"/.exec(head)[1]] = { filename: (/filename="([^"]*)"/.exec(head) || [])[1], bytes: Buffer.from(body, 'latin1') };
    }
    return parts;
  }

  // A fake photo API: keeps what is uploaded in memory and serves it back, the way the real one lists it.
  async function fakePhotoApi(page, { rejectSecond = false } = {}) {
    const store = [];
    const uploads = [];
    await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
    // Pictures are served where the real site serves them: /media/w/<wedding>/<photo>-full|thumb.<ext>
    await page.route('**/media/w/**', route => {
      const match = /\/media\/w\/[0-9a-f-]{36}\/([0-9a-f-]{36})-(full|thumb)\.(webp|jpg)$/.exec(new URL(route.request().url()).pathname);
      const photo = match && store.find(item => item.id === match[1]);
      return photo ? route.fulfill({ status: 200, contentType: photo.type, body: photo[match[2]] }) : route.fulfill({ status: 404, body: '' });
    });
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (/\/api\/weddings\/[^/]+\/media$/.test(url.pathname)) {
        if (request.method() === 'POST') {
          if (rejectSecond && store.length + uploads.length >= 1) {
            uploads.push('rejected');
            return route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ error: { code: 'MEDIA_TOO_LARGE', message: 'too large' } }) });
          }
          const form = multipart(request.postDataBuffer(), request.headers()['content-type']);
          const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(store.length + 1).padStart(12, '0')}`;
          const type = form.full.filename.endsWith('webp') ? 'image/webp' : 'image/jpeg';
          store.push({ id, type, full: form.full.bytes, thumb: form.thumb.bytes, fullName: form.full.filename, thumbName: form.thumb.filename });
          uploads.push(id);
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ photo: { id } }) });
        }
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            enabled: true, reason: '', limits: { photos: 12, totalBytes: 8 * 1024 * 1024 },
            usage: { count: store.length, bytes: store.reduce((sum, item) => sum + item.full.length, 0) },
            photos: store.map(item => {
              const ext = item.type === 'image/webp' ? 'webp' : 'jpg';
              const base = `/media/w/11111111-1111-4111-8111-111111111111/${item.id}`;
              return { id: item.id, alt: '', width: 800, height: 600, full: `${base}-full.${ext}`, thumb: `${base}-thumb.${ext}` };
            })
          })
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    return { store, uploads };
  }

  const online = { project: { cloudId: 'cloud-1' }, tokens: { 'cloud-1': 'token-1' } };

  test('clicking a gallery placeholder uploads photos through the real resize and upload path', async ({ page }) => {
    const api = await fakePhotoApi(page);
    await openEditor(page, 'minimalist', online);
    // storage is reachable now, so the placeholder opens the picker
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-photo-add]').first().click()]);
    const big = png(2400, 1800, [120, 160, 200]);
    await chooser.setFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: big },
      { name: 'two.png', mimeType: 'image/png', buffer: png(1200, 900, [200, 120, 120]) }
    ]);
    await expect(page.locator('.edit-hint-pill')).toContainText('Added 2 photos: 1 to the cover picture, 1 to the gallery', { timeout: 20000 });
    // the browser shrank the picture before sending it: far smaller than the original, with a thumbnail alongside
    expect(api.store).toHaveLength(2);
    expect(api.store[0].full.length).toBeGreaterThan(0);
    expect(api.store[0].thumb.length).toBeGreaterThan(0);
    expect(api.store[0].thumb.length).toBeLessThan(api.store[0].full.length);
    expect(api.store[0].fullName).toMatch(/^full\.(jpg|webp)$/);
    // and the preview shows the pictures that came back from the list
    await expect(page.locator('.invitation-canvas img[src*="/media/w/"]').first()).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).photos.length).toBe(2);
    await expect(page.locator('[data-photo-add]')).toHaveCount(0);
  });

  test('a photo the server refuses is reported by name, and the others are still added', async ({ page }) => {
    const api = await fakePhotoApi(page, { rejectSecond: true });
    await openEditor(page, 'minimalist', online);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-photo-add]').first().click()]);
    await chooser.setFiles([
      { name: 'good.png', mimeType: 'image/png', buffer: png(800, 600, [90, 140, 90]) },
      { name: 'huge.png', mimeType: 'image/png', buffer: png(800, 600, [140, 90, 90]) }
    ]);
    const notice = page.locator('.edit-hint-pill');
    await expect(notice).toContainText('Added 1 photo', { timeout: 20000 });
    await expect(notice).toContainText('huge.png');
    await expect(notice).toContainText('too large');
    expect(api.store).toHaveLength(1);
  });
});

test.describe('on a phone', () => {
  // The phone's size and touch, without its browser engine (a device preset would force a different browser).
  const { viewport, screen, userAgent, deviceScaleFactor } = devices['iPhone 13'];
  test.use({ viewport, screen, userAgent, deviceScaleFactor, isMobile: true, hasTouch: true });

  test('tapping edits, the tip stays on screen above the tab bar, and event controls work by touch', async ({ page }) => {
    await openEditor(page, 'minimalist', { withEvents: true, hintSeen: false });
    const pill = page.locator('.edit-hint-pill');
    await expect(pill).toContainText('Tap any outlined text');
    // The pill is pinned to the screen (position: fixed). Right after the editor mounts it may still be settling, so wait.
    const viewport = page.viewportSize();
    const edges = () => pill.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    await expect.poll(async () => (await edges()).top).toBeGreaterThan(0);
    await expect.poll(async () => (await edges()).bottom).toBeLessThan(viewport.height - 60); // above the bottom tab bar
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    await page.locator('[data-edit="names:first"]').first().tap();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Mia');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await snapshot(page)).title).toBe('Mia & Ben');
    await expect(pill).toHaveCount(0); // the first edit retires the tip

    await page.locator('[data-edit="event:title"][data-id="ev1"]').tap();
    await expect(page.locator('[data-event-bar]')).toBeVisible();
    const down = await page.locator('[data-event-move="1"]').boundingBox();
    expect(down.width).toBeGreaterThanOrEqual(40); // a touch-sized button
    await page.locator('[data-event-move="1"]').tap();
    await expect.poll(async () => (await snapshot(page)).events.map(event => event.title)).toEqual(['Sangeet', 'Mehndi', 'Wedding']);
  });
});
