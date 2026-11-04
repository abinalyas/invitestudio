// Designer (D3) behaviour against the real cloud stack: editing, preview sync, section
// selection, visibility, template changes, save status and honest empty states.
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

const TEMPLATE_NAMES = {
  1: 'Forest Elegance',
  2: 'Kerala Traditions',
  3: 'Spring Blossom',
  4: 'Evening Soirée',
  5: 'Coastal Romance',
  6: 'Modern Minimal',
  7: 'Lotus Reverie'
};

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

async function openDesigner(page, number) {
  await page.goto(`/templates/${number}`);
  await expect(page.getByRole('heading', { name: TEMPLATE_NAMES[number] })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /use this template/i }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${number}$`), { timeout: 15000 });
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });
}

async function waitSaved(page) {
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });
}

test('a field edit updates the preview at once and survives a reload', async ({ page }) => {
  await openDesigner(page, 3);
  const message = `We cannot wait ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Welcome message').fill(message);
  await expect(page.locator('.invitation-canvas')).toContainText(message, { timeout: 2000 });
  await waitSaved(page);

  await page.reload();
  await expect(page.getByLabel('Welcome message')).toHaveValue(message, { timeout: 15000 });
  await expect(page.locator('.invitation-canvas')).toContainText(message, { timeout: 15000 });
});

test('a click on a section in the preview selects it, and the list selects the preview section', async ({ page }) => {
  await openDesigner(page, 2);
  await page.locator('.invitation-canvas [data-section="story"]').click();
  await expect(page.getByRole('button', { name: /our story/i })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Our story', level: 2 })).toBeVisible();

  await page.getByRole('button', { name: /^Events/ }).click();
  await expect(page.getByRole('button', { name: /^Events/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Events', level: 2 })).toBeVisible();
});

test('a hidden section stays hidden after saving and reloading, and leaves the guest navigation', async ({ page }) => {
  await openDesigner(page, 4);
  await expect(page.locator('.invitation-canvas')).toContainText('OUR STORY');
  await page.getByLabel('Show Our story on the invitation').uncheck();
  await waitSaved(page);
  await expect(page.locator('.invitation-canvas')).not.toContainText('OUR STORY');

  await page.reload();
  await expect(page.getByLabel('Show Our story on the invitation')).not.toBeChecked({ timeout: 15000 });
  await expect(page.locator('.invitation-canvas')).not.toContainText('OUR STORY');
});

test('changing design keeps every detail that was entered', async ({ page }) => {
  await openDesigner(page, 1);
  const title = `Keep ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await page.getByLabel('Date').fill('2027-03-14');
  await page.getByLabel('Location').fill('Kochi, Kerala');
  await page.getByLabel('Welcome message').fill('Together with our families.');
  await page.getByRole('button', { name: /our story/i }).click();
  await page.getByLabel('Your story').fill('We met on a train.');
  await waitSaved(page);
  const [before] = await dbQuery('select template_id from weddings where title = $1', [title]);
  expect(before.template_id).toBe('romantic-garden-wedding');

  await page.getByRole('button', { name: 'Change design' }).click();
  await page.locator('.design-option').nth(4).click();
  await waitSaved(page);

  const [after] = await dbQuery('select template_id, location from weddings where title = $1', [title]);
  expect(after.template_id).not.toBe('romantic-garden-wedding');
  expect(after.location).toBe('Kochi, Kerala');
  await expect(page.locator('.invitation-canvas')).toContainText(title);

  await page.reload();
  await expect(page.getByLabel('Couple or celebration names')).toHaveValue(title, { timeout: 15000 });
  await expect(page.getByLabel('Location')).toHaveValue('Kochi, Kerala');
  await expect(page.getByLabel('Date')).toHaveValue('2027-03-14');
  await expect(page.getByLabel('Welcome message')).toHaveValue('Together with our families.');
  await page.getByRole('button', { name: /our story/i }).click();
  await expect(page.getByLabel('Your story')).toHaveValue('We met on a train.');
});

test('the save status says offline while disconnected, and saved only once the server confirms', async ({ page, context }) => {
  await openDesigner(page, 5);
  await page.getByLabel('Couple or celebration names').fill(`Offline ${randomUUID().slice(0, 6)}`);
  await waitSaved(page);

  await context.setOffline(true);
  await expect(page.locator('[data-save-state="offline"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-save-state="offline"]')).toContainText(/kept on this device/i);
  const message = `Offline note ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Welcome message').fill(message);
  await expect(page.locator('.invitation-canvas')).toContainText(message, { timeout: 2000 });

  await context.setOffline(false);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByLabel('Welcome message')).toHaveValue(message, { timeout: 15000 });
});

test('pre-title and hosts appear on the invitation, and no unused button label is offered', async ({ page }) => {
  await openDesigner(page, 6);
  await page.getByLabel('Pre-title').fill('The wedding of');
  await page.getByLabel('Hosts').fill('With the families of Meera and Arjun');
  await expect(page.locator('.invitation-canvas')).toContainText('The wedding of', { timeout: 2000 });
  await expect(page.locator('.invitation-canvas')).toContainText('With the families of Meera and Arjun', { timeout: 2000 });
  await expect(page.getByLabel(/button label/i)).toHaveCount(0);
});

test('gallery stays off with an honest empty state and no upload control', async ({ page }) => {
  await openDesigner(page, 7);
  await page.getByRole('button', { name: /^Gallery/ }).click();
  await expect(page.getByText(/photo storage is available/i)).toBeVisible();
  await expect(page.locator('.editor-controls input[type="file"]')).toHaveCount(0);
  await expect(page.locator('.invitation-canvas')).not.toContainText('Photos will be added here');
});
