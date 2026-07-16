import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from '@playwright/test';
import JSZip from 'jszip';

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const evidenceDirectory = path.join(process.cwd(), 'docs/ui-ux-evidence/2026-07-15/replit-layout/after');

type AuthFixture = {
  token: string;
  organization: { id: string };
};

const viewports = [
  {
    id: 'web',
    viewport: { width: 1440, height: 960 },
    context: { hasTouch: false, isMobile: false } satisfies BrowserContextOptions,
  },
  {
    id: 'tablet',
    viewport: { width: 1024, height: 768 },
    context: { hasTouch: true, isMobile: false } satisfies BrowserContextOptions,
  },
  {
    id: 'mobile',
    viewport: { width: 390, height: 844 },
    context: { hasTouch: true, isMobile: true } satisfies BrowserContextOptions,
  },
] as const;

async function register(request: APIRequestContext): Promise<AuthFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const response = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `replit-layout-${suffix}@local.test`,
      password: 'Password123!',
      name: 'Replit Layout Evidence',
      organizationName: `Replit Layout ${suffix}`,
    },
  });

  const body = await response.text();

  expect(response.ok(), body).toBeTruthy();

  return JSON.parse(body) as AuthFixture;
}

async function createProject(request: APIRequestContext, auth: AuthFixture) {
  const response = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Replit layout proof' },
  });

  const body = await response.text();

  expect(response.ok(), body).toBeTruthy();

  const projectId = (JSON.parse(body) as { project: { id: string } }).project.id;
  const archive = new JSZip();

  archive.file(
    'src/App.tsx',
    `export default function App() {
  return <main data-replit-layout-proof="ready">Replit layout proof</main>;
}
`,
  );
  archive.file(
    'src/main.tsx',
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  );
  archive.file(
    'index.html',
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  );
  archive.file(
    'package.json',
    JSON.stringify(
      {
        name: 'replit-layout-proof',
        private: true,
        scripts: { dev: 'vite --host 0.0.0.0' },
        dependencies: { '@vitejs/plugin-react': 'latest', vite: 'latest', react: 'latest', 'react-dom': 'latest' },
        devDependencies: {},
      },
      null,
      2,
    ),
  );

  const importResponse = await request.post(`${apiBaseUrl}/projects/${projectId}/files/import/zip`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { zipBase64: await archive.generateAsync({ type: 'base64' }), replaceExisting: true },
  });

  const importBody = await importResponse.text();

  expect(importResponse.ok(), importBody).toBeTruthy();

  return projectId;
}

async function openAuthenticatedPage(browser: Browser, auth: AuthFixture, config: (typeof viewports)[number]) {
  const context = await browser.newContext({
    ...config.context,
    viewport: config.viewport,
    colorScheme: 'dark',
    deviceScaleFactor: 1,
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
  await context.addInitScript(() => {
    window.localStorage.setItem('vibecore-project-ide-guided-tour-v1', 'complete');
  });

  const page = await context.newPage();

  if (process.env.PLAYWRIGHT_DIAGNOSTICS === '1') {
    page.on('pageerror', (error) => process.stderr.write(`[browser pageerror] ${error.stack ?? error.message}\n`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        process.stderr.write(`[browser console] ${message.text()}\n`);
      }
    });
    page.on('requestfailed', (request) => {
      process.stderr.write(`[browser requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}\n`);
    });
  }

  return { context, page };
}

async function captureAfter(page: Page, name: string) {
  await mkdir(evidenceDirectory, { recursive: true });
  const viewport = page.viewportSize();

  if (viewport) {
    await page.mouse.move(4, Math.min(420, viewport.height - 80));
  }

  await page.waitForTimeout(200);
  await expect(page.getByText('Loading E-Code...', { exact: true })).toBeHidden({ timeout: 45_000 });
  await page.evaluate(() => {
    const cleanupStyle = document.createElement('style');

    cleanupStyle.id = 'replit-layout-evidence-cleanup';
    cleanupStyle.textContent = `
      [role='tooltip'] { opacity: 0 !important; visibility: hidden !important; }
      ::selection { background: transparent !important; color: inherit !important; }
    `;
    document.head.append(cleanupStyle);

    return new Promise<void>((resolve) => {
      const activeElement = document.activeElement as HTMLElement | null;

      if (!activeElement?.closest('[role="dialog"], [role="menu"]')) {
        activeElement?.blur();
      }

      window.getSelection()?.removeAllRanges();
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  });

  try {
    await page.screenshot({
      path: path.join(evidenceDirectory, name),
      animations: 'disabled',
      fullPage: false,
    });
  } finally {
    await page.evaluate(() => document.getElementById('replit-layout-evidence-cleanup')?.remove());
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
}

async function expectProjectEditorReady(page: Page) {
  const editorRoot = page.locator('.bolt-responsive-ide').first();

  await expect(editorRoot).toHaveAttribute('data-project-state-ready', 'true', { timeout: 90_000 });
  await expect(editorRoot).toHaveAttribute('aria-busy', 'false');
}

async function stableBoundingBox(locator: Locator) {
  let box = await locator.boundingBox();

  await expect
    .poll(async () => {
      box = await locator.boundingBox();

      return box ? Math.min(box.width, box.height) : 0;
    })
    .toBeGreaterThan(0);

  return box!;
}

async function expectResponsiveProjectionFitsViewport(page: Page, projection: Locator) {
  const [box, viewport] = await Promise.all([
    projection.boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);

  expect(box, 'The active canonical Pane projection should have visible geometry').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 20);
  expect(box!.height).toBeGreaterThan(viewport.height * 0.6);
}

function pane(page: Page, paneId: string) {
  return page.locator(`.bolt-project-pane-leaf[data-pane-id="${paneId}"]`);
}

async function paneIds(page: Page) {
  return page
    .locator('.bolt-project-pane-leaf[data-pane-id]')
    .evaluateAll((panes) =>
      panes.map((item) => item.getAttribute('data-pane-id')).filter((id): id is string => Boolean(id)),
    );
}

async function openPaneOptions(page: Page, paneId: string) {
  const trigger = page.getByTestId(`pane-options-${paneId}`);

  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');

  const menu = page.getByTestId(`pane-options-menu-${paneId}`);

  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('role', 'menu');
  await expect(menu).toContainText('Window');
  await expect(menu).toContainText('Pane');
  await expect(menu).toContainText('Tab');
  await expect(menu.getByTestId('open-new-project-editor-window')).toBeVisible();

  return menu;
}

async function splitPane(page: Page, paneId: string, direction: 'right' | 'down') {
  const idsBefore = await paneIds(page);
  const menu = await openPaneOptions(page, paneId);
  const action = menu.getByTestId(direction === 'right' ? 'split-pane-right' : 'split-pane-down');

  await action.click();
  await expect(page.locator('.bolt-project-pane-leaf[data-pane-id]')).toHaveCount(idsBefore.length + 1);

  const idsAfter = await paneIds(page);
  const newPaneId = idsAfter.find((id) => !idsBefore.includes(id));

  expect(newPaneId, `${direction} split should create exactly one pane`).toBeTruthy();

  return newPaneId!;
}

async function directPanelRects(split: Locator) {
  return split.locator(':scope > [data-panel]').evaluateAll((panels) =>
    panels.map((panel) => {
      const rect = panel.getBoundingClientRect();

      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    }),
  );
}

async function expectSplitGeometry(split: Locator, direction: 'horizontal' | 'vertical') {
  await expect(split).toBeVisible();
  await expect(split).toHaveAttribute('data-direction', direction);

  const rects = await directPanelRects(split);

  expect(rects).toHaveLength(2);

  const [first, second] = rects;

  expect(first.width).toBeGreaterThan(120);
  expect(first.height).toBeGreaterThan(120);
  expect(second.width).toBeGreaterThan(120);
  expect(second.height).toBeGreaterThan(120);

  if (direction === 'horizontal') {
    expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(first.height - second.height)).toBeLessThanOrEqual(2);
    expect(second.x).toBeGreaterThanOrEqual(first.right);
  } else {
    expect(Math.abs(first.x - second.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(2);
    expect(second.y).toBeGreaterThanOrEqual(first.bottom);
  }
}

async function resizeHorizontalSplit(page: Page, split: Locator) {
  const firstPanel = split.locator(':scope > [data-panel]').first();
  const handle = split.getByRole('separator', { name: 'Resize panes horizontally' });
  const before = await firstPanel.boundingBox();
  const handleBox = await handle.boundingBox();

  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + 96, handleBox!.y + handleBox!.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => (await firstPanel.boundingBox())?.width ?? 0, { message: 'Horizontal split should resize' })
    .toBeGreaterThan(before!.width + 32);

  const splitBox = await split.boundingBox();
  const resized = await firstPanel.boundingBox();

  expect(splitBox).not.toBeNull();
  expect(resized).not.toBeNull();

  return resized!.width / splitBox!.width;
}

async function openAllToolsSearch(page: Page, query: string) {
  const dock = page.getByTestId('project-tools-dock');

  await expect(dock).toBeVisible();
  await expect(dock.getByTestId('all-tools-button')).toBeVisible();
  await dock.getByTestId('all-tools-button').click();

  const popup = page.getByTestId('all-tools-popup');

  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute('data-mode', 'tools');
  await popup.getByRole('combobox', { name: 'Search all tools' }).fill(query);

  return popup;
}

async function openToolInPane(page: Page, paneId: string, panel: string, query: string) {
  const targetPane = pane(page, paneId);

  await targetPane.getByTestId('tab-add').click();

  const palette = page.getByTestId('ide-add-tab-command-palette');

  await expect(palette).toBeVisible();
  await palette.getByLabel('Search commands, tools, or files').fill(query);
  await palette.getByTestId(`feature-${panel}`).click();
  await expect(targetPane.locator(`.bolt-project-tab[data-panel="${panel}"]`)).toBeVisible();
}

async function openFileInPane(page: Page, paneId: string, fileName: string) {
  const targetPane = pane(page, paneId);

  await targetPane.getByTestId('tab-add').click();

  const palette = page.getByTestId('ide-add-tab-command-palette');

  await expect(palette).toBeVisible();

  const fileResult = palette.locator('button.bolt-project-tool-item').filter({ hasText: fileName }).first();

  await expect(fileResult, `${fileName} should be offered by the pane's Add tab palette`).toBeVisible();
  await fileResult.click();
  await expect(palette).toBeHidden();

  const fileTab = targetPane.locator('.bolt-project-tab[data-panel="editor"][aria-selected="true"]');

  await expect(fileTab).toBeVisible();
  await expect(fileTab).toContainText(fileName);
  await expect(targetPane.locator('.bolt-project-editor-toolbar-file')).toContainText(fileName, { timeout: 30_000 });

  const tabId = await fileTab.getAttribute('data-tab-id');

  expect(tabId, `${fileName} should have its own tab identity`).toBeTruthy();

  return tabId!;
}

async function moveTabWithoutSwap(page: Page, sourcePaneId: string, targetPaneId: string, panel: string) {
  const sourcePane = pane(page, sourcePaneId);
  const targetPane = pane(page, targetPaneId);
  const tab = sourcePane.locator(`.bolt-project-tab[data-panel="${panel}"]`);

  await expect(tab).toBeVisible();
  await tab.locator('.bolt-project-tab-main').click();

  const tabId = await tab.getAttribute('data-tab-id');
  const sourceCount = await sourcePane.locator('.bolt-project-tab').count();
  const targetCount = await targetPane.locator('.bolt-project-tab').count();

  expect(tabId).toBeTruthy();

  const menu = await openPaneOptions(page, sourcePaneId);

  await menu.getByTestId(`move-tab-to-${targetPaneId}`).click();
  await expect(page.locator(`.bolt-project-tab[data-tab-id="${tabId}"]`)).toHaveCount(1);
  await expect(sourcePane.locator(`.bolt-project-tab[data-tab-id="${tabId}"]`)).toHaveCount(0);
  await expect(targetPane.locator(`.bolt-project-tab[data-tab-id="${tabId}"]`)).toHaveCount(1);
  await expect(sourcePane.locator('.bolt-project-tab')).toHaveCount(sourceCount - 1);
  await expect(targetPane.locator('.bolt-project-tab')).toHaveCount(targetCount + 1);

  return tabId!;
}

async function exerciseFloatingPane(page: Page, paneId: string) {
  const paneCountBefore = await page.locator('.bolt-project-pane-leaf[data-pane-id]').count();
  const menu = await openPaneOptions(page, paneId);
  const floatAction = menu.getByTestId('float-pane');

  await expect(floatAction, 'Floating is a required Pane capability').toBeVisible();
  await expect(floatAction).toBeEnabled();
  await floatAction.click();

  const floatingPane = page.locator(`[data-testid="floating-pane"][data-pane-id="${paneId}"]`);

  await expect(floatingPane).toBeVisible();

  const floatingMetrics = await floatingPane.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return { position: style.position, width: rect.width, height: rect.height, x: rect.x, y: rect.y };
  });

  expect(['fixed', 'absolute']).toContain(floatingMetrics.position);
  expect(floatingMetrics.width).toBeGreaterThan(320);
  expect(floatingMetrics.height).toBeGreaterThan(240);
  expect(floatingMetrics.x).toBeGreaterThanOrEqual(0);
  expect(floatingMetrics.y).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId(`dock-floating-pane-${paneId}`)).toBeVisible();

  const moveHandle = page.getByTestId(`floating-pane-move-${paneId}`);

  await moveHandle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(async () => (await floatingPane.boundingBox())?.x ?? 0, {
      message: 'The floating Pane should be keyboard-movable',
    })
    .toBeGreaterThan(floatingMetrics.x + 32);

  const movedBox = await floatingPane.boundingBox();

  expect(movedBox).not.toBeNull();

  const resizeHandle = page.getByTestId(`floating-pane-resize-${paneId}`);

  await resizeHandle.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await expect
    .poll(async () => (await floatingPane.boundingBox())?.width ?? Number.POSITIVE_INFINITY, {
      message: 'The floating Pane should be keyboard-resizable',
    })
    .toBeLessThan(movedBox!.width - 32);
  await resizeHandle.evaluate((element: HTMLElement) => element.blur());
  await page.mouse.move(0, 0);
  await captureAfter(page, 'web-pane-floating.png');

  const dockMenu = await openPaneOptions(page, paneId);

  await expect(dockMenu.getByTestId('dock-floating-pane')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId(`dock-floating-pane-${paneId}`).click();
  await expect(floatingPane).toHaveCount(0);
  await expect(
    page.locator(`.bolt-project-main-panes .bolt-project-pane-leaf[data-pane-id="${paneId}"]`),
  ).toBeVisible();
  await expect(page.locator('.bolt-project-pane-leaf[data-pane-id]')).toHaveCount(paneCountBefore);
  await expect(page.locator('.bolt-project-pane-split[data-direction="horizontal"]')).toHaveCount(1);
  await expect(page.locator('.bolt-project-pane-split[data-direction="vertical"]')).toHaveCount(1);
  await captureAfter(page, 'web-pane-docked.png');
}

async function expectResourcesPanel(page: Page, options: { triggerTestId?: string; evidenceName?: string } = {}) {
  const trigger = page.getByTestId(options.triggerTestId ?? 'project-resources-trigger');

  await expect(trigger).toBeVisible();
  await trigger.click();

  const panel = page.getByTestId('project-resources-panel');

  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Resources' })).toBeVisible();
  await expect(panel.getByTestId('project-resource-cpu')).toContainText('CPU');
  await expect(panel.getByTestId('project-resource-memory')).toContainText('RAM');
  await expect(panel.getByTestId('project-resource-storage')).toContainText('Storage');
  await expect(panel.getByTestId('project-resource-storage').locator('output')).not.toHaveText('Unavailable');
  await captureAfter(page, options.evidenceName ?? 'web-resources-ram-cpu-storage.png');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}

async function waitForWindowSplitPersisted(page: Page, windowId: string, direction: 'horizontal' | 'vertical') {
  return page.waitForResponse(
    (response) => {
      if (!response.url().includes('/ide-state') || response.request().method() !== 'PUT' || !response.ok()) {
        return false;
      }

      try {
        const payload = JSON.stringify(response.request().postDataJSON());

        return payload.includes(`"${windowId}"`) && payload.includes(`"direction":"${direction}"`);
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
}

async function proveIndependentSecondWindow(page: Page, sourcePaneId: string, expectedFileName?: string) {
  const editorRoot = page.locator('.bolt-responsive-ide').first();
  const originalWindowId = await editorRoot.getAttribute('data-project-editor-window-id');
  const originalPaneCount = await page.locator('.bolt-project-pane-leaf[data-pane-id]').count();

  expect(originalWindowId, 'The first browser Window should expose its canonical identity').toBeTruthy();

  const secondPagePromise = page.context().waitForEvent('page');
  const menu = await openPaneOptions(page, sourcePaneId);

  await menu.getByTestId('open-new-project-editor-window').click();

  const secondPage = await secondPagePromise;

  try {
    await secondPage.waitForLoadState('domcontentloaded');
    await expect(secondPage.locator('.bolt-project-ide-shell')).toBeVisible({ timeout: 90_000 });
    await expect(secondPage.locator('.bolt-responsive-ide-desktop')).toBeVisible({ timeout: 90_000 });
    await expectProjectEditorReady(secondPage);

    const secondRoot = secondPage.locator('.bolt-responsive-ide').first();
    const secondWindowId = await secondRoot.getAttribute('data-project-editor-window-id');
    const requestedWindowId = new URL(secondPage.url()).searchParams.get('window');

    expect(secondWindowId, 'The second browser Window should expose its own canonical identity').toBeTruthy();
    expect(secondWindowId).not.toBe(originalWindowId);
    expect(requestedWindowId).toBe(secondWindowId);
    await expect(secondPage.locator('.bolt-project-main-panes')).toHaveAttribute('data-window-id', secondWindowId!);
    await expect(secondPage.locator('.bolt-project-pane-leaf[data-pane-id]')).toHaveCount(1);

    if (expectedFileName) {
      const activeEditorTab = secondPage.locator(
        '.bolt-project-pane-leaf .bolt-project-tab[data-panel="editor"][aria-selected="true"]',
      );

      await expect(activeEditorTab).toContainText(expectedFileName);
      await expect(secondPage.locator('.bolt-project-pane-leaf .bolt-project-editor-toolbar-file')).toContainText(
        expectedFileName,
      );
    }

    const secondSourcePaneId = (await paneIds(secondPage))[0];

    expect(secondSourcePaneId).toBeTruthy();

    const persistedSecondWindow = waitForWindowSplitPersisted(secondPage, secondWindowId!, 'horizontal');

    await splitPane(secondPage, secondSourcePaneId, 'right');
    await expect(secondPage.locator('.bolt-project-pane-leaf[data-pane-id]')).toHaveCount(2);
    await expectSplitGeometry(
      secondPage.locator('.bolt-project-pane-split[data-direction="horizontal"]').first(),
      'horizontal',
    );
    await persistedSecondWindow;

    await expect(page.locator('.bolt-project-pane-leaf[data-pane-id]')).toHaveCount(originalPaneCount);
    await expect(page.locator(`.bolt-project-main-panes[data-window-id="${originalWindowId}"]`)).toBeVisible();
    await expect(page.locator(`.bolt-project-main-panes[data-window-id="${secondWindowId}"]`)).toHaveCount(0);
    await captureAfter(secondPage, 'web-second-window-independent.png');
    await captureAfter(page, 'web-first-window-independent.png');
  } finally {
    await secondPage.close();
  }
}

function countPaneLeaves(node: unknown): number {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  const candidate = node as { type?: unknown; first?: unknown; second?: unknown };

  if (candidate.type === 'leaf') {
    return 1;
  }

  if (candidate.type === 'split') {
    return countPaneLeaves(candidate.first) + countPaneLeaves(candidate.second);
  }

  return 0;
}

type PersistedWindowSnapshot = {
  root?: unknown;
  activePaneId?: string;
  floatingPanes?: Array<{ pane?: { id?: string } }>;
};

function readPersistedWindow(payload: unknown, windowId: string): PersistedWindowSnapshot | undefined {
  const envelope = payload as {
    ideState?: {
      state?: {
        ui?: { projectEditorLayout?: { windows?: Record<string, PersistedWindowSnapshot> } };
      };
    };
    state?: {
      ui?: { projectEditorLayout?: { windows?: Record<string, PersistedWindowSnapshot> } };
    };
  };

  const state = envelope.ideState?.state ?? envelope.state;

  return state?.ui?.projectEditorLayout?.windows?.[windowId];
}

async function waitForPersistedWindowState(
  page: Page,
  windowId: string,
  predicate: (windowState: PersistedWindowSnapshot) => boolean,
) {
  return page.waitForResponse(
    (response) => {
      if (!response.url().includes('/ide-state') || response.request().method() !== 'PUT' || !response.ok()) {
        return false;
      }

      try {
        const persistedWindow = readPersistedWindow(response.request().postDataJSON(), windowId);

        return Boolean(persistedWindow && predicate(persistedWindow));
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
}

async function waitForPersistedLayout(page: Page) {
  return page.waitForResponse(
    (response) => {
      if (!response.url().includes('/ide-state') || response.request().method() !== 'PUT' || !response.ok()) {
        return false;
      }

      try {
        const payload = JSON.stringify(response.request().postDataJSON());

        return payload.includes('"direction":"horizontal"') && payload.includes('"direction":"vertical"');
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
}

test('Project Editor proves split, resize, tab movement, tools, resources, Spotlight and persistence', async ({
  browser,
  request,
}, testInfo) => {
  test.skip(
    !['chromium', 'webkit'].includes(testInfo.project.name),
    'Layout evidence uses a desktop engine with pointer geometry and explicit contexts.',
  );
  test.setTimeout(420_000);

  const auth = await register(request);
  const projectId = await createProject(request, auth);
  const { context, page } = await openAuthenticatedPage(browser, auth, viewports[0]);

  try {
    await page.goto(`${appBaseUrl}/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-project-ide-shell')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.bolt-responsive-ide-desktop')).toBeVisible({ timeout: 45_000 });
    await expectProjectEditorReady(page);
    await expect(page.getByTestId('project-tools-dock')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const dockBox = await stableBoundingBox(page.getByTestId('project-tools-dock'));
    const initialPaneBox = await stableBoundingBox(page.locator('.bolt-project-pane-leaf').first());

    expect(dockBox.x).toBeLessThan(initialPaneBox.x);

    const allTools = await openAllToolsSearch(page, 'Database');

    await expect(allTools.getByRole('option', { name: /^Database\b/i })).toBeVisible();
    await captureAfter(page, 'web-all-tools-search-database.png');
    await allTools.getByRole('option', { name: /^Database\b/i }).click();
    await expect(allTools).toBeHidden();

    const initialPaneId = (await paneIds(page))[0];

    expect(initialPaneId).toBeTruthy();
    await expect(pane(page, initialPaneId).locator('.bolt-project-tab[data-panel="database"]')).toBeVisible();

    const horizontalPaneId = await splitPane(page, initialPaneId, 'right');
    const horizontalSplit = page.locator('.bolt-project-pane-split[data-direction="horizontal"]').first();

    await expectSplitGeometry(horizontalSplit, 'horizontal');
    await captureAfter(page, 'web-split-horizontal.png');

    const persistedHorizontalRatio = await resizeHorizontalSplit(page, horizontalSplit);

    expect(persistedHorizontalRatio).toBeGreaterThan(0.52);
    expect(persistedHorizontalRatio).toBeLessThanOrEqual(0.8);
    await captureAfter(page, 'web-split-horizontal-resized.png');

    await openToolInPane(page, horizontalPaneId, 'files', 'Files');
    await expect(pane(page, horizontalPaneId).locator('.bolt-project-files-tool')).toBeVisible();
    await expect(pane(page, horizontalPaneId).getByText('4 files', { exact: true })).toBeVisible();
    await captureAfter(page, 'web-canonical-files-tool.png');

    await openToolInPane(page, horizontalPaneId, 'preview', 'Preview');

    const previewSurface = pane(page, horizontalPaneId).locator('.bolt-project-webview-tool').first();
    const previewSignal = previewSurface
      .locator(
        [
          'iframe[data-testid="preview-iframe"]',
          '[data-testid="preview-not-running-state"]',
          '[data-testid="preview-splash-sequence"]',
        ].join(', '),
      )
      .first();

    await expect(previewSurface).toBeVisible({ timeout: 45_000 });
    await expect(
      previewSignal,
      'The preserved Bolt preview must expose a real frame or an actionable state',
    ).toBeVisible({
      timeout: 45_000,
    });

    const previewGeometry = await previewSurface.evaluate((element) => {
      const rect = element.getBoundingClientRect();

      return {
        area: rect.width * rect.height,
        hasFrame: Boolean(element.querySelector('iframe')),
        hasActionableState: Boolean(
          element.querySelector('[data-testid="preview-not-running-state"], [data-testid="preview-splash-sequence"]'),
        ),
      };
    });

    expect(previewGeometry.area).toBeGreaterThan(80_000);
    expect(previewGeometry.hasFrame || previewGeometry.hasActionableState).toBe(true);
    await captureAfter(page, 'web-preview-preserved-and-nonblank.png');

    await openToolInPane(page, horizontalPaneId, 'logs', 'Logs');

    const movedTabId = await moveTabWithoutSwap(page, horizontalPaneId, initialPaneId, 'logs');

    await captureAfter(page, 'web-tab-moved-between-panes.png');

    const draggedLogTab = pane(page, initialPaneId).locator(`.bolt-project-tab[data-tab-id="${movedTabId}"]`);
    const displacedPreviewTab = pane(page, horizontalPaneId).locator('.bolt-project-tab[data-panel="preview"]');

    await draggedLogTab.dragTo(displacedPreviewTab);
    await expect(pane(page, initialPaneId).locator(`.bolt-project-tab[data-tab-id="${movedTabId}"]`)).toHaveCount(0);
    await expect(pane(page, horizontalPaneId).locator(`.bolt-project-tab[data-tab-id="${movedTabId}"]`)).toBeVisible();
    await captureAfter(page, 'web-tab-dragged-between-panes.png');

    await pane(page, horizontalPaneId)
      .locator(`.bolt-project-tab[data-tab-id="${movedTabId}"]`)
      .dragTo(pane(page, initialPaneId).locator('.bolt-project-tab[data-panel="editor"]'));
    await expect(pane(page, initialPaneId).locator(`.bolt-project-tab[data-tab-id="${movedTabId}"]`)).toBeVisible();
    await expect(pane(page, horizontalPaneId).locator('.bolt-project-tab[data-panel="preview"]')).toBeVisible();
    await pane(page, initialPaneId)
      .locator(`.bolt-project-tab[data-tab-id="${movedTabId}"] .bolt-project-tab-main`)
      .click();

    const verticalPaneId = await splitPane(page, initialPaneId, 'down');
    const verticalSplit = page.locator('.bolt-project-pane-split[data-direction="vertical"]').first();

    await expectSplitGeometry(verticalSplit, 'vertical');
    await expect(page.locator(`.bolt-project-tab[data-tab-id="${movedTabId}"]`)).toHaveCount(1);
    await captureAfter(page, 'web-split-horizontal-and-vertical.png');

    const desktopOptionsMenu = await openPaneOptions(page, verticalPaneId);

    await captureAfter(page, 'web-options-window-pane-tab.png');
    await page.keyboard.press('Escape');
    await expect(desktopOptionsMenu).toBeHidden();
    await exerciseFloatingPane(page, verticalPaneId);

    const appFileTabId = await openFileInPane(page, initialPaneId, 'App.tsx');
    const mainFileTabId = await openFileInPane(page, horizontalPaneId, 'main.tsx');

    expect(appFileTabId).not.toBe(mainFileTabId);
    await expect(pane(page, initialPaneId).locator(`.bolt-project-tab[data-tab-id="${appFileTabId}"]`)).toContainText(
      'App.tsx',
    );
    await expect(
      pane(page, horizontalPaneId).locator(`.bolt-project-tab[data-tab-id="${mainFileTabId}"]`),
    ).toContainText('main.tsx');
    await expect(pane(page, initialPaneId).locator('.bolt-project-editor-toolbar-file')).toContainText('App.tsx');
    await expect(pane(page, horizontalPaneId).locator('.bolt-project-editor-toolbar-file')).toContainText('main.tsx');
    await captureAfter(page, 'web-two-editor-files-two-panes.png');

    await proveIndependentSecondWindow(page, initialPaneId, 'App.tsx');

    await expectResourcesPanel(page);

    const persistedLayout = waitForPersistedLayout(page);

    await page.getByTestId('project-spotlight-trigger').click();
    await expect(page).toHaveURL(/[?&]panel=overview(?:&|$)/);
    await expect(page.locator('[data-testid="ide-service-panel"][data-panel="overview"]').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('project-overview-panel').first()).toBeVisible({ timeout: 45_000 });
    await captureAfter(page, 'web-project-spotlight.png');
    await persistedLayout;

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-project-ide-shell')).toBeVisible({ timeout: 45_000 });
    await expectProjectEditorReady(page);
    await expect(page.locator('.bolt-project-pane-leaf[data-pane-id]')).toHaveCount(3);
    await expectSplitGeometry(
      page.locator('.bolt-project-pane-split[data-direction="horizontal"]').first(),
      'horizontal',
    );
    await expectSplitGeometry(page.locator('.bolt-project-pane-split[data-direction="vertical"]').first(), 'vertical');
    await expect(page.locator(`.bolt-project-tab[data-tab-id="${movedTabId}"]`)).toHaveCount(1);

    const reloadedHorizontalSplit = page.locator('.bolt-project-pane-split[data-direction="horizontal"]').first();
    const reloadedRects = await directPanelRects(reloadedHorizontalSplit);
    const reloadedSplitBox = await reloadedHorizontalSplit.boundingBox();

    expect(reloadedSplitBox).not.toBeNull();
    expect(reloadedRects[0].width / reloadedSplitBox!.width).toBeCloseTo(persistedHorizontalRatio, 1);
    await expect(page.getByTestId('project-overview-panel').first()).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByText('No console logs yet. Start the runtime or run a command to stream output here.').first(),
    ).toBeVisible({
      timeout: 45_000,
    });
    await expectNoHorizontalOverflow(page);
    await captureAfter(page, 'web-reloaded-persisted-layout.png');
  } finally {
    await context.close();
  }
});

test('Project Editor layout fits web, tablet, and mobile with searchable tools', async ({
  browser,
  request,
}, testInfo) => {
  test.skip(
    !['chromium', 'webkit'].includes(testInfo.project.name),
    'This test creates its own explicit responsive contexts.',
  );
  test.setTimeout(420_000);

  const auth = await register(request);
  const projectId = await createProject(request, auth);

  let canonicalWindowId: string | null = null;
  let canonicalPaneCount = 0;
  let canonicalSourcePaneId: string | null = null;
  let canonicalSecondPaneId: string | null = null;
  let responsiveMovedTabId: string | null = null;

  /*
   * Chromium's single-process fallback is required on the macOS QA host, but
   * closing and recreating BrowserContexts can terminate that shared process.
   * One touch-capable context with real viewport changes still exercises the
   * app's web/tablet/mobile responsive contract while keeping the browser
   * process stable. Every transition performs a full navigation and verifies
   * the canonical state returned by the API.
   */
  const { context, page } = await openAuthenticatedPage(browser, auth, viewports[1]);

  try {
    for (const config of viewports) {
      await page.setViewportSize(config.viewport);

      const persistedStateResponse =
        config.id === 'web'
          ? null
          : page.waitForResponse(
              (response) => response.url().includes('/ide-state') && response.request().method() === 'GET',
              { timeout: 30_000 },
            );

      await page.goto(`${appBaseUrl}/projects/${projectId}/ide?panel=editor`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.bolt-project-ide-shell')).toBeVisible({ timeout: 90_000 });
      await expectProjectEditorReady(page);

      const editorRoot = page.locator('.bolt-responsive-ide').first();

      if (config.id === 'web') {
        canonicalWindowId = await editorRoot.getAttribute('data-project-editor-window-id');
        expect(canonicalWindowId).toBeTruthy();
      } else {
        expect(canonicalWindowId).toBeTruthy();
        await expect(editorRoot).toHaveAttribute('data-project-editor-window-id', canonicalWindowId!);

        const response = await persistedStateResponse!;

        expect(response.ok()).toBeTruthy();

        const persistedWindow = readPersistedWindow(await response.json(), canonicalWindowId!);

        expect(persistedWindow, `${config.id} should load the same canonical Window state`).toBeTruthy();
        expect(countPaneLeaves(persistedWindow?.root)).toBe(canonicalPaneCount);
      }

      if (config.id === 'web') {
        await expect(page.locator('.bolt-responsive-ide-desktop')).toBeVisible({ timeout: 90_000 });
        await expect(page.getByTestId('project-tools-dock')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Options for active tab' }).first()).toBeVisible();

        const sourcePaneId = (await paneIds(page))[0];

        expect(sourcePaneId).toBeTruthy();
        canonicalSourcePaneId = sourcePaneId;

        const persistedCanonicalSplit = waitForWindowSplitPersisted(page, canonicalWindowId!, 'horizontal');

        canonicalSecondPaneId = await splitPane(page, sourcePaneId, 'right');
        canonicalPaneCount = await page.locator('.bolt-project-pane-leaf[data-pane-id]').count();
        expect(canonicalPaneCount).toBe(2);
        await expect(page.locator('.bolt-project-main-panes')).toHaveAttribute('data-window-id', canonicalWindowId!);
        await expect(pane(page, canonicalSourcePaneId)).toBeVisible();
        await expect(pane(page, canonicalSecondPaneId)).toBeVisible();
        await expectSplitGeometry(
          page.locator('.bolt-project-pane-split[data-direction="horizontal"]').first(),
          'horizontal',
        );
        await persistedCanonicalSplit;
        await expectNoHorizontalOverflow(page);
        await captureAfter(page, 'web-responsive-canonical-two-pane-window.png');
      } else {
        await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 90_000 });
        await expect(page.getByTestId('mobile-project-spotlight-trigger')).toBeVisible();
        await expect(page.getByTestId('mobile-project-resources-trigger')).toBeVisible();
        expect(canonicalSourcePaneId).toBeTruthy();
        expect(canonicalSecondPaneId).toBeTruthy();

        const responsiveProjection = page.getByTestId('responsive-project-editor-layout');
        const expectedProjectedPaneId = config.id === 'tablet' ? canonicalSecondPaneId! : canonicalSourcePaneId!;

        await expect(responsiveProjection).toBeVisible();
        await expect(responsiveProjection).toHaveAttribute('data-window-id', canonicalWindowId!);
        await expect(responsiveProjection).toHaveAttribute('data-pane-id', expectedProjectedPaneId);
        await expect(responsiveProjection.locator('.bolt-project-pane-leaf[data-pane-id]')).toHaveCount(1);
        await expect(
          responsiveProjection.locator(`.bolt-project-pane-leaf[data-pane-id="${expectedProjectedPaneId}"]`),
        ).toBeVisible();
        await expect(responsiveProjection.getByRole('button', { name: 'Options for active tab' })).toBeVisible();
        await expectResponsiveProjectionFitsViewport(page, responsiveProjection);

        const mobileNavigation = page.getByTestId('mobile-bottom-navigation');

        await expect(mobileNavigation).toBeVisible();
        await mobileNavigation.getByTestId('button-add-tab').click();
        await expect(page.getByTestId('tools-sheet')).toBeVisible();
        await page.getByTestId('tools-search-input').fill('Database');
        await expect(page.getByTestId('tool-item-database')).toBeVisible();
        await captureAfter(page, `${config.id}-all-tools-search-database.png`);
        await page.getByTestId('tool-item-database').click();
        await expect(page.getByTestId('tools-sheet')).toBeHidden();
        await expect(responsiveProjection.locator('.bolt-project-tab[data-panel="database"]')).toBeVisible();

        if (config.id === 'tablet') {
          const databaseTab = responsiveProjection.locator(
            '.bolt-project-tab[data-panel="database"][aria-selected="true"]',
          );

          responsiveMovedTabId = await databaseTab.getAttribute('data-tab-id');
          expect(responsiveMovedTabId, 'The responsive tab move should preserve one stable Tab identity').toBeTruthy();

          const persistedResponsiveMove = waitForPersistedWindowState(
            page,
            canonicalWindowId!,
            (windowState) =>
              windowState.activePaneId === canonicalSourcePaneId &&
              countPaneLeaves(windowState.root) === canonicalPaneCount &&
              JSON.stringify(windowState.root).includes(responsiveMovedTabId!),
          );

          const moveMenu = await openPaneOptions(page, canonicalSecondPaneId!);
          const moveAction = moveMenu.getByTestId(`move-tab-to-${canonicalSourcePaneId}`);

          await expect(moveAction).toBeVisible();
          await captureAfter(page, 'tablet-options-move-between-canonical-panes.png');
          await moveAction.click();
          await expect(responsiveProjection).toHaveAttribute('data-pane-id', canonicalSourcePaneId!);
          await expect(
            responsiveProjection.locator(`.bolt-project-tab[data-tab-id="${responsiveMovedTabId}"]`),
          ).toBeVisible();
          await expect(
            responsiveProjection.locator(`.bolt-project-tab[data-tab-id="${responsiveMovedTabId}"]`),
          ).toHaveAttribute('aria-selected', 'true');
          await persistedResponsiveMove;
          await expectResponsiveProjectionFitsViewport(page, responsiveProjection);

          const movedTabMenu = await openPaneOptions(page, canonicalSourcePaneId!);

          await expect(movedTabMenu.getByTestId(`move-tab-to-${canonicalSecondPaneId}`)).toBeVisible();
          await captureAfter(page, 'tablet-tab-moved-between-canonical-panes.png');
          await page.keyboard.press('Escape');
          await expect(movedTabMenu).toBeHidden();
        } else {
          expect(responsiveMovedTabId).toBeTruthy();
          await expect(
            responsiveProjection.locator(`.bolt-project-tab[data-tab-id="${responsiveMovedTabId}"]`),
          ).toBeVisible();

          const persistedFloatingPane = waitForPersistedWindowState(
            page,
            canonicalWindowId!,
            (windowState) =>
              windowState.activePaneId === canonicalSourcePaneId &&
              countPaneLeaves(windowState.root) === canonicalPaneCount - 1 &&
              Boolean(windowState.floatingPanes?.some((floating) => floating.pane?.id === canonicalSourcePaneId)),
          );

          const floatMenu = await openPaneOptions(page, canonicalSourcePaneId!);

          await expect(floatMenu.getByTestId(`move-tab-to-${canonicalSecondPaneId}`)).toBeVisible();
          await expect(floatMenu.getByTestId('float-pane')).toBeVisible();
          await captureAfter(page, 'mobile-options-window-pane-tab.png');
          await floatMenu.getByTestId('float-pane').click();
          await expect(responsiveProjection).toHaveAttribute('data-pane-id', canonicalSourcePaneId!);
          await expect(responsiveProjection).toHaveAttribute('data-floating', 'true');
          await persistedFloatingPane;
          await expectResponsiveProjectionFitsViewport(page, responsiveProjection);
          await expect(page.getByTestId('responsive-floating-pane-bar')).toBeVisible();
          await expect(page.getByTestId(`responsive-dock-floating-pane-${canonicalSourcePaneId}`)).toBeVisible();
          await captureAfter(page, 'mobile-pane-floating-responsive.png');

          const persistedDockedPane = waitForPersistedWindowState(
            page,
            canonicalWindowId!,
            (windowState) =>
              windowState.activePaneId === canonicalSourcePaneId &&
              countPaneLeaves(windowState.root) === canonicalPaneCount &&
              !windowState.floatingPanes?.some((floating) => floating.pane?.id === canonicalSourcePaneId),
          );

          await page.getByTestId(`responsive-dock-floating-pane-${canonicalSourcePaneId}`).click();
          await expect(responsiveProjection).toHaveAttribute('data-pane-id', canonicalSourcePaneId!);
          await expect(responsiveProjection).toHaveAttribute('data-floating', 'false');
          await expect(page.getByTestId('responsive-floating-pane-bar')).toHaveCount(0);
          await persistedDockedPane;
          await expectResponsiveProjectionFitsViewport(page, responsiveProjection);
          await captureAfter(page, 'mobile-pane-docked-responsive.png');
        }

        await expect(mobileNavigation.getByTestId('button-more')).toBeVisible();
        await mobileNavigation.getByTestId('button-more').click();
        await expect(page.getByTestId('mobile-more-menu-sheet')).toBeVisible();
        await page.getByTestId('mobile-more-menu-close').click();

        await expectNoHorizontalOverflow(page);
        await captureAfter(page, `${config.id}-responsive.png`);

        await expectResourcesPanel(page, {
          triggerTestId: 'mobile-project-resources-trigger',
          evidenceName: `${config.id}-resources-ram-cpu-storage.png`,
        });

        await page.getByTestId('mobile-project-spotlight-trigger').click();
        await expect(page).toHaveURL(/[?&]panel=overview(?:&|$)/);
        await expect(page.getByTestId('mobile-project-spotlight-trigger')).toBeVisible();
        await expect(page.getByTestId('project-overview-panel').first()).toBeVisible({ timeout: 45_000 });
        await expectResponsiveProjectionFitsViewport(page, responsiveProjection);
        await captureAfter(page, `${config.id}-project-spotlight.png`);
      }

      await expectNoHorizontalOverflow(page);

      if (config.id === 'web') {
        await captureAfter(page, 'web-responsive.png');
      }
    }
  } finally {
    await context.close();
  }
});
