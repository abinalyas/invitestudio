// The date typed in the first setup step becomes a "Wedding ceremony" event: added once, kept in step until edited, never re-added.
const { test, expect } = require('@playwright/test');

const events = page => page.evaluate(() => (JSON.parse(localStorage.getItem('invitestudio-projects') || '[]')[0] || {}).functions || []);
const next = page => page.getByRole('button', { name: /^Continue/ }).first();
const back = page => page.getByRole('button', { name: /Back/ }).first();

async function start(page, { date = '2027-02-14', location = 'Kochi, Kerala' } = {}) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  if (date) await page.locator('#projectDate').fill(date);
  await page.locator('#projectLocation').fill(location);
}

test('the setup date becomes a Wedding ceremony event with the location as its venue', async ({ page }) => {
  await start(page);
  await next(page).click();
  await expect(page.locator('#ceremonyNote')).toBeVisible();
  const list = await events(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ title: 'Wedding ceremony', date: '2027-02-14', venue: 'Kochi, Kerala', time: '' });
});

test('no date means no event', async ({ page }) => {
  await start(page, { date: '' });
  await next(page).click();
  await expect(page.getByRole('heading', { name: /your events/i })).toBeVisible();
  expect(await events(page)).toHaveLength(0);
  await expect(page.locator('#ceremonyNote')).toHaveCount(0);
});

test('going back and changing the date updates the event instead of adding another', async ({ page }) => {
  await start(page);
  await next(page).click();
  await back(page).click();
  await page.locator('#projectDate').fill('2027-03-01');
  await page.locator('#projectLocation').fill('Dubai, UAE');
  await next(page).click();
  const list = await events(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ date: '2027-03-01', venue: 'Dubai, UAE' });
});

test('once the person edits the event it is left alone', async ({ page }) => {
  await start(page);
  await next(page).click();
  const [item] = await events(page);
  await page.evaluate(id => window.InviteStudioBridge.updateEvent(id, { venue: 'St. Mary’s Church' }), item.id);
  await back(page).click();
  await page.locator('#projectDate').fill('2027-03-01');
  await next(page).click();
  const list = await events(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ date: '2027-02-14', venue: 'St. Mary’s Church' });
});

test('a removed event is not added back', async ({ page }) => {
  await start(page);
  await next(page).click();
  const [item] = await events(page);
  await page.evaluate(id => window.InviteStudioBridge.removeEvent(id), item.id);
  await back(page).click();
  await next(page).click();
  expect(await events(page)).toHaveLength(0);
});
