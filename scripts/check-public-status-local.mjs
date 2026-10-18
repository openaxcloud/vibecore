/** Local, anonymous proof; never submits the newsletter or provisions a workspace. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3184');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Only a loopback server is allowed');

const directory = process.argv[3] ?? '/tmp/vibecore-status-captures';
await mkdir(directory, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true,
});

const evidence = { pages: [], api: [], redirects: [], blockedExternalRequests: 0 };

try {
  for (const language of ['en', 'fr']) {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        locale: language,
        isMobile: width < 1024,
        hasTouch: width < 1024,
      });
      await context.route('**/*', (route) => {
        if (new URL(route.request().url()).origin !== origin.origin) {
          evidence.blockedExternalRequests++;
          return route.abort();
        }

        return route.continue();
      });

      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      const response = await page.goto(`${origin.origin}/status?lang=${language}`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await page.getByTestId('heading-status').waitFor();
      assert.equal(await page.locator('[data-status="unknown"]').count(), 6);

      const text = await page.getByTestId('page-status').innerText();
      assert(text.includes(language === 'fr' ? 'État des services inconnu' : 'Service status unknown'));
      assert(
        text.includes(language === 'fr' ? 'Historique des incidents indisponible' : 'Incident history unavailable'),
      );
      assert(
        !/All systems operational|Tous les systèmes sont opérationnels|No incidents reported|Aucun incident signalé|99\.9/.test(
          text,
        ),
      );

      // Full-page screenshots do not force offscreen lazy images to load.
      const illustration = page.locator('img[src="/ecode-static/assets/product/dashboard.png"]');
      await illustration.scrollIntoViewIfNeeded();
      await illustration.evaluate((image) => image.decode());
      await page.evaluate(() => scrollTo(0, 0));

      const bounds = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert(
        bounds.content <= bounds.viewport,
        `Horizontal overflow at ${language}/${width}: ${JSON.stringify(bounds)}`,
      );
      assert.equal(await page.getByTestId('button-status-cta').getAttribute('href'), '/signup');
      assert.equal(await page.getByTestId('button-status-cta-secondary').getAttribute('href'), '/dashboard');
      await page.screenshot({ path: `${directory}/${language}-${width}.png`, fullPage: true });

      if (width === 390) {
        await page.screenshot({ path: `${directory}/${language}-${width}-viewport.png` });
      }

      if (width < 1024) {
        await page.getByTestId('button-status-subscribe').tap();
      } else {
        await page.getByTestId('button-status-subscribe').click();
      }

      const subscription = page.getByTestId('popover-status-subscribe');
      const email = subscription.locator('input[type="email"]');
      await email.waitFor({ state: 'visible' });
      assert.equal(await email.getAttribute('required'), '');
      assert.equal(await subscription.locator('form').getAttribute('method'), 'post');
      assert.equal(new URL(await subscription.locator('form').getAttribute('action'), origin).pathname, '/newsletter');
      assert.equal(await subscription.locator('input[name="source"]').inputValue(), 'status');

      if (width === 390) {
        await page.screenshot({ path: `${directory}/${language}-${width}-subscription.png`, fullPage: true });
        await page.screenshot({ path: `${directory}/${language}-${width}-subscription-viewport.png` });
      }

      assert.deepEqual(errors, [], `Browser errors in ${language}/${width}`);
      evidence.pages.push({
        language,
        width,
        status: response.status(),
        bounds,
        subscriptionOpened: true,
        submitted: false,
      });
      await context.close();
    }

    for (const path of [
      'status',
      'status/services',
      'status/incidents',
      'status/maintenance',
      'status/metrics',
      'status/uptime',
      'monitoring/health',
      'polyglot/health',
      'polyglot/benchmark',
    ]) {
      const response = await fetch(`${origin.origin}/api/${path}`, { headers: { 'Accept-Language': language } });
      assert.equal(response.status, 503, path);
      assert.equal(response.headers.get('content-language'), language);

      const payload = await response.json();

      for (const value of Array.isArray(payload) ? payload : [payload]) {
        assert.equal(value.code, 'PUBLIC_TELEMETRY_UNAVAILABLE');
        assert.equal(value.status, 'unknown');
        assert.equal(value.observedAt, null);
      }
      evidence.api.push({ path, language, status: response.status });
    }
  }

  for (const path of [
    '/ecode-static',
    '//ecode-static/index.html',
    '///ecode-static/',
    '/ecode-static/',
    '/ecode-static/index.html',
    '/ecode-static%2f.%2findex.html',
    '/ecode-static%2f..%2fecode-static%2findex.html',
    '/ecode-static/index',
    '/%65code-static/index%2Ehtml',
  ]) {
    const response = await fetch(`${origin.origin}${path}?lang=fr`, { redirect: 'manual' });
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get('location'), '/?lang=fr');
    evidence.redirects.push({ path, status: response.status, location: response.headers.get('location') });
  }
  assert.equal((await fetch(`${origin.origin}/ecode-static/assets/product/dashboard.png`)).status, 200);
  await writeFile(`${directory}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
