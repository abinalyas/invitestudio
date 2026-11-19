// Add to calendar on a published invitation, with the real server and its security headers: the control opens, the Google link
// carries the event's times, and the .ics file downloads with the right entry.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');

async function createPublished(request, { title, slug }) {
  const created = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `cal-${randomUUID()}` },
    data: {
      templateId: 'modern-heritage',
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

test('a published invitation offers Add to calendar for each dated event, and the file downloads', async ({ page, request }) => {
  const slug = `cal-${randomUUID().slice(0, 8)}`;
  const title = `Calendar ${slug}`;
  await createPublished(request, { title, slug });

  await page.goto(`/s/${slug}`);
  const invitation = page.locator('[data-public-invitation]');
  await expect(invitation).toContainText('Wedding ceremony', { timeout: 15000 });
  // Two of the three events have a date.
  const controls = invitation.locator('details[data-cal]');
  await expect(controls).toHaveCount(2);

  const first = controls.first();
  await first.scrollIntoViewIfNeeded();
  await expect(first.getByRole('link', { name: 'Google Calendar' })).toBeHidden();
  await first.locator('summary').click();
  await expect(first.getByRole('link', { name: 'Google Calendar' })).toBeVisible();
  await expect(first.getByRole('link', { name: 'Apple, Outlook and others' })).toBeVisible();

  const google = new URL(await first.getByRole('link', { name: 'Google Calendar' }).getAttribute('href'));
  expect(google.origin + google.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(google.searchParams.get('text')).toBe(`Wedding ceremony – ${title}`);
  expect(google.searchParams.get('dates')).toBe('20270120T100000/20270120T113000');
  expect(google.searchParams.get('location')).toBe('The Garden Estate');
  expect(google.searchParams.get('details')).toContain('Please arrive early.');
  expect(google.searchParams.get('details')).toContain(`/s/${slug}`);
  await expect(first.getByRole('link', { name: 'Google Calendar' })).toHaveAttribute('target', '_blank');
  await expect(first.getByRole('link', { name: 'Google Calendar' })).toHaveAttribute('rel', /noopener/);

  // The file downloads (the page's security rules allow it) and holds the event.
  const [download] = await Promise.all([page.waitForEvent('download'), first.getByRole('link', { name: 'Apple, Outlook and others' }).click()]);
  expect(download.suggestedFilename()).toBe('wedding-ceremony.ics');
  const ics = fs.readFileSync(await download.path(), 'utf8');
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics).toContain('DTSTART:20270120T100000');
  expect(ics).toContain('DTEND:20270120T113000');
  expect(ics).toContain(`SUMMARY:Wedding ceremony – ${title}`);
  expect(ics).toContain('LOCATION:The Garden Estate');
  expect(ics).toContain(`URL:${new URL(page.url()).origin}/s/${slug}`);
  expect(ics).toMatch(/\r\nEND:VCALENDAR\r\n$/);

  // The control opens and closes with a tap on its label, and works from the keyboard.
  await first.locator('summary').click();
  await expect(first.getByRole('link', { name: 'Google Calendar' })).toBeHidden();
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first.getByRole('link', { name: 'Google Calendar' })).toBeVisible();
});

test('on a phone the control and its two options fit the screen, with big enough touch targets', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const slug = `cal-${randomUUID().slice(0, 8)}`;
  await createPublished(request, { title: `Phone ${slug}`, slug });
  await page.goto(`/s/${slug}`);
  const first = page.locator('[data-public-invitation] details[data-cal]').first();
  await expect(first).toBeAttached({ timeout: 15000 });
  await first.scrollIntoViewIfNeeded();
  await first.locator('summary').click();
  for (const target of [first.locator('summary'), first.getByRole('link', { name: 'Google Calendar' }), first.getByRole('link', { name: 'Apple, Outlook and others' })]) {
    const box = await target.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(43);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
