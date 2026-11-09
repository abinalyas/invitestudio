// Design foundation checks in the browser: the template's palette is the source of truth,
// the Kerala button meets contrast, and unsupported launch controls are gone.
// See docs/DESIGN_SYSTEM.md and docs/PRODUCT_DECISIONS.md.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.INVITESTUDIO_API_ENABLED = true; });
});

const kerala = {
  id: 'review', name: 'Ananya & Arjun', title: 'Ananya & Arjun', category: 'Wedding', templateId: 'kerala-kasavu',
  date: '2027-01-20', location: 'Kochi, Kerala', message: 'Together with our families.', story: '', hosts: '', locale: 'English',
  // A stale palette preference that must not change the invitation.
  theme: { background: '#1d2b2a', accent: '#c7a16f', text: '#f3ead9' },
  sections: [], photos: [], preferences: { palette: 'noir', typography: 'sans', layout: 'gallery' },
  introSettings: {}, animationSettings: { enabled: false }, functions: []
};

async function renderKerala(page) {
  await page.goto('/');
  await page.evaluate(p => {
    document.querySelector('#app').innerHTML = '<div>' + sitePreview(p, tpl(p.templateId), false) + '</div>';
  }, kerala);
  await page.waitForTimeout(1200);
}

function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('the template palette decides the invitation, not the stale palette preference', async ({ page }) => {
  await renderKerala(page);
  const hero = page.locator('.preview-hero').first();
  await expect(hero).toBeVisible({ timeout: 15000 });
  // The Kerala ivory is the background; the dark palette from the preference never appears.
  const background = await hero.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(background).toBe('rgb(247, 241, 225)');
  expect(await page.locator('.preview-hero').first().evaluate(el => el.outerHTML.includes('#1d2b2a'))).toBe(false);
});

test('the Kerala button meets 4.5:1 with white text', async ({ page }) => {
  await renderKerala(page);
  const label = page.getByText("YOU'RE INVITED", { exact: true });
  await expect(label).toBeVisible({ timeout: 15000 });
  const rgb = await label.evaluate(el => getComputedStyle(el).backgroundColor);
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  expect(contrast('#ffffff', hex)).toBeGreaterThanOrEqual(4.5);
});

test('the Kerala motif renders the woven band and the name ornament', async ({ page }) => {
  await renderKerala(page);
  await expect(page.locator('.motif-kasavu-frame.band')).toHaveCount(1);
  await expect(page.locator('.motif-lamp')).toHaveCount(1);
});

test('Kerala stays out of the offered catalogue until it is approved', async ({ page }) => {
  await page.goto('/');
  const offered = await page.evaluate(() => sortedTemplates().map(t => t.id));
  expect(offered).not.toContain('kerala-kasavu');
});

test('unsupported launch controls are gone from setup', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => startCreate('Wedding'));
  await page.evaluate(() => { state.setupStep = 2; render(); });
  await expect(page.locator('#prefRsvp')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('#prefPalette, #prefTypography, #prefLayout, #accentColor')).toHaveCount(0);
});

test('the RSVP preference remains in setup', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => startCreate('Wedding'));
  await page.evaluate(() => { state.setupStep = 2; render(); });
  await expect(page.locator('#prefRsvp')).toHaveCount(1, { timeout: 15000 });
});
