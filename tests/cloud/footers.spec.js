// The footers on the guide and policy pages (server-rendered), on the real server: same columns and type scale as the home page footer.
const { test, expect } = require('@playwright/test');

const PAGES = ['/whatsapp-wedding-invitation', '/digital-wedding-invitation', '/privacy', '/terms', '/refund-policy', '/delivery-policy', '/contact'];
const footer = page => page.locator('footer.site-footer');

test('every guide and policy page has the three labelled columns, with the right links', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await expect(footer(page), path).toBeVisible();
    const columns = await footer(page).evaluate(el => [...el.querySelectorAll('nav.footer-col')].map(nav => ({ label: nav.querySelector('h3').textContent.trim(), links: [...nav.querySelectorAll('a')].map(a => [a.textContent.trim(), a.getAttribute('href')]) })));
    expect(columns.map(c => c.label), path).toEqual(['Product', 'Guides', 'Company']);
    expect(columns[0].links.map(l => l[1])).toEqual(['/templates', '/#how', '/#pricing', '/#faq-list']);
    expect(columns[1].links.map(l => l[0])).toEqual(['Wedding invitation website', 'Digital wedding invitation', 'Invitation with RSVP', 'Animated invitations', 'Share on WhatsApp']);
    expect(columns[2].links).toEqual([['Contact', '/contact'], ['Terms', '/terms'], ['Refund policy', '/refund-policy'], ['Delivery policy', '/delivery-policy'], ['Privacy', '/privacy']]);
    await expect(footer(page).getByRole('link', { name: 'InviteStudio on Instagram' })).toHaveAttribute('href', /instagram\.com/);
    await expect(footer(page).locator('.footer-talk').getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);
    await expect(footer(page).locator('.footer-talk').getByRole('link', { name: 'Email' })).toHaveAttribute('href', /^mailto:/);
  }
});

test('the copyright year is this year (not 1970, which a frozen server clock would print)', async ({ page }) => {
  for (const path of ['/privacy', '/whatsapp-wedding-invitation']) {
    await page.goto(path);
    const text = await footer(page).locator('.copy').innerText();
    expect(text, path).toContain(`© ${new Date().getFullYear()} InviteStudio`);
    expect(text).not.toContain('1970');
    expect(text).toContain('protected by copyright');
  }
});

test('the same type scale as the home page footer: 24px logo, 14px text, 12px headings, 13px copyright', async ({ page }) => {
  for (const path of ['/privacy', '/digital-wedding-invitation']) {
    await page.goto(path);
    const sizes = await footer(page).evaluate(el => {
      const found = {};
      for (const e of el.querySelectorAll('a, p, h3, strong, span')) {
        if (!e.textContent.trim()) continue;
        const kind = e.closest('.logo') ? 'logo' : e.matches('h3') ? 'heading' : e.closest('.copy') ? 'copyright' : 'text';
        (found[kind] = found[kind] || new Set()).add(getComputedStyle(e).fontSize);
      }
      return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v]]));
    });
    expect(sizes, path).toEqual({ logo: ['24px'], text: ['14px'], heading: ['12px'], copyright: ['13px'] });
  }
});

for (const width of [320, 390, 768, 1280]) {
  test(`footer at ${width}px: no sideways scrolling, links stay inside, and on a phone every link is a 44px target`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/privacy', '/whatsapp-wedding-invitation']) {
      await page.goto(path);
      await footer(page).scrollIntoViewIfNeeded();
      const m = await footer(page).evaluate(el => {
        const box = el.getBoundingClientRect();
        const links = [...el.querySelectorAll('.footer-col a')];
        return {
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          outside: [...el.querySelectorAll('a, p, h3')].filter(e => { const r = e.getBoundingClientRect(); return r.right > box.right + 1 || r.left < box.left - 1; }).length,
          minTarget: Math.min(...links.map(a => Math.round(a.getBoundingClientRect().height))),
          columnTops: new Set([...el.querySelectorAll('nav.footer-col')].map(n => Math.round(n.getBoundingClientRect().top))).size
        };
      });
      expect(m.sideways, path).toBeLessThanOrEqual(0);
      expect(m.outside, path).toBe(0);
      expect(m.minTarget).toBeGreaterThanOrEqual(width <= 767 ? 44 : 31);
      expect(m.columnTops, `${path} at ${width}`).toBe(width <= 560 ? 2 : 1);
    }
  });
}

test('the header navigation of these pages is unchanged by the footer styles', async ({ page }) => {
  await page.goto('/privacy');
  const header = page.locator('header.top nav[aria-label="Main"] a');
  await expect(header).toHaveCount(2);
  const sizes = await header.evaluateAll(links => links.map(a => getComputedStyle(a).fontSize));
  expect(sizes).toEqual(['15px', '15px']);
});
