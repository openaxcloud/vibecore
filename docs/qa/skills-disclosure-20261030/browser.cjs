const { chromium, expect } = require('@playwright/test');
const fs = require('fs');
// Run from repository root against the synthetic fixture server only.
(async () => {
  const { token, projectId } = JSON.parse(fs.readFileSync('/tmp/skills-browser-fixture.json'));
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const receipts = [];
  try {
    for (const width of [1280, 820, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.context().addCookies([
        { name: 'vc_session', value: token, url: 'http://127.0.0.1:21999' },
        { name: 'vibecore-lang', value: 'fr', url: 'http://127.0.0.1:21999' },
      ]);
      await page.addInitScript(() =>
        localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'dismissed', step: 0 })),
      );
      await page.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (!['127.0.0.1', 'localhost'].includes(u.hostname)) return r.abort();
        if (u.pathname.includes('/api/chat') || u.pathname.includes('/runtime/')) return r.abort();
        return r.continue();
      });
      await page.goto(`http://127.0.0.1:21999/projects/${projectId}/ide?panel=skills`);
      const panel = page.locator('.bolt-project-skills-panel:visible').first();
      await expect(panel)
        .toBeVisible({ timeout: 15000 })
        .catch(async (e) => {
          console.log((await page.locator('body').innerText()).slice(0, 6000));
          throw e;
        });
      const row = panel
        .locator('div.flex')
        .filter({ has: page.getByText('Revue de code', { exact: true }) })
        .last();
      const toggle = row.getByRole('button');
      const before = await toggle.getAttribute('aria-pressed');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
      await page.reload();
      await expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
      const geometry = await panel.evaluate((e) => ({
        client: e.clientWidth,
        scroll: e.scrollWidth,
        viewport: innerWidth,
      }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
      await panel.getByText(/La sélection automatique compare des mots/).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/qa/skills-disclosure-20261030/help-${width}.png` });
      await panel.getByRole('button', { name: /UI.*ecode-proof/ }).click();
      await expect(panel.getByText('Ressources déclarées (contenu indisponible) :', { exact: true })).toBeVisible();
      await expect(panel.getByText(/La sélection automatique compare des mots/)).toBeVisible();
      await panel.getByText('Ressources déclarées (contenu indisponible) :', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/qa/skills-disclosure-20261030/skills-${width}.png` });
      await panel.getByRole('button', { name: /Communauté/ }).click();
      await expect(panel.getByRole('searchbox')).toBeVisible();
      await panel.getByRole('searchbox').fill('zzzz-no-skill');
      await expect(panel.getByText(/Aucune/)).toBeVisible();
      receipts.push({ width, togglePersisted: true, geometry, catalogSearch: true });
      await page.close();
    }
  } finally {
    fs.writeFileSync('docs/qa/skills-disclosure-20261030/browser.json', JSON.stringify(receipts, null, 2));
    await browser.close();
  }
})();
