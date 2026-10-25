// Synthetic local browser check. Start the web app against fixture.cjs on port3099.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5199';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Local fixture only');
const viewports = [
  [320, 740],
  [360, 800],
  [390, 844],
  [844, 390],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const receipt = { base, synthetic: true, browser: browser.version(), matrix: [], errors: [] };
  try {
    for (const language of ['fr', 'en'])
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
        await context.addCookies([
          { name: 'vc_session', value: 'synthetic-ui-fixture', url: base },
          { name: 'ecode_theme', value: theme, url: base },
        ]);
        await context.addInitScript(() =>
          localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'dismissed', step: 0 })),
        );
        // No third-party resource or service is needed for a synthetic UI check.
        await context.route('**/*', (route) =>
          new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort(),
        );
        const page = await context.newPage();
        page.on('pageerror', (e) => receipt.errors.push(e.message));
        await page.goto(`${base}/account-settings?lang=${language}`, { waitUntil: 'domcontentloaded' });
        const name = page.locator('input[name=name]');
        await expect(name).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const draft =
          language === 'fr'
            ? 'Camille — nom de profil très long conservé pendant le redimensionnement'
            : 'Camille — a long profile name preserved throughout viewport changes';
        await name.fill(draft);
        const nav = page.getByRole('navigation', {
          name: language === 'fr' ? 'Paramètres du compte' : 'Account settings',
        });
        for (const [width, height] of viewports) {
          await page.setViewportSize({ width, height });
          await expect(name).toHaveValue(draft);
          await expect(nav.locator('a')).toHaveCount(3);
          const bounds = await nav.evaluate((n) => {
            const b = n.getBoundingClientRect();
            return {
              client: n.clientWidth,
              scroll: n.scrollWidth,
              links: [...n.querySelectorAll('a')].map((a) => {
                const r = a.getBoundingClientRect();
                return {
                  text: a.textContent,
                  inside:
                    r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
                  height: r.height,
                };
              }),
            };
          });
          expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
          expect(bounds.links.every((a) => a.inside && a.height >= 44)).toBe(true);
          await expect(nav.locator('a[aria-current=page]')).toHaveAttribute('href', '/account-settings');
          receipt.matrix.push({ language, theme, width, height, bounds });
          if (language === 'fr' && theme === 'light' && [320, 820, 1440].includes(width))
            await page.screenshot({ path: path.join(__dirname, `after-${width}-fr.png`), fullPage: true });
        }
        // A200% layout equivalent: desktop1280 /2 =>640 CSS px; no claim of native browser zoom or mobile keyboard.
        await page.setViewportSize({ width: 640, height: 400 });
        await expect(name).toHaveValue(draft);
        await nav.locator('a').last().focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(name).toHaveValue(draft);
        await name.focus();
        await page.keyboard.press('Tab');
        await expect(page.locator('input[name=email]')).toBeFocused();
        await page.locator('input[name=timezone]').fill('invalid zone');
        await page.locator('input[name=timezone]').blur();
        await expect(page.getByRole('alert')).toBeVisible();
        receipt.matrix.push({
          language,
          theme,
          width: 640,
          height: 400,
          zoom: '200% layout equivalent only',
          dirtyNavigationEscape: true,
          keyboard: true,
          invalidTimezone: true,
        });
        await context.close();
      }
    expect(receipt.errors).toEqual([]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'receipt.json'), JSON.stringify(receipt, null, 2));
    await browser.close();
  }
  console.log(`${receipt.matrix.length} synthetic viewport/interaction observations passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
