// Designer (D3) behaviour against the real cloud stack: editing, preview sync, section
// selection, visibility, template changes, save status and honest empty states.
const { test, expect } = require('@playwright/test');
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');

const DB_URL = 'postgres://postgres@127.0.0.1:54329/invitestudio';

// The tests below pick a design by position (1 to 7); these are the current designs, by their number in the address.
const DESIGNS = {
  1: { number: 13, name: 'Modern Heritage' },
  2: { number: 14, name: 'Minimalist' },
  3: { number: 15, name: 'Cinematic' },
  4: { number: 16, name: 'Fairy Tale' },
  5: { number: 18, name: 'Bloom Reveal' },
  6: { number: 19, name: 'Velvet Reveal' },
  7: { number: 20, name: 'Under the Same Moon' }
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

async function openDesigner(page, position) {
  const { number, name } = DESIGNS[position];
  await page.goto(`/templates/${number}`);
  await expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 15000 });
  // "Quick start" skips the setup steps and opens the editor on this design.
  await page.getByRole('button', { name: /quick start/i }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${number}$`), { timeout: 15000 });
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });
}

async function waitSaved(page) {
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 20000 });
}

test('a field edit updates the preview at once and survives a reload', async ({ page }) => {
  await openDesigner(page, 3);
  const message = `We cannot wait ${randomUUID().slice(0, 6)}`;
  await page.getByLabel(/^Welcome message \(optional\)/).fill(message);
  await expect(page.locator('.invitation-canvas')).toContainText(message, { timeout: 2000 });
  await waitSaved(page);

  await page.reload();
  await expect(page.getByLabel(/^Welcome message \(optional\)/)).toHaveValue(message, { timeout: 15000 });
  await expect(page.locator('.invitation-canvas')).toContainText(message, { timeout: 15000 });
});

test('a click on a section in the preview selects it, and the list selects the preview section', async ({ page }) => {
  await openDesigner(page, 2);
  await page.locator('.invitation-canvas [data-section="story"]').click({ timeout: 15000 });
  await expect(page.locator('.editor-pages').getByRole('button', { name: /our story/i })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.editor-controls').getByRole('heading', { name: 'Our story', level: 2 })).toBeVisible();

  await page.locator('.editor-pages').getByRole('button', { name: /^Events/ }).click();
  await expect(page.locator('.editor-pages').getByRole('button', { name: /^Events/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.editor-controls').getByRole('heading', { name: 'Events', level: 2 })).toBeVisible();
});

test('a hidden section stays hidden after saving and reloading, and leaves the guest navigation', async ({ page }) => {
  await openDesigner(page, 2);
  const text = `Our story ${randomUUID().slice(0, 6)}`;
  await page.locator('.editor-pages').getByRole('button', { name: /our story/i }).click();
  await page.getByLabel('Your story').fill(text);
  await expect(page.locator('.invitation-canvas')).toContainText(text, { timeout: 5000 });
  await expect(page.locator('.invitation-canvas')).toContainText('OUR STORY');   // the design's menu link
  await page.getByLabel('Show Our story on the invitation').uncheck();
  await waitSaved(page);
  await expect(page.locator('.invitation-canvas')).not.toContainText(text);
  await expect(page.locator('.invitation-canvas')).not.toContainText('OUR STORY');

  await page.reload();
  await expect(page.getByLabel('Show Our story on the invitation')).not.toBeChecked({ timeout: 15000 });
  await expect(page.locator('.invitation-canvas')).not.toContainText(text);
  await expect(page.locator('.invitation-canvas')).not.toContainText('OUR STORY');
});

test('changing design keeps every detail that was entered', async ({ page }) => {
  await openDesigner(page, 1);
  const title = `Keep ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await page.getByLabel(/^Date \(optional\)/).fill('2027-03-14');
  await page.getByLabel(/^Location \(optional\)/).fill('Kochi, Kerala');
  await page.getByLabel(/^Welcome message \(optional\)/).fill('Together with our families.');
  await page.locator('.editor-pages').getByRole('button', { name: /our story/i }).click();
  await page.getByLabel('Your story').fill('We met on a train.');
  await waitSaved(page);
  const [before] = await dbQuery('select template_id from weddings where title = $1', [title]);
  expect(before.template_id).toBe('modern-heritage');

  await page.getByRole('button', { name: 'Change design' }).click();
  await page.locator('.design-option').nth(4).click();
  await waitSaved(page);

  const [after] = await dbQuery('select template_id, location from weddings where title = $1', [title]);
  expect(after.template_id).not.toBe('modern-heritage');
  expect(after.location).toBe('Kochi, Kerala');
  await expect(page.locator('.invitation-canvas')).toContainText(title);

  await page.reload();
  await expect(page.getByLabel('Couple or celebration names')).toHaveValue(title, { timeout: 15000 });
  await expect(page.getByLabel(/^Location \(optional\)/)).toHaveValue('Kochi, Kerala');
  await expect(page.getByLabel(/^Date \(optional\)/)).toHaveValue('2027-03-14');
  await expect(page.getByLabel(/^Welcome message \(optional\)/)).toHaveValue('Together with our families.');
  await page.locator('.editor-pages').getByRole('button', { name: /our story/i }).click();
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
  await page.getByLabel(/^Welcome message \(optional\)/).fill(message);
  await expect(page.locator('.invitation-canvas')).toContainText(message, { timeout: 2000 });

  await context.setOffline(false);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByLabel(/^Welcome message \(optional\)/)).toHaveValue(message, { timeout: 15000 });
});

test('the hosts line appears on the invitation, and no unused button label is offered', async ({ page }) => {
  // The pre-title field no longer changes the packaged designs (each design words its own line above the names, see
  // the Wording panel), so only the hosts line is checked here.
  await openDesigner(page, 1);
  await page.getByLabel(/^Hosts \(optional\)/).fill('With the families of Meera and Arjun');
  await expect(page.locator('.invitation-canvas')).toContainText('With the families of Meera and Arjun', { timeout: 5000 });
  await expect(page.getByLabel(/button label/i)).toHaveCount(0);
});

test('the photos panel shows an honest empty state and an upload control, and the invitation keeps the design\'s own pictures', async ({ page }) => {
  await openDesigner(page, 7);
  await page.locator('.editor-pages').getByRole('button', { name: /^Photos/ }).click();
  await expect(page.getByText(/No photos yet/i)).toBeVisible();
  await expect(page.getByText(/0 of \d+ photos/)).toBeVisible();
  await expect(page.locator('.editor-controls input[type="file"]')).toHaveCount(1);
  await expect(page.locator('.invitation-canvas')).not.toContainText('Photos will be added here');
});

test('events are added and edited with their own travel details, and persist', async ({ page }) => {
  await openDesigner(page, 1);
  const eventName = `Sangeet ${randomUUID().slice(0, 4)}`;
  await page.locator('.editor-pages').getByRole('button', { name: /^Events/ }).click();
  await page.getByLabel('Add an event').fill(eventName);
  await page.getByRole('button', { name: 'Add event' }).click();

  await page.getByLabel(/^Venue \(optional\)/).fill('The Garden Hall');
  await page.getByText(/^More details/).click();
  await page.getByLabel('Directions link').fill('https://maps.example.com/garden-hall');
  await page.getByLabel(/^Parking/).fill('Parking behind the hall');
  await expect(page.locator('.invitation-canvas')).toContainText(eventName, { timeout: 5000 });
  await expect(page.locator('.invitation-canvas')).toContainText('The Garden Hall', { timeout: 5000 });
  await waitSaved(page);

  await page.reload();
  await page.locator('.editor-pages').getByRole('button', { name: /^Events/ }).click();
  await page.locator('.editor-controls').getByRole('button', { name: new RegExp(eventName) }).first().click();
  await expect(page.getByLabel(/^Venue \(optional\)/)).toHaveValue('The Garden Hall', { timeout: 15000 });
  await page.getByText(/^More details/).click();
  await expect(page.getByLabel('Directions link')).toHaveValue('https://maps.example.com/garden-hall');
  await expect(page.getByLabel(/^Parking/)).toHaveValue('Parking behind the hall');

  await page.getByLabel('Show this event on the invitation').uncheck();
  await waitSaved(page);
  await expect(page.locator('.invitation-canvas')).not.toContainText(eventName);
});

test('removing an event asks first, then removes it from the list and the invitation', async ({ page }) => {
  await openDesigner(page, 3);
  const eventName = `Haldi ${randomUUID().slice(0, 4)}`;
  await page.locator('.editor-pages').getByRole('button', { name: /^Events/ }).click();
  await page.getByLabel('Add an event').fill(eventName);
  await page.getByRole('button', { name: 'Add event' }).click();
  await waitSaved(page);

  await page.getByRole('button', { name: 'Remove event' }).click();
  await expect(page.getByRole('group', { name: new RegExp(`Remove ${eventName}`) })).toBeVisible();
  await page.getByRole('button', { name: 'Keep event' }).click();
  await expect(page.getByLabel(/^Venue \(optional\)/)).toBeVisible();

  await page.getByRole('button', { name: 'Remove event' }).click();
  await page.getByRole('button', { name: 'Remove event' }).last().click();
  await expect(page.locator('.editor-controls').getByRole('button', { name: new RegExp(eventName) })).toHaveCount(0);
  await waitSaved(page);
  await expect(page.locator('.invitation-canvas')).not.toContainText(eventName);
});

test('the RSVP preference is saved and comes back after a reload', async ({ page }) => {
  await openDesigner(page, 4);
  await page.locator('.editor-pages').getByRole('button', { name: /^RSVP/ }).click();
  await expect(page.getByText(/Guests can reply once your invitation is live/i).first()).toBeVisible();
  await page.getByLabel('How guests reply').selectOption('contact');
  await expect(page.getByText(/How should guests reach you/i)).toBeVisible();
  await waitSaved(page);

  await page.reload();
  await page.locator('.editor-pages').getByRole('button', { name: /^RSVP/ }).click();
  await expect(page.getByLabel('How guests reply')).toHaveValue('contact', { timeout: 15000 });
});

test.describe('designer on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('the phone opens on the invitation, with three clear views', async ({ page }) => {
    await openDesigner(page, 5);
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.invitation-canvas')).toBeVisible();
    await expect(page.getByLabel(/^Welcome message \(optional\)/)).not.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sections' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Edit' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('tapping a section in the preview offers its editor; the offer opens the Edit view', async ({ page }) => {
    await openDesigner(page, 1);   // a design without an opening film, so nothing covers the invitation
    await page.locator('.invitation-canvas [data-section="story"]').click({ timeout: 15000 });
    const pill = page.getByRole('button', { name: /^Edit Our story$/ });
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(page.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.editor-controls').getByRole('heading', { name: 'Our story', level: 2 })).toBeVisible();
    await expect(page.getByLabel('Your story')).toBeVisible();
  });

  test('choosing a section in the list opens its editor, and edits show on the invitation', async ({ page }) => {
    await openDesigner(page, 7);
    await page.getByRole('tab', { name: 'Sections' }).click();
    await page.locator('.editor-pages').getByRole('button', { name: /our story/i }).click();
    await expect(page.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
    const text = `Phone edit ${randomUUID().slice(0, 6)}`;
    await page.getByLabel('Your story').fill(text);
    await waitSaved(page);
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.locator('.invitation-canvas')).toContainText(text);
  });
});

test.describe('setup on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });


  test('the three setup steps fit on one row with no sideways scrolling', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { localStorage.clear(); startCreate('Wedding'); });
    await expect(page.locator('#projectTitle')).toBeVisible({ timeout: 15000 });
    const steps = page.locator('.setup-steps li');
    await expect(steps).toHaveCount(3);
    const list = await page.locator('.setup-steps').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(list.scroll).toBeLessThanOrEqual(list.client);
    const tops = await steps.evaluateAll(items => new Set(items.map(item => Math.round(item.getBoundingClientRect().top))).size);
    expect(tops).toBe(1);
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).then(overflow => expect(overflow).toBeLessThanOrEqual(0));
  });
});

test('the default copy is THE WEDDING OF and Our Story, and clearing a field returns to it', async ({ page }) => {
  await openDesigner(page, 2);
  await expect(page.getByLabel(/^Pre-title/)).toHaveValue('THE WEDDING OF');
  await page.locator('.editor-pages').getByRole('button', { name: /our story/i }).click();
  await expect(page.getByLabel('Section heading')).toHaveValue('Our Story');

  await page.getByLabel('Section heading').fill('Our journey');
  await waitSaved(page);
  await page.getByLabel('Section heading').fill('');
  await waitSaved(page);
  await expect(page.getByLabel('Section heading')).toHaveValue('Our Story', { timeout: 15000 });
});

test('quick-add uses the setup presets, and custom events still work', async ({ page }) => {
  await openDesigner(page, 3);
  await page.locator('.editor-pages').getByRole('button', { name: /^Events/ }).click();
  await expect(page.getByRole('button', { name: '+ Reception' })).toBeVisible();
  await page.getByRole('button', { name: '+ Reception' }).click();
  await expect(page.getByRole('button', { name: /^Reception/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Reception' })).toHaveCount(0);
  await waitSaved(page);
  await expect(page.locator('.invitation-canvas')).toContainText('Reception');

  const custom = `Custom ${randomUUID().slice(0, 4)}`;
  await page.getByLabel('Add an event').fill(custom);
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.locator('.editor-controls').getByRole('button', { name: new RegExp(custom) }).first()).toBeVisible();
});

test('edits made while offline reach the server after reconnecting', async ({ page, context }) => {
  await openDesigner(page, 4);
  const title = `Sync ${randomUUID().slice(0, 6)}`;
  await page.getByLabel('Couple or celebration names').fill(title);
  await waitSaved(page);

  await context.setOffline(true);
  await page.getByLabel(/^Location \(optional\)/).fill('Offline Hall, Kochi');
  await page.locator('.editor-pages').getByRole('button', { name: /our story/i }).click();
  await page.getByLabel('Show Our story on the invitation').uncheck();
  await expect(page.locator('[data-save-state="offline"]')).toBeVisible({ timeout: 5000 });

  await context.setOffline(false);
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => {
    const [row] = await dbQuery('select location, sections from weddings where title = $1', [title]);
    return row ? { location: row.location, story: row.sections?.find(s => s.id === 'story')?.visible } : null;
  }, { timeout: 30000 }).toEqual({ location: 'Offline Hall, Kochi', story: false });

  await page.reload();
  await page.locator('.editor-pages').getByRole('button', { name: /our story/i }).click();
  await expect(page.getByLabel('Show Our story on the invitation')).not.toBeChecked({ timeout: 15000 });
});
