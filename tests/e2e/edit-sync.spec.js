// The form shows what the design shows: the example story is the field's hint, and editing text in the design brings its field into view.
const { test, expect } = require('@playwright/test');

async function openEditor(page, templateId, project = {}) {
  await page.goto('/');
  await page.evaluate(({ templateId, project }) => {
    localStorage.clear();
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const p = {
      id: `e2e-${templateId}`, name: 'Ava and Ben', category: 'Wedding', templateId, status: 'Draft', updated: 'Just now',
      title: 'Ava & Ben', date: '2027-06-19', location: 'Kent', message: '', hosts: '', story: '', photos: [], functions: [],
      theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }, published: false, ...project
    };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
  }, { templateId, project });
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
}

test('an empty story field shows the design’s example story as its hint', async ({ page }) => {
  await openEditor(page, 'minimalist');
  await page.getByRole('button', { name: /story/i }).first().click();
  const story = page.locator('textarea[data-field="storyCopy"]');
  await expect(story).toHaveValue('');
  await expect(story).toHaveAttribute('placeholder', /Some moments become memories/);
  // ...and it is the same text the design shows.
  const shown = await page.locator('[data-edit="storyCopy"]').first().textContent();
  expect((await story.getAttribute('placeholder')).trim()).toBe(shown.trim());
});

test('editing the story in the design shows its field in the panel', async ({ page }) => {
  await openEditor(page, 'minimalist');
  await expect(page.locator('textarea[data-field="storyCopy"]')).toHaveCount(0); // the Home section is open
  await page.locator('[data-edit="storyCopy"]').first().click();
  const story = page.locator('textarea[data-field="storyCopy"]');
  await expect(story).toBeVisible();
  await expect(story.locator('xpath=ancestor::label')).toHaveClass(/field-flash/);
});

test('editing the welcome message in the design shows its field too', async ({ page }) => {
  await openEditor(page, 'minimalist', { message: 'Hello' });
  await page.getByRole('button', { name: /story/i }).first().click(); // panel is on another section first
  await page.locator('[data-edit="message"]').first().click();
  const field = page.locator('textarea[data-field="message"]');
  await expect(field).toBeVisible();
  await expect(field.locator('xpath=ancestor::label')).toHaveClass(/field-flash/);
});
