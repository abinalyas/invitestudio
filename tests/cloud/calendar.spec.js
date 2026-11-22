// Add to calendar on a published invitation, with the real server and its security headers: the control opens, the Google link
// carries the event's times, and the .ics file downloads with the right entry.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');

async function createPublished(request, { title, slug }) {
  const created = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `cal-${randomUUID()}` },
    data: {
      templateId: 'minimalist',
      title,
      date: '2027-01-20',
      location: 'Kochi',
      functions: [
        { id: randomUUID(), title: 'Wedding ceremony', date: '2027-01-20', time: '10:00', endTime: '11:30', venue: 'The Garden Estate', description: 'Please arrive early.', visible: true },
        { id: randomUUID(), title: 'Reception', date: '2027-01-20', time: '19:00', venue: 'The Garden Hall', visible: true },
        { id: randomUUID(), title: 'Welcome dinner', visible: true }
      ]
    }
  });
  expect(created.status()).toBe(201);
  const draft = await created.json();
  const published = await request.post(`/api/weddings/${draft.wedding.id}/publish`, {
    headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' }, data: { version: 1, slug }
  });
  expect(published.status()).toBe(200);
}

test('a published invitation offers one Add to calendar button for each dated event, and the file downloads', async ({ page, request }) => {
  const slug = `cal-${randomUUID().slice(0, 8)}`;
  const title = `Calendar ${slug}`;
  await createPublished(request, { title, slug });

  await page.goto(`/s/${slug}`);
  const invitation = page.locator('[data-public-invitation]');
  await expect(invitation).toContainText('Wedding ceremony', { timeout: 15000 });
  // Two of the three events have a date. One plain button each: no menu, no choice of calendars.
  const buttons = invitation.getByRole('link', { name: /^Add to calendar/ });
  await expect(buttons).toHaveCount(2);
  await expect(invitation.getByText(/Google Calendar|Apple, Outlook/)).toHaveCount(0);

  const first = invitation.getByRole('link', { name: 'Add to calendar: Wedding ceremony' });
  await first.scrollIntoViewIfNeeded();
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute('download', 'wedding-ceremony.ics');
  await expect(invitation.getByRole('link', { name: 'Add to calendar: Reception' })).toBeVisible();
  await expect(invitation.getByRole('link', { name: /Welcome dinner/ }).filter({ hasText: 'Add to calendar' })).toHaveCount(0);

  // One tap downloads the file (the page's security rules allow it), and it holds the event.
  const [download] = await Promise.all([page.waitForEvent('download'), first.click()]);
  expect(download.suggestedFilename()).toBe('wedding-ceremony.ics');
  const ics = fs.readFileSync(await download.path(), 'utf8');
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics).toContain('DTSTART:20270120T100000');
  expect(ics).toContain('DTEND:20270120T113000');
  expect(ics).toContain(`SUMMARY:Wedding ceremony – ${title}`);
  expect(ics).toContain('LOCATION:The Garden Estate');
  expect(ics).toContain('Please arrive early.');
  expect(ics).toContain(`URL:${new URL(page.url()).origin}/s/${slug}`);
  expect(ics).toMatch(/\r\nEND:VCALENDAR\r\n$/);
  // The page stays where it was.
  expect(new URL(page.url()).pathname).toBe(`/s/${slug}`);

  // The second event downloads its own file.
  const [second] = await Promise.all([page.waitForEvent('download'), invitation.getByRole('link', { name: 'Add to calendar: Reception' }).click()]);
  expect(second.suggestedFilename()).toBe('reception.ics');
  expect(fs.readFileSync(await second.path(), 'utf8')).toContain('DTSTART:20270120T190000');
});

test('on a phone the button fits the screen with a big enough touch target', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const slug = `cal-${randomUUID().slice(0, 8)}`;
  await createPublished(request, { title: `Phone ${slug}`, slug });
  await page.goto(`/s/${slug}`);
  const button = page.locator('[data-public-invitation]').getByRole('link', { name: 'Add to calendar: Wedding ceremony' });
  await expect(button).toBeAttached({ timeout: 15000 });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(43);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// Phones: a downloaded file is not enough there (the Google Calendar app on Android cannot open one, and an iPhone only offers
// "Add to Calendar" for a calendar entry a website serves). The same button sends each phone to what it can add.
test('on an Android phone the button opens Google Calendar with the event, in a new tab, and the invitation stays open', async ({ browser, request }) => {
  const slug = `cal-${randomUUID().slice(0, 8)}`;
  const title = `Android ${slug}`;
  await createPublished(request, { title, slug });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' });
  // Google is outside the test stack: the new tab's address is all that matters.
  await context.route('https://calendar.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google Calendar</p>' }));
  const page = await context.newPage();
  await page.goto(`/s/${slug}`);
  const button = page.locator('[data-public-invitation]').getByRole('link', { name: 'Add to calendar: Wedding ceremony' });
  await expect(button).toBeAttached({ timeout: 15000 });
  await button.scrollIntoViewIfNeeded();
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  const [tab] = await Promise.all([context.waitForEvent('page'), button.tap()]);
  const url = new URL(tab.url());
  expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(url.searchParams.get('action')).toBe('TEMPLATE');
  expect(url.searchParams.get('text')).toBe(`Wedding ceremony – ${title}`);
  expect(url.searchParams.get('dates')).toBe('20270120T100000/20270120T113000');
  expect(url.searchParams.get('location')).toBe('The Garden Estate');
  expect(url.searchParams.get('details')).toContain('Please arrive early.');
  expect(new URL(page.url()).pathname).toBe(`/s/${slug}`);
  expect(downloaded).toBe(false);
  await context.close();
});

test('on an iPhone the button opens the event as a calendar entry the site serves, which the phone offers to add', async ({ browser, request }) => {
  const slug = `cal-${randomUUID().slice(0, 8)}`;
  const title = `iPhone ${slug}`;
  await createPublished(request, { title, slug });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const page = await context.newPage();
  await page.goto(`/s/${slug}`);
  const button = page.locator('[data-public-invitation]').getByRole('link', { name: 'Add to calendar: Reception' });
  await expect(button).toBeAttached({ timeout: 15000 });
  const address = await button.getAttribute('data-cal-apple');
  expect(address).toMatch(new RegExp(`^/api/public-weddings/${slug}/calendar/[0-9a-f-]{36}\\.ics$`));
  await button.scrollIntoViewIfNeeded();
  // Chromium cannot show the iPhone's sheet, so it saves what the site serves; on an iPhone the same answer opens "Add to Calendar".
  const [response] = await Promise.all([page.waitForResponse(r => r.url().endsWith(address)), button.tap().catch(() => {})]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/calendar; charset=utf-8');
  expect(response.headers()['content-disposition']).toBe('inline; filename="reception.ics"');
  // The body of a navigation that became a download is not kept by the browser: the same address is read again.
  const ics = await (await page.request.get(address)).text();
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics).toContain('DTSTART:20270120T190000');
  expect(ics).toContain(`SUMMARY:Reception – ${title}`);
  expect(ics).toContain('LOCATION:The Garden Hall');
  expect(ics).toContain(`URL:${new URL(page.url()).origin}/s/${slug}`);
  await context.close();
});

test('the served calendar entry is only there for a published invitation\'s own events', async ({ request }) => {
  const slug = `cal-${randomUUID().slice(0, 8)}`;
  await createPublished(request, { title: `Served ${slug}`, slug });
  const body = await (await request.get(`/api/public-weddings/${slug}`)).json();
  const events = body.wedding.content.functions;
  const ceremony = events.find(f => f.title === 'Wedding ceremony');
  const ok = await request.get(`/api/public-weddings/${slug}/calendar/${ceremony.id}.ics`);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toContain('DTEND:20270120T113000');
  // The undated event has no entry; neither has an unknown event, an unknown invitation, or a malformed address.
  const dinner = events.find(f => f.title === 'Welcome dinner');
  expect((await request.get(`/api/public-weddings/${slug}/calendar/${dinner.id}.ics`)).status()).toBe(404);
  expect((await request.get(`/api/public-weddings/${slug}/calendar/${randomUUID()}.ics`)).status()).toBe(404);
  expect((await request.get(`/api/public-weddings/not-${slug}/calendar/${ceremony.id}.ics`)).status()).toBe(404);
  expect((await request.get(`/api/public-weddings/${slug}/calendar/..%2Fx.ics`)).status()).toBe(404);
});
