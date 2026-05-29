import { expect, test, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';

function isCompactIdeProject(testInfo: TestInfo) {
  return testInfo.project.name === 'mobile' || testInfo.project.name === 'tablet';
}

function mobileBottomNavigation(page: import('@playwright/test').Page) {
  return page.getByTestId('mobile-bottom-navigation');
}

function apiBaseUrl() {
  return process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
}

async function expectBottomTabLabelsHidden(page: import('@playwright/test').Page) {
  const labelStates = await page
    .getByTestId('mobile-open-tabs')
    .locator('.bolt-mobile-replit-tab-label')
    .evaluateAll((labels) =>
      labels.map((label) => {
        const element = label as HTMLElement;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return {
          text: element.textContent?.trim() ?? '',
          display: style.display,
          height: rect.height,
          width: rect.width,
        };
      }),
    );

  const visibleTabButtonLabels = await page
    .getByTestId('mobile-open-tabs')
    .locator('.bolt-mobile-replit-panel-tab')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''));

  expect(labelStates.length).toBeGreaterThan(0);
  expect(visibleTabButtonLabels.length).toBe(labelStates.length);
  expect(visibleTabButtonLabels.every((label) => /^Switch to .+ tab$/.test(label))).toBe(true);

  for (const state of labelStates) {
    expect(state.display).toBe('none');
    expect(state.width).toBe(0);
    expect(state.height).toBe(0);
  }
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

async function expectMobileToolsSheetFitsViewport(page: import('@playwright/test').Page) {
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

async function expectSettingsTabRailFitsViewport(page: import('@playwright/test').Page) {
  const metrics = await page.getByTestId('settings-hub-panel').evaluate((hub) => {
    const rail = hub.querySelector('.bolt-project-settings-sidebar') as HTMLElement | null;

    if (!rail) {
      throw new Error('Missing settings tab rail');
    }

    const railRect = rail.getBoundingClientRect();

    const visibleGroupHeadings = Array.from(rail.querySelectorAll('section > div')).filter((heading) => {
      const style = window.getComputedStyle(heading);
      const rect = heading.getBoundingClientRect();

      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).length;
    const visibleButtons = Array.from(rail.querySelectorAll('button'))
      .map((button) => {
        const rect = button.getBoundingClientRect();

        return {
          height: rect.height,
          left: rect.left,
          right: rect.right,
          text: button.textContent?.trim() ?? '',
          width: rect.width,
        };
      })
      .filter((rect) => rect.right > railRect.left && rect.left < railRect.right);

    const visibleOverlapCount = visibleButtons.reduce((count, button, index) => {
      const overlaps = visibleButtons.slice(index + 1).some((next) => {
        const horizontalOverlap = Math.min(button.right, next.right) - Math.max(button.left, next.left);

        return horizontalOverlap > 1;
      });

      return count + (overlaps ? 1 : 0);
    }, 0);

    return {
      documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      railLeft: railRect.left,
      railRight: railRect.right,
      viewportWidth: window.innerWidth,
      visibleButtonCount: visibleButtons.length,
      visibleButtons,
      visibleGroupHeadings,
      visibleOverlapCount,
    };
  });

  expect(metrics.documentOverflowsX).toBe(false);
  expect(metrics.railLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.railRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.visibleGroupHeadings).toBe(0);
  expect(metrics.visibleButtonCount).toBeGreaterThanOrEqual(2);
  expect(metrics.visibleOverlapCount).toBe(0);

  for (const button of metrics.visibleButtons) {
    expect(button.width, button.text).toBeGreaterThanOrEqual(120);
    expect(button.height, button.text).toBeGreaterThanOrEqual(44);
  }
}

async function openMobileToolsSheet(page: import('@playwright/test').Page) {
  const toolsSheet = page.getByTestId('tools-sheet');

  const openTargets = [
    mobileBottomNavigation(page).getByTestId('button-add-tab'),
    page.getByTestId('mobile-ide-header').getByTestId('button-new-tab'),
  ];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await toolsSheet.isVisible().catch(() => false)) {
      await expectMobileToolsSheetFitsViewport(page);

      return toolsSheet;
    }

    for (const target of openTargets) {
      await target.click({ force: true, timeout: 2000 }).catch(() => undefined);

      if (!(await toolsSheet.isVisible().catch(() => false))) {
        await target
          .evaluate((element) => {
            if (element instanceof HTMLElement) {
              element.click();
            }
          })
          .catch(() => undefined);
      }

      try {
        await expect(toolsSheet).toBeVisible({ timeout: 5000 });
      } catch {
        continue;
      }

      await expectMobileToolsSheetFitsViewport(page);

      return toolsSheet;
    }
  }

  await expect(toolsSheet).toBeVisible({ timeout: 15000 });
  await expectMobileToolsSheetFitsViewport(page);

  return toolsSheet;
}

async function authenticate(page: import('@playwright/test').Page) {
  const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';
  let payload: { token: string; organization: { id: string } } | undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.post(`${apiBaseUrl()}/auth/register`, {
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

async function createTestProject(
  page: import('@playwright/test').Page,
  name: string,
  files: Record<string, string> = {
    'src/App.tsx': `export function App() {
  return <main>Responsive IDE test</main>;
}
`,
  },
) {
  return (await createTestProjectFixture(page, name, files)).projectId;
}

async function createTestProjectFixture(
  page: import('@playwright/test').Page,
  name: string,
  files: Record<string, string> = {
    'src/App.tsx': `export function App() {
  return <main>Responsive IDE test</main>;
}
`,
  },
) {
  const auth = await authenticate(page);

  const createProject = await page.request.post(`${apiBaseUrl()}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  const projectId = (await createProject.json()).project.id as string;
  const zip = new JSZip();

  for (const [filePath, content] of Object.entries(files)) {
    zip.file(filePath, content);
  }

  const importFiles = await page.request.post(`${apiBaseUrl()}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await zip.generateAsync({ type: 'base64' }) },
  });

  expect(importFiles.ok(), await importFiles.text()).toBeTruthy();

  return { projectId, auth };
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
    await expect(page.getByRole('complementary', { name: 'Project files panel' })).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator('.bolt-project-file-tree .bolt-file-tree-name', { hasText: /^src$/ }).first(),
    ).toBeVisible({
      timeout: 45000,
    });
    await expect(
      page.locator('.bolt-project-file-tree .bolt-file-tree-name', { hasText: /^App\.tsx$/ }).first(),
    ).toBeVisible({
      timeout: 45000,
    });

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

  test('mobile exposes icon-only tab navigation for core IDE panels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive mobile project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId('tab-preview')).toBeVisible();
    await expect(page.getByTestId('tab-agent')).toBeVisible();
    await expect(page.getByTestId('tab-deployments')).toBeVisible();
    await expectBottomTabLabelsHidden(page);
    await expect(mobileNav.getByTestId('button-add-tab')).toBeVisible();
    await expect(mobileNav.getByTestId('button-more')).toBeVisible();
    await mobileNav.getByTestId('button-more').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mobile-more-menu-database')).toContainText('Database');
    await expect(page.getByTestId('mobile-more-menu-settings')).toContainText('Settings');
    await page.getByTestId('mobile-more-menu-close').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);
  });

  test('tablet exposes icon-only tab navigation and one tools entry point', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'tablet-only assertion');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1024, height: 768 });

    const projectId = await createTestProject(page, 'Responsive tablet named tabs project');

    await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });
    await expectBottomTabLabelsHidden(page);
    await expect(mobileNav.getByTestId('button-add-tab')).toBeVisible();
    await expect(mobileNav.getByTestId('button-more')).toBeVisible();

    const toolsSheet = await openMobileToolsSheet(page);
    await expect(toolsSheet).toBeVisible({ timeout: 15_000 });
    await expect(toolsSheet.getByTestId('tool-item-deployments')).toContainText('Deployments');
    await expect(toolsSheet.getByTestId('tool-item-object-storage')).toContainText('Object Storage');
    await expect(toolsSheet.getByTestId('tool-item-commands')).toContainText('Commands');
    await expect(toolsSheet.getByTestId('tool-item-share')).toContainText('Share');
    await page.keyboard.press('Escape');
    await expect(toolsSheet).toBeHidden({ timeout: 10_000 });

    await mobileNav.getByTestId('button-more').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mobile-more-menu-deployments')).toContainText('Deployments');
    await expect(page.getByTestId('mobile-more-menu-object-storage')).toContainText('Object Storage');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflowX).toBe(false);
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

  test('mobile and tablet keep the settings tab rail readable', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive settings rail project');

    await page.goto(`/projects/${projectId}/ide?panel=settings`, { waitUntil: 'domcontentloaded' });
    await expectMobileServicePanel(page, 'settings');
    await expect(page.getByTestId('settings-hub-panel')).toBeVisible({ timeout: 45_000 });
    await expectSettingsTabRailFitsViewport(page);

    await page.getByTestId('button-settings-tab-usage').click();
    await expect(page.getByText('Billing & Plan')).toBeVisible({ timeout: 15_000 });
    await expectSettingsTabRailFitsViewport(page);
  });

  test('mobile and tablet run button controls the real preview runtime', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(240_000);

    const projectId = await createTestProject(page, 'Responsive mobile run button project', {
      'package.json': JSON.stringify(
        {
          private: true,
          type: 'module',
          scripts: { dev: 'node server.mjs' },
        },
        null,
        2,
      ),
      'server.mjs': `import { createServer } from 'node:http';

const port = Number(process.env.PORT || 5173);

createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('<!doctype html><html><body><main data-run-button-preview="ready">Mobile run button preview ready</main></body></html>');
}).listen(port, '0.0.0.0', () => {
  console.log('mobile run button preview listening on ' + port);
});
`,
      'src/App.tsx': 'export function App() { return <main>Run button editor fixture</main>; }\n',
    });

    await page.goto(`/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toHaveAttribute('data-mobile-panel', 'editor');

    const runButton = mobileBottomNavigation(page).getByTestId('button-play-stop');
    await expect(runButton).toBeVisible({ timeout: 15_000 });

    const initialRunLabel = await runButton.getAttribute('aria-label');

    if (initialRunLabel === 'Run project') {
      await runButton.click();
      await expect(page.locator('.bolt-responsive-ide-mobile')).toHaveAttribute('data-mobile-panel', 'preview', {
        timeout: 15_000,
      });
    } else {
      await mobileBottomNavigation(page).getByTestId('tab-preview').click();
      await expect(page.locator('.bolt-responsive-ide-mobile')).toHaveAttribute('data-mobile-panel', 'preview', {
        timeout: 15_000,
      });
    }

    await expect(runButton).toHaveAttribute('aria-label', 'Stop running', { timeout: 45_000 });
    await expect(runButton).toHaveAttribute('data-preview-state', /^(starting|running|static)$/);
    await expect(runButton).toHaveClass(/bolt-mobile-replit-run--active/);
    await expect(runButton.locator('span').first()).toHaveClass(/i-ph:square-fill/);

    await expect(
      page.getByTestId('preview-splash-sequence').or(page.getByTestId('preview-loading-overlay')).first(),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('preview-iframe')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('preview-loading-overlay')).toContainText(/Starting npm run dev|Building|Ready/, {
      timeout: 45_000,
    });
    await expect(runButton).toHaveAttribute('aria-label', 'Stop running', { timeout: 15_000 });
  });

  test('mobile and tablet keep a visible webview startup state until the iframe renders', async ({
    page,
  }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(240_000);

    const projectId = await createTestProject(page, 'Responsive slow preview startup project', {
      'package.json': JSON.stringify(
        {
          private: true,
          type: 'module',
          scripts: { dev: 'node server.mjs' },
        },
        null,
        2,
      ),
      'server.mjs': `import { createServer } from 'node:http';

const port = Number(process.env.PORT || 5173);

createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (request.url === '/healthz') {
    response.end('ok');
    return;
  }

  setTimeout(() => {
    response.end('<!doctype html><html><body><main data-slow-preview="ready">Slow preview ready</main></body></html>');
  }, 8000);
}).listen(port, '0.0.0.0', () => {
  console.log('slow preview server listening on ' + port);
});
`,
    });

    await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });

    await expect(
      page.getByTestId('preview-splash-sequence').or(page.getByTestId('preview-loading-overlay')).first(),
    ).toBeVisible({ timeout: 45_000 });

    const loadingOverlay = page.getByTestId('preview-loading-overlay');
    await expect(loadingOverlay).toBeVisible({ timeout: 180_000 });
    await expect(loadingOverlay.getByTestId('preview-loading-current-step')).toContainText(
      /Building|Starting dev server|Ready/,
    );
    await expect(loadingOverlay).toContainText(/Webview startup|Loading the webview|Waiting for the preview port/);
    await expect(page.getByTestId('preview-iframe')).toBeVisible({ timeout: 15_000 });
    await expect(loadingOverlay).toBeVisible();

    await expect(page.frameLocator('iframe[title="preview"]').locator('[data-slow-preview="ready"]')).toContainText(
      'Slow preview ready',
      { timeout: 180_000 },
    );
    await expect(loadingOverlay).toHaveCount(0, { timeout: 15_000 });
  });

  test('mobile and tablet menus follow dark and light theme tokens', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive compact theme menu project');

    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript((nextTheme) => {
        window.localStorage.setItem('bolt_theme', nextTheme);
      }, theme);
      await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'chat', {
        timeout: 15_000,
      });

      const toolsSheet = await openMobileToolsSheet(page);

      const toolsTheme = await toolsSheet.evaluate((element) => {
        const root = document.documentElement;
        const styles = getComputedStyle(element);

        return {
          rootTheme: root.getAttribute('data-theme'),
          background: styles.backgroundColor,
          color: styles.color,
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });

      expect(toolsTheme.rootTheme).toBe(theme);
      expect(toolsTheme.overflowX).toBe(false);
      expect(toolsTheme.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(toolsTheme.color).not.toBe('rgba(0, 0, 0, 0)');
      await page.keyboard.press('Escape');
      await expect(toolsSheet).toBeHidden({ timeout: 10_000 });

      await page.getByTestId('mobile-bottom-navigation').getByTestId('button-more').click();

      const moreMenu = page.getByTestId('mobile-more-menu-sheet');
      await expect(moreMenu).toBeVisible({ timeout: 10_000 });

      const moreTheme = await moreMenu.evaluate((element) => {
        const styles = getComputedStyle(element);

        return {
          rootTheme: document.documentElement.getAttribute('data-theme'),
          background: styles.backgroundColor,
          color: styles.color,
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });

      expect(moreTheme.rootTheme).toBe(theme);
      expect(moreTheme.overflowX).toBe(false);
      expect(moreTheme.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(moreTheme.color).not.toBe('rgba(0, 0, 0, 0)');
      await page.keyboard.press('Escape');
      await expect(moreMenu).toHaveCount(0);
    }
  });

  test('mobile opens the agent by default and uses panel URLs for restore', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');

    const { projectId, auth } = await createTestProjectFixture(page, 'Responsive mobile persistence project');

    const staleMobileState = await page.request.put(`${apiBaseUrl()}/projects/${projectId}/ide-state`, {
      headers: { authorization: `Bearer ${auth.token}` },
      data: {
        state: {
          ui: {
            activeWorkspacePanel: 'files',
            mobilePanel: 'files',
            workspaceTabs: ['files'],
          },
        },
      },
    });

    expect(staleMobileState.ok(), await staleMobileState.text()).toBeTruthy();

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'chat', {
      timeout: 15000,
    });
    await expect(page.getByTestId('mobile-ide-header')).toContainText('AI Agent');

    await page.getByTestId('tab-preview').tap();
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'preview');
    await expect(page).toHaveURL(/panel=preview/, { timeout: 15_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'preview', {
      timeout: 15000,
    });

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'chat', {
      timeout: 15000,
    });
    await expect(page.getByTestId('mobile-ide-header')).toContainText('AI Agent');
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
    await expect(
      page.getByTestId('mobile-files-panel').locator('.bolt-file-tree-name', { hasText: /^src$/ }).first(),
    ).toBeVisible({
      timeout: 45000,
    });
    await expect(
      page
        .getByTestId('mobile-files-panel')
        .locator('.bolt-file-tree-name', { hasText: /^App\.tsx$/ })
        .first(),
    ).toBeVisible({
      timeout: 45000,
    });
    await page
      .getByTestId('mobile-files-panel')
      .locator('.bolt-file-tree-name', { hasText: /^App\.tsx$/ })
      .first()
      .click({ force: true });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'editor', {
      timeout: 45000,
    });
    await expect(
      page.locator('[data-testid="responsive-code-editor"] [data-editor-kind="codemirror"]').first(),
    ).toBeVisible({
      timeout: 45000,
    });

    await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'deploy', {
      timeout: 45000,
    });

    const databasePanel = page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first();
    await expect(databasePanel).toBeVisible({ timeout: 45000 });
    await expect(databasePanel.getByText(/Loading database from backend/i)).toHaveCount(0, { timeout: 45000 });
    await expect(databasePanel).not.toContainText('PANEL_BACKEND_UNAVAILABLE');
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Database');
    await expect(databasePanel.getByRole('button', { name: 'Backups' })).toBeVisible({ timeout: 45000 });

    await page.goto(`/projects/${projectId}/ide?panel=security`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'deploy', {
      timeout: 45000,
    });

    const securityPanel = page.locator('[data-testid="ide-service-panel"][data-panel="security"]').first();
    await expect(securityPanel).toBeVisible({ timeout: 15000 });
    await expect(securityPanel.getByText(/Loading security from backend/i)).toHaveCount(0, { timeout: 45000 });
    await expect(securityPanel.getByRole('button', { name: 'Run full scan' })).toBeVisible({ timeout: 45000 });
    await expect(securityPanel.getByRole('button', { name: 'Settings' })).toBeVisible({ timeout: 45000 });

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

    const toolsSheet = await openMobileToolsSheet(page);
    await expect(toolsSheet.getByTestId('tool-item-deployments')).toContainText('Deployments');
    await expect(toolsSheet.getByTestId('tool-item-object-storage')).toContainText('Object Storage');
    await expect(toolsSheet.getByText('Publishing', { exact: true })).toHaveCount(0);
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

    const toolsSheet = await openMobileToolsSheet(page);
    await expect(toolsSheet.getByTestId('tool-item-deployments')).toContainText('Deployments');
    await expect(toolsSheet.getByTestId('tool-item-object-storage')).toContainText('Object Storage');
    await expect(toolsSheet.getByTestId('tool-item-debugger')).toContainText('Debugger');
    await expect(toolsSheet.getByTestId('tool-item-activity')).toContainText('Activity');
    await expect(toolsSheet.getByText('Publishing', { exact: true })).toHaveCount(0);
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

  test('mobile and tablet use one canonical tools palette', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(240_000);

    const projectId = await createTestProject(page, 'Responsive canonical mobile panels project');

    await page.goto(`/projects/${projectId}/ide?panel=preview`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });

    await expect(page.getByTestId('mobile-bottom-navigation').getByTestId('button-more')).toBeVisible();
    await expect(page.getByTestId('mobile-ide-header').getByTestId('button-more')).toBeVisible();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);

    await page.getByTestId('mobile-bottom-navigation').getByTestId('button-more').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mobile-more-menu-deployments')).toContainText('Deployments');
    await expect(page.getByTestId('mobile-more-menu-settings')).toContainText('Settings');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);

    const toolsSheet = await openMobileToolsSheet(page);
    await expect(toolsSheet).toBeVisible({ timeout: 15_000 });

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
      ['commands', 'Commands'],
      ['share', 'Share'],
    ] as const) {
      await expect(toolsSheet.getByTestId(`tool-item-${itemId}`)).toContainText(label, { timeout: 15_000 });
    }

    for (const legacyLabel of ['Publishing', 'App Storage', 'Debug', 'History', 'Checkpoints', 'Multiplayer']) {
      await expect(toolsSheet.getByText(legacyLabel, { exact: true })).toHaveCount(0);
    }

    await page.getByTestId('tools-search-input').fill('database');
    await expect(page.getByTestId('tool-item-database')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(toolsSheet).toBeHidden({ timeout: 10_000 });

    const resetToolsSheet = await openMobileToolsSheet(page);
    await expect(page.getByTestId('tools-search-input')).toHaveValue('');
    await page.getByTestId('tools-sheet-close').click();
    await expect(resetToolsSheet).toBeHidden({ timeout: 10_000 });

    const reopenedToolsSheet = await openMobileToolsSheet(page);
    const deploymentsToolItem = reopenedToolsSheet.getByTestId('tool-item-deployments');

    await expect(deploymentsToolItem).toBeVisible({ timeout: 15_000 });
    await expect(deploymentsToolItem).toContainText('Deployments');
    await deploymentsToolItem.click();
    await expectMobileServicePanel(page, 'deployments');
    await expect(page.getByTestId('mobile-ide-header')).toContainText('Deployments');

    const finalToolsSheet = await openMobileToolsSheet(page);

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
      await expect(finalToolsSheet.getByText(legacyLabel, { exact: true })).toHaveCount(0);
    }
  });
});
