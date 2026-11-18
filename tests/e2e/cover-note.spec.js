// The note under the Cover fields: it is only shown for designs that have a cover picture, and it says how to add one.
const { test, expect } = require('@playwright/test');

async function openEditor(page, templateId) {
  await page.goto('/');
  await page.evaluate(templateId => {
    localStorage.clear();
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const p = {
      id: 'e1', name: 'Mira', category: 'Wedding', templateId, status: 'Draft', title: 'Mira & Arun', date: '2027-06-19', location: 'Kochi',
      message: '', hosts: '', story: '', photos: [], functions: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }
    };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
  }, templateId);
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
}

test('a design with a cover picture says the first photo becomes it, and Add photos opens the Photos section', async ({ page }) => {
  await openEditor(page, 'minimalist');
  const note = page.locator('.cover-photo-note');
  await expect(note).toContainText('Your first photo becomes the cover picture');
  await expect(note).not.toContainText(/photo storage|unlock/i);
  await note.getByRole('button', { name: 'Add photos' }).click();
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
});

test('a design without a cover picture shows no note', async ({ page }) => {
  await openEditor(page, 'modern-heritage');
  await expect(page.locator('.cover-photo-note')).toHaveCount(0);
  await expect(page.getByText(/photo storage is available/i)).toHaveCount(0);
});
