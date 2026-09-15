// Responsive/theme visual proof for File History (RPL-FH-001.*) via the
// dev-only /dev/fh-proof harness (real component + styles, no backend).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const outDir = '/private/tmp/claude-501/-Users-hb-dev-vibecore/52c7ea32-0da7-4ae2-94db-b564ececf263/scratchpad/fh-shots';
mkdirSync(outDir, { recursive: true });

const WIDTHS = [
  { w: 390, h: 844, name: 'mobile-390' },
  { w: 768, h: 1024, name: 'tablet-768' },
  { w: 1024, h: 768, name: 'tablet-1024' },
  { w: 1440, h: 900, name: 'desktop-1440' },
];
const THEMES = ['light', 'dark'];
const MIN_TARGET = 44;

async function measure(locator) {
  const box = await locator.boundingBox();
  return box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  const targetReport = {};

  for (const theme of THEMES) {
    for (const { w, h, name } of WIDTHS) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      const tag = `${name}-${theme}`;

      await page.goto(`${base}/dev/fh-proof?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      const openBtn = page.locator('[data-testid="file-history-open"]');
      await openBtn.waitFor({ state: 'visible', timeout: 45000 });

      // A) editor with the bottom-right History button (RPL-FH-001.1)
      await page.screenshot({ path: `${outDir}/${tag}-a-button.png` });
      const btnBox = await measure(openBtn);

      // Open the panel.
      await openBtn.click();
      const panel = page.locator('[data-testid="file-history-panel"]');
      await panel.waitFor({ state: 'visible', timeout: 8000 });
      await page.locator('[data-testid="file-history-slider"]').waitFor({ state: 'visible' });

      // B) panel — latest version view + controls (RPL-FH-001.1/.2/.5)
      await page.screenshot({ path: `${outDir}/${tag}-b-panel.png` });

      // Measure key touch targets.
      targetReport[tag] = {
        openButton: btnBox,
        play: await measure(page.locator('[data-testid="file-history-play"]')),
        prev: await measure(page.getByLabel('Previous version')),
        next: await measure(page.getByLabel('Next version')),
        slider: await measure(page.locator('[data-testid="file-history-slider"]')),
        restore: await measure(page.locator('[data-testid="file-history-restore"]')),
        compare: await measure(page.locator('[data-testid="file-history-compare"]')),
        close: await measure(page.getByLabel('Close file history')),
      };

      // Navigate to an older version (prev arrow), then Compare Latest (RPL-FH-001.2/.3)
      await page.getByLabel('Previous version').click();
      await page.getByLabel('Previous version').click();
      await page.locator('[data-testid="file-history-compare"]').click();
      await page.locator('[data-testid="file-history-diff"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.screenshot({ path: `${outDir}/${tag}-c-compare.png` });

      // Playback (RPL-FH-001.5): switch back to version view + press play.
      await page.locator('[data-testid="file-history-compare"]').click();
      await page.locator('[data-testid="file-history-play"]').click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${outDir}/${tag}-d-playback.png` });

      results.push(tag);
      await context.close();
    }
  }

  // Error/retry state (RPL-FH-001.6) at two widths.
  for (const theme of THEMES) {
    for (const { w, h, name } of [WIDTHS[0], WIDTHS[3]]) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.goto(`${base}/dev/fh-proof?theme=${theme}&state=error`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-testid="file-history-error"]').waitFor({ state: 'visible', timeout: 10000 });
      await page.screenshot({ path: `${outDir}/error-${name}-${theme}.png` });
      await context.close();
    }
  }

  await browser.close();

  // Report target-size compliance.
  console.log('=== touch targets (min height must be >= 44px) ===');
  let allOk = true;
  for (const [tag, targets] of Object.entries(targetReport)) {
    for (const [name, box] of Object.entries(targets)) {
      const ok = box && box.h >= MIN_TARGET;
      if (!ok) allOk = false;
      if (!ok) console.log(`  ✗ ${tag} ${name}: ${box ? box.h + 'px' : 'missing'}`);
    }
  }
  console.log(allOk ? '  ✓ all measured targets >= 44px' : '  ✗ some targets under 44px');
  console.log('captured configs:', results.length, results.join(', '));
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
