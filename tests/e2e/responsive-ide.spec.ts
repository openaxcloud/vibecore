import { expect, test, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';

function isCompactIdeProject(testInfo: TestInfo) {
  return testInfo.project.name === 'mobile' || testInfo.project.name === 'tablet';
}

function mobileBottomNavigation(page: import('@playwright/test').Page) {
  return page.getByTestId('mobile-bottom-navigation');
}

async function clickFirstVisible(candidates: import('@playwright/test').Locator[], options: { timeout?: number } = {}) {
  const deadline = Date.now() + (options.timeout ?? 15_000);

  let lastClickError: unknown;

  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        const remainingMs = Math.max(deadline - Date.now(), 1);

        try {
          await candidate.click({ force: true, timeout: Math.min(2_000, remainingMs) });

          return;
        } catch (error) {
          lastClickError = error;
        }

        if (Date.now() >= deadline) {
          break;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (lastClickError) {
    throw lastClickError;
  }

  throw new Error('No visible mobile IDE click target was available.');
}

async function expectMobileServicePanel(page: import('@playwright/test').Page, panel: string) {
  await expect(page).toHaveURL(new RegExp(`panel=${panel.replace('-', '\\-')}`), { timeout: 45_000 });
  await expect(page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).first()).toBeVisible({
    timeout: 45_000,
  });
}

async function expectMobileCodeMirrorEditor(page: import('@playwright/test').Page) {
  const editor = page.locator('[data-testid="responsive-code-editor"]').first();
  const codeMirror = page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="codemirror"]').first();

  await expect(editor).toBeVisible({ timeout: 45_000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('vibecore:open-editor-file', { detail: { filePath: 'src/App.tsx' } }));
    });

    try {
      await expect(codeMirror).toBeVisible({ timeout: 15_000 });

      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }
}

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function openMobileMoreMenu(page: import('@playwright/test').Page) {
  const moreMenu = page.getByTestId('mobile-more-menu-sheet');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickFirstVisible([
      mobileBottomNavigation(page).getByTestId('button-more'),
      page.getByTestId('mobile-ide-header').getByTestId('button-more'),
    ]);

    try {
      await expect(moreMenu).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('mobile-more-menu-overview')).toBeVisible({ timeout: 5000 });

      return moreMenu;
    } catch {
      await page
        .getByTestId('mobile-more-menu-backdrop')
        .click({ force: true })
        .catch(() => undefined);
    }
  }

  await expect(moreMenu).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('mobile-more-menu-overview')).toBeVisible({ timeout: 15000 });

  return moreMenu;
}

async function openMobileToolsSheet(page: import('@playwright/test').Page) {
  const toolsSheet = page.getByTestId('tools-sheet');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickFirstVisible([
      mobileBottomNavigation(page).getByTestId('button-add-tab'),
      page.getByTestId('mobile-ide-header').getByTestId('button-new-tab'),
    ]);

    try {
      await expect(toolsSheet).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('tool-item-overview')).toBeVisible({ timeout: 5000 });

      return toolsSheet;
    } catch {
      await page
        .getByTestId('tools-sheet-close')
        .click({ force: true })
        .catch(() => undefined);
    }
  }

  await expect(toolsSheet).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('tool-item-overview')).toBeVisible({ timeout: 15000 });

  return toolsSheet;
}

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';
  let payload: { token: string; organization: { id: string } } | undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `responsive-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Responsive E2E',
        organizationName: `Responsive E2E Organization ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      payload = JSON.parse(responseText) as { token: string; organization: { id: string } };
      break;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  expect(payload, responseText).toBeTruthy();

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload!.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return payload!;
}

async function createTestProject(page: import('@playwright/test').Page, name: string) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const auth = await authenticate(page);

  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;
  const zip = new JSZip();
  zip.file(
    'src/App.tsx',
    `export function App() {
  return <main>Responsive IDE test</main>;
}
`,
  );

  const importFiles = await page.request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });

  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  return projectId;
}

test.describe('responsive IDE shell', () => {
  test('desktop keeps the full IDE workspace available', async ({ page }, testInfo) => {
    test.skip(isCompactIdeProject(testInfo), 'desktop-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive desktop project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 45000 });
    await expect(page.getByRole('button', { name: /^(Run|Stop)$/ })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="ide-agent-panel"]').first()).toBeVisible();
    await expect(page.locator('.bolt-responsive-ide-desktop')).toBeVisible();

    const agentBox = await page.locator('[data-testid="ide-agent-panel"]').first().boundingBox();
    const viewport = page.viewportSize();
    expect(agentBox?.width).toBeGreaterThan(260);
    expect(agentBox?.width).toBeLessThan((viewport?.width ?? 1200) * 0.46);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();

    await page.locator('.bolt-project-ide-rail-item[aria-label^="Files"]').hover();
    await expect(page.locator('.bolt-project-tooltip-content').filter({ hasText: /Files/ }).last()).toBeVisible({
      timeout: 5000,
    });
    await page.keyboard.press('Escape');

    const desktopSizes = [
      { width: 1200, height: 720 },
      { width: 1440, height: 900 },
      { width: 1728, height: 960 },
    ];

    for (const size of desktopSizes) {
      await page.setViewportSize(size);
      await expect(page.locator('.bolt-responsive-ide-desktop')).toBeVisible({ timeout: 5000 });

      const metrics = await page.locator('.bolt-project-ide-panels').evaluate(() => {
        const readRect = (selector: string) => {
          const element = document.querySelector(selector);

          if (!element) {
            throw new Error(`Missing ${selector}`);
          }

          const box = element.getBoundingClientRect();

          return {
            top: Math.round(box.top),
            right: Math.round(box.right),
            bottom: Math.round(box.bottom),
            left: Math.round(box.left),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        };

        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          documentWidth: document.documentElement.scrollWidth,
          panelGroup: readRect('.bolt-project-panel-group'),
          rail: readRect('.bolt-project-ide-rail'),
          statusbar: readRect('.bolt-project-statusbar'),
          agent: readRect('.bolt-project-agent-shell'),
          workspace: readRect('.bolt-project-workspace-shell'),
          rightPanel: readRect('.bolt-project-right-panel-shell'),
        };
      });

      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport.width + 1);
      expect(metrics.panelGroup.bottom).toBeLessThanOrEqual(metrics.statusbar.top);
      expect(metrics.rail.bottom).toBeLessThanOrEqual(metrics.statusbar.top);
      expect(metrics.statusbar.left).toBe(metrics.panelGroup.left);
      expect(metrics.workspace.width).toBeGreaterThan(320);
      expect(metrics.rightPanel.width).toBeGreaterThanOrEqual(160);
    }
  });

  test('desktop can collapse and restore the right preview panel', async ({ page }, testInfo) => {
    test.skip(isCompactIdeProject(testInfo), 'desktop-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive files toggle project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^(Run|Stop)$/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toBeVisible({ timeout: 15000 });

    const filesPanelToggle = page.getByTestId('ide-files-panel-toggle');
    await expect(filesPanelToggle).toBeVisible();
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Close files panel');

    await filesPanelToggle.click();
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toHaveCount(0);
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Open files panel');

    await filesPanelToggle.click();
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toBeVisible({ timeout: 15000 });
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Close files panel');

    await page.getByRole('button', { name: 'Close right panel' }).click();
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toHaveCount(0);
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Open files panel');
    await expect(page.locator('[data-testid="ide-agent-panel"]').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Editor and preview' })).toBeVisible();

    await page.locator('.bolt-project-ide-rail-item[aria-label^="Files"]').click();
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toBeVisible({ timeout: 15000 });
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Close files panel');
  });

  test('desktop opens terminal as a workspace panel from the panel URL', async ({ page }, testInfo) => {
    test.skip(isCompactIdeProject(testInfo), 'desktop-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive terminal panel project');

    await page.goto(`/projects/${projectId}/ide?panel=terminal`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /Terminal/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Vibecore Terminal' })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/panel=terminal/);
  });

  test('mobile exposes tab navigation for core IDE panels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive mobile project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId('tab-preview')).toBeVisible();
    await expect(page.getByTestId('tab-agent')).toBeVisible();
    await expect(page.getByTestId('tab-deployments')).toBeVisible();
    await expect(mobileNav.getByTestId('button-more')).toBeVisible();
  });

  test('mobile keeps runtime status above navigation without overlap', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    const projectId = await createTestProject(page, 'Responsive mobile status project');

    await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });

    const metrics = await page.evaluate(() => {
      const navElement = document.querySelector('.bolt-mobile-replit-nav');
      const statusElement = document.querySelector('.bolt-project-statusbar-mobile');
      const nav = navElement?.getBoundingClientRect();
      const status = statusElement?.getBoundingClientRect();

      const statusVisible =
        statusElement instanceof HTMLElement &&
        getComputedStyle(statusElement).display !== 'none' &&
        statusElement.offsetParent !== null;

      return {
        navVisible:
          navElement instanceof HTMLElement &&
          getComputedStyle(navElement).display !== 'none' &&
          getComputedStyle(navElement).visibility !== 'hidden' &&
          Boolean(nav && nav.width > 0 && nav.height > 0),
        overlaps: Boolean(nav && status && statusVisible && status.bottom > nav.top),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    expect(metrics.navVisible).toBe(true);
    expect(metrics.overlaps).toBe(false);
    expect(metrics.overflowX).toBe(false);
  });

  test('mobile restores the last active IDE panel from local persistence', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    const projectId = await createTestProject(page, 'Responsive mobile persistence project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });
    await page.getByTestId('tab-preview').tap();
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'preview');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'preview', {
      timeout: 15000,
    });
  });

  test('mobile can deep-link to real IDE service panels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive mobile database panel project');

    await page.goto(`/projects/${projectId}/ide?panel=search`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'search', {
      timeout: 45000,
    });
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Search');

    await page.goto(`/projects/${projectId}/ide?panel=files`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'files', {
      timeout: 45000,
    });
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Files');

    await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'deploy', {
      timeout: 45000,
    });

    const databasePanel = page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first();
    await expect(databasePanel).toBeVisible({ timeout: 45000 });
    await expect(databasePanel.getByText(/Loading database from backend/i)).toHaveCount(0, { timeout: 45000 });
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Database');
    await expect(databasePanel.getByRole('button', { name: 'Backups' })).toBeVisible({ timeout: 45000 });

    await page.goto(`/projects/${projectId}/ide?panel=security`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'deploy', {
      timeout: 45000,
    });

    const securityPanel = page.locator('[data-testid="ide-service-panel"][data-panel="security"]').first();
    await expect(securityPanel).toBeVisible({ timeout: 15000 });
    await expect(securityPanel.getByRole('button', { name: 'Run full scan' })).toBeVisible();
    await expect(securityPanel.getByRole('button', { name: 'Settings' })).toBeVisible();

    await page.goto(`/projects/${projectId}/ide?panel=logs`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'deploy', {
      timeout: 45000,
    });
    await expect(page.locator('[data-testid="ide-service-panel"][data-panel="logs"]').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Logs');

    await page.goto(`/projects/${projectId}/ide?panel=locks`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'locks', {
      timeout: 45000,
    });
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Locks');
    await expect(page.getByText('No locked items found')).toBeVisible({ timeout: 15000 });
  });

  test('short landscape mobile viewport keeps the IDE mobile shell', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 932, height: 430 });

    const projectId = await createTestProject(page, 'Responsive mobile landscape project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('navigation', { name: 'IDE panels' })).toBeVisible({ timeout: 15000 });

    const metrics = await page.evaluate(() => {
      const nav = document.querySelector('.bolt-mobile-replit-nav')?.getBoundingClientRect();
      const statusElement = document.querySelector('.bolt-project-statusbar-mobile');
      const status = statusElement?.getBoundingClientRect();

      const statusVisible =
        statusElement instanceof HTMLElement &&
        getComputedStyle(statusElement).display !== 'none' &&
        statusElement.offsetParent !== null;

      return {
        overlaps: Boolean(nav && status && statusVisible && status.bottom > nav.top),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    expect(metrics.overlaps).toBe(false);
    expect(metrics.overflowX).toBe(false);

    await page.goto(`/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 15000 });
    await expectMobileCodeMirrorEditor(page);
    await expect(page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="monaco"]')).toHaveCount(0);
  });

  test('tablet portrait uses the compact mobile IDE shell', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project runs touch-enabled compact assertions');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 820, height: 1180 });

    const projectId = await createTestProject(page, 'Responsive tablet portrait project');

    await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('navigation', { name: 'IDE panels' })).toBeVisible({ timeout: 15000 });
    await expectMobileServicePanel(page, 'database');
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Database');

    const moreMenu = await openMobileMoreMenu(page);
    await expect(moreMenu.getByRole('button', { name: 'Deployments', exact: true })).toBeVisible();
    await expect(moreMenu.getByRole('button', { name: 'Object Storage', exact: true })).toBeVisible();
    await expect(moreMenu.getByText('Publishing', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    const metrics = await page.evaluate(() => {
      const nav = document.querySelector('.bolt-mobile-replit-nav')?.getBoundingClientRect();
      const statusElement = document.querySelector('.bolt-project-statusbar-mobile');
      const status = statusElement?.getBoundingClientRect();

      const statusVisible =
        statusElement instanceof HTMLElement &&
        getComputedStyle(statusElement).display !== 'none' &&
        statusElement.offsetParent !== null;

      return {
        overlaps: Boolean(nav && status && statusVisible && status.bottom > nav.top),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    expect(metrics.overlaps).toBe(false);
    expect(metrics.overflowX).toBe(false);

    await page.goto(`/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 15000 });
    await expectMobileCodeMirrorEditor(page);
    await expect(page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="monaco"]')).toHaveCount(0);
  });

  test('mobile editor accepts edits without Monaco', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive mobile editor project');

    await page.goto(`/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });

    await expectMobileCodeMirrorEditor(page);
    await expect(page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="monaco"]')).toHaveCount(0);

    const editorContent = page.locator('.cm-content').first();
    await editorContent.click();
    await page.keyboard.press('End');
    await page.keyboard.type('\n// mobile editor edit path');
    await expect(editorContent).toContainText('mobile editor edit path', { timeout: 15000 });
  });

  test('tablet landscape uses the compact mobile IDE shell', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'tablet landscape assertion');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1024, height: 768 });

    const projectId = await createTestProject(page, 'Responsive tablet project');

    await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('navigation', { name: 'IDE panels' })).toBeVisible({ timeout: 15000 });
    await expectMobileServicePanel(page, 'database');
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Database');

    const moreMenu = await openMobileMoreMenu(page);
    await expect(moreMenu.getByRole('button', { name: 'Deployments', exact: true })).toBeVisible();
    await expect(moreMenu.getByRole('button', { name: 'Object Storage', exact: true })).toBeVisible();
    await expect(moreMenu.getByRole('button', { name: 'Debugger', exact: true })).toBeVisible();
    await expect(moreMenu.getByRole('button', { name: 'Activity', exact: true })).toBeVisible();
    await expect(moreMenu.getByText('Publishing', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    const metrics = await page.evaluate(() => {
      const nav = document.querySelector('.bolt-mobile-replit-nav')?.getBoundingClientRect();
      const statusElement = document.querySelector('.bolt-project-statusbar-mobile');
      const status = statusElement?.getBoundingClientRect();

      const statusVisible =
        statusElement instanceof HTMLElement &&
        getComputedStyle(statusElement).display !== 'none' &&
        statusElement.offsetParent !== null;

      return {
        overlaps: Boolean(nav && status && statusVisible && status.bottom > nav.top),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    expect(metrics.overlaps).toBe(false);
    expect(metrics.overflowX).toBe(false);

    await page.goto(`/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 15000 });
    await expectMobileCodeMirrorEditor(page);
    await expect(page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="monaco"]')).toHaveCount(0);
  });

  test('mobile and tablet use canonical web panel names in More and tools sheets', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(150_000);

    const projectId = await createTestProject(page, 'Responsive canonical mobile panels project');

    await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });

    const moreMenu = await openMobileMoreMenu(page);
    await expect(moreMenu).toBeVisible({ timeout: 15_000 });

    for (const [itemId, label] of [
      ['overview', 'Overview'],
      ['preview', 'Webview'],
      ['deployments', 'Deployments'],
      ['object-storage', 'Object Storage'],
      ['locks', 'Locks'],
      ['env', 'Environment variables'],
      ['debugger', 'Debugger'],
      ['integrations', 'Integrations'],
      ['activity', 'Activity'],
      ['extensions', 'Extensions'],
      ['snapshots', 'Snapshots'],
    ] as const) {
      await expect(moreMenu.getByTestId(`mobile-more-menu-${itemId}`)).toContainText(label, { timeout: 15_000 });
    }

    for (const legacyLabel of ['Publishing', 'App Storage', 'Debug', 'History', 'Checkpoints', 'Multiplayer']) {
      await expect(moreMenu.getByText(legacyLabel, { exact: true })).toHaveCount(0);
    }

    await page.getByTestId('mobile-more-menu-close').click();
    await expect(moreMenu).toBeHidden({ timeout: 10_000 });

    const firstToolsSheet = await openMobileToolsSheet(page);
    await expect(firstToolsSheet).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('tools-search-input').fill('database');
    await expect(page.getByTestId('tool-item-database')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(firstToolsSheet).toBeHidden({ timeout: 10_000 });

    const resetToolsSheet = await openMobileToolsSheet(page);
    await expect(page.getByTestId('tools-search-input')).toHaveValue('');
    await page.getByTestId('tools-sheet-close').click();
    await expect(resetToolsSheet).toBeHidden({ timeout: 10_000 });

    const reopenedMoreMenu = await openMobileMoreMenu(page);
    await expect(reopenedMoreMenu.getByTestId('mobile-more-menu-deployments')).toContainText('Deployments');
    await reopenedMoreMenu.getByTestId('mobile-more-menu-deployments').click({ force: true });
    await expectMobileServicePanel(page, 'deployments');
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Deployments');

    const toolsSheet = await openMobileToolsSheet(page);

    for (const toolId of [
      'overview',
      'deployments',
      'object-storage',
      'locks',
      'debugger',
      'integrations',
      'extensions',
      'activity',
      'snapshots',
      'settings',
    ]) {
      await expect(page.getByTestId(`tool-item-${toolId}`)).toBeVisible();
    }

    for (const legacyLabel of ['Publishing', 'App Storage', 'Auth', 'Console', 'Shell', 'Key-Value Store']) {
      await expect(toolsSheet.getByText(legacyLabel, { exact: true })).toHaveCount(0);
    }
  });
});
