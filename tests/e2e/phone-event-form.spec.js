// On a phone the invitation is a preview, and an event's time, venue, dress code and so on are filled in on the Edit view, which people
// do not think to open. An event that is added, or tapped, in the preview must open its form there. On a wide screen nothing changes:
// the form is already beside the preview, and the name and venue are edited in place.
const { test, expect } = require('@playwright/test');

async function openEditor(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    const event = (n, title, venue) => ({ id: `ev${n}`, title, date: `2027-06-1${n}`, time: '16:00', endTime: '', venue, visible: true, description: '', dressCode: '', directionsUrl: '', parking: '', accommodation: '', accessibility: '' });
    const project = {
      id: 'e2e-events', name: 'Ava and Ben', category: 'Wedding', templateId: 'minimalist', status: 'Draft', updated: 'Just now',
      title: 'Ava & Ben', date: '2027-06-19', location: 'The Garden Estate, Kent', message: 'Please join us', hosts: 'Mr and Mrs Shah',
      story: 'We met in March.', photos: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }, published: false,
      functions: [event(1, 'Mehndi', 'Hall 1'), event(2, 'Sangeet', 'Hall 2')]
    };
    localStorage.setItem('invitestudio-edit-hint-seen', '1');
    localStorage.setItem('invitestudio-projects', JSON.stringify([project]));
    // eslint-disable-next-line no-undef
    state.projects = [project]; state.currentId = project.id; state.page = 'editor'; render();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-edit="names:first"]').first()).toBeVisible({ timeout: 15000 });
}
const editTab = page => page.getByRole('tab', { name: /^Edit/ });
const inView = (page, text) => page.locator('.event-item', { hasText: text }).first().evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight - 120; });

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('adding an event in the preview opens its form on the Edit view', async ({ page }) => {
    await openEditor(page);
    await expect(editTab(page)).toHaveAttribute('aria-selected', 'false'); // it opens on the preview
    await page.locator('[data-add-event]').click();
    await page.locator('.edit-chip', { hasText: 'Reception' }).click();
    await expect(editTab(page)).toHaveAttribute('aria-selected', 'true');
    const item = page.locator('.event-item', { hasText: 'Reception' }).first();
    await expect(item.getByLabel(/Event name/)).toBeVisible();    // its form is open: time, venue and the rest are one scroll away
    await expect(item.getByLabel(/Event name/)).toHaveValue('Reception');
    await expect.poll(() => inView(page, 'Reception')).toBe(true);
  });

  test('a custom event opens with its name ready to type over', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-add-event]').click();
    await page.locator('.edit-chip', { hasText: 'Custom event' }).click();
    // (The tab bar is hidden while a text field has focus, to leave room for the keyboard, so the focused name is the proof.)
    const name = page.getByLabel(/Event name/); // only one event form is open
    await expect(name).toBeFocused();
    expect(await name.evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length)).toBe(true); // all of "New event" is selected
    await page.keyboard.type('Haldi');
    await expect(name).toHaveValue('Haldi');
  });

  test('tapping an existing event in the preview opens that event on the Edit view', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-edit="event:title"][data-id="ev2"]').click();
    await expect(editTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.event-item', { hasText: 'Sangeet' }).first().getByLabel(/Event name/)).toHaveValue('Sangeet');
    await expect.poll(() => inView(page, 'Sangeet')).toBe(true);
  });

  // After the form opens, people have to be able to see how to get back, and that what they type is kept and shown in the preview.
  test('the Edit view says how to go back to the preview, and that changes are saved and shown there', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-add-event]').click();
    await page.locator('.edit-chip', { hasText: 'Reception' }).click();
    await expect(editTab(page)).toHaveAttribute('aria-selected', 'true');
    const bar = page.locator('.phone-edit-bar');
    await expect(bar.getByRole('button', { name: 'Back to preview' })).toBeVisible();
    await expect(bar.locator('.phone-saved')).toContainText(/Saved|Saving/);
    // The header's status is the one live region, so screen readers hear each save state once, not twice.
    await expect(page.locator('[role="status"][aria-live]', { hasText: /Saved|Saving/ })).toHaveCount(1);
    await expect(page.locator('[data-save-state]')).toHaveCount(1);
    await expect(bar).toContainText('Preview updates as you type');   // proof that what is typed is applied, in the part that stays on screen
  });

  // After editing, the next step (a draft link, or making it live) must be in reach: the header with Share invitation scrolls away on a
  // phone, so the bottom bar carries Share in every view, and it opens the same Share dialog.
  test('Share stays on screen in the bottom bar in every view, also after scrolling the preview, and opens the Share dialog', async ({ page }) => {
    await openEditor(page);
    const share = page.locator('.mobile-tabs').getByRole('button', { name: 'Share', exact: true });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(share).toBeInViewport();
    const box = await share.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.height).toBeGreaterThanOrEqual(44);
    for (const name of ['Sections', 'Edit', 'Preview']) {
      await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
      await expect(share).toBeInViewport();
    }
    // The views are still a tablist of three tabs; Share is a button beside them, not a fourth tab.
    await expect(page.getByRole('tablist', { name: 'Editor views' }).getByRole('tab')).toHaveCount(3);
    await share.click();
    await expect(page.locator('#modal-root [role="dialog"], #modal-root .modal').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('Share in the bottom bar asks for the names first, like Share invitation does, when there are none', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('tab', { name: /^Edit/ }).click();
    await page.getByLabel('Couple or celebration names').fill('');
    await page.getByRole('tab', { name: /^Preview/ }).click();
    await page.locator('.mobile-tabs').getByRole('button', { name: 'Share', exact: true }).click();
    await expect(editTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Couple or celebration names')).toBeVisible();
  });

  // From the mobile critique: the invitation, not the controls, fills the first screen, and tapping its text edits it right there.
  test('the first screen is mostly the invitation: one header row, no size switch, Share only in the bottom bar, Replies once there are any', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Guest view' })).toBeVisible();
    await expect(page.locator('.editor-header .editor-publish')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Tablet' })).toHaveCount(0);
    await expect(page.locator('.editor-header .editor-replies.no-replies')).toBeHidden();
    // The header is one row, and the invitation starts within the top third of the screen.
    const header = await page.locator('.editor-header').boundingBox();
    expect(header.height).toBeLessThan(72);
    const frameTop = await page.locator('.device-frame').evaluate(el => el.getBoundingClientRect().top);
    expect(frameTop).toBeLessThan(844 / 3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('tapping a text in the invitation edits it there: no extra Edit button over it, the tip goes, and the cursor is at the end', async ({ page }) => {
    await openEditor(page);
    const names = page.locator('[data-edit="names:first"]').first();
    await names.tap();
    await expect(names).toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('.mobile-edit-pill')).toHaveCount(0);
    await expect(page.locator('.edit-hint')).toHaveCount(0);
    // Not everything selected, so the first key pressed adds to the names instead of wiping them.
    expect(await names.evaluate(el => { const sel = el.getRootNode().getSelection ? el.getRootNode().getSelection() : window.getSelection(); return sel ? sel.toString() : ''; })).toBe('');
    await page.keyboard.type('!');
    await page.keyboard.press('Enter');
    await expect(names).toContainText('Ava!');
    // A tap on the design itself (not on a text) still offers its section's form.
    await page.locator('[data-section="hero"]').first().click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.mobile-edit-pill')).toBeVisible();
  });

  test('on the Edit view a chosen date is also said in words (the field itself may show month first)', async ({ page }) => {
    await openEditor(page);
    await editTab(page).click();
    await expect(page.locator('[data-date-words]').first()).toHaveText('Saturday, 19 June 2027');
  });

  test('the way back stays at the top while the form scrolls and while a field is being typed in (when the tab bar is hidden)', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-edit="event:title"][data-id="ev2"]').click();
    const name = page.locator('.event-item', { hasText: 'Sangeet' }).first().getByLabel(/Event name/);
    await name.focus();
    await page.keyboard.type('!');
    await page.evaluate(() => window.scrollBy(0, 500));
    const back = page.locator('.phone-edit-bar').getByRole('button', { name: 'Back to preview' });
    await expect(back).toBeVisible();
    expect(await back.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < 80; })).toBe(true);   // pinned at the top
    await back.click();
    await expect(editTab(page)).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('tab', { name: /^Preview/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-edit="event:title"][data-id="ev2"]')).toContainText('Sangeet!');   // what was typed is in the invitation
  });
});

test.describe('wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('nothing changes: the form is already beside the preview, and the title is edited in place', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-edit="event:title"][data-id="ev2"]').click();
    await expect(page.locator('[data-edit="event:title"][data-id="ev2"]')).toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('.phone-edit-bar')).toBeHidden();   // the way back is for phones only: the preview is already beside the form
  });
});
