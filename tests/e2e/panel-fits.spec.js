// The editor's left panel is wide enough, and compact enough, to show everything without scrolling on a normal laptop screen.
const { test, expect } = require('@playwright/test');

for (const [width, height] of [[1440, 900], [1280, 800]]) {
  for (const withPrivateLink of [false, true]) {
    test(`left panel needs no scrolling at ${width}x${height}${withPrivateLink ? ' with the private-draft card' : ''}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.evaluate(({ withPrivateLink }) => {
        if (withPrivateLink) Object.defineProperty(window, 'inviteStudioApi', { value: { enabled: true }, configurable: true });
        localStorage.clear();
        localStorage.setItem('invitestudio-edit-hint-seen', '1');
        const p = {
          id: 'e1', name: 'Mira', category: 'Wedding', templateId: 'minimalist', status: 'Draft', title: 'Mira & Arun', date: '2027-06-19', location: 'Kochi',
          message: '', hosts: '', story: '', photos: [], functions: [], theme: { background: '#f4eee4', accent: '#a77d4d', text: '#28241f' }
        };
        if (withPrivateLink) p.cloudId = 'c1';
        localStorage.setItem('invitestudio-projects', JSON.stringify([p]));
        // eslint-disable-next-line no-undef
        state.projects = [p]; state.currentId = p.id; state.page = 'editor'; render();
      }, { withPrivateLink });
      const panel = page.locator('#panel-sections');
      await expect(panel).toBeVisible({ timeout: 15000 });
      if (withPrivateLink) await expect(panel.locator('.draft-access')).toBeVisible();
      await page.waitForTimeout(500);
      const sizes = await panel.evaluate(el => ({ scroll: el.scrollHeight, client: el.clientHeight, width: el.getBoundingClientRect().width }));
      expect(sizes.width).toBeGreaterThanOrEqual(300);
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
      // every section description stays on one line
      for (const small of await panel.locator('.section-select small').all()) {
        const h = await small.evaluate(el => el.getBoundingClientRect().height);
        expect(h).toBeLessThan(24);
      }
    });
  }
}
