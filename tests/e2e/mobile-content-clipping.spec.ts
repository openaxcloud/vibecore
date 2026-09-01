import { expect, test, type Page } from '@playwright/test';

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

const IPHONE = { width: 390, height: 844 };

test.setTimeout(120_000);

/*
 * Every test here builds its own 390px context, so running the file once per
 * configured project would repeat identical work three times — and the desktop
 * profiles carry a desktop user-agent, which changed the measured layout on the
 * 2026-09-01 negative-control run (/community amputated under `mobile` but not
 * under `tablet`). Pin the file to the mobile project so the measurement is
 * reproducible.
 */
/*
 * WHY THIS SPEC EXISTS, AND WHY IT DOES NOT MEASURE `documentElement`.
 *
 * `app/styles/index.scss` puts `overflow-x: clip` on <html> AND <body> for the
 * marketing shell and for the whole user area (`.vc-app-shell-grid`). That was
 * a deliberate containment of decorative blurs, but it has two consequences:
 *
 *   1. Content wider than the viewport is AMPUTATED rather than scrollable —
 *      `clip` creates no scroll container, so the user can never reach it.
 *   2. `document.documentElement.scrollWidth` is clamped to `clientWidth` by
 *      construction, so the classic guard
 *      `documentElement.scrollWidth <= window.innerWidth + 1`
 *      cannot fail on these pages, whatever the layout does. Measured on
 *      2026-09-01: injecting a deliberately 3000px-wide block left
 *      `documentElement.scrollWidth` at 390 while `body.scrollWidth` read 3000.
 *
 * So the honest metric is `document.body.scrollWidth`, and the guard is only
 * trustworthy if it is itself proven able to fail — hence the counter-proof
 * test at the bottom, which is the check every existing overflow guard lacks.
 */
function measureClip(page: Page) {
  return page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
}

async function settle(page: Page) {
  await page.waitForTimeout(1_500);

  /* Marketing pages reveal sections on scroll; clipping can start below the fold. */
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 1_200);
    await page.waitForTimeout(150);
  }

  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
}

/*
 * Public routes: /community and /mobile each held a grid whose single implicit
 * `auto` track was sized by its children's min-content, overflowing the
 * container by 150px and 32px respectively at 390px.
 */
const PUBLIC_ROUTES = [
  /*
   * Each route is anchored on the section that actually overflowed. Without the
   * anchor the measurement can run before that section hydrates and report a
   * clean page — a false green, observed on the 2026-09-01 negative-control run
   * where /community passed under two of the three project profiles purely on
   * timing.
   *
   * The anchors are structural on purpose: not the fixed class (a test that
   * asserts its own fix proves nothing) and not the copy (these pages are
   * translated, so an English string would silently stop matching in French).
   */
  { route: '/community', anchor: '#community-feed' },
  { route: '/mobile', anchor: 'article:nth-of-type(1)' },
] as const;

for (const { route, anchor } of PUBLIC_ROUTES) {
  test(`${route} does not amputate content at ${IPHONE.width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: IPHONE, isMobile: true, hasTouch: true });
    const page = await context.newPage();

    try {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} status`).toBeLessThan(400);

      await expect(page.locator(anchor).first(), `${route} anchor section rendered`).toBeAttached({
        timeout: 30_000,
      });

      await settle(page);

      const measured = await measureClip(page);

      expect(
        measured.bodyScrollWidth,
        `${route} amputates ${measured.bodyScrollWidth - measured.clientWidth}px of content ` +
          `(body.scrollWidth=${measured.bodyScrollWidth}, viewport=${measured.clientWidth})`,
      ).toBeLessThanOrEqual(measured.clientWidth + 1);
    } finally {
      await context.close();
    }
  });
}

/*
 * User-area route: the permission matrix on /organization-roles overflowed by
 * 266px, hiding the Member / Editor / Viewer columns with no way to scroll.
 */
test(`/organization-roles does not amputate the permission matrix at ${IPHONE.width}px`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: IPHONE, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  try {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
      data: {
        email: `mobile-clipping-${suffix}@local.test`,
        password: 'Password123!',
        name: 'Mobile Clipping QA',
        organizationName: `Mobile Clipping QA ${suffix}`,
      },
    });

    expect(registration.ok(), await registration.text()).toBeTruthy();

    const auth = (await registration.json()) as { token: string };

    await context.addCookies([
      { name: 'vc_session', value: auth.token, url: APP_BASE_URL, httpOnly: true, sameSite: 'Lax' },
    ]);

    const response = await page.goto('/organization-roles', { waitUntil: 'domcontentloaded' });
    expect(response?.status(), '/organization-roles status').toBeLessThan(400);

    await expect(page.getByText('Permission matrix')).toBeVisible({ timeout: 30_000 });
    await settle(page);

    const measured = await measureClip(page);

    expect(
      measured.bodyScrollWidth,
      `/organization-roles amputates ${measured.bodyScrollWidth - measured.clientWidth}px of content ` +
        `(body.scrollWidth=${measured.bodyScrollWidth}, viewport=${measured.clientWidth})`,
    ).toBeLessThanOrEqual(measured.clientWidth + 1);
  } finally {
    await context.close();
  }
});

/*
 * COUNTER-PROOF — the guard above must be able to fail.
 *
 * A metric that cannot go red is worse than no metric: it reads as coverage.
 * This test breaks the page on purpose and asserts that `body.scrollWidth`
 * notices, AND that `documentElement.scrollWidth` does NOT — pinning the exact
 * reason the existing guards were blind. If a future change makes
 * `documentElement` responsive again, this test fails loudly and the migration
 * of the other guards can be revisited deliberately rather than by accident.
 */
test('the clipping metric is able to fail, and documentElement is not', async ({ browser }) => {
  const context = await browser.newContext({ viewport: IPHONE, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  try {
    await page.goto('/community', { waitUntil: 'domcontentloaded' });
    await settle(page);

    /*
     * Deliberately no precondition on the page being clean: this test proves the
     * INSTRUMENT, and must stay meaningful even on a build where the routes above
     * are still failing.
     */
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.id = 'clip-counter-proof';
      probe.style.cssText = 'width:3000px;height:8px';
      document.body.appendChild(probe);
    });
    await page.waitForTimeout(200);

    const after = await measureClip(page);

    expect(after.bodyScrollWidth, 'body.scrollWidth must react to a 3000px block').toBeGreaterThanOrEqual(3_000);

    expect(
      after.documentScrollWidth,
      'documentElement.scrollWidth is clamped by overflow-x: clip — this is why the legacy guards never fired',
    ).toBeLessThanOrEqual(after.clientWidth + 1);
  } finally {
    await context.close();
  }
});
