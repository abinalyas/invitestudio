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
