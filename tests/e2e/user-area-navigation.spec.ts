import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const EVIDENCE_DIR = process.env.UI_UX_EVIDENCE_DIR?.trim();

type ProvisionedProject = {
  id: string;
  name: string;
  slug?: string;
  updatedAt?: string;
};

async function waitForApiHealth(page: Page) {
  const deadline = Date.now() + 60_000;

  let lastError = 'API did not respond before timeout.';

  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(`${API_BASE_URL}/health`, { timeout: 2_000 });

      if (response.ok()) {
        return;
      }

      lastError = `API health returned ${response.status()}: ${await response.text().catch(() => '')}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await page.waitForTimeout(500);
  }

  throw new Error(lastError);
}

async function provisionWorkspace(page: Page) {
  await waitForApiHealth(page);

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      email: `user-area-navigation-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Responsive QA',
      organizationName: `Responsive QA ${suffix}`,
    },
  });

  expect(registration.ok(), await registration.text()).toBeTruthy();

  const auth = (await registration.json()) as { token: string; organization: { id: string; slug?: string } };

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: auth.token,
      url: APP_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  for (const name of ['Customer portal', 'Operations dashboard']) {
    const creation = await page.request.post(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
      data: { name },
      headers: { authorization: `Bearer ${auth.token}` },
    });

    expect(creation.ok(), await creation.text()).toBeTruthy();
  }

  const projectsResponse = await page.request.get(`${API_BASE_URL}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
  });

  expect(projectsResponse.ok(), await projectsResponse.text()).toBeTruthy();

  const { projects } = (await projectsResponse.json()) as { projects: ProvisionedProject[] };

  expect(projects).toHaveLength(2);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.context().addCookies([
    {
      name: 'ecode_theme',
      value: theme,
      url: APP_BASE_URL,
      sameSite: 'Lax',
    },
  ]);
}

async function captureEvidence(page: Page, filename: string) {
  if (!EVIDENCE_DIR) {
    return;
  }

  const routeLoader = page.getByTestId('branded-route-loader');

  await expect(routeLoader).toHaveAttribute('aria-hidden', 'true', {
    timeout: 30_000,
  });
  await expect
    .poll(() => routeLoader.evaluate((element) => window.getComputedStyle(element).opacity), { timeout: 30_000 })
    .toBe('0');

  const outputDirectory = path.resolve(EVIDENCE_DIR);
  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(outputDirectory, filename),
    type: 'jpeg',
    quality: 90,
    fullPage: false,
    animations: 'disabled',
  });
  await expect(routeLoader).toHaveAttribute('aria-hidden', 'true');
  await expect.poll(() => routeLoader.evaluate((element) => window.getComputedStyle(element).opacity)).toBe('0');
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
}

async function expectDashboardReady(page: Page) {
  await expectUserAreaReady(page, 'Dashboard');
}

async function expectUserAreaReady(page: Page, heading: string) {
  await page.waitForFunction(
    () => Boolean((window as Window & { __ecodeHydrated?: boolean }).__ecodeHydrated),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('branded-route-loader')).toHaveAttribute('aria-hidden', 'true', {
    timeout: 30_000,
  });
}

async function installHydrationObserver(page: Page) {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __ecodeHydrated?: boolean };
    testWindow.__ecodeHydrated = false;
    window.addEventListener(
      'ecode:hydrated',
      () => {
        testWindow.__ecodeHydrated = true;
      },
      { once: true },
    );
    window.localStorage.setItem(
      'ecode:user-area-tour:v1',
      JSON.stringify({ version: 1, status: 'completed', step: 3 }),
    );
  });
}

async function openAndScrollMobileNavigation(page: Page, width: 390 | 768) {
  await page.setViewportSize({ width, height: 600 });
  await page.goto('/dashboard');
  await expectDashboardReady(page);

  const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveText('Menu');
  await menuButton.click();

  const drawer = page.getByRole('navigation', { name: 'Main' });
  const navigation = page.getByTestId('mobile-navigation-scroll-region');
  await expect(drawer).toBeVisible();
  await expect(navigation).toBeVisible();
  await expect.poll(() => drawer.evaluate((element) => element.getBoundingClientRect().left)).toBe(0);

  const measurements = await navigation.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: style.overflowY,
      overscrollBehaviorY: style.overscrollBehaviorY,
      touchAction: style.touchAction,
      top: rect.top,
      bottom: rect.bottom,
    };
  });

  expect(measurements.scrollHeight).toBeGreaterThan(measurements.clientHeight);
  expect(measurements.overflowY).toBe('auto');
  expect(measurements.overscrollBehaviorY).toBe('contain');
  expect(measurements.touchAction).toBe('pan-y');
  expect(measurements.top).toBeGreaterThanOrEqual(0);
  expect(measurements.bottom).toBeLessThanOrEqual(600);

  const touchTargetHeights = await navigation.locator('a, button').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element);

        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((element) => element.getBoundingClientRect().height),
  );

  expect(touchTargetHeights.length).toBeGreaterThan(0);
  expect(Math.min(...touchTargetHeights)).toBeGreaterThanOrEqual(44);

  await navigation.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(navigation.getByRole('link', { name: 'Data & privacy' })).toBeInViewport();
  await expectNoHorizontalOverflow(page);

  return navigation;
}

test('project actions and user navigation remain usable across responsive sizes', async ({ page }) => {
  test.setTimeout(180_000);

  const hydrationErrors: string[] = [];
  const hydrationErrorPattern = /(?:React error #(?:418|423)|hydration (?:failed|mismatch)|did not match)/i;
  page.on('console', (message) => {
    if (message.type() === 'error' && hydrationErrorPattern.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (hydrationErrorPattern.test(error.message)) {
      hydrationErrors.push(error.message);
    }
  });

  await provisionWorkspace(page);

  await installHydrationObserver(page);

  await setTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  await expectDashboardReady(page);
  await expect(page.getByRole('link', { name: /^Resume / })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Choose project', exact: true })).toHaveCount(0);
  await expect(page.locator('#main-content').getByRole('link', { name: 'New project', exact: true })).toHaveAttribute(
    'href',
    '/projects/new',
  );
  await expect(page.locator('#main-content').getByRole('link', { name: 'Open IDE', exact: true })).toHaveCount(2);

  const projectTitles = await page.locator('#main-content').getByRole('heading', { level: 3 }).allTextContents();
  expect(projectTitles.indexOf('Operations dashboard')).toBeGreaterThanOrEqual(0);
  expect(projectTitles.indexOf('Operations dashboard')).toBeLessThan(projectTitles.indexOf('Customer portal'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectNoHorizontalOverflow(page);
  await captureEvidence(page, 'dashboard-project-actions-light.jpg');

  await setTheme(page, 'dark');
  await page.reload();
  await expectDashboardReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: /^Resume / })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Choose project', exact: true })).toHaveCount(0);
  await captureEvidence(page, 'dashboard-project-actions-dark.jpg');

  await setTheme(page, 'light');
  await openAndScrollMobileNavigation(page, 390);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await captureEvidence(page, 'mobile-navigation-scroll-light.jpg');

  await setTheme(page, 'dark');

  const darkNavigation = await openAndScrollMobileNavigation(page, 390);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(darkNavigation.getByRole('link', { name: 'Data & privacy' })).toBeInViewport();
  await captureEvidence(page, 'mobile-navigation-scroll-dark.jpg');

  await openAndScrollMobileNavigation(page, 768);

  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeHidden();

  const tabletRailNavigation = page.locator('nav[aria-label="Application navigation"]:visible');
  await expect(tabletRailNavigation).toHaveCount(1);

  const tabletMeasurements = await tabletRailNavigation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: window.getComputedStyle(element).overflowY,
  }));

  const tabletTouchTargetHeights = await tabletRailNavigation.locator('a, button').evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element);

        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((element) => element.getBoundingClientRect().height),
  );

  expect(tabletMeasurements.scrollHeight).toBeGreaterThan(tabletMeasurements.clientHeight);
  expect(tabletMeasurements.overflowY).toBe('auto');
  expect(Math.min(...tabletTouchTargetHeights)).toBeGreaterThanOrEqual(44);
  await tabletRailNavigation.evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
  );
  await expect.poll(() => tabletRailNavigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  await expectDashboardReady(page);
  await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeHidden();
  await expect(page.locator('nav[aria-label="Application navigation"]:visible')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  expect(hydrationErrors).toEqual([]);
});

const USER_AREA_SURFACES = [
  {
    path: '/projects',
    heading: 'Projects',
    evidenceName: 'projects',
    settledCopy: /Customer portal|Operations dashboard|Projects could not load/,
  },
  {
    path: '/recent-projects',
    heading: 'Recent projects',
    evidenceName: 'recent-projects',
    settledCopy: /Customer portal|Operations dashboard|Recent projects could not load/,
  },
  {
    path: '/support',
    heading: 'Support',
    evidenceName: 'support',
    settledCopy: /Your open tickets|Support tickets could not load/,
  },
  {
    path: '/invoices',
    heading: 'Invoices',
    evidenceName: 'invoices',
    settledCopy: /No invoices yet|Invoices are restricted|Invoices could not load/,
  },
  {
    path: '/desktop-settings',
    heading: 'Desktop settings',
    evidenceName: 'desktop-settings',
    settledCopy: /Available in the E-Code desktop app|Desktop settings could not load/,
  },
  {
    path: '/organization-domains',
    heading: 'Verified domains',
    evidenceName: 'verified-domains',
    settledCopy: /Add a domain|Domain management is restricted|Domains could not load/,
  },
  {
    path: '/organization-siem',
    heading: 'SIEM webhooks',
    evidenceName: 'siem-webhooks',
    settledCopy: /Add a webhook|SIEM settings are restricted|SIEM webhooks could not load/,
  },
  {
    path: '/audit-logs',
    heading: 'Audit logs',
    evidenceName: 'audit-logs',
    settledCopy: /Recent events|Audit logs are restricted|Audit logs could not load/,
  },
  {
    path: '/organization-members',
    heading: 'Organization members',
    evidenceName: 'organization-members',
    settledCopy: /Members|Member management is restricted|Members could not load/,
  },
  {
    path: '/account-settings/data',
    heading: 'Account',
    evidenceName: 'account-data',
    settledCopy: /Account status|Data and privacy settings could not load/,
  },
] as const;

test('updated user-area surfaces remain responsive in light and dark themes', async ({ page }) => {
  test.setTimeout(600_000);

  await provisionWorkspace(page);
  await installHydrationObserver(page);

  const viewports = [
    { width: 1440, height: 900, theme: 'light' as const, capture: true },
    { width: 390, height: 844, theme: 'dark' as const, capture: true },
    { width: 768, height: 900, theme: 'light' as const, capture: false },
    { width: 1024, height: 768, theme: 'dark' as const, capture: false },
  ];

  for (const viewport of viewports) {
    await setTheme(page, viewport.theme);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const surface of USER_AREA_SURFACES) {
      await page.goto(surface.path);
      await expectUserAreaReady(page, surface.heading);
      await expect(page.locator('#main-content')).toContainText(surface.settledCopy, { timeout: 30_000 });
      await expectNoHorizontalOverflow(page);

      if (surface.path === '/account-settings/data' && viewport.width === 1440) {
        const activeNavigationItems = page.locator(
          'nav[aria-label="Application navigation"]:visible a[aria-current="page"]',
        );
        await expect(activeNavigationItems).toHaveCount(1);
        await expect(activeNavigationItems).toHaveText('Data & privacy');
      }

      if (viewport.capture) {
        await captureEvidence(page, `${surface.evidenceName}-${viewport.theme}-${viewport.width}.jpg`);
      }
    }
  }
});

test('async user-area panels recover from an unavailable API without exposing fallback controls', async ({ page }) => {
  test.skip(
    process.env.UI_UX_FAULT_API_UNAVAILABLE !== '1',
    'Run against a web process whose SAAS_API_URL points to an unavailable port.',
  );
  test.setTimeout(180_000);

  await provisionWorkspace(page);
  await installHydrationObserver(page);

  const surfaces = [
    {
      path: '/organization-members?orgId=fault-injection',
      heading: 'Organization members',
      errorHeading: 'Members could not load',
      evidenceName: 'organization-members-error',
      hiddenControl: () => page.getByRole('button', { name: 'Send invite' }),
    },
    {
      path: '/account-settings/data',
      heading: 'Account',
      errorHeading: 'Data and privacy settings could not load',
      evidenceName: 'account-data-error',
      hiddenControl: () => page.getByTestId('account-delete-open'),
    },
  ] as const;

  for (const viewport of [
    { width: 1440, height: 900, theme: 'light' as const },
    { width: 390, height: 844, theme: 'dark' as const },
  ]) {
    await setTheme(page, viewport.theme);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const surface of surfaces) {
      await page.goto(surface.path);
      await expectUserAreaReady(page, surface.heading);
      await expect(page.getByRole('heading', { name: surface.errorHeading })).toBeVisible();
      await expect(surface.hiddenControl()).toHaveCount(0);

      if (surface.path === '/account-settings/data') {
        await expect(page.getByTestId('account-data-export')).toHaveCount(0);
      }

      const retry = page.getByRole('button', { name: 'Try again' });
      await expect(retry).toBeVisible();
      expect(await retry.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalOverflow(page);
      await captureEvidence(page, `${surface.evidenceName}-${viewport.theme}-${viewport.width}.jpg`);
      await retry.click();
      await expect(page.getByRole('heading', { name: surface.errorHeading })).toBeVisible({ timeout: 30_000 });
      await expect(retry).toBeVisible();
    }
  }
});
