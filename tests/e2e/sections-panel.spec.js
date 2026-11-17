// The editor's left panel: each section has a short description under its name, and the Design block shows the current design.
const { test, expect } = require('@playwright/test');

async function openEditor(page, project = {}) {
  await page.goto('/');
  await page.evaluate(project => {
    localStorage.clear();
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const p = {
      id: 'e1', name: 'Mira', category: 'Wedding', templateId: 'minimalist', status: 'Draft', title: 'Mira & Arun', date: '2027-06-19',
      location: 'Kochi', message: '', hosts: '', story: '', photos: [], functions: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }, ...project
    };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
  }, project);
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
}

test('each section says what it is for', async ({ page }) => {
  await openEditor(page);
  const panel = page.locator('#panel-sections');
  for (const [name, note] of [['Cover', 'Intro, names and date'], ['Our story', 'Your journey together'], ['Events', 'Wedding and reception details'], ['Photos', 'Gallery of your moments'], ['RSVP', 'Collect guest responses']]) {
    const row = panel.locator('.section-row').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) });
    await expect(row.locator('small')).toHaveText(note);
  }
});

test('a hidden section says so instead of its description', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('checkbox', { name: /Show Photos on the invitation/ }).uncheck({ force: true });
  const row = page.locator('#panel-sections .section-row').filter({ has: page.locator('strong', { hasText: /^Photos$/ }) });
  await expect(row.locator('small')).toHaveText('Hidden from guests');
});

test('the Design block shows the current design and opens the list', async ({ page }) => {
  await openEditor(page);
  const picker = page.locator('.design-picker');
  await expect(picker.locator('.design-heading')).toHaveText('Design');
  await expect(picker.locator('.design-name')).toHaveText('Minimalist');
  await expect(picker.locator('img.design-current-thumb')).toBeVisible();
  await picker.getByRole('button', { name: /Change design/ }).click();
  await expect(picker.getByRole('group', { name: 'Designs' })).toBeVisible();
});
