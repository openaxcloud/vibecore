// Chromium-only regression. Every request is fulfilled locally by Playwright.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { waitForWorkspaceCalculation } from './probe';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium',
});
try {
  const context = await browser.newContext();
  const ide = await context.newPage();
  const inspector = await context.newPage();
  const initial = 'http://ws-fixture-5173.localhost:3020/';
  const ready = 'http://ws-fixture-3000.localhost:3020/';
  const frame = ide.locator('iframe');
  const other = 'http://ws-other-3000.localhost:3020/';
  let next = ready;
  let guesses = 0;
  let foreignCalculations = 0;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    assert([new URL(initial).origin, new URL(ready).origin, new URL(other).origin].includes(url.origin));
    if (url.pathname !== '/compute') return route.fulfill({ body: '' });
    if (url.origin === new URL(other).origin) foreignCalculations++;
    if (url.origin === new URL(initial).origin) {
      guesses++;
      if (guesses === 1) await frame.evaluate((el, src) => el.setAttribute('src', src), next);
      return route.fulfill({ status: 503, body: 'starting' });
    }
    const result = Number(url.searchParams.get('a')) * 3 + Number(url.searchParams.get('b'));
    await route.fulfill({ json: { version: 'A', result } });
  });
  await ide.setContent('<iframe src="' + initial + '"></iframe>');
  assert.equal((await waitForWorkspaceCalculation(inspector, frame, 'A', 3, 2500)).origin, new URL(ready).origin);
  assert(guesses > 0);
  await assert.rejects(waitForWorkspaceCalculation(inspector, frame, 'B', 3, 1000), /version|toEqual/);
  next = other;
  guesses = 0;
  await frame.evaluate((el, src) => el.setAttribute('src', src), initial);
  await assert.rejects(waitForWorkspaceCalculation(inspector, frame, 'A', 3, 1500), /ws-other/);
  assert.equal(foreignCalculations, 0);
  console.log(
    'PASS port change, both calculations, stale version rejected, different workspace rejected before calculation',
  );
} finally {
  await browser.close();
}
