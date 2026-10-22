import { expect, test } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const returnTo = '/@org-dzj1djmz/creez-un-tableau-de-bord-2?panel=preview';

// Network fault fixtures on the real local web bundle, not a production diagnosis.
for (const fault of ['normal', 'slow', 'pending', '503', 'json', 'shape'] as const) {
  for (const language of ['en', 'fr']) {
    test(`login catalogue ${fault} (${language}) preserves returnTo and hydration`, async ({ page }) => {
      // 30s navigation + 15s bounded failure observation + 15s recovery.
      test.setTimeout(60_000);
      expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL).hostname);

      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        const state = window as typeof window & {
          __catalogueEntry?: boolean;
          __vibecoreStartupMark?: (phase: string) => void;
        };

        state.__vibecoreStartupMark = (phase) => {
          if (phase === 'entry-module-evaluated') {
            state.__catalogueEntry = true;
          }
        };
      });

      let recovered = fault === 'normal';
      let release!: () => void;

      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });

      let requests = 0;
      await page.route(`**/catalogue-${language}-public-*.json`, async (route) => {
        requests++;

        if (!recovered) {
          if (fault === 'slow' || fault === 'pending') {
            await pending;
          } else {
            await route.fulfill({
              status: fault === '503' ? 503 : 200,
              contentType: 'application/json',
              body: fault === 'shape' ? '[]' : 'not valid JSON',
            });
            return;
          }
        }

        await route.continue().catch(() => undefined); // The timeout may already have aborted this request.
      });

      try {
        await page.goto(`${baseURL}/login?lang=${language}&returnTo=${encodeURIComponent(returnTo)}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });

        const recovery = page.locator('[data-ecode-startup-recovery]');

        if (fault === 'slow') {
          await expect
            .poll(() =>
              page.evaluate(() => (window as typeof window & { __catalogueEntry?: boolean }).__catalogueEntry),
            )
            .toBe(true);
          await expect(page.locator('[data-ecode-boot-splash]')).toBeVisible();
          await expect(page.locator('input[type=email]')).toHaveCount(0);
          await expect(recovery).toBeHidden();
          recovered = true;
          release();
        } else if (fault !== 'normal') {
          await expect(recovery).toBeVisible({ timeout: 15_000 });
          await expect(recovery).toContainText(
            language === 'fr' ? 'Le chargement de cette page a échoué' : 'This page could not finish loading',
          );
          await expect(
            recovery.getByRole('heading', {
              name: language === 'fr' ? 'Le chargement de cette page a échoué' : 'This page could not finish loading',
              level: 2,
            }),
          ).toBeVisible();
          await expect(page.locator('input[type=email]')).toHaveCount(0);
          expect(errors).toEqual([]);

          const retry = recovery.getByRole('button', { name: language === 'fr' ? 'Réessayer' : 'Try again' });
          await expect(retry).toBeFocused();

          const requestsBeforeRetry = requests;
          recovered = true;
          release();
          await retry.click();
          await expect.poll(() => requests).toBeGreaterThan(requestsBeforeRetry);
        }

        await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('input[type=password]')).toBeVisible();
        await expect(recovery).toBeHidden();
        await expect(page.locator('body')).not.toContainText('Unavailable');
        expect(new URL(page.url()).searchParams.get('returnTo')).toBe(returnTo);
        expect(await page.locator('html').getAttribute('lang')).toBe(language);
        expect(errors).toEqual([]);
        expect(requests).toBeGreaterThan(0);
      } finally {
        release();
      }
    });
  }
}
