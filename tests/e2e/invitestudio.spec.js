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

test('the template page shows the whole design in a phone you can scroll, and the details scroll beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // The static test server has no /templates/<n> route, so open the page the way the application does.
  await page.evaluate(() => { history.pushState({}, '', '/templates/14'); state.page = 'home'; render(); });
  const screen = page.locator('.figma-island-host .detail-screen');
  await expect(screen).toBeVisible();
  await expect(page.getByRole('button', { name: /live preview/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /start with this design/i })).toBeVisible();
  const rendered = await page.locator('.figma-island-host').evaluate(host => {
    const phone = host.shadowRoot.querySelector('.detail-screen');
    const template = phone.shadowRoot.querySelector('[data-packaged-template]');
    return { text: template.textContent.includes('Daniel'), scrolls: phone.scrollHeight > phone.clientHeight + 100 };
  });
  expect(rendered).toEqual({ text: true, scrolls: true });
  // The phone stays in view while the page (the details) scrolls.
  const top = () => page.locator('.figma-island-host').evaluate(host => Math.round(host.shadowRoot.querySelector('.detail-device').getBoundingClientRect().top));
  const before = await top();
  await page.mouse.move(1100, 400);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(400);
  const after = await top();
  expect(after).toBeGreaterThan(-20);
  expect(after).toBeLessThan(before + 1);
});

// Guest replies on a published invitation. The API is a stand-in: nothing here reaches production.
test.describe('guest replies', () => {
  const slug = 'asha-ravi';
  const wedding = prefs => ({
    wedding: {
      slug, template_id: 'minimalist', name: 'Asha & Ravi', category: 'Wedding', title: 'Asha & Ravi', event_date: '2027-02-14',
      location: 'Grand Hall, Kochi', message: '', story: '', hosts: '', locale: 'English', theme: {},
      content: { functions: [{ id: 'e1', title: 'Ceremony', date: '2027-02-14', time: '10:00' }, { id: 'e2', title: 'Reception', date: '2027-02-14', time: '18:00' }], copy: {}, gallery: {} },
      sections: [], intro_settings: {}, animation_settings: {}, rsvp: prefs, published_at: '2026-11-01T00:00:00Z'
    }, photos: []
  });
  const online = { mode: 'count', open: true, maxParty: 4, replyBy: '', contact: null };

  async function stubApi(page, prefs) {
    const sent = { posts: [], puts: [] };
    const token = 'T'.repeat(43);
    let stored = null;
    await page.route('**/s/' + slug, route => route.fulfill({ contentType: 'text/html', body: require('fs').readFileSync('index.html', 'utf8') }));
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url()), method = route.request().method();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === `/api/public-weddings/${slug}`) return json(wedding(prefs));
      if (url.pathname === `/api/public-weddings/${slug}/rsvp` && method === 'POST') {
        const body = route.request().postDataJSON(); sent.posts.push(body);
        stored = { name: body.name, attending: body.attending, party: body.party || 0, events: body.events || {}, needs: body.needs, message: body.message };
        return json({ reply: stored, changeToken: token }, 201);
      }
      if (url.pathname === `/api/public-weddings/${slug}/rsvp/${token}`) {
        if (method === 'PUT') { const body = route.request().postDataJSON(); sent.puts.push(body); stored = { name: body.name, attending: body.attending, party: body.party || 0, events: body.events || {}, needs: body.needs, message: body.message }; return json({ reply: stored }); }
        return stored ? json({ reply: stored, closed: false }) : json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
      }
      return route.abort();
    });
    return { sent, token };
  }

  test('a guest replies, sees a confirmation with a private link, and can change the reply', async ({ page }) => {
    const { sent, token } = await stubApi(page, online);
    await page.goto('/s/' + slug);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('[data-rsvp-open]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Only the couple can see your reply.')).toBeVisible();

    // Required answers are checked before anything is sent.
    await dialog.getByRole('button', { name: 'Send reply' }).click();
    await expect(dialog.getByText('Please enter your name.')).toBeVisible();
    expect(sent.posts).toHaveLength(0);

    await dialog.getByLabel('Your name').fill('Meera Nair');
    await dialog.getByLabel('Yes, I will be there').check();
    await dialog.getByLabel('Reception').check();
    await dialog.getByLabel(/How many people/).selectOption('3');
    await expect(dialog.getByLabel(/How many people/).locator('option')).toHaveCount(4);
    await dialog.getByLabel(/Meal or access needs/).fill('Vegetarian');
    await dialog.getByRole('button', { name: 'Send reply' }).click();

    await expect(dialog.getByText('Thank you, your reply is sent')).toBeVisible();
    expect(sent.posts[0]).toMatchObject({ name: 'Meera Nair', attending: true, party: 3, events: { e1: false, e2: true }, needs: 'Vegetarian', website: '' });
    await expect(dialog.getByText('Reception', { exact: true })).toBeVisible();
    await expect(dialog.locator('.rsvp-link')).toHaveText(`http://127.0.0.1:4173/s/${slug}#reply=${token}`);
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Reopening on the same device shows the reply so it can be changed.
    await page.locator('[data-rsvp-open]').click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Change your reply' })).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveValue('Meera Nair');
    await page.getByLabel('Sorry, I cannot make it').check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Your reply is updated')).toBeVisible();
    expect(sent.puts[0]).toMatchObject({ name: 'Meera Nair', attending: false });
  });

  test('the private link opens the reply and leaves the address bar', async ({ page }) => {
    const { token } = await stubApi(page, online);
    await page.goto('/s/' + slug);
    await page.locator('[data-rsvp-open]').click();
    await page.getByLabel('Your name').fill('Kiran');
    await page.getByLabel('Sorry, I cannot make it').check();
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('Thank you, your reply is sent')).toBeVisible();
    await page.evaluate(() => localStorage.clear());
    await page.goto('about:blank');
    await page.goto(`/s/${slug}#reply=${token}`);
    await expect(page.getByRole('heading', { name: 'Change your reply' })).toBeVisible({ timeout: 10000 });
    expect(page.url()).not.toContain('reply=');
  });

  test('closed replies show no button, and the couple\'s number when given', async ({ page }) => {
    await stubApi(page, { mode: 'count', open: false, maxParty: 4, replyBy: '', contact: { type: 'whatsapp', value: '+91 98765 43210' } });
    await page.goto('/s/' + slug);
    await expect(page.getByText('Replies are closed.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'WhatsApp +91 98765 43210' })).toHaveAttribute('href', 'https://wa.me/919876543210');
    await expect(page.locator('[data-rsvp-open]')).toHaveCount(0);
  });

  test('in the editor the form is a preview only and sends nothing', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/**', route => { calls += 1; return route.abort(); });
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'minimalist'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await page.getByRole('button', { name: /^RSVP/ }).click();
    await expect(page.getByLabel('Accepting replies')).toBeChecked();
    await page.getByLabel('Most people in one reply').fill('6');
    await page.locator('[data-rsvp-open]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Preview only/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send reply' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Close' }).click();
    // Switching replies off in the editor replaces the button with the closed note.
    await page.getByLabel('Accepting replies').uncheck();
    await expect(page.locator('[data-rsvp-open]')).toHaveCount(0);
    expect(calls, 'the editor preview never sends a reply').toBe(0);
  });

  test('the couple\'s dashboard: totals, filters, search, close replies, spreadsheet', async ({ page }) => {
    await page.route('**/api/**', route => route.abort());
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'minimalist'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    const deleted = [];
    await page.evaluate(() => {
      window.__replies = [
        { id: 'r1', name: 'Meera Nair', attending: true, party: 3, events: { e1: true, e2: true }, needs: 'Vegetarian', message: 'See you!', createdAt: '2027-01-01T10:00:00Z', updatedAt: '2027-01-01T10:00:00Z' },
        { id: 'r2', name: '=cmd|calc', attending: true, party: 1, events: { e1: true, e2: false }, needs: '', message: '', createdAt: '2027-01-02T10:00:00Z', updatedAt: '2027-01-02T10:00:00Z' },
        { id: 'r3', name: 'Kiran', attending: false, party: 0, events: { e1: false, e2: false }, needs: '', message: 'Sorry!', createdAt: '2027-01-03T10:00:00Z', updatedAt: '2027-01-03T10:00:00Z' }
      ];
      const totals = () => ({ replies: window.__replies.length, attending: 2, notAttending: 1, headcount: 4, byEvent: { e1: { title: 'Ceremony', replies: 2, headcount: 4 }, e2: { title: 'Reception', replies: 1, headcount: 3 } } });
      window.loadRsvpReplies = async () => ({ replies: window.__replies.slice(), totals: totals() });
      window.deleteRsvpReply = async id => { window.__replies = window.__replies.filter(r => r.id !== id); };
    });
    await page.getByRole('button', { name: /^RSVP/ }).click();
    await expect(page.getByText('Meera Nair')).toBeVisible();
    await expect(page.locator('.rsvp-cards')).toContainText('4');
    await expect(page.locator('table.rsvp-by-event')).toContainText('Reception');

    await page.getByRole('button', { name: /^Not attending 1/ }).click();
    await expect(page.locator('.rsvp-list li')).toHaveCount(1);
    await expect(page.getByText('Kiran')).toBeVisible();
    await page.getByRole('button', { name: /^With needs 1/ }).click();
    await expect(page.locator('.rsvp-list li')).toHaveCount(1);
    await expect(page.getByText('Needs: Vegetarian')).toBeVisible();
    await page.getByRole('button', { name: /^All 3/ }).click();
    await page.getByLabel('Search replies').fill('sorry');
    await expect(page.locator('.rsvp-list li')).toHaveCount(1);
    await page.getByLabel('Search replies').fill('');

    // Closing replies from the dashboard changes the invitation's button.
    await expect(page.locator('.rsvp-status')).toContainText('Accepting replies.');
    await page.getByRole('button', { name: 'Close replies now' }).click();
    await expect(page.locator('.rsvp-status.closed')).toContainText('Replies are closed.');
    await expect(page.locator('[data-rsvp-open]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reopen replies' }).click();
    await expect(page.locator('[data-rsvp-open]').first()).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download spreadsheet/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('wedding-replies.csv');
    const csv = require('fs').readFileSync(await file.path(), 'utf8');
    expect(csv).toContain('"Meera Nair","Yes","3","Ceremony; Reception","Vegetarian"');
    expect(csv).toContain(`"'=cmd|calc"`);

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.locator('.rsvp-list li')).toHaveCount(2);
  });
});
