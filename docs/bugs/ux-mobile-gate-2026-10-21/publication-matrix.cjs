const fs = require('node:fs');
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5206';
if (new URL(base).hostname !== '127.0.0.1') throw Error('Local synthetic QA only');
const output = process.env.UX_QA_OUTPUT_DIR || '/tmp/vibecore-publication-qa';
fs.mkdirSync(output, { recursive: true });
const { chromium, expect } = require('@playwright/test');
(async () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.UX_QA_SESSION_FILE));
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const results = [];
  for (const width of process.argv.length > 2 ? process.argv.slice(2).map(Number) : [390, 768, 1440])
    for (const lang of ['fr', 'en']) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 },
        hasTouch: width < 1000,
        isMobile: width === 390,
      });
      await context.addCookies(fixture.cookies);
      await context.addCookies([{ name: 'vibecore-lang', value: lang, url: base }]);
      const page = await context.newPage();
      await page.goto(`${base}/projects/${fixture.projectId}/ide?lang=${lang}`, { waitUntil: 'domcontentloaded' });
      if (width < 1000) {
        await page.getByTestId('button-add-tab').click();
        await page.getByTestId('tool-item-deployments').click();
      } else {
        await page.getByTestId('tab-add').first().click();
        await page.getByTestId('feature-deployments').click();
      }
      const button = page.getByRole('button', { name: lang === 'fr' ? 'Voir les journaux' : 'View logs', exact: true });
      await expect(button).toBeVisible();
      await button.scrollIntoViewIfNeeded();
      await button.focus();
      const metrics = await button.evaluate((e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        const rects = [...r.getClientRects()].filter((x) => x.height > 0).sort((a, b) => a.top - b.top);
        let lines = 1,
          bottom = rects[0]?.bottom ?? 0;
        for (const rect of rects.slice(1)) {
          if (rect.top >= bottom - 1) {
            lines++;
            bottom = rect.bottom;
          } else bottom = Math.max(bottom, rect.bottom);
        }
        const box = e.getBoundingClientRect();
        return {
          lines,
          box: box.toJSON(),
          focused: document.activeElement === e,
          receivesEvents: e.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(metrics.lines).toBe(1);
      expect(metrics.focused).toBe(true);
      expect(metrics.receivesEvents).toBe(true);
      expect(metrics.overflow).toBe(false);
      if (width < 1000) expect(metrics.box.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `${output}/publication-after-${width}-${lang}.png` });
      if (width < 1000) await button.tap();
      else await button.press('Enter');
      await expect(page.getByTestId('publication-journal')).toBeVisible();
      expect(await page.getByTestId('publication-journal').innerText()).not.toBe('');
      const toggle = page.getByTestId('publication-bascule-journaux');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      if (width < 1000) await toggle.tap();
      else await toggle.press('Enter');
      await expect(page.getByTestId('publication-journal')).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      results.push({ width, lang, ...metrics, logsOpened: true, logsClosed: true });
      fs.writeFileSync(`${output}/publication-matrix.json`, JSON.stringify(results, null, 2));
      console.log(`PASS ${width} ${lang}: label, focus hit-test, logs opened/closed`);
      await context.close();
    }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
