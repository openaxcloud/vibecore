// Real local production bundle, synthetic catalogue503; no account/provider.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;

  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('Local server required');
  }

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
  });

  const results = [];

  try {
    for (const [name, width, height] of [
      ['desktop', 1280, 900],
      ['tablet', 768, 1024],
      ['mobile', 390, 844],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      let recovered = false;
      await page.route('**/catalogue-fr-public-*.json', (route) =>
        recovered ? route.continue() : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      await page.goto(`${baseURL}/login?lang=fr&returnTo=%2F%40org-fixture%2Fproject-fixture%3Fpanel%3Dpreview`, {
        waitUntil: 'domcontentloaded',
      });

      const recovery = page.locator('[data-ecode-startup-recovery]');
      await recovery.waitFor({ state: 'visible' });

      const button = recovery.getByRole('button', { name: 'Réessayer' });
      const bounds = await button.boundingBox();

      if (
        !bounds ||
        bounds.x < 0 ||
        bounds.y < 0 ||
        bounds.x + bounds.width > width ||
        bounds.y + bounds.height > height
      ) {
        throw new Error(`Retry outside ${name} viewport`);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

      if (overflow) {
        throw new Error(`Horizontal overflow on ${name}`);
      }

      await page.screenshot({ path: path.join(__dirname, `${name}-recovery.png`) });
      recovered = true;
      await button.click();
      await page.locator('input[type=email]').waitFor({ state: 'visible' });

      if (errors.length) {
        throw new Error(JSON.stringify(errors));
      }

      results.push({
        name,
        width,
        height,
        recoveryVisible: true,
        retryClicked: true,
        loginVisible: true,
        overflow,
        errors,
      });
      await page.close();
    }
    await fs.writeFile(
      path.join(__dirname, 'responsive-results.json'),
      JSON.stringify({ engine: await browser.version(), results }, null, 2) + '\n',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
