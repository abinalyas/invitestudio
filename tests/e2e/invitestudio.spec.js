const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('homepage starts a short personalised-preview journey', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /make the moment|find the feeling|invite.*moment/i })).toBeVisible();
  await page.getByRole('button', { name: /start with a preview/i }).click();
  await expect(page.getByRole('heading', { name: /create your invitation/i })).toBeVisible();
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-20');
  await page.getByRole('button', { name: /create my preview/i }).click();
  await expect(page.getByText(/your first preview is ready/i)).toBeVisible();
  await expect(page.locator('main')).toContainText('Mira & Arun');
});

test('same-device recovery offers Continue Editing for the last draft', async ({ page }) => {
  const draftId = '7d4f6a30-8e5e-4d2b-9c8a-1b2c3d4e5f60';
  await page.evaluate(({ draftId }) => {
    const project = {
      id: draftId,
      cloudId: draftId,
      cloudStatus: 'saved',
      cloudVersion: 3,
      name: 'Anika & Rohan',
      title: 'Anika & Rohan',
      category: 'Wedding',
      templateId: 'eternal',
      status: 'Draft',
      updated: 'Just now',
      date: '2027-02-14',
      location: 'Kochi, India',
      message: 'We cannot wait to celebrate with you.',
      story: 'Our story.',
      functions: [],
      sections: [],
      theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' },
      photos: []
    };
    localStorage.setItem('invitestudio-projects', JSON.stringify([project]));
    localStorage.setItem('invitestudio-current-draft', JSON.stringify({
      localId: draftId,
      cloudId: draftId,
      updatedAt: Date.now()
    }));
  }, { draftId });
  await page.reload();

  await expect(page.getByRole('region', { name: /continue your draft/i })).toContainText('Anika & Rohan');
  await page.getByRole('button', { name: /continue editing/i }).click();
  await expect(page.locator('.editor-shell')).toBeVisible();
  await expect(page.locator('.editor-canvas')).toContainText('Anika & Rohan');
});

test('cloud drafts encourage optional cross-device email recovery', async ({ page }) => {
  const draftId = '8e5e7b41-9f6f-4e3c-a9d1-2b3c4d5e6f70';
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
  await page.evaluate(({ draftId }) => {
    const project = {
      id: draftId,
      cloudId: draftId,
      cloudStatus: 'saved',
      cloudVersion: 1,
      name: 'Mira & Arun',
      title: 'Mira & Arun',
      category: 'Wedding',
      templateId: 'eternal',
      status: 'Draft',
      updated: 'Just now',
      functions: [],
      sections: [],
      theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' },
      photos: []
    };
    localStorage.setItem('invitestudio-projects', JSON.stringify([project]));
    localStorage.setItem('invitestudio-current-draft', JSON.stringify({ localId: draftId, cloudId: draftId }));
    localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ [draftId]: 'a'.repeat(43) }));
  }, { draftId });
  await page.reload();

  await page.getByRole('button', { name: /continue editing/i }).click();
  const prompt = page.getByRole('region', { name: /recover this draft on another device/i });
  await expect(prompt).toContainText('Keep editing from any device');
  await prompt.getByRole('button', { name: /send me the link/i }).click();
  await expect(page.getByRole('dialog')).toContainText(/email me a private editing link/i);
  await expect(page.getByLabel('Email address')).toBeVisible();
});

test('intro style changes to a compatible signature transition', async ({ page }) => {
  await page.evaluate(() => { startCreate('Wedding'); });
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-20');
  await page.getByRole('button', { name: /create my preview/i }).click();
  await page.evaluate(() => { state.editorTab = 'Theme'; state.mobileEditorView = 'edit'; render(); });
  const style = page.locator('.editor-panel select').first();
  const transition = page.locator('#intro-transition-select');
  await expect(style).toBeVisible();
  await style.selectOption('floral');
  await expect(transition).toHaveValue('floral');
  const floralOptions = await transition.locator('option').evaluateAll(options => options.map(o => o.value));
  expect(floralOptions).toContain('floral');
  expect(floralOptions).not.toContain('page-turn');
  await style.selectOption('envelope');
  await expect(transition).toHaveValue('envelope');
  const envelopeOptions = await transition.locator('option').evaluateAll(options => options.map(o => o.value));
  expect(envelopeOptions).toContain('envelope');
  expect(envelopeOptions).not.toContain('floral');
  const expectedDefaults = {cinematic:'dissolve',floral:'floral',envelope:'envelope',monogram:'monogram',editorial:'page-turn',celebration:'confetti',nature:'scenic',type:'type-wipe',storybook:'illustration',light:'light-sweep'};
  for (const [intro, signature] of Object.entries(expectedDefaults)) {
    await style.selectOption(intro);
    await expect(transition).toHaveValue(signature);
    const values = await transition.locator('option').evaluateAll(options => options.map(o => o.value));
    expect(values).toContain(signature);
  }
});

test('preview and publish dialog provide an honest path back to the invitation', async ({ page }) => {
  await page.evaluate(() => { startCreate('Wedding'); });
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-20');
  await page.getByRole('button', { name: /create my preview/i }).click();
  await page.evaluate(() => { state.page = 'preview'; state.device = 'mobile'; render(); });
  await expect(page.locator('main')).toContainText('Mira & Arun');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(/you can’t publish a live website yet/i)).toBeVisible();
  await page.getByRole('button', { name: /view my preview/i }).click();
  await expect(page.getByText('Website preview')).toBeVisible();
  await expect(page.locator('main')).toContainText('Mira & Arun');
});

for (const width of [320, 375, 390, 768, 1280]) {
  test(`home page has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
}
