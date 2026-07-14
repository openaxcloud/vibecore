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

  const sortedProjects = [...projects].sort((a, b) => {
    const aUpdatedAt = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bUpdatedAt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

    return bUpdatedAt - aUpdatedAt;
  });

  expect(sortedProjects).toHaveLength(2);

  return {
    mostRecentProject: sortedProjects[0],
    organizationSlug: auth.organization.slug,
  };
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

  const outputDirectory = path.resolve(EVIDENCE_DIR);
  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(outputDirectory, filename),
    type: 'jpeg',
    quality: 90,
    fullPage: false,
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
}

async function expectDashboardReady(page: Page) {
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByText('Loading E-Code...', { exact: true })).toBeHidden({ timeout: 15_000 });
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

test('multi-project resume and user navigation remain usable across responsive sizes', async ({ page }) => {
  test.setTimeout(120_000);

  const { mostRecentProject, organizationSlug } = await provisionWorkspace(page);

  await page.addInitScript(() => {
    window.localStorage.setItem(
      'ecode:user-area-tour:v1',
      JSON.stringify({ version: 1, status: 'completed', step: 3 }),
    );
  });

  await setTheme(page, 'light');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  const resumeAction = page.getByRole('link', { name: `Resume ${mostRecentProject.name}`, exact: true });
  await expectDashboardReady(page);
  await expect(resumeAction).toBeVisible();

  const expectedResumePath =
    organizationSlug && mostRecentProject.slug
      ? `/@${organizationSlug}/${mostRecentProject.slug}`
      : `/projects/${mostRecentProject.id}/ide`;
  await expect(resumeAction).toHaveAttribute('href', expectedResumePath);
  await expect(page.getByRole('link', { name: 'Choose project', exact: true })).toHaveAttribute('href', '/projects');
  await expect(page.locator('#main-content').getByRole('link', { name: 'New project', exact: true })).toHaveAttribute(
    'href',
    '/projects/new',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectNoHorizontalOverflow(page);
  await captureEvidence(page, 'dashboard-multi-project-resume-light.jpg');

  await setTheme(page, 'dark');
  await page.reload();
  await expectDashboardReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: `Resume ${mostRecentProject.name}`, exact: true })).toBeVisible();
  await captureEvidence(page, 'dashboard-multi-project-resume-dark.jpg');

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

  expect(tabletMeasurements.scrollHeight).toBeGreaterThan(tabletMeasurements.clientHeight);
  expect(tabletMeasurements.overflowY).toBe('auto');
  await tabletRailNavigation.evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
  );
  await expect.poll(() => tabletRailNavigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);
});
