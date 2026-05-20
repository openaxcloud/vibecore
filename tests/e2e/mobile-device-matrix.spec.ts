import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import JSZip from 'jszip';

type AuthPayload = { token: string; organization: { id: string } };

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const mobileDeviceProfiles = [
  {
    name: 'iphone-se',
    viewport: { width: 375, height: 667 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iphone-pro-max',
    viewport: { width: 430, height: 932 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'pixel-compact',
    viewport: { width: 393, height: 851 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  },
  {
    name: 'galaxy-large',
    viewport: { width: 412, height: 915 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  },
  {
    name: 'android-landscape',
    viewport: { width: 932, height: 430 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  },
  {
    name: 'ipad-mini-portrait',
    viewport: { width: 768, height: 1024 },
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'ipad-landscape',
    viewport: { width: 1024, height: 768 },
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
] as const;

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function authenticate(request: APIRequestContext): Promise<AuthPayload> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `device-matrix-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Device Matrix E2E',
        organizationName: `Device Matrix E2E ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      return JSON.parse(responseText) as AuthPayload;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  throw new Error(responseText || 'Unable to authenticate device matrix user');
}

async function createProject(request: APIRequestContext, auth: AuthPayload) {
  const createProject = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Mobile device matrix project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;
  const zip = new JSZip();
  zip.file(
    'src/App.tsx',
    `export function App() {
  return <main data-device-matrix="ready">Device matrix preview</main>;
}
`,
  );

  const importFiles = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }), replaceExisting: true },
  });

  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  return projectId;
}

async function clickFirstVisible(candidates: import('@playwright/test').Locator[], timeout = 15_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click({ force: true });

        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await candidates[0].click({ force: true });
}

async function openMobileMoreMenu(page: import('@playwright/test').Page, profileName: string) {
  const moreMenu = page.getByTestId('mobile-more-menu-sheet');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickFirstVisible([
      page.getByTestId('mobile-bottom-navigation').getByTestId('button-more'),
      page.getByTestId('mobile-ide-header').getByTestId('button-more'),
    ]);

    try {
      await expect(moreMenu, `${profileName} more menu`).toBeVisible({ timeout: 5_000 });

      return moreMenu;
    } catch {
      await page
        .getByTestId('mobile-more-menu-backdrop')
        .click({ force: true })
        .catch(() => undefined);
      await expect(moreMenu)
        .toBeHidden({ timeout: 5_000 })
        .catch(() => undefined);
    }
  }

  await expect(moreMenu, `${profileName} more menu`).toBeVisible({ timeout: 15_000 });

  return moreMenu;
}

async function closeMobileMoreMenu(page: import('@playwright/test').Page) {
  const moreMenu = page.getByTestId('mobile-more-menu-sheet');

  await page
    .getByTestId('mobile-more-menu-close')
    .click({ timeout: 5_000 })
    .catch(() => undefined);
  await expect(moreMenu)
    .toBeHidden({ timeout: 2_000 })
    .catch(async () => {
      await page
        .getByTestId('mobile-more-menu-backdrop')
        .click({ force: true, timeout: 5_000 })
        .catch(() => undefined);
    });
  await expect(moreMenu).toBeHidden({ timeout: 10_000 });
}

async function openMobileToolsSheet(page: import('@playwright/test').Page, profileName: string) {
  const toolsSheet = page.getByTestId('tools-sheet');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickFirstVisible([
      page.getByTestId('mobile-bottom-navigation').getByTestId('button-add-tab'),
      page.getByTestId('mobile-ide-header').getByTestId('button-new-tab'),
      page.getByTestId('mobile-bottom-navigation').getByTestId('button-tab-switcher'),
    ]);

    if (
      await page
        .getByTestId('mobile-tab-switcher')
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTestId('button-new-tab').click({ force: true });
    }

    try {
      await expect(toolsSheet, `${profileName} tools sheet`).toBeVisible({ timeout: 5_000 });

      return toolsSheet;
    } catch {
      await page
        .getByTestId('tools-sheet-close')
        .click({ force: true })
        .catch(() => undefined);
      await expect(toolsSheet)
        .toBeHidden({ timeout: 5_000 })
        .catch(() => undefined);
    }
  }

  await expect(toolsSheet, `${profileName} tools sheet`).toBeVisible({ timeout: 15_000 });

  return toolsSheet;
}

test.describe('compact IDE shell device matrix', () => {
  let auth: AuthPayload;
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    auth = await authenticate(request);
    projectId = await createProject(request, auth);
  });

  for (const profile of mobileDeviceProfiles) {
    test(`adapts to ${profile.name}`, async ({ browser }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'device matrix creates explicit browser contexts');
      test.setTimeout(90_000);

      await assertCompactShellForProfile(browser, auth, projectId, profile);
    });
  }
});

async function assertCompactShellForProfile(
  browser: Browser,
  auth: AuthPayload,
  projectId: string,
  profile: (typeof mobileDeviceProfiles)[number],
) {
  const context = await browser.newContext({
    baseURL: appBaseUrl,
    viewport: profile.viewport,
    isMobile: true,
    hasTouch: true,
    userAgent: profile.userAgent,
  });

  await context.addCookies([
    {
      name: 'vc_session',
      value: auth.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  try {
    await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile'), `${profile.name} compact shell`).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId('mobile-bottom-navigation'), `${profile.name} bottom navigation`).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId('tab-preview'), `${profile.name} Webview tab`).toBeVisible();
    await expect(page.getByTestId('tab-agent'), `${profile.name} AI Agent tab`).toBeVisible();
    await expect(page.getByTestId('tab-deployments'), `${profile.name} Deployments tab`).toBeVisible();

    const layout = await page.evaluate(() => {
      const navElement = document.querySelector('.bolt-mobile-replit-nav');
      const statusElement = document.querySelector('.bolt-project-statusbar-mobile');
      const nav = navElement?.getBoundingClientRect();
      const status = statusElement?.getBoundingClientRect();

      const statusVisible =
        statusElement instanceof HTMLElement &&
        getComputedStyle(statusElement).display !== 'none' &&
        statusElement.offsetParent !== null;

      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        navVisible:
          navElement instanceof HTMLElement &&
          getComputedStyle(navElement).display !== 'none' &&
          getComputedStyle(navElement).visibility !== 'hidden' &&
          Boolean(nav && nav.width > 0 && nav.height > 0),
        overlaps: Boolean(nav && status && statusVisible && status.bottom > nav.top),
      };
    });

    expect(layout.navVisible, `${profile.name} nav visible`).toBe(true);
    expect(layout.overflowX, `${profile.name} horizontal overflow`).toBe(false);
    expect(layout.overlaps, `${profile.name} status/nav overlap`).toBe(false);

    const moreMenu = await openMobileMoreMenu(page, profile.name);

    for (const label of ['Overview', 'Webview', 'Deployments', 'Object Storage', 'Environment variables', 'Settings']) {
      await expect(moreMenu.getByText(label, { exact: true }), `${profile.name} more menu ${label}`).toBeVisible();
    }

    await closeMobileMoreMenu(page);
    await openMobileToolsSheet(page, profile.name);

    for (const toolId of ['editor', 'files', 'terminal', 'deployments', 'object-storage', 'settings']) {
      await expect(page.getByTestId(`tool-item-${toolId}`), `${profile.name} tool ${toolId}`).toBeVisible();
    }
  } finally {
    await context.close();
  }
}
