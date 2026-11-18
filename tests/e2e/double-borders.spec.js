// No screen shows two horizontal lines right next to each other (for example a list's last row line and the next block's top line).
const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['Pixel 5'] });

// Finds horizontal rules (a border-top or border-bottom) that sit within 48px of another and overlap it sideways, in the page and in the islands' shadow roots.
const scan = () => {
  const roots = [document, ...Array.from(document.querySelectorAll('*')).filter(e => e.shadowRoot).map(e => e.shadowRoot)];
  const lines = [];
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.width < 60) continue;
    if (cs.position === 'fixed' || cs.position === 'sticky') continue;
    const vis = cs.display !== 'none' && cs.visibility !== 'hidden';
    if (!vis) continue;
    const top = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && cs.borderTopColor !== 'rgba(0, 0, 0, 0)';
    const bot = parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none' && cs.borderBottomColor !== 'rgba(0, 0, 0, 0)';
    const sides = ['Left','Right'].filter(s => parseFloat(cs['border'+s+'Width']) > 0 && cs['border'+s+'Style'] !== 'none').length;
    if (sides >= 2 && top && bot) continue; // a full box, not a rule
    if (top) lines.push({ y: r.top + window.scrollY, x1: r.left, x2: r.right, cls: (el.className||el.tagName)+'', kind: 'top' });
    if (bot) lines.push({ y: r.bottom + window.scrollY, x1: r.left, x2: r.right, cls: (el.className||el.tagName)+'', kind: 'bottom' });
  }
  const out = [];
  for (const a of lines) for (const b of lines) {
    if (a === b || b.y <= a.y) continue;
    const d = b.y - a.y;
    if (d < 48 && Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 100 && !(a.kind === b.kind && a.cls === b.cls)) out.push(`${Math.round(d)}px: ${a.kind}:${String(a.cls).slice(0,40)}  ->  ${b.kind}:${String(b.cls).slice(0,40)}`);
  }
  return [...new Set(out)];
};

async function project(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear(); localStorage.setItem('invitestudio-edit-hint-seen', '1');
    const p = { id: 'e1', name: 'Q', category: 'Wedding', templateId: 'minimalist', status: 'Draft', title: 'Ava & Ben', date: '2027-06-19', location: 'Kochi', message: 'Hi', hosts: 'H', story: 'x', photos: [], functions: [{ id: 'ev1', title: 'Wedding ceremony', date: '2027-06-19', time: '', venue: 'Kochi', visible: true }], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' } };
    localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
    // eslint-disable-next-line no-undef
    state.projects = [p]; state.currentId = p.id; state.page = 'editor'; state.device = 'mobile'; state.mobileEditorView = 'edit'; render();
  });
}

test('the three setup steps have no doubled lines', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.evaluate(() => window.InviteStudioBridge.startCreate('Wedding'));
  await page.locator('#projectTitle').fill('Mira & Arun');
  await page.locator('#projectDate').fill('2027-01-28');
  await page.locator('#projectLocation').fill('Ernakulam');
  expect(await page.evaluate(scan), 'step 1').toEqual([]);
  await page.getByRole('button', { name: /^Continue/ }).first().click();
  await expect(page.locator('#ceremonyNote')).toBeVisible();
  expect(await page.evaluate(scan), 'step 2').toEqual([]);
  await page.getByRole('button', { name: /^Continue/ }).first().click();
  await expect(page.locator('.setup-summary')).toBeVisible();
  expect(await page.evaluate(scan), 'step 3, Ready').toEqual([]);
  await expect(page.locator('.setup-summary')).toContainText('28 Jan 2027');
});

test('every editor section has no doubled lines', async ({ page }) => {
  await project(page);
  const host = page.locator('.figma-island-host');
  await expect(host).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1200);
  const names = await page.evaluate(() => Array.from(document.querySelector('.figma-island-host').shadowRoot.querySelectorAll('.section-select')).map(b => b.textContent.trim().slice(0, 10)));
  expect(names.length).toBeGreaterThan(3);
  for (const name of names) {
    await page.evaluate(name => Array.from(document.querySelector('.figma-island-host').shadowRoot.querySelectorAll('.section-select')).find(b => b.textContent.trim().startsWith(name))?.click(), name);
    await page.waitForTimeout(400);
    expect(await page.evaluate(scan), `section ${name}`).toEqual([]);
  }
});
