// Template protection (docs/PROTECTION.md): every design carries a hidden marker, and the copyright notices are in place.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test('every rendered design carries the hidden marker, with a fixed ref that differs between designs', async ({ page }) => {
  await page.goto('/');
  const marks = await page.evaluate(async () => {
    const out = {};
    for (const t of templates) {
      await InviteTemplates.need(t);
      const first = sitePreview(templateDemoProject(t), t, true);
      const again = sitePreview(templateDemoProject(t), t, true);
      const match = /^<!-- © InviteStudio · template ([a-z0-9-]+) · ref (is-[0-9a-f]{8}) · licensed for use on InviteStudio only -->/.exec(first);
      out[t.id] = { ok: Boolean(match), id: match && match[1], ref: match && match[2], stable: first.slice(0, 120) === again.slice(0, 120) };
    }
    return out;
  });
  const ids = Object.keys(marks);
  expect(ids.length).toBeGreaterThan(10);
  for (const id of ids) {
    expect(marks[id].ok, `${id} has the marker`).toBe(true);
    expect(marks[id].id).toBe(id);
    expect(marks[id].stable).toBe(true);
  }
  expect(new Set(ids.map(id => marks[id].ref)).size).toBe(ids.length);
});

test('the home page footer states that the designs are protected by copyright', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.figma-island-host .footer-copy')).toContainText('protected by copyright');
});

test('the artwork headers and the licence notices are in place', async () => {
  const headers = fs.readFileSync('_headers', 'utf8');
  for (const path of ['/templates/:id/assets/*', '/assets/templates/*', '/assets/scene-fonts/*', '/assets/hero/*', '/assets/samples/*', '/assets/music/*']) {
    const block = headers.split('\n').findIndex(line => line.trim() === path);
    expect(block, `${path} has a rule`).toBeGreaterThan(-1);
    expect(headers.split('\n').slice(block + 1, block + 4).join('\n')).toContain('Cross-Origin-Resource-Policy: same-site');
  }
  for (const file of ['packaged-templates.js', 'template-widgets.js', 'templates/dist/bloom-reveal.js', 'template-loader.js', 'index.html']) {
    expect(fs.readFileSync(file, 'utf8').slice(0, 600), `${file} starts with the notice`).toContain('© 2026 InviteStudio');
  }
});
