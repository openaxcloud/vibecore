import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

async function waitForApi(page: Page) {
  await expect
    .poll(
      async () => {
        try {
          return (await page.request.get(`${apiBaseUrl}/health`, { timeout: 2_000 })).ok();
        } catch {
          return false;
        }
      },
      { timeout: 60_000, message: 'The real API must be healthy before Community Gallery validation.' },
    )
    .toBe(true);
}

async function authenticate(page: Page) {
  await waitForApi(page);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseBody = '';
  let token: string | undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `community-gallery-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Community Gallery QA',
        organizationName: `Community Gallery QA ${suffix}-${attempt}`,
      },
    });

    responseBody = await response.text();

    if (response.ok()) {
      token = (JSON.parse(responseBody) as { token: string }).token;
      break;
    }

    if (response.status() !== 429 || attempt === 3) {
      expect(response.ok(), responseBody).toBeTruthy();
    }

    const retryAfter = Number(response.headers()['retry-after']);
    const responseSeconds = Number(responseBody.match(/retry in (\d+) seconds/i)?.[1]);

    const delayMs = Number.isFinite(retryAfter)
      ? (retryAfter + 1) * 1000
      : Number.isFinite(responseSeconds)
        ? (responseSeconds + 1) * 1000
        : 10_000;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  expect(token, responseBody || 'Registration did not return a session token.').toBeTruthy();

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: token!,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function waitForSettledUserArea(page: Page) {
  const routeLoader = page.getByTestId('branded-route-loader');

  if ((await routeLoader.count()) > 0) {
    await expect(routeLoader).toHaveAttribute('aria-hidden', 'true', { timeout: 30_000 });
    await expect
      .poll(() => routeLoader.evaluate((element) => window.getComputedStyle(element).opacity), {
        message: 'The branded route loader must be fully hidden before visual evidence is captured.',
        timeout: 30_000,
      })
      .toBe('0');
  }
}

async function loadAllGalleryThumbnails(page: Page) {
  const thumbnails = page.getByTestId('template-thumbnail');
  const count = await thumbnails.count();

  for (let index = 0; index < count; index += 1) {
    const thumbnail = thumbnails.nth(index);
    await thumbnail.scrollIntoViewIfNeeded();
    await expect
      .poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), {
        message: `Gallery thumbnail ${index + 1} must be decoded before visual evidence is captured.`,
      })
      .toBe(true);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
}

test('captures the authenticated Community Gallery across required themes and viewports', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The explicit viewport matrix runs once in Chromium.');
  test.setTimeout(180_000);

  await page.addInitScript(() => {
    const captureTheme = new URL(window.location.href).searchParams.get('captureTheme');

    if (captureTheme === 'dark' || captureTheme === 'light') {
      localStorage.setItem('bolt_theme', captureTheme);
    }

    localStorage.setItem('ecode:user-area-tour:v1', JSON.stringify({ version: 1, status: 'completed', step: 3 }));
  });
  await authenticate(page);

  const phase = process.env.COMMUNITY_GALLERY_CAPTURE_PHASE ?? 'after';
  const evidenceDirectory = path.resolve('docs/ui-ux-evidence/2026-07-16/community-gallery', phase);
  await mkdir(evidenceDirectory, { recursive: true });

  const viewports = [
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'tablet-1024', width: 1024, height: 900 },
    { name: 'desktop-1440', width: 1440, height: 1050 },
  ] as const;

  for (const theme of ['dark', 'light'] as const) {
    for (const viewport of viewports) {
      // The shared theme cookie intentionally has priority over localStorage.
      // Keep both persistence layers aligned so each capture exercises the
      // same production theme boot path as a real user selection.
      await page.context().addCookies([
        {
          name: 'ecode_theme',
          value: theme,
          url: appBaseUrl,
          sameSite: 'Lax',
        },
      ]);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/dashboard/templates?captureTheme=${theme}&captureViewport=${viewport.name}`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(page.getByRole('heading', { name: 'Community Gallery' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Remix / }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Not now' })).toHaveCount(0);
      await waitForSettledUserArea(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await loadAllGalleryThumbnails(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(2);

      await page.screenshot({
        path: path.join(evidenceDirectory, `${theme}-${viewport.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });

      if (theme === 'dark' && viewport.name === 'desktop-1440') {
        await page.getByRole('button', { name: 'List view' }).click();
        await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
        await page.screenshot({
          path: path.join(evidenceDirectory, `${theme}-${viewport.name}-list.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
  }
});
