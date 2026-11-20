// The home page footer: a brand column and three link columns, one type scale, tappable links, and no sideways scrolling.
const { test, expect } = require('@playwright/test');

const footer = page => page.locator('footer.footer');

test('the footer is structured: three labelled link columns, every link in the right place', async ({ page }) => {
  await page.goto('/');
  await expect(footer(page)).toBeVisible();
  const columns = await footer(page).evaluate(el => [...el.querySelectorAll('nav.footer-col')].map(nav => ({
    label: nav.querySelector('h3').textContent.trim(),
    links: [...nav.querySelectorAll('a')].map(a => [a.textContent.trim(), a.getAttribute('href')])
  })));
  expect(columns.map(c => c.label)).toEqual(['Product', 'Guides', 'Company']);
  expect(columns[0].links).toEqual([['Templates', '/templates'], ['How it works', '#how'], ['Pricing', '#pricing'], ['FAQs', '#faq-list']]);
  expect(columns[1].links.map(l => l[1])).toEqual(['/wedding-invitation-website', '/digital-wedding-invitation', '/online-wedding-invitation-with-rsvp', '/animated-wedding-invitation', '/whatsapp-wedding-invitation']);
  expect(columns[2].links).toEqual([['Contact', '/contact'], ['Terms', '/terms'], ['Refund policy', '/refund-policy'], ['Delivery policy', '/delivery-policy'], ['Privacy', '/privacy']]);
  // Each column is a navigation landmark named by its heading.
  for (const name of ['Product', 'Guides', 'Company']) await expect(footer(page).getByRole('navigation', { name })).toBeVisible();
  await expect(footer(page).locator('.footer-copy')).toContainText('protected by copyright');
  await expect(footer(page).getByRole('link', { name: 'InviteStudio on Instagram' })).toHaveAttribute('href', /instagram\.com/);
});

test('one type scale: 14px for every link and text, 12px column headings, 13px copyright, a 24px logo and nothing else', async ({ page }) => {
  await page.goto('/');
  const sizes = await footer(page).evaluate(el => {
    const found = {};
    for (const e of el.querySelectorAll('a, p, h3, strong, span')) {
      if (!e.textContent.trim()) continue;
      const kind = e.closest('.logo') ? 'logo' : e.matches('h3') ? 'heading' : e.closest('.footer-copy') ? 'copyright' : 'text';
      (found[kind] = found[kind] || new Set()).add(getComputedStyle(e).fontSize);
    }
    return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v]]));
  });
  expect(sizes).toEqual({ logo: ['24px'], text: ['14px'], heading: ['12px'], copyright: ['13px'] });
});

for (const width of [320, 390, 768, 1280]) {
  test(`footer at ${width}px: no sideways scrolling, and on a touch screen every link is a 44px target`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await footer(page).scrollIntoViewIfNeeded();
    const m = await footer(page).evaluate(el => ({
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      outside: [...el.querySelectorAll('a, p, h3')].filter(e => { const r = e.getBoundingClientRect(); return r.right > el.getBoundingClientRect().right + 1 || r.left < el.getBoundingClientRect().left - 1; }).length,
      shortLinks: [...el.querySelectorAll('.footer-col a')].filter(a => a.getBoundingClientRect().height < 31).length,
      minTarget: Math.min(...[...el.querySelectorAll('.footer-col a')].map(a => Math.round(a.getBoundingClientRect().height)))
    }));
    expect(m.sideways).toBeLessThanOrEqual(0);
    expect(m.outside).toBe(0);
    expect(m.shortLinks).toBe(0);
    if (width <= 767) expect(m.minTarget).toBeGreaterThanOrEqual(44);
  });
}

test('the columns line up: three equal columns beside the brand on a wide screen, two on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const lefts = async () => footer(page).evaluate(el => [...el.querySelectorAll('nav.footer-col')].map(n => Math.round(n.getBoundingClientRect().left)));
  const wide = await lefts();
  expect(new Set(wide).size).toBe(3);
  expect(wide[0]).toBeLessThan(wide[1]);
  expect(wide[1]).toBeLessThan(wide[2]);
  const tops = await footer(page).evaluate(el => [...el.querySelectorAll('nav.footer-col')].map(n => Math.round(n.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);        // one row
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneTops = await footer(page).evaluate(el => [...el.querySelectorAll('nav.footer-col')].map(n => Math.round(n.getBoundingClientRect().top)));
  expect(new Set(phoneTops).size).toBe(2);   // Product and Guides side by side, Company below
});
