import { expect, test, type APIRequestContext, type Browser, type Page, type TestInfo } from '@playwright/test';
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

const compactPanelProfiles = mobileDeviceProfiles.filter((profile) =>
  ['iphone-se', 'iphone-pro-max', 'android-landscape', 'ipad-mini-portrait', 'ipad-landscape'].includes(profile.name),
);

const compactIdePanels = [
  'preview',
  'agent',
  'files',
  'editor',
  'terminal',
  'search',
  'locks',
  'overview',
  'git',
  'packages',
  'database',
  'object-storage',
  'secrets',
  'env',
  'logs',
  'debugger',
  'workflows',
  'integrations',
  'collaborators',
  'activity',
  'snapshots',
  'extensions',
  'monitoring',
  'domains',
  'security',
  'settings',
  'deployments',
] as const;

const compactToolsPaletteItems = [
  { id: 'overview', label: 'Overview' },
  { id: 'preview', label: 'Webview' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'git', label: 'Git' },
  { id: 'packages', label: 'Packages' },
  { id: 'database', label: 'Database' },
  { id: 'object-storage', label: 'Object Storage' },
  { id: 'locks', label: 'Locks' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'env', label: 'Environment variables' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'logs', label: 'Logs' },
  { id: 'debugger', label: 'Debugger' },
  { id: 'search', label: 'Search' },
  { id: 'commands', label: 'Commands' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'collaborators', label: 'Collaborators' },
  { id: 'share', label: 'Share' },
  { id: 'activity', label: 'Activity' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'extensions', label: 'Extensions' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'domains', label: 'Domains' },
  { id: 'security', label: 'Security' },
  { id: 'settings', label: 'Settings' },
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

  const listedFiles = await request.get(`${apiBaseUrl}/projects/${projectId}/files`, {
    headers: { authorization: `Bearer ${auth.token}` },
  });

  const listedFilesBody = await listedFiles.text();

  expect(listedFiles.ok(), listedFilesBody).toBeTruthy();
  expect(
    (JSON.parse(listedFilesBody) as { files: Array<{ path: string }> }).files.some(
      (file) => file.path === 'src/App.tsx',
    ),
    'imported project file should be persisted by the real project files API',
  ).toBe(true);

  return projectId;
}

async function clickFirstVisible(candidates: import('@playwright/test').Locator[], timeout = 15_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click({ force: true });

        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function expectMobileToolsSheetFitsViewport(page: Page) {
  await expect(page.getByTestId('tools-search-input')).not.toBeFocused();

  const metrics = await page.getByTestId('tools-sheet').evaluate((sheet) => {
    const sheetRect = sheet.getBoundingClientRect();
    const toolItems = Array.from(sheet.querySelectorAll('[data-testid^="tool-item-"]'));
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

    const visibleToolItems = toolItems.filter((item) => {
      const rect = item.getBoundingClientRect();

      return (
        rect.top >= sheetRect.top && rect.bottom <= viewportHeight && rect.left >= 0 && rect.right <= viewportWidth
      );
    }).length;

    const searchInput = sheet.querySelector('[data-testid="tools-search-input"]') as HTMLInputElement | null;

    return {
      bottom: sheetRect.bottom,
      left: sheetRect.left,
      right: sheetRect.right,
      searchFontSize: searchInput ? Number.parseFloat(window.getComputedStyle(searchInput).fontSize) : 0,
      top: sheetRect.top,
      visibleToolItems,
      viewportHeight,
      viewportWidth,
    };
  });

  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.searchFontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.visibleToolItems).toBeGreaterThanOrEqual(6);
}

async function openMobileToolsSheet(page: import('@playwright/test').Page, profileName: string) {
  const toolsSheet = page.getByTestId('tools-sheet');
  const tabSwitcher = page.getByTestId('mobile-tab-switcher');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await tabSwitcher.isVisible().catch(() => false)) {
      await tabSwitcher.getByTestId('button-new-tab').click({ force: true });
    } else {
      await clickFirstVisible(
        [
          page.getByTestId('mobile-bottom-navigation').getByTestId('button-add-tab'),
          page.getByTestId('mobile-ide-header').getByTestId('button-new-tab'),
          page.getByTestId('mobile-bottom-navigation').getByTestId('button-tab-switcher'),
        ],
        5_000,
      );

      if (await tabSwitcher.isVisible().catch(() => false)) {
        await tabSwitcher.getByTestId('button-new-tab').click({ force: true });
      }
    }

    try {
      await expect(toolsSheet, `${profileName} tools sheet`).toBeVisible({ timeout: 5_000 });

      break;
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
  await expect(toolsSheet.getByTestId('tool-item-editor'), `${profileName} tools sheet content`).toBeVisible({
    timeout: 15_000,
  });
  await expectMobileToolsSheetFitsViewport(page);

  return toolsSheet;
}

test.describe('compact IDE shell device matrix', () => {
  test.describe.configure({ timeout: 300_000 });

  let auth: AuthPayload;
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    auth = await authenticate(request);
    projectId = await createProject(request, auth);
  });

  for (const profile of mobileDeviceProfiles) {
    test(`adapts to ${profile.name}`, async ({ browser }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium', 'device matrix creates explicit browser contexts');
      test.setTimeout(150_000);

      await assertCompactShellForProfile(browser, auth, projectId, profile);
    });
  }

  for (const profile of compactPanelProfiles) {
    test(
      `renders every compact IDE panel full-screen on ${profile.name} with a nonblank preview`,
      {
        tag: '@runtime',
      },
      async ({ browser }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'device matrix creates explicit browser contexts');
        test.setTimeout(300_000);

        await assertEveryCompactPanelForProfile(browser, auth, projectId, profile, testInfo);
      },
    );
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
    await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile'), `${profile.name} compact shell`).toBeVisible({
      timeout: 90_000,
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

    await expect(page.getByTestId('mobile-bottom-navigation').getByTestId('button-more')).toBeVisible();

    /*
     * The compact header exposes a single overflow control whose test id (and
     * target menu) depends on the active panel: `mobile-agent-menu-trigger`
     * while the Agent panel is up, `button-more` otherwise. The shell lands on
     * the Agent panel, so asserting `button-more` unconditionally never
     * matched. Accept either — what matters is that the control is there.
     */
    await expect(
      page
        .getByTestId('mobile-ide-header')
        .locator('[data-testid="button-more"], [data-testid="mobile-agent-menu-trigger"]'),
      `${profile.name} header overflow control`,
    ).toBeVisible();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);

    await page.getByTestId('mobile-bottom-navigation').getByTestId('button-more').click({ force: true });
    await expect(page.getByTestId('mobile-more-menu-sheet'), `${profile.name} more menu`).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('mobile-more-menu-deployments')).toContainText('Deployments');
    await expect(page.getByTestId('mobile-more-menu-settings')).toContainText('Settings');
    await page.getByTestId('mobile-more-menu-close').click({ force: true });
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);

    const toolsSheet = await openMobileToolsSheet(page, profile.name);

    const renderedToolItems = await toolsSheet.evaluate((sheet) =>
      Array.from(sheet.querySelectorAll('[data-testid^="tool-item-"]')).map((element) => ({
        id: element.getAttribute('data-testid')?.replace('tool-item-', ''),
        label: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      })),
    );

    /*
     * Tool items prefix their label with a status and a description that depend
     * on whether a workspace is up ("UnavailableWorkspace shell terminal" with
     * no runtime, "Terminal …" with one). This matrix is about responsive
     * layout, not runtime state, so match the tool name case-insensitively;
     * running-workspace labels belong to the @runtime suite.
     *
     * Report every gap in one go rather than failing on the first tool.
     */
    const missingTools = compactToolsPaletteItems.filter((item) => {
      const renderedItem = renderedToolItems.find((candidate) => candidate.id === item.id);

      return !renderedItem || !renderedItem.label.toLowerCase().includes(item.label.toLowerCase());
    });

    expect(
      missingTools.map((item) => item.id),
      `${profile.name} tools palette — rendered: ${renderedToolItems.map((item) => item.id).join(', ')}`,
    ).toEqual([]);

    const renderedToolIds = renderedToolItems.map((item) => item.id);

    for (const toolId of ['editor', 'files', 'terminal', 'deployments', 'object-storage', 'settings']) {
      expect(renderedToolIds, `${profile.name} tool ${toolId}`).toContain(toolId);
    }
  } finally {
    await context.close();
  }
}

async function assertEveryCompactPanelForProfile(
  browser: Browser,
  auth: AuthPayload,
  projectId: string,
  profile: (typeof mobileDeviceProfiles)[number],
  testInfo: TestInfo,
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
    await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile'), `${profile.name} compact shell`).toBeVisible({
      timeout: 90_000,
    });

    for (const panel of compactIdePanels) {
      await test.step(`${profile.name} ${panel}`, async () => {
        await openCompactPanel(page, panel);
        await assertCompactPanelRendered(page, profile.name, panel);
        await assertCompactPanelLayout(page, profile.name, panel);

        const screenshotTarget = compactPanelScreenshotTarget(page, panel);
        await testInfo.attach(`${profile.name}-${panel}`, {
          body: await screenshotTarget.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        });
      });
    }
  } finally {
    await context.close();
  }
}

async function openCompactPanel(page: Page, panel: (typeof compactIdePanels)[number]) {
  const bottomNav = page.getByTestId('mobile-bottom-navigation');
  const visibleTab = bottomNav.getByTestId(`tab-${panel}`);

  if (await visibleTab.isVisible().catch(() => false)) {
    await visibleTab.click({ force: true });
  } else {
    const toolsSheet = await openMobileToolsSheet(page, `panel ${panel}`);
    const toolItem = toolsSheet.getByTestId(`tool-item-${panel}`).first();

    await toolItem.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => undefined);
    await expect(toolItem, `${panel} tool item`).toBeVisible({ timeout: 15_000 });
    await toolItem.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
  }

  await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });

  if (panel !== 'agent' && panel !== 'editor') {
    await expect
      .poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get('panel')), {
        message: `${panel} should update the compact IDE panel URL`,
        timeout: 15_000,
      })
      .toBe(panel);
  } else if (panel === 'editor') {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const panelParam = new URL(window.location.href).searchParams.get('panel');

            return panelParam === null || panelParam === 'editor';
          }),
        {
          message: 'editor should use the canonical editor URL',
          timeout: 15_000,
        },
      )
      .toBe(true);
  }
}

async function assertCompactPanelRendered(page: Page, profileName: string, panel: (typeof compactIdePanels)[number]) {
  await expect(page.getByText(/Application Error|Unexpected Application Error|Route Error/i)).toHaveCount(0);

  if (panel === 'agent') {
    await expect(
      page.getByPlaceholder(/Describe what you want the agent to build/i),
      `${profileName} agent input`,
    ).toBeVisible({
      timeout: 45_000,
    });
    return;
  }

  if (panel === 'preview') {
    const previewSurface = page.locator('.bolt-workbench-mobile > div.fixed:visible').first();

    const previewControls = page
      .locator(
        [
          '.bolt-project-webview-tool:visible',
          '.bolt-project-webview-toolbar:visible',
          '[data-testid="preview-splash-sequence"]:visible',
          '[data-testid="preview-not-running-state"]:visible',
        ].join(', '),
      )
      .first();
    await expect(previewSurface, `${profileName} preview surface`).toBeVisible({ timeout: 45_000 });
    await expect(previewControls, `${profileName} preview controls`).toBeVisible({ timeout: 45_000 });

    const previewState = await previewSurface.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const textLength = (element.textContent ?? '').replace(/\s+/g, '').length;

      return {
        area: rect.width * rect.height,
        hasFrame: Boolean(element.querySelector('iframe')),
        hasCanvas: Boolean(element.querySelector('canvas')),
        textLength,
      };
    });

    expect(previewState.area, `${profileName} preview area`).toBeGreaterThan(80_000);
    expect(
      previewState.hasFrame || previewState.hasCanvas || previewState.textLength > 20,
      `${profileName} preview should not be blank`,
    ).toBe(true);

    return;
  }

  if (panel === 'files') {
    const filesPanel = page.getByTestId('mobile-files-panel');
    const srcFolder = filesPanel.locator('.bolt-file-tree-name', { hasText: /^src$/ }).first();
    const appFile = filesPanel.locator('.bolt-file-tree-name', { hasText: /^App\.tsx$/ }).first();

    await expect(filesPanel, `${profileName} files panel`).toBeVisible({ timeout: 45_000 });
    await expect(srcFolder, `${profileName} imported src folder`).toBeVisible({ timeout: 45_000 });

    if (!(await appFile.isVisible().catch(() => false))) {
      await srcFolder.click({ force: true });
    }

    await expect(appFile, `${profileName} imported project file`).toBeVisible({ timeout: 45_000 });

    return;
  }

  if (panel === 'editor') {
    await expect(page.getByTestId('responsive-code-editor').first(), `${profileName} editor`).toBeVisible({
      timeout: 45_000,
    });
    return;
  }

  if (panel === 'terminal') {
    await expect(page.getByTestId('mobile-terminal-panel'), `${profileName} terminal panel`).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.getByRole('region', { name: 'Interactive terminal' }),
      `${profileName} terminal region`,
    ).toBeVisible({
      timeout: 45_000,
    });

    return;
  }

  if (panel === 'search') {
    await expect(page.getByPlaceholder('Search files'), `${profileName} search input`).toBeVisible({ timeout: 45_000 });
    return;
  }

  if (panel === 'locks') {
    await expect(page.getByTestId('mobile-locks-panel'), `${profileName} locks panel`).toBeVisible({ timeout: 45_000 });
    return;
  }

  const servicePanel = page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).first();
  await expect(servicePanel, `${profileName} ${panel} service panel`).toBeVisible({ timeout: 45_000 });
  await expect(servicePanel.getByText(/Loading .* from backend/i)).toHaveCount(0, { timeout: 45_000 });
  await expect(servicePanel.getByRole('alert')).toHaveCount(0);
}

function compactPanelScreenshotTarget(page: Page, panel: (typeof compactIdePanels)[number]) {
  if (panel === 'agent') {
    return page.locator('.bolt-responsive-ide-mobile').first();
  }

  if (panel === 'preview') {
    return page.locator('.bolt-responsive-ide-mobile').first();
  }

  return page.locator('.bolt-responsive-ide-mobile').first();
}

async function assertCompactPanelLayout(page: Page, profileName: string, panel: (typeof compactIdePanels)[number]) {
  const layout = await page.evaluate((panelName) => {
    const shell = document.querySelector('.bolt-responsive-ide-mobile');
    const header = document.querySelector('[data-testid="mobile-ide-header"]');
    const nav = document.querySelector('[data-testid="mobile-bottom-navigation"]');
    const status = document.querySelector('.bolt-project-statusbar-mobile');

    const isVisible = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();

      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const activeSurface =
      Array.from(
        document.querySelectorAll(
          '.bolt-workbench-mobile > div.fixed, .bolt-workbench-mobile, [data-testid="ide-service-panel"]',
        ),
      )
        .filter(isVisible)
        .sort((left, right) => {
          const leftBox = left.getBoundingClientRect();
          const rightBox = right.getBoundingClientRect();

          return rightBox.width * rightBox.height - leftBox.width * leftBox.height;
        })[0] ?? null;

    const rect = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const box = element.getBoundingClientRect();

      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      };
    };

    const navRect = rect(nav);
    const statusRect = rect(status);
    const activeRect = rect(activeSurface);

    const servicePanel =
      Array.from(document.querySelectorAll(`[data-testid="ide-service-panel"][data-panel="${panelName}"]`)).find(
        isVisible,
      ) ?? null;
    const serviceContentViewport =
      servicePanel instanceof HTMLElement
        ? Array.from(servicePanel.children).find((child): child is HTMLElement => child.classList.contains('min-h-0'))
        : null;
    const serviceContentViewportStyle = serviceContentViewport
      ? window.getComputedStyle(serviceContentViewport)
      : undefined;
    const serviceContentPadding = serviceContentViewportStyle
      ? {
          inlineEnd: Number.parseFloat(serviceContentViewportStyle.paddingRight) || 0,
          inlineStart: Number.parseFloat(serviceContentViewportStyle.paddingLeft) || 0,
        }
      : null;

    const isHorizontalScroller = (element: Element) =>
      Boolean(
        element.closest(
          [
            'pre',
            'table',
            'code',
            '.cm-scroller',
            '.xterm-viewport',
            '.bolt-project-tool-tabs',
            '.bolt-project-settings-sidebar',
          ].join(', '),
        ),
      );

    const serviceOverflow = servicePanel
      ? Array.from(
          servicePanel.querySelectorAll(
            [
              'a',
              'article',
              'button',
              'fieldset',
              'form',
              'header',
              'input',
              'label',
              'section',
              'select',
              'textarea',
              '.bolt-project-empty-panel',
              '.bolt-project-panel-toolbar',
            ].join(', '),
          ),
        )
          .filter((element) => isVisible(element) && !isHorizontalScroller(element))
          .map((element) => {
            const box = element.getBoundingClientRect();

            return {
              selector:
                (element as HTMLElement).dataset.testid ??
                (element as HTMLElement).className?.toString().split(/\s+/).filter(Boolean).slice(0, 2).join('.') ??
                element.tagName.toLowerCase(),
              left: box.left,
              right: box.right,
              width: box.width,
            };
          })
          .filter((box) => box.left < -1 || box.right > window.innerWidth + 1 || box.width > window.innerWidth + 1)
          .slice(0, 8)
      : [];

    const serviceInternalOverflow = servicePanel
      ? Array.from(
          servicePanel.querySelectorAll(
            [
              '.bolt-project-panel-toolbar',
              '.bolt-project-managed-panel',
              '.bolt-project-managed-form',
              '.bolt-project-object-grid',
              '.bolt-project-package-content',
              '.bolt-project-package-list',
              '.bolt-project-package-sidebar',
              '.bolt-project-security-grid',
              '.bolt-project-security-scope',
              '.bolt-project-security-comparison-grid',
              '.bolt-project-metric-grid',
              '.bolt-project-deploy-tool',
              '.bolt-project-integrations-layout',
              '.bolt-project-settings-layout',
              'article',
              'section',
              'form',
              'header',
            ].join(', '),
          ),
        )
          .filter((element) => isVisible(element) && !isHorizontalScroller(element))
          .map((element) => {
            const node = element as HTMLElement;
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();

            return {
              selector:
                node.dataset.testid ??
                node.className?.toString().split(/\s+/).filter(Boolean).slice(0, 2).join('.') ??
                node.tagName.toLowerCase(),
              clientWidth: node.clientWidth,
              overflowX: style.overflowX,
              scrollWidth: node.scrollWidth,
              width: box.width,
            };
          })
          .filter(
            (box) =>
              box.scrollWidth > box.clientWidth + 1 &&
              box.width > 0 &&
              box.overflowX !== 'auto' &&
              box.overflowX !== 'scroll',
          )
          .slice(0, 8)
      : [];

    const toolbarOverlaps = servicePanel
      ? Array.from(servicePanel.querySelectorAll('.bolt-project-panel-toolbar'))
          .filter(isVisible)
          .flatMap((toolbar) => {
            const children = Array.from(toolbar.children).filter(isVisible);
            const overlaps: Array<{ first: string; second: string }> = [];

            for (let index = 0; index < children.length; index += 1) {
              for (let nextIndex = index + 1; nextIndex < children.length; nextIndex += 1) {
                const first = children[index];
                const second = children[nextIndex];

                if (!first || !second) {
                  continue;
                }

                const firstBox = first.getBoundingClientRect();
                const secondBox = second.getBoundingClientRect();
                const horizontalOverlap = firstBox.left < secondBox.right - 1 && secondBox.left < firstBox.right - 1;
                const verticalOverlap = firstBox.top < secondBox.bottom - 1 && secondBox.top < firstBox.bottom - 1;

                if (horizontalOverlap && verticalOverlap) {
                  overlaps.push({
                    first: first.tagName.toLowerCase(),
                    second: second.tagName.toLowerCase(),
                  });
                }
              }
            }

            return overlaps;
          })
      : [];

    const managedPanelColumns = servicePanel
      ? Array.from(servicePanel.querySelectorAll('.bolt-project-managed-panel'))
          .filter(isVisible)
          .map((element) => getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length)
      : [];

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      shell: rect(shell),
      header: rect(header),
      nav: navRect,
      status: statusRect,
      active: activeRect,
      statusOverlapsNav: Boolean(statusRect && navRect && statusRect.bottom > navRect.top),
      serviceOverflow,
      serviceInternalOverflow,
      serviceContentPadding,
      toolbarOverlaps,
      managedPanelColumns,
    };
  }, panel);

  expect(layout.overflowX, `${profileName} ${panel} horizontal overflow`).toBe(false);
  expect(layout.shell?.width ?? 0, `${profileName} ${panel} shell width`).toBeGreaterThanOrEqual(layout.innerWidth - 2);
  expect(layout.shell?.height ?? 0, `${profileName} ${panel} shell height`).toBeGreaterThan(layout.innerHeight * 0.75);
  expect(
    (layout.shell?.top ?? layout.innerHeight) + (layout.shell?.height ?? 0),
    `${profileName} ${panel} shell reaches viewport bottom`,
  ).toBeGreaterThanOrEqual(layout.innerHeight - 2);
  expect(layout.nav?.height ?? 0, `${profileName} ${panel} bottom nav visible`).toBeGreaterThan(40);
  expect(layout.statusOverlapsNav, `${profileName} ${panel} status/nav overlap`).toBe(false);

  if (panel !== 'agent') {
    expect(layout.active?.width ?? 0, `${profileName} ${panel} active panel width`).toBeGreaterThanOrEqual(
      layout.innerWidth - 2,
    );
    expect(layout.active?.height ?? 0, `${profileName} ${panel} active panel height`).toBeGreaterThan(
      layout.innerHeight * 0.55,
    );
    expect(layout.active?.top ?? layout.innerHeight, `${profileName} ${panel} active panel top`).toBeGreaterThanOrEqual(
      (layout.shell?.top ?? 0) - 2,
    );
  }

  expect(layout.serviceOverflow, `${profileName} ${panel} service panel visible overflow`).toEqual([]);
  expect(layout.serviceInternalOverflow, `${profileName} ${panel} service panel internal overflow`).toEqual([]);
  expect(layout.toolbarOverlaps, `${profileName} ${panel} toolbar control overlap`).toEqual([]);

  if (layout.serviceContentPadding) {
    const minimumServiceGutter = layout.innerWidth >= 768 ? 20 : 14;

    expect(
      layout.serviceContentPadding.inlineStart,
      `${profileName} ${panel} service panel left content gutter`,
    ).toBeGreaterThanOrEqual(minimumServiceGutter);
    expect(
      layout.serviceContentPadding.inlineEnd,
      `${profileName} ${panel} service panel right content gutter`,
    ).toBeGreaterThanOrEqual(minimumServiceGutter);
  }

  if (panel === 'object-storage') {
    expect(layout.managedPanelColumns, `${profileName} ${panel} managed panel columns`).not.toContain(2);
  }
}
