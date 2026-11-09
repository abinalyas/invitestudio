// IS-01: content typed into guided setup, or into the editor, must survive refresh and reopening,
// in the browser's own copy AND on the server, for several template structures.
//   minimalist     : packaged template (HTML partials)
//   savanna-sunset : scene template (the other rendering path)
//   fairy-tale     : packaged template with a different content structure (hosts line above the title)
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

const TEMPLATES = ['minimalist', 'savanna-sunset', 'fairy-tale'];
const CONTENT = {
  message: 'Welcome, we are so glad you are here.',
  story: 'We met on a rainy Tuesday.\nIt was love at first umbrella.',
  hosts: 'Mr & Mrs Rao'
};
const BLANK = { message: '', story: '', hosts: '' };
const uniq = prefix => `${prefix} ${randomUUID().slice(0, 6)}`;
const next = page => page.getByRole('button', { name: /^Continue/ });

async function freshStart(page, template) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(id => startCreate('Wedding', id), template);
}

// Drives the guided setup. `content` null leaves the optional step untouched.
async function guidedSetup(page, template, title, content = CONTENT) {
  await freshStart(page, template);
  await page.locator('#projectTitle').fill(title);
  await page.locator('#projectDate').fill('2027-01-20');
  await page.locator('#projectLocation').fill('Kochi');
  await next(page).click();
  await next(page).click();
  if (content) {
    await page.locator('#projectMessage').fill(content.message);
    await page.locator('#projectStory').fill(content.story);
    await page.locator('#projectHosts').fill(content.hosts);
  }
  await next(page).click();
  const open = page.getByRole('button', { name: /open editor/i });
  await expect(open).toBeEnabled({ timeout: 20000 });
  await open.click();
}

const localCopy = (page, title) => page.evaluate(t => {
  const p = JSON.parse(localStorage.getItem('invitestudio-projects') || '[]').find(x => x.title === t);
  return p && { message: p.message, story: p.story, hosts: p.hosts, status: p.cloudStatus, cloudId: p.cloudId };
}, title);

// The server's own copy, read with the draft's private edit token.
const serverCopy = (page, cloudId) => page.evaluate(async id => {
  const tokens = JSON.parse(localStorage.getItem('invitestudio-edit-tokens') || '{}');
  const r = await fetch(`/api/weddings/${id}`, { headers: { Authorization: `Bearer ${tokens[id]}` } });
  const w = (await r.json()).wedding;
  return { message: w.message, story: w.story, hosts: w.hosts };
}, cloudId);

// Waits until the draft says "saved", then checks the server really holds `expected`.
async function expectPersisted(page, title, expected) {
  await expect.poll(async () => (await localCopy(page, title))?.status, { timeout: 20000 }).toBe('saved');
  const { cloudId } = await localCopy(page, title);
  await expect.poll(() => serverCopy(page, cloudId), { timeout: 15000 }).toEqual(expected);
}

// What the person sees: the invitation preview text, including inside shadow roots.
// Lower-cased because several templates set the host line in capitals.
const visibleText = page => page.evaluate(() => {
  const walk = n => {
    if (n.nodeName === 'STYLE' || n.nodeName === 'SCRIPT') return '';
    return (n.shadowRoot ? walk(n.shadowRoot) : '') + (n.nodeType === 3 ? n.textContent : '') + [...(n.childNodes || [])].map(walk).join(' ');
  };
  return walk(document.body).toLowerCase();
});

// Reopens the draft the way a returning visitor does: reload, then "continue".
async function reopen(page) {
  await page.reload();
  await page.waitForFunction(() => typeof continueLastDraft === 'function');
  await page.evaluate(() => continueLastDraft());
  await page.waitForFunction(() => state.page === 'editor');
  await page.waitForTimeout(1200);
}

async function editField(page, label, value) {
  await page.evaluate(() => { state.mobileEditorView = 'edit'; render(); });
  const tab = page.getByRole('tab', { name: /^edit/i });
  if (await tab.count()) await tab.first().click().catch(() => {});
  const field = page.locator('#panel-edit').getByLabel(label).first();
  await field.fill(value);
}

async function openEditorSection(page, name) {
  await page.evaluate(() => { state.mobileEditorView = 'edit'; render(); });
  await page.locator('#panel-sections').getByRole('button', { name: new RegExp(name, 'i') }).first().click();
}

for (const template of TEMPLATES) {
  test.describe(template, () => {
    test('guided setup -> save -> refresh -> reopen', async ({ page }) => {
      const title = uniq(`Setup ${template}`);
      await guidedSetup(page, template, title);
      await expectPersisted(page, title, CONTENT);
      await reopen(page);
      expect(await localCopy(page, title)).toMatchObject(CONTENT);
      const text = await visibleText(page);
      expect(text).toContain('Welcome, we are so glad'.toLowerCase());
      expect(text).toContain('love at first umbrella'.toLowerCase());
      expect(text).toContain('Mr & Mrs Rao'.toLowerCase());   // the host line is shown by every template
      await expectPersisted(page, title, CONTENT);
    });

    test('guided setup -> editor edit -> refresh -> reopen', async ({ page }) => {
      const title = uniq(`SetupEdit ${template}`);
      await guidedSetup(page, template, title);
      await expectPersisted(page, title, CONTENT);
      await editField(page, /Welcome message/, 'Edited welcome');
      await expectPersisted(page, title, { ...CONTENT, message: 'Edited welcome' });
      await reopen(page);
      expect(await localCopy(page, title)).toMatchObject({ ...CONTENT, message: 'Edited welcome' });
      expect(await visibleText(page)).toContain('Edited welcome'.toLowerCase());
    });

    test('guided setup -> leave optional fields blank -> reopen', async ({ page }) => {
      const title = uniq(`Blank ${template}`);
      await guidedSetup(page, template, title, null);
      await expectPersisted(page, title, BLANK);
      await reopen(page);
      expect(await localCopy(page, title)).toMatchObject(BLANK);
      await expectPersisted(page, title, BLANK);
    });

    test('guided setup -> edit repeatedly -> reopen keeps the newest value', async ({ page }) => {
      const title = uniq(`Rapid ${template}`);
      await guidedSetup(page, template, title);
      await expectPersisted(page, title, CONTENT);
      await page.evaluate(() => { state.mobileEditorView = 'edit'; render(); });
      const field = page.locator('#panel-edit').getByLabel(/Welcome message/).first();
      for (let i = 1; i <= 8; i++) await field.fill(`Rapid edit ${i}`);
      await expectPersisted(page, title, { ...CONTENT, message: 'Rapid edit 8' });
      await reopen(page);
      expect(await localCopy(page, title)).toMatchObject({ message: 'Rapid edit 8' });
    });

    test('editor -> edit -> refresh -> reopen (draft started without optional content)', async ({ page }) => {
      const title = uniq(`Editor ${template}`);
      await guidedSetup(page, template, title, null);
      await expectPersisted(page, title, BLANK);
      await editField(page, /Welcome message/, CONTENT.message);
      await editField(page, /Hosts/, CONTENT.hosts);
      await openEditorSection(page, 'story');
      await page.locator('#panel-edit').getByLabel(/Your story/).fill(CONTENT.story);
      await expectPersisted(page, title, CONTENT);
      await reopen(page);
      expect(await localCopy(page, title)).toMatchObject(CONTENT);
      const text = await visibleText(page);
      expect(text).toContain('Welcome, we are so glad'.toLowerCase());
      expect(text).toContain('Mr & Mrs Rao'.toLowerCase());
    });

    test('a slow first save does not wipe content typed meanwhile', async ({ page }) => {
      await page.route('**/api/weddings', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        await new Promise(r => setTimeout(r, 3000));
        return route.continue();
      });
      const title = uniq(`Slow ${template}`);
      await guidedSetup(page, template, title);
      await expectPersisted(page, title, CONTENT);
    });
  });
}

test('an existing draft (saved before this fix, with no newer fields) can be updated and reopened', async ({ page }) => {
  const title = uniq('Legacy');
  await guidedSetup(page, 'minimalist', title, null);
  await expectPersisted(page, title, BLANK);
  // Simulate an older draft: strip the fields an old build never wrote, then reload.
  await page.evaluate(t => {
    const list = JSON.parse(localStorage.getItem('invitestudio-projects'));
    const p = list.find(x => x.title === t);
    delete p.message; delete p.story; delete p.hosts; delete p.copy;
    localStorage.setItem('invitestudio-projects', JSON.stringify(list));
  }, title);
  await reopen(page);
  await editField(page, /Hosts/, 'Legacy Hosts');
  await expectPersisted(page, title, { ...BLANK, hosts: 'Legacy Hosts' });
  await reopen(page);
  expect(await localCopy(page, title)).toMatchObject({ hosts: 'Legacy Hosts' });
});

test('a failed save says so and offers a way to recover; it never claims "saved"', async ({ page }) => {
  const title = uniq('Failing');
  await guidedSetup(page, 'minimalist', title);
  await expectPersisted(page, title, CONTENT);
  await page.route('**/api/weddings/*', route => route.request().method() === 'PATCH' || route.request().method() === 'PUT'
    ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'nope' } }) })
    : route.continue());
  await editField(page, /Welcome message/, 'This will not be accepted');
  await expect.poll(async () => (await localCopy(page, title)).status, { timeout: 20000 }).not.toBe('saved');
  expect(await page.evaluate(() => window.cloudSaveLabel(current()))).not.toMatch(/^saved/i);
  // The text is still on the device.
  expect((await localCopy(page, title)).message).toBe('This will not be accepted');
});
