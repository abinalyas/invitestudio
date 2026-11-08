const { completeSetupSteps } = require('../support/setup');
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('homepage starts a short personalised-preview journey', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /create a wedding|make the moment|find the feeling|invite.*moment/i })).toBeVisible();
  // The big button is a link to the template gallery, where the couple picks a design first.
  // (The plain static test server has no route for /templates, so only the destination is checked here.)
  await expect(page.getByRole('link', { name: /start your invitation/i }).first()).toHaveAttribute('href', '/templates');
  // Starting from scratch (the "New website" path) opens the setup wizard.
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await expect(page.getByRole('heading', { name: /create your invitation/i })).toBeVisible();
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-20');
  await completeSetupSteps(page);
  await expect(page.getByText(/your first preview is ready/i)).toBeVisible();
  await expect(page.locator('main')).toContainText('Mira & Arun');
});

test('intro style changes to a compatible signature transition', async ({ page }) => {
  await page.evaluate(() => { startCreate('Wedding'); });
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-20');
  await completeSetupSteps(page);
  // The designer is the default editor now; this test covers the advanced editor's intro controls.
  await page.evaluate(() => { state.editorMode = 'advanced'; state.editorTab = 'Theme'; state.mobileEditorView = 'edit'; render(); });
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
  await completeSetupSteps(page);
  await page.evaluate(() => { state.page = 'preview'; state.device = 'mobile'; render(); });
  await expect(page.locator('main')).toContainText('Mira & Arun');
  await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
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

test('malformed private link does not break the app', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?draft=3f2c1a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f');
  await expect(page.getByRole('heading', { name: /create a wedding|make the moment|find the feeling|invite.*moment/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test('new visitors do not receive a demo draft', async ({ page }) => {
  await page.goto('/');
  const stored = await page.evaluate(() => localStorage.getItem('invitestudio-projects'));
  expect(stored === null || !stored.includes('Meera & Abin')).toBe(true);
});

test('"Open editor" opens the editor even when setup was started from a template page', async ({ page }) => {
  // Setup can start from a template's own address (its preview popup, "Choose this design"). The editor must not be hidden
  // behind that earlier page when setup finishes.
  await page.evaluate(() => { history.pushState({}, '', '/templates/9'); startCreate('Wedding'); });
  await expect(page.getByRole('heading', { name: /create your invitation/i })).toBeVisible();
  await page.locator('#projectTitle').fill('Mira & Arun');
  await completeSetupSteps(page);
  await expect(page.getByText(/your first preview is ready/i)).toBeVisible();
  await expect(page.locator('.editor-header, .editor-page').first()).toBeVisible();
  await expect(page.locator('.editor-controls')).toBeAttached();
  expect(new URL(page.url()).pathname).toBe('/');
});

test('a new event shows only the essentials; the rest is tucked away and optional', async ({ page }) => {
  await page.evaluate(() => { startCreate('Wedding'); });
  await page.locator('#projectTitle').fill('Mira & Arun');
  await completeSetupSteps(page);
  await page.getByRole('button', { name: /^Events/ }).first().click();
  await page.getByRole('button', { name: /\+ Wedding ceremony/ }).click();
  await expect(page.getByText(/only the name is needed/i)).toBeVisible();
  await expect(page.getByText('(required)')).toBeVisible();
  const more = page.locator('details.event-more');
  await expect(more).not.toHaveAttribute('open', '');
  await expect(page.getByLabel(/dress code/i)).toBeHidden();
  await more.locator('summary').click();
  await expect(page.getByLabel(/dress code/i)).toBeVisible();
});

test('guided setup opens with the chosen design already selected', async ({ page }) => {
  await page.evaluate(() => window.InviteStudioBridge.startSetup('minimalist'));
  await expect(page.getByRole('heading', { name: /create your invitation/i })).toBeVisible();
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.locator('.setup-template.selected')).toContainText('Minimalist');
});

test('event times are real time fields, saved as HH:MM and shown as 4:00 PM', async ({ page }) => {
  await page.evaluate(() => { startCreate('Wedding'); });
  await page.locator('#projectTitle').fill('Mira & Arun');
  await completeSetupSteps(page);
  await page.getByRole('button', { name: /^Events/ }).first().click();
  await page.getByRole('button', { name: /\+ Wedding ceremony/ }).click();
  const start = page.getByLabel(/start time/i);
  await expect(start).toHaveAttribute('type', 'time');
  await start.fill('16:00');
  expect(await page.evaluate(() => current().functions[0].time)).toBe('16:00');
  // Whatever an older draft or a pasted value holds, the cloud copy is clean and the field shows it as a time.
  await page.evaluate(() => { current().functions[0].time = '4:00 PM'; current().functions[0].endTime = 'late'; });
  expect(await page.evaluate(() => InviteEventFields.cloudEvents(current().functions)[0])).toMatchObject({ time: '16:00', endTime: '' });
});
