// Browser tests for the public invitation page (/s/<slug>): read-only rendering,
// no token or internal identifiers in the page, and a clear not-available state.
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

async function createPublished(request, { title, slug }) {
  const created = await request.post('/api/weddings', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `page-${randomUUID()}` },
    data: {
      templateId: 'eternal',
      title,
      date: '2027-01-20',
      location: 'Kochi',
      functions: [
        { id: randomUUID(), title: 'Wedding ceremony', date: '2027-01-20', time: '10:00', venue: 'The Garden Estate', visible: true },
        { id: randomUUID(), title: 'Private rehearsal', date: '2027-01-19', visible: false }
      ]
    }
  });
  const draft = await created.json();
  const published = await request.post(`/api/weddings/${draft.wedding.id}/publish`, {
    headers: { Authorization: `Bearer ${draft.editToken}`, 'Content-Type': 'application/json' },
    data: { version: 1, slug }
  });
  expect(published.status()).toBe(200);
  return draft;
}

test('a published invitation renders read-only, without tokens or hidden events', async ({ page, request }) => {
  const slug = `page-${randomUUID().slice(0, 8)}`;
  const title = `Read Only ${slug}`;
  const draft = await createPublished(request, { title, slug });

  await page.goto(`/s/${slug}`);
  const invitation = page.locator('[data-public-invitation]');
  await expect(invitation).toContainText(title, { timeout: 15000 });
  await expect(invitation).toContainText('Wedding ceremony');
  await expect(invitation).not.toContainText('Private rehearsal');

  const html = await page.content();
  expect(html).not.toContain(draft.editToken);
  expect(html).not.toContain(draft.wedding.id);
  expect(html).not.toMatch(/token_hash|owner_id|storagePath/);

  // Editing and preview-only controls do not belong on the public page.
  await expect(page.locator('.editor-panel')).toHaveCount(0);
  await expect(page.getByText(/preview only/i)).toHaveCount(0);
});

test('an invitation that does not exist shows a clear not-available message', async ({ page }) => {
  await page.goto(`/s/no-such-invitation-${randomUUID().slice(0, 6)}`);
  await expect(page.getByText('This invitation is not available.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: /create an invitestudio website/i })).toBeVisible();
});

test('an invalid public address is handled without an error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/s/Not%20A%20Slug!!');
  await expect(page.getByText('This invitation is not available.')).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});

test('a live invitation has no InviteStudio header, while the not-available page keeps its way back', async ({ page, request }) => {
  const slug = `page-${randomUUID().slice(0, 8)}`;
  const title = `No Header ${slug}`;
  await createPublished(request, { title, slug });

  await page.goto(`/s/${slug}`);
  await expect(page.locator('[data-public-invitation]')).toContainText(title, { timeout: 15000 });
  await expect(page.locator('header.topbar')).toHaveCount(0);
  await expect(page.locator('a.brand')).toHaveCount(0);

  await page.goto(`/s/missing-${randomUUID().slice(0, 8)}`);
  await expect(page.getByText('This invitation is not available.')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('a.brand')).toHaveCount(1);
});
