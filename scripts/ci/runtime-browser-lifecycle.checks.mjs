// Runner-only transport guard, not runtime app coverage. No Docker action here.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { browserEndpoint, launchRuntimeChromium } from './runtime-browser-client.mjs';
assert.ok(browserEndpoint());

const deadline = setTimeout(() => process.exit(1), 90000);

try {
  for (let client = 0; client < 2; client++) {
    const browser = await launchRuntimeChromium(chromium, { headless: true, timeout: 30000 });

    try {
      const page = await browser.newPage();
      assert.equal(await page.evaluate(() => 2 + 2), 4);

      if (process.argv.includes('--services')) {
        for (const url of [
          'http://127.0.0.1:3001/health',
          'http://127.0.0.1:3020/health',
          'http://127.0.0.1:5173/',
          'http://127.0.0.1:5174/',
        ]) {
          const response = await page.request.get(url, { timeout: 5000, maxRetries: 0 });
          assert.ok(response.ok(), 'remote service transport');
          await response.dispose();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  clearTimeout(deadline);
}
