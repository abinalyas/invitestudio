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

test.describe('events can be reordered', () => {
  async function openEvents(page) {
    await page.evaluate(() => { startCreate('Wedding'); });
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await page.getByRole('button', { name: /^Events/ }).click();
    for (const name of ['Haldi', 'Sangeet', 'Reception']) {
      await page.getByLabel('Add an event').fill(name);
      await page.getByRole('button', { name: 'Add event' }).click();
      await page.getByRole('button', { name: new RegExp('^' + name) }).click();   // close the form that opens for a new event
    }
  }
  const order = page => page.evaluate(() => current().functions.map(f => f.title));
  const shown = page => page.locator('.event-item .event-toggle strong').allTextContents();

  test('dragging an event by its handle changes the order guests see, and it is kept', async ({ page }) => {
    await openEvents(page);
    const before = await order(page);
    expect(before.slice(-3)).toEqual(['Haldi', 'Sangeet', 'Reception']);
    const grip = page.getByRole('button', { name: /^Move Reception/ });
    const first = page.locator('.event-item').first();
    const from = await grip.boundingBox();
    const to = await first.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 40, { steps: 5 });
    await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 10 });
    await page.mouse.up();
    const after = await order(page);
    expect(after[0]).toBe('Reception');
    expect(after.slice(1)).toEqual(before.slice(0, -1));
    expect(await shown(page)).toEqual(after);
    // Kept on this device.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('invitestudio-projects'))[0].functions.map(f => f.title));
    expect(stored).toEqual(after);
  });

  test('the up and down arrow keys move an event, and the handle keeps focus', async ({ page }) => {
    await openEvents(page);
    const before = await order(page);
    const grip = page.getByRole('button', { name: /^Move Sangeet/ });
    await grip.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[role="status"]', { hasText: /Sangeet moved to position/ })).toBeAttached();
    expect(await order(page)).toEqual([...before.slice(0, -3), 'Sangeet', 'Haldi', 'Reception']);
    await expect(page.getByRole('button', { name: /^Move Sangeet/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect((await order(page)).slice(-3)).toEqual(['Haldi', 'Reception', 'Sangeet']);
    // The first event cannot move further up.
    const firstGrip = page.locator('.event-grip').first();
    const firstOrder = await order(page);
    await firstGrip.focus();
    await page.keyboard.press('ArrowUp');
    expect(await order(page)).toEqual(firstOrder);
  });
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
    // Pages may look up the prices (a read, nothing to do with replies); everything else counts.
    await page.route('**/api/**', route => { if (!new URL(route.request().url()).pathname.startsWith('/api/pricing')) calls += 1; return route.abort(); });
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

  test('the Replies button in the editor header opens the RSVP dashboard, on a phone too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', route => route.abort());
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'minimalist'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await page.evaluate(() => {
      window.loadRsvpReplies = async () => ({ replies: [{ id: 'r1', name: 'Meera Nair', attending: true, party: 2, events: {}, needs: '', message: '', createdAt: '2027-01-01T10:00:00Z', updatedAt: '2027-01-01T10:00:00Z' }], totals: { replies: 1, attending: 1, notAttending: 0, headcount: 2, byEvent: {} } });
    });
    // From the first screen of the editor (the preview), one tap reaches the replies.
    await page.getByRole('button', { name: 'Replies' }).click();
    await expect(page.getByRole('heading', { name: 'RSVP' })).toBeVisible();
    await expect(page.getByText('Meera Nair')).toBeVisible();
    await expect(page.locator('.rsvp-cards')).toContainText('2');
  });

  test('on a tablet-width screen, Replies brings the panel (below the preview) into view', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.route('**/api/**', route => route.abort());
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'minimalist'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await expect(page.getByRole('heading', { name: 'RSVP' })).not.toBeInViewport();
    await page.getByRole('button', { name: 'Replies', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'RSVP' })).toBeInViewport();
  });

  test('the editor stays on the section you chose when the page redraws after the cloud sync', async ({ page }) => {
    await page.route('**/api/**', route => route.abort());
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'minimalist'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await page.getByRole('button', { name: 'Replies', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'RSVP' })).toBeVisible();
    // "Continue editing" redraws the whole page about a second later, when the draft has refreshed from the cloud.
    await page.evaluate(() => window.render());
    await page.waitForTimeout(300);
    await expect(page.getByRole('heading', { name: 'RSVP' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home' })).toHaveCount(0);
  });

  // This one uses the app's own loadRsvpReplies (the others replace it), so a broken lookup of the open draft or its
  // edit token cannot hide: the call must reach the replies address with the draft's edit token.
  test('the dashboard loads the replies of the open draft with its edit token, and deletes one', async ({ page }) => {
    const wid = '22222222-2222-4222-8222-222222222222', token = 'k'.repeat(43);
    const seen = { auth: [], deleted: [] };
    let replies = [
      { id: '33333333-3333-4333-8333-333333333333', name: 'Meera Nair', attending: true, party: 3, events: {}, needs: 'Vegetarian', message: '', createdAt: '2027-01-01T10:00:00Z', updatedAt: '2027-01-01T10:00:00Z' },
      { id: '44444444-4444-4444-8444-444444444444', name: 'Kiran', attending: false, party: 0, events: {}, needs: '', message: '', createdAt: '2027-01-02T10:00:00Z', updatedAt: '2027-01-02T10:00:00Z' }
    ];
    // 1. Make a draft on the device, then turn it into a saved one: a cloud id, and this browser holds its edit token.
    await page.route('**/api/**', route => route.abort());
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'minimalist'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await page.evaluate(({ wid, token }) => {
      current().cloudId = wid;
      localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ [wid]: token }));
      save();
    }, { wid, token });
    // 2. Open the app again with the saved-draft service switched on, as a returning couple does.
    await page.unroute('**/api/**');
    await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url()), method = route.request().method();
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === `/api/weddings/${wid}/rsvps` && method === 'GET') {
        seen.auth.push(route.request().headers().authorization);
        return json({ replies, totals: { replies: replies.length, attending: replies.filter(r => r.attending).length, notAttending: replies.filter(r => !r.attending).length, headcount: replies.reduce((n, r) => n + r.party, 0), byEvent: {} } });
      }
      const del = url.pathname.match(new RegExp(`^/api/weddings/${wid}/rsvps/([0-9a-f-]+)$`));
      if (del && method === 'DELETE') { seen.deleted.push(del[1]); replies = replies.filter(r => r.id !== del[1]); return json({ deleted: true }); }
      return route.abort();
    });
    await page.reload();
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await page.getByRole('button', { name: /^RSVP/ }).click();
    await expect(page.getByText('Meera Nair')).toBeVisible();
    await expect(page.locator('.rsvp-cards')).toContainText('3people');
    expect(seen.auth[0]).toBe(`Bearer ${token}`);
    await expect(page.getByRole('button', { name: /^Replies/ }).first()).toContainText('2');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.locator('.rsvp-list li')).toHaveCount(1);
    expect(seen.deleted).toEqual(['33333333-3333-4333-8333-333333333333']);
  });

  // ---- Photos -------------------------------------------------------------------------------------------------
  function parseMultipart(request) {
    const boundary = /boundary=(.+)$/.exec(request.headers()['content-type'])[1];
    const buffer = request.postDataBuffer();
    const delimiter = Buffer.from('--' + boundary), parts = {};
    let position = buffer.indexOf(delimiter);
    while (position !== -1) {
      const next = buffer.indexOf(delimiter, position + delimiter.length);
      if (next === -1) break;
      const part = buffer.subarray(position + delimiter.length + 2, next - 2);
      const headerEnd = part.indexOf('\r\n\r\n');
      parts[/name="([^"]+)"/.exec(part.subarray(0, headerEnd).toString())[1]] = part.subarray(headerEnd + 4);
      position = next;
    }
    return parts;
  }
  const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  // A draft that is saved online (cloud id and edit token on this device), opened the way a returning couple opens it,
  // with a stand-in photo service. Nothing reaches production.
  async function openSavedDraft(page, { enabled = true, reason = '', retention = null, published = false } = {}) {
    const wid = '55555555-5555-4555-8555-555555555555', token = 'm'.repeat(43);
    const calls = { uploads: [], patches: [], deleted: [], orders: [] };
    const photos = [];
    const view = () => ({ enabled, reason, limits: { photos: 12, totalBytes: 8388608 }, usage: { count: photos.length, bytes: photos.length * 90000 }, photos: photos.map(p => ({ id: p.id, alt: p.alt, width: p.width, height: p.height, full: p.full, thumb: p.thumb, bytes: 90000 })) });
    await page.route('**/api/**', route => route.abort());
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'cinematic'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await page.evaluate(({ wid, token }) => {
      window.InviteStudioBridge.setTemplate('cinematic'); // a design with three large picture spots
      current().cloudId = wid;
      localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ [wid]: token }));
      save();
    }, { wid, token });
    await page.unroute('**/api/**');
    await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
    await page.route('**/media/**', route => route.fulfill({ contentType: 'image/png', body: TINY_PNG }));
    await page.route('**/api/**', route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const base = `/api/weddings/${wid}/media`;
      if (url.pathname === `/api/weddings/${wid}/retention`) return json(retention || { available: false });
      if (url.pathname === `/api/weddings/${wid}/rsvps` && method === 'GET') return json({ replies: [{ id: '99999999-9999-4999-8999-999999999999', name: 'Meera Nair', attending: true, party: 2, events: {}, needs: '', message: '', createdAt: '2027-01-01T10:00:00Z', updatedAt: '2027-01-01T10:00:00Z' }], totals: { replies: 1, attending: 1, notAttending: 0, headcount: 2, byEvent: {} } });
      if (url.pathname === base && method === 'GET') return json(view());
      if (url.pathname === base && method === 'POST') {
        const parts = parseMultipart(request);
        calls.uploads.push(parts);
        const id = `66666666-6666-4666-8666-${String(photos.length + 1).padStart(12, '0')}`;
        photos.push({ id, alt: '', width: 1600, height: 1067, full: `/media/w/${wid}/${id}-full.webp`, thumb: `/media/w/${wid}/${id}-thumb.webp` });
        return json({ photo: photos[photos.length - 1] }, 201);
      }
      if (url.pathname === base && method === 'PATCH') { const order = request.postDataJSON().order; calls.orders.push(order); photos.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); return json(view()); }
      const one = url.pathname.match(new RegExp(`^${base}/([0-9a-f-]+)$`));
      if (one && method === 'PATCH') { calls.patches.push(request.postDataJSON()); photos.find(p => p.id === one[1]).alt = request.postDataJSON().alt; return json({ photo: {} }); }
      if (one && method === 'DELETE') { calls.deleted.push(one[1]); photos.splice(photos.findIndex(p => p.id === one[1]), 1); return json({ deleted: true }); }
      return route.abort();
    });
    await page.reload();
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await page.getByRole('button', { name: /^Photos/ }).click();
    return { calls, photos };
  }
  const makeImage = (page, type, width, height) => page.evaluate(({ type, width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#c06'); gradient.addColorStop(1, '#06c'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 400; i += 1) { ctx.fillStyle = `hsl(${i * 7 % 360} 70% 50%)`; ctx.fillRect((i * 53) % width, (i * 97) % height, 40, 40); }
    return canvas.toDataURL(type, 0.95).split(',')[1];
  }, { type, width, height });

  test('photos: resized on the device, uploaded, described, reordered and removed', async ({ page }) => {
    const { sniffImage, imageSize, MEDIA_LIMITS } = await import('../../functions/_shared/media.js');
    const { calls } = await openSavedDraft(page);
    await expect(page.getByTestId('photo-usage')).toContainText('0 of 12 photos');
    await expect(page.getByText(/first 3 photos fill this design/)).toBeVisible();
    const big = Buffer.from(await makeImage(page, 'image/png', 3000, 2000), 'base64');
    const portrait = Buffer.from(await makeImage(page, 'image/jpeg', 1200, 1800), 'base64');
    await page.getByLabel('Add photos').setInputFiles([
      { name: 'wide.png', mimeType: 'image/png', buffer: big },
      { name: 'tall.jpg', mimeType: 'image/jpeg', buffer: portrait }
    ]);
    await expect(page.getByTestId('photo-usage')).toContainText('2 of 12 photos');
    await expect(page.locator('.photo-list li')).toHaveCount(2);
    await expect(page.locator('.photo-slot').first()).toHaveText('Cover picture');

    // What the browser made is what the server accepts: right format, shrunk, small.
    expect(calls.uploads).toHaveLength(2);
    const [wide, tall] = calls.uploads;
    const wideFull = new Uint8Array(wide.full), wideThumb = new Uint8Array(wide.thumb);
    const format = sniffImage(wideFull);
    expect(['webp', 'jpeg']).toContain(format);
    expect(sniffImage(wideThumb)).toBe(format);
    expect(imageSize(wideFull, format)).toEqual({ width: 1600, height: 1067 });
    expect(imageSize(wideThumb, format)).toEqual({ width: 480, height: 320 });
    expect(wideFull.length).toBeLessThan(MEDIA_LIMITS.fullBytes);
    expect(wideThumb.length).toBeLessThan(MEDIA_LIMITS.thumbBytes);
    expect(wideFull.length).toBeLessThan(big.length / 2);
    expect(imageSize(new Uint8Array(tall.full), format)).toEqual({ width: 1067, height: 1600 });

    // Real pictures now fill the design's spots in the preview.
    await expect(page.locator('img[src^="/media/w/"]').first()).toBeAttached();

    // Description, order, removal.
    const first = page.getByLabel('Description of photo 1');
    await first.fill('On the beach');
    await first.blur();
    await expect.poll(() => calls.patches.length).toBe(1);
    expect(calls.patches[0]).toEqual({ alt: 'On the beach' });
    await page.getByLabel('Move photo 1 down').click();
    await expect.poll(() => calls.orders.length).toBe(1);
    await expect(page.getByLabel('Description of photo 2')).toHaveValue('On the beach');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.locator('.photo-list li')).toHaveCount(1);
    expect(calls.deleted).toHaveLength(1);
  });

  test('photos: location and camera details inside a picture are removed before it leaves the device', async ({ page }) => {
    const { calls } = await openSavedDraft(page);
    const jpeg = Buffer.from(await makeImage(page, 'image/jpeg', 1200, 800), 'base64');
    const exif = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLatitude 12.9716 N GPSLongitude 77.5946 E Make=SecretCam')]);
    const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
    const tagged = Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
    expect(tagged.includes('GPSLatitude')).toBe(true);
    await page.getByLabel('Add photos').setInputFiles({ name: 'trip.jpg', mimeType: 'image/jpeg', buffer: tagged });
    await expect(page.locator('.photo-list li')).toHaveCount(1);
    for (const part of ['full', 'thumb']) {
      const sent = calls.uploads[0][part];
      expect(sent.includes('GPS')).toBe(false);
      expect(sent.includes('SecretCam')).toBe(false);
      expect(sent.includes('Exif')).toBe(false);
    }
  });

  test('photos: a file that is not a picture is refused with a reason, and nothing is sent', async ({ page }) => {
    const { calls } = await openSavedDraft(page);
    await page.getByLabel('Add photos').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hello') });
    await expect(page.getByRole('alert')).toContainText('notes.pdf');
    await expect(page.getByRole('alert')).toContainText(/photo file/i);
    expect(calls.uploads).toHaveLength(0);
  });

  test('photos: when storage is not set up the panel says so plainly', async ({ page }) => {
    await openSavedDraft(page, { enabled: false, reason: 'NO_STORAGE' });
    await expect(page.getByText(/Photo storage is not set up yet/)).toBeVisible();
    await expect(page.getByLabel('Add photos')).toHaveCount(0);
  });

  test('guests see the couple\'s uploaded photos on the published page', async ({ page }) => {
    const slug = 'asha-ravi', wid = '55555555-5555-4555-8555-555555555555';
    await page.route('**/s/' + slug, route => route.fulfill({ contentType: 'text/html', body: require('fs').readFileSync('index.html', 'utf8') }));
    await page.route('**/media/**', route => route.fulfill({ contentType: 'image/png', body: TINY_PNG }));
    const img = n => ({ id: `77777777-7777-4777-8777-00000000000${n}`, alt: `Photo ${n}`, width: 1600, height: 1067 });
    const photos = [1, 2, 3, 4, 5].map(n => { const p = img(n); return { ...p, full: `/media/w/${wid}/${p.id}-full.webp`, thumb: `/media/w/${wid}/${p.id}-thumb.webp` }; });
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      wedding: { slug, template_id: 'cinematic', name: 'A', category: 'Wedding', title: 'Asha & Ravi', event_date: '2027-02-14', location: 'Hall, Kochi', message: '', story: '', hosts: '', locale: 'English', theme: {}, content: { functions: [], copy: {}, gallery: {} }, sections: [], intro_settings: {}, animation_settings: {}, rsvp: { mode: 'count', open: true, maxParty: 6, replyBy: '', contact: null } },
      photos
    }) }));
    await page.goto('/s/' + slug);
    await page.waitForSelector('[data-public-invitation]');
    const sources = await page.locator('[data-public-invitation] img').evaluateAll(list => list.map(n => n.getAttribute('src')));
    expect(sources.filter(src => /^\/media\/w\//.test(src)).length).toBeGreaterThanOrEqual(3);
    expect(sources.some(src => /-full\.webp$/.test(src))).toBe(true);
    expect(await page.locator('[data-public-invitation] img[alt="Photo 4"]').count()).toBeGreaterThan(0);
  });

  // ---- Retention: how long the website stays online (docs/RETENTION_PLAN.md, step 2) ----------------------------
  const keepInfo = over => ({ available: true, hasClock: true, endsOn: '2027-09-20', deleteOn: '2027-10-04', stage: 'keep', daysLeft: 200, graceDays: 14, warnDays: 14, source: 'event', lastEventDate: '2027-07-20', endsBeforeEvent: false, closed: false, ...over });

  test('retention: far from the end date the editor says nothing (a draft that is not live)', async ({ page }) => {
    await openSavedDraft(page, { retention: keepInfo({}) });
    await page.waitForTimeout(800);
    await expect(page.locator('[data-retention]')).toHaveCount(0);
  });

  test('retention: 14 days before the end, a warning with a way to download replies and ask for more time', async ({ page }) => {
    await openSavedDraft(page, { retention: keepInfo({ endsOn: '2027-09-20', daysLeft: 9 }) });
    const notice = page.locator('[data-retention="soon"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your website closes on 20 September 2027');
    await expect(notice).toContainText('in 9 days');
    await expect(notice.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919567882568\?text=.*keep%20my%20InviteStudio%20website%20online%20for%20longer/);
    await expect(notice.getByRole('link', { name: 'Email' })).toHaveAttribute('href', /^mailto:abinalyas@gmail\.com\?subject=Keep%20my%20InviteStudio%20website%20longer/);
    const download = page.waitForEvent('download');
    await notice.getByRole('button', { name: 'Download replies' }).click();
    expect((await download).suggestedFilename()).toBe('wedding-replies.csv');
  });

  test('retention: after it closes, the couple is told when everything is deleted and how to get it back', async ({ page }) => {
    await openSavedDraft(page, { retention: keepInfo({ stage: 'hidden', endsOn: '2027-09-20', deleteOn: '2027-10-04', daysLeft: -3, closed: true }) });
    const notice = page.locator('[data-retention="closed"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('closed on 20 September 2027');
    await expect(notice).toContainText('deleted for good on 4 October 2027');
    await expect(notice.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /bring%20back%20my%20InviteStudio%20website|would%20like%20it%20back/i);
    await expect(notice.getByRole('button', { name: 'Download replies' })).toBeVisible();
  });

  test('retention: a date that falls before the event is called out', async ({ page }) => {
    await openSavedDraft(page, { retention: keepInfo({ endsOn: '2027-06-01', lastEventDate: '2027-07-20', endsBeforeEvent: true, daysLeft: 120 }) });
    await expect(page.locator('[data-retention="before-event"]')).toContainText('before your event on 20 July 2027');
  });

  test('retention: before the migration is run, or without a clock, there is no notice and no error', async ({ page }) => {
    await openSavedDraft(page, { retention: { available: false } });
    await page.waitForTimeout(800);
    await expect(page.locator('[data-retention]')).toHaveCount(0);
  });

  test('an invitation that has ended says so to guests, with the couple\'s way back', async ({ page }) => {
    await page.route('**/s/asha-ravi', route => route.fulfill({ contentType: 'text/html', body: require('fs').readFileSync('index.html', 'utf8') }));
    await page.route('**/api/**', route => route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ENDED', message: 'This invitation has ended.' } }) }));
    await page.goto('/s/asha-ravi');
    await expect(page.getByRole('heading', { name: 'This invitation has ended.' })).toBeVisible();
    await expect(page.locator('[data-public-invitation]')).toHaveCount(0);
    const contact = page.locator('[data-ended-contact]');
    await expect(contact.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919567882568\?text=.*asha-ravi/);
    await expect(contact.getByRole('link', { name: 'Email us' })).toHaveAttribute('href', /^mailto:abinalyas@gmail\.com\?subject=/);
  });

  test('"Talk to us" is on the home page for people who want something unique', async ({ page }) => {
    await page.goto('/');
    const talk = page.locator('.footer-talk');
    await expect(talk).toContainText('Want something unique?');
    await expect(talk.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919567882568\?text=.*made%20just%20for%20us/);
    await expect(talk.getByRole('link', { name: 'Email' })).toHaveAttribute('href', /^mailto:abinalyas@gmail\.com/);
  });

  test('retention: a draft that would close before the event is warned before it is published', async ({ page }) => {
    await openSavedDraft(page, { retention: keepInfo({ hasClock: false, endsOn: null, deleteOn: null, stage: 'no_clock', daysLeft: null, source: 'none', estimatedEndsOn: '2027-06-01', estimateBeforeEvent: true, lastEventDate: '2027-12-20' }) });
    const notice = page.locator('[data-retention="estimate-before-event"]');
    await expect(notice).toContainText('If you publish today, your website would close on 1 June 2027');
    await expect(notice).toContainText('before your event on 20 December 2027');
  });

  test('retention: the Share dialog shows how long the website will stay online', async ({ page }) => {
    await openSavedDraft(page, { retention: keepInfo({ hasClock: false, endsOn: null, deleteOn: null, stage: 'no_clock', daysLeft: null, source: 'none', estimatedEndsOn: '2027-09-20', estimateBeforeEvent: false }) });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Share invitation/ }).first().click();
    const note = page.locator('[data-kept-note]');
    await expect(note).toContainText('Once live, your website stays online until 20 September 2027');
    await expect(note.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/919567882568/);
  });

  // ---- Draft recovery and the Share panel's wording -------------------------------------------------------------
  // A draft that is saved online (cloud id and edit token on this device), served by a small stand-in for the server.
  async function savedDraftWithServer(page) {
    const wid = '77777777-7777-4777-8777-777777777777', token = 'r'.repeat(43);
    const server = { version: 1, message: '', patches: [], dropPatches: false, loseReply: false, getDelay: 0 };
    const wedding = () => ({
      id: wid, version: server.version, status: 'draft', visibility: 'private', slug: null, name: 'Mira & Arun', category: 'Wedding', template_id: 'savanna-sunset',
      title: 'Mira & Arun', event_date: '2027-01-20', location: '', message: server.message, story: '', hosts: '', locale: 'English', theme: {}, preferences: {},
      cultural_preferences: {}, sections: [], intro_settings: {}, animation_settings: {}, content: { functions: [], copy: {}, gallery: {} }, updated_at: '2026-11-09T10:00:00Z'
    });
    await page.route('**/api/**', route => route.abort());
    await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding', 'minimalist'));
    await page.locator('#projectTitle').fill('Mira & Arun');
    await page.locator('#projectDate').fill('2027-01-20');
    await completeSetupSteps(page);
    await page.evaluate(({ wid, token }) => {
      const p = current();
      p.id = wid; p.cloudId = wid; p.cloudVersion = 1; p.cloudStatus = 'saved'; p.createRequestId = null;
      state.currentId = wid;
      localStorage.setItem('invitestudio-edit-tokens', JSON.stringify({ [wid]: token }));
      save();
      p.cloudStatus = 'saved';      // save() marks a change as unsent; this draft starts out fully saved
      localStorage.setItem('invitestudio-projects', JSON.stringify(state.projects));
    }, { wid, token });
    await page.unroute('**/api/**');
    await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
    await page.route('**/api/**', route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === `/api/weddings/${wid}` && method === 'GET') {
        const snapshot = { wedding: wedding(), photos: [] };     // the copy as it is when asked, even if it arrives late
        if (!server.getDelay) return json(snapshot);
        return new Promise(resolve => setTimeout(() => resolve(json(snapshot)), server.getDelay));
      }
      if (url.pathname === `/api/weddings/${wid}` && method === 'PATCH') {
        if (server.dropPatches) return route.abort();           // the tab "crashed": the server never hears about this edit
        const body = request.postDataJSON();
        if (body.version !== server.version) return json({ error: { code: 'VERSION_CONFLICT', message: 'The wedding changed elsewhere. Reload before saving.' } }, 409);
        server.patches.push(body);
        server.message = body.message ?? server.message;
        server.version += 1;
        if (server.loseReply) return route.abort();              // the server took it; the tab never heard back
        return json({ wedding: wedding() });
      }
      if (url.pathname === `/api/weddings/${wid}/slug-availability`) return json({ available: true, slug: url.searchParams.get('slug'), suggestions: [] });
      if (url.pathname === `/api/weddings/${wid}/publish` && method === 'POST') {
        const body = request.postDataJSON();
        server.version += 1;
        return json({ wedding: { ...wedding(), status: 'published', visibility: 'public', slug: body.slug } });
      }
      if (url.pathname === '/api/edit-links') return json({ wedding: wedding(), photos: [] });
      return route.abort();
    });
    await page.reload();
    return { server, wid };
  }

  test('straight after the first publish the dialog shows the link, with no "update" explanation or button', async ({ page }) => {
    await savedDraftWithServer(page);
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toBeVisible();
    await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
    const dialog = page.locator('#modal-root');
    await expect(dialog.getByRole('button', { name: 'Make it live' })).toBeEnabled({ timeout: 15000 });
    await dialog.getByRole('button', { name: 'Make it live' }).click();
    await expect(dialog.locator('h2')).toHaveText(/your invitation is live/i, { timeout: 15000 });
    await expect(dialog.getByText('Current public link')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Take offline' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Update live page' })).toHaveCount(0);
    await expect(dialog.getByText(/Made changes since going live/)).toHaveCount(0);
    // Opening it again later is when "update" makes sense.
    await dialog.getByRole('button', { name: 'Close' }).click();
    // The editor then carries a prominent "live" banner whose address is a real link.
    const banner = page.locator('.live-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('link', { name: /\/s\/[a-z0-9-]+$/ })).toHaveAttribute('href', /\/s\/[a-z0-9-]+$/);
    await expect(banner.getByRole('link', { name: 'Open' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Copy link' })).toBeVisible();
    await page.getByRole('button', { name: 'Share invitation', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Update live page' })).toBeVisible();
    await expect(dialog.getByText(/Made changes since going live/)).toBeVisible();
  });

  test('a welcome message typed just before a crash is still there when the draft is reopened', async ({ page }) => {
    const { server, wid } = await savedDraftWithServer(page);
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toBeVisible();

    // Type the message. The moment it is typed, this device must already know the server does not have it yet.
    server.dropPatches = true;
    await page.evaluate(() => window.InviteStudioBridge.update({ message: 'Welcome from Mira and Arun' }));
    const stored = await page.evaluate(wid => JSON.parse(localStorage.getItem('invitestudio-projects')).find(p => p.id === wid), wid);
    expect(stored.message).toBe('Welcome from Mira and Arun');
    expect(stored.cloudStatus, 'marked as not yet sent, on disk, before the autosave runs').toBe('pending');

    // The tab "crashes": the autosave never reached the server. Reopen.
    await page.reload();
    expect(server.message, 'the server still has the old (empty) message').toBe('');
    server.dropPatches = false;
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toHaveValue('Welcome from Mira and Arun');

    // And it is sent now, on top of the version it was written against.
    await expect.poll(() => server.patches.length, { timeout: 10000 }).toBeGreaterThan(0);
    expect(server.patches[server.patches.length - 1]).toMatchObject({ message: 'Welcome from Mira and Arun', version: 1 });
    expect(server.message).toBe('Welcome from Mira and Arun');
  });

  test('a save the server accepted but the tab never heard back about does not lose the next edit', async ({ page }) => {
    const { server } = await savedDraftWithServer(page);
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toBeVisible();

    server.loseReply = true;
    await page.evaluate(() => window.InviteStudioBridge.update({ message: 'First words' }));
    await expect.poll(() => server.patches.length, { timeout: 10000 }).toBe(1);
    expect(server.version).toBe(2);                     // the server has it, this tab does not know

    // More is typed straight away. The save of that text goes out against the old version and is refused, even though
    // the only newer copy on the server is this tab's own.
    await page.evaluate(() => window.InviteStudioBridge.update({ message: 'First words, then more' }));
    server.loseReply = false;
    await expect.poll(() => server.message, { timeout: 15000 }).toBe('First words, then more');
    await page.reload();
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toHaveValue('First words, then more');
  });

  test('text typed while the saved copy is still on its way is not replaced by it', async ({ page }) => {
    const { server } = await savedDraftWithServer(page);
    server.getDelay = 1500;
    await page.reload();
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toBeVisible();
    await page.evaluate(() => window.InviteStudioBridge.update({ message: 'Typed during the load' }));
    await page.waitForTimeout(2500);                    // the old copy has now arrived
    await expect(page.getByLabel(/Welcome message/)).toHaveValue('Typed during the load');
    await expect.poll(() => server.message, { timeout: 10000 }).toBe('Typed during the load');
  });

  test('edits that were already saved are not disturbed when the draft is reopened', async ({ page }) => {
    const { server } = await savedDraftWithServer(page);
    server.message = 'Saved earlier';
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toHaveValue('Saved earlier');
    expect(server.patches).toHaveLength(0);
  });

  test('the Share panel says plainly: private now, a link when made live, anyone with the link can open it', async ({ page }) => {
    await savedDraftWithServer(page);
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toBeVisible();
    // The note above the editor
    const guide = page.locator('.share-guide');
    await expect(guide).toContainText('Right now only you can see your invitation');
    await expect(guide).toContainText('anyone who has the link can open it');
    await expect(guide).not.toContainText('Nothing is public until you do');
    // The dialog
    await page.getByRole('button', { name: /Share invitation/ }).first().click();
    const dialog = page.locator('#modal-title').locator('xpath=ancestor::*[contains(@class,"modal")][1]');
    const text = await dialog.innerText();
    expect(text).toContain('Right now it is private.');
    expect(text).toContain('Only you can see your invitation.');
    expect(text).toContain('Anyone who has the link can open it');
    expect(text).toContain('Guests can reply from the live invitation.');
    expect(text).not.toContain('Nobody can see your invitation yet');
    expect(text).not.toContain('can’t reply online yet');
    expect(text).not.toContain('for now the invitation is for viewing');
  });

  test('the Share panel describes replies the way this invitation is set up', async ({ page }) => {
    await savedDraftWithServer(page);
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByLabel(/Welcome message/)).toBeVisible();
    for (const [mode, expected, absent] of [['contact', 'Guests will see your contact details', 'Guests can reply from the live invitation'], ['none', null, 'Replies.']]) {
      await page.evaluate(mode => window.InviteStudioBridge.setRsvp(mode), mode);
      await page.getByRole('button', { name: /Share invitation/ }).first().click();
      const dialog = page.locator('#modal-title').locator('xpath=ancestor::*[contains(@class,"modal")][1]');
      const text = await dialog.innerText();
      if (expected) expect(text).toContain(expected);
      expect(text).not.toContain(absent);
      await page.getByRole('button', { name: 'Close' }).click();
    }
  });
});
