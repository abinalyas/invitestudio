// Regression tests for the three D0 defects. Each test states the correct behaviour
// and was run against the code before its fix (see docs/DEFECTS_D0.md).
const { completeSetupSteps } = require('../support/setup');
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

async function dbQuery(sql, params) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.end();
  }
}

// Reads one field of the local project with the given title.
async function projectField(page, title, field) {
  return page.evaluate(([projectTitle, name]) => {
    const project = JSON.parse(localStorage.getItem('invitestudio-projects') || '[]').find(p => p.title === projectTitle);
    return project ? (project[name] ?? null) : null;
  }, [title, field]);
}

async function createDraft(request, templateId = 'eternal', title = 'Regression Couple') {
  return request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `reg-${randomUUID()}` },
    data: { templateId, title }
  });
}

// Creates a website through the real setup flow and waits until its cloud copy is saved.
async function createWebsiteInBrowser(page, title) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => startCreate('Wedding'));
  await page.locator('#projectTitle').fill(title);
  await page.locator('#projectDate').fill('2027-01-20');
  await completeSetupSteps(page);
  await expect.poll(() => projectField(page, title, 'cloudStatus'), { timeout: 20000 }).toBe('saved');
}

test.describe('D0 defect 1: intro media must not break saving', () => {
  // Reproduced before the fix: an 800 KB intro image was stored on the device, but its save
  // (about 1.09 MB once base64-encoded) was rejected, so the server version never advanced.
  test('intro image and music uploads are locked until media storage exists', async ({ page }) => {
    const title = `Intro Locked ${randomUUID().slice(0, 6)}`;
    await createWebsiteInBrowser(page, title);
    await page.evaluate(() => { state.editorMode = 'advanced'; state.editorTab = 'Theme'; state.mobileEditorView = 'edit'; render(); });
    await expect(page.locator('.editor-control', { hasText: 'Intro image' }).locator('input[type="file"]')).toBeDisabled();
    await expect(page.locator('.editor-control', { hasText: 'Optional intro music' }).locator('input[type="file"]')).toBeDisabled();
  });

  test('a draft that already holds large local intro media still saves, and the media stays off the server', async ({ page }) => {
    const title = `Legacy Media ${randomUUID().slice(0, 6)}`;
    await createWebsiteInBrowser(page, title);
    const versionBefore = await projectField(page, title, 'cloudVersion');

    // Legacy data from before the upload was locked: a 1.1 MB image on this device.
    await page.evaluate(() => {
      const project = current();
      project.introSettings = { enabled: true, style: 'floral', image: 'data:image/png;base64,' + 'A'.repeat(1100000) };
      save();
    });

    await expect.poll(() => projectField(page, title, 'cloudVersion'), { timeout: 20000 }).toBeGreaterThan(versionBefore);
    expect(await projectField(page, title, 'cloudStatus')).toBe('saved');
    // The local copy keeps the media; the server copy does not.
    expect(String((await projectField(page, title, 'introSettings'))?.image || '').slice(0, 5)).toBe('data:');
    const [row] = await dbQuery('select intro_settings::text as intro from weddings where title = $1', [title]);
    expect(row.intro).not.toContain('data:');
    expect(row.intro).toContain('floral');
  });

  test('the server refuses media embedded in an invitation field, with a clear message', async ({ request }) => {
    const created = await (await createDraft(request, 'eternal', `Refuse ${randomUUID().slice(0, 6)}`)).json();
    const response = await request.patch(`/api/weddings/${created.wedding.id}`, {
      headers: { Authorization: `Bearer ${created.editToken}`, 'Content-Type': 'application/json' },
      data: { version: 1, introSettings: { image: 'data:image/png;base64,AAAA' } }
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.fields.introSettings).toMatch(/cannot be saved/i);
  });
});

test.describe('D0 defect 2: template selection is explicit', () => {
  // birthday is a seeded database row for a non-wedding occasion, which is outside launch scope.
  for (const templateId of ['birthday', 'starter-wedding-anniversary']) {
    test(`the API refuses "${templateId}", which has no registered design`, async ({ request }) => {
      const response = await createDraft(request, templateId);
      expect(response.status()).toBe(422);
      expect((await response.json()).error.fields.templateId).toBeTruthy();
    });
  }

  test('an unregistered template is reported as unavailable, not drawn as another design', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const template = tpl('retired-design-x');
      return { unavailable: template?.unavailable === true, name: template?.name || '' };
    });
    expect(result.unavailable).toBe(true);
    expect(result.name).not.toBe('Timeless Romance');
  });

  test('a website whose design is unavailable shows an explicit message, not an invitation', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      state.projects = [{ id: 'missing-design', name: 'Retired', title: 'Retired design', templateId: 'retired-design-x', status: 'Draft', functions: [], sections: [], photos: [], theme: {} }];
      state.page = 'preview';
      state.currentId = 'missing-design';
      render();
    });
    await expect(page.getByRole('heading', { name: /no longer available/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /choose a template/i })).toBeVisible();
  });
});

test.describe('D0 defect 3: projects can be deleted', () => {
  test('the API deletes a draft with its token and the draft is gone', async ({ request }) => {
    const created = await (await createDraft(request, 'eternal', `Delete ${randomUUID().slice(0, 6)}`)).json();
    const auth = { Authorization: `Bearer ${created.editToken}` };
    const deleted = await request.delete(`/api/weddings/${created.wedding.id}`, { headers: auth });
    expect(deleted.status()).toBe(204);
    expect((await request.get(`/api/weddings/${created.wedding.id}`, { headers: auth })).status()).toBe(403);
    const rows = await dbQuery('select count(*)::int as n from weddings where id = $1', [created.wedding.id]);
    expect(rows[0].n).toBe(0);
  });

  test('deleting removes the private links and the public address with the website', async ({ request }) => {
    const slug = `gone-${randomUUID().slice(0, 8)}`;
    const created = await (await createDraft(request, 'eternal', `Public ${randomUUID().slice(0, 6)}`)).json();
    await request.post(`/api/weddings/${created.wedding.id}/publish`, {
      headers: { Authorization: `Bearer ${created.editToken}`, 'Content-Type': 'application/json' },
      data: { version: 1, slug }
    });
    expect((await request.get(`/api/public-weddings/${slug}`)).status()).toBe(200);
    await request.delete(`/api/weddings/${created.wedding.id}`, { headers: { Authorization: `Bearer ${created.editToken}` } });
    expect((await request.get(`/api/public-weddings/${slug}`)).status()).toBe(404);
    const tokens = await dbQuery('select count(*)::int as n from edit_tokens where wedding_id = $1', [created.wedding.id]);
    expect(tokens[0].n).toBe(0);
  });

  test("deleting requires the website's own token", async ({ request }) => {
    const a = await (await createDraft(request, 'eternal', `Keep ${randomUUID().slice(0, 6)}`)).json();
    const b = await (await createDraft(request, 'eternal', `Other ${randomUUID().slice(0, 6)}`)).json();
    expect((await request.delete(`/api/weddings/${a.wedding.id}`)).status()).toBe(401);
    expect((await request.delete(`/api/weddings/${a.wedding.id}`, { headers: { Authorization: `Bearer ${b.editToken}` } })).status()).toBe(403);
    const rows = await dbQuery('select count(*)::int as n from weddings where id = $1', [a.wedding.id]);
    expect(rows[0].n).toBe(1);
  });

  test('the dashboard offers a delete action for each project', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { ensureProject(); save(); state.page = 'dashboard'; render(); });
    await expect(page.getByRole('button', { name: /^delete$/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('deleting from the dashboard, after confirmation, removes the website and its cloud copy', async ({ page }) => {
    const title = `Dashboard Delete ${randomUUID().slice(0, 6)}`;
    await createWebsiteInBrowser(page, title);
    const cloudId = await projectField(page, title, 'cloudId');
    await page.evaluate(() => { state.page = 'dashboard'; render(); });

    const card = page.locator('article.project-card', { hasText: title });
    await card.getByRole('button', { name: /^delete$/i }).click();
    const dialog = page.locator('#modal-root');
    await expect(dialog).toContainText(/permanently removes/i);
    // Keeping it changes nothing.
    await dialog.getByRole('button', { name: /keep it/i }).click();
    await expect(page.locator('#modal-root')).toBeEmpty();
    expect((await dbQuery('select count(*)::int as n from weddings where id = $1', [cloudId]))[0].n).toBe(1);

    await card.getByRole('button', { name: /^delete$/i }).click();
    await page.locator('#modal-root').getByRole('button', { name: /delete permanently/i }).click();
    await expect(page.locator('article.project-card', { hasText: title })).toHaveCount(0, { timeout: 15000 });
    expect((await dbQuery('select count(*)::int as n from weddings where id = $1', [cloudId]))[0].n).toBe(0);
    expect(await page.evaluate(t => JSON.parse(localStorage.getItem('invitestudio-projects') || '[]').some(p => p.title === t), title)).toBe(false);
  });
});
