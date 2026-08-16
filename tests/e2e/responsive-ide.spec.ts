import { expect, test, type TestInfo } from '@playwright/test';
import JSZip from 'jszip';

function isCompactIdeProject(testInfo: TestInfo) {
  return testInfo.project.name === 'mobile' || testInfo.project.name === 'tablet';
}

function mobileBottomNavigation(page: import('@playwright/test').Page) {
  return page.getByTestId('mobile-bottom-navigation');
}

async function readButtonVisualState(locator: import('@playwright/test').Locator) {
  return locator.evaluate((button) => {
    const style = window.getComputedStyle(button);

    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      color: style.color,
      runState: button.getAttribute('data-run-state'),
    };
  });
}

function apiBaseUrl() {
  return process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
}

async function getWithNetworkRetry(page: import('@playwright/test').Page, url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await page.request.get(url);
    } catch (error) {
      lastError = error;

      if (attempt < 4) {
        await page.waitForTimeout(250 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to GET ${url}`);
}

async function expectCompactIdeSurfaceFitsViewport(page: import('@playwright/test').Page, label: string) {
  const root = page.locator('.bolt-responsive-ide-mobile').first();

  if (!(await root.isVisible().catch(() => false))) {
    return;
  }

  const metrics = await root.evaluate(() => {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

    const selectors = [
      '[data-testid="ide-service-panel"]',
      '[data-testid="ide-agent-panel"]',
      '[data-testid="responsive-code-editor"]',
      '.bolt-workbench-mobile',
      '.bolt-workbench-mobile-service',
      '.bolt-project-agent-shell',
      '.bolt-project-agent-composer',
      '.bolt-project-ide-panel-header',
      '.bolt-mobile-replit-nav',
    ];

    const surfaces = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return {
          selector,
          display: style.display,
          visibility: style.visibility,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      }),
    );

    return {
      documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      surfaces: surfaces.filter(
        (surface) =>
          surface.display !== 'none' && surface.visibility !== 'hidden' && surface.width > 0 && surface.height > 0,
      ),
      viewportWidth,
    };
  });

  expect(metrics.documentOverflowsX, `${label} document horizontal overflow`).toBe(false);

  for (const surface of metrics.surfaces) {
    expect(surface.left, `${label} ${surface.selector} left edge`).toBeGreaterThanOrEqual(-1);
    expect(surface.right, `${label} ${surface.selector} right edge`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  }
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
  await expectCompactIdeSurfaceFitsViewport(page, `${panel} service panel`);
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

async function expectMobileBottomNavigationIsTouchSafe(page: import('@playwright/test').Page) {
  const metrics = await mobileBottomNavigation(page).evaluate((nav) => {
    const navRect = nav.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

    const buttons = Array.from(nav.querySelectorAll('button'))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);

        return {
          ariaLabel: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
          bottom: rect.bottom,
          display: style.display,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          visibility: style.visibility,
          width: rect.width,
        };
      })
      .filter(
        (button) =>
          button.display !== 'none' &&
          button.visibility !== 'hidden' &&
          button.width > 0 &&
          button.height > 0 &&
          button.right >= 0 &&
          button.left <= viewportWidth,
      );

    return {
      buttons,
      documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      navBottom: navRect.bottom,
      navLeft: navRect.left,
      navRight: navRect.right,
      navTop: navRect.top,
      viewportHeight,
      viewportWidth,
    };
  });

  expect(metrics.documentOverflowsX).toBe(false);
  expect(metrics.navLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.navRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.navTop).toBeGreaterThanOrEqual(0);
  expect(metrics.navBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);

  for (const button of metrics.buttons) {
    expect(button.left, `${button.ariaLabel} left edge`).toBeGreaterThanOrEqual(0);
    expect(button.right, `${button.ariaLabel} right edge`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(button.width, `${button.ariaLabel} touch width`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${button.ariaLabel} touch height`).toBeGreaterThanOrEqual(44);
  }
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

async function expectFloatingSurfaceFitsViewport(
  locator: import('@playwright/test').Locator,
  label: string,
  options: { minInteractiveHeight?: number; requireSearchFontSize?: boolean; minVisibleOptions?: number } = {},
) {
  const metrics = await locator.evaluate(
    (surface, assertionOptions) => {
      const surfaceRect = surface.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

      const interactiveElements = Array.from(
        surface.querySelectorAll('button, input, select, textarea, [role="option"], [role="menuitem"]'),
      )
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);

          return {
            height: rect.height,
            isVisible:
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom >= surfaceRect.top &&
              rect.top <= viewportHeight,
            left: rect.left,
            right: rect.right,
            text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            width: rect.width,
          };
        })
        .filter((element) => element.isVisible);
      const searchInput = surface.querySelector(
        'input[role="searchbox"], input[aria-label^="Search"], input[type="search"], input[type="text"], input:not([type])',
      ) as HTMLInputElement | null;
      const visibleOptions = Array.from(surface.querySelectorAll('[role="option"]')).filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).length;

      return {
        bottom: surfaceRect.bottom,
        documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
        interactiveElements,
        left: surfaceRect.left,
        right: surfaceRect.right,
        searchFontSize: searchInput ? Number.parseFloat(window.getComputedStyle(searchInput).fontSize) : undefined,
        top: surfaceRect.top,
        viewportHeight,
        viewportWidth,
        visibleOptions,
        minInteractiveHeight: assertionOptions.minInteractiveHeight ?? 0,
      };
    },
    {
      minInteractiveHeight: options.minInteractiveHeight,
    },
    { timeout: 5_000 },
  );

  expect(metrics.documentOverflowsX, `${label} document horizontal overflow`).toBe(false);
  expect(metrics.left, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(metrics.top, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(metrics.right, `${label} right edge`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bottom, `${label} bottom edge`).toBeLessThanOrEqual(metrics.viewportHeight + 1);

  if (options.requireSearchFontSize) {
    expect(metrics.searchFontSize ?? 0, `${label} search input font size`).toBeGreaterThanOrEqual(16);
  }

  if (typeof options.minVisibleOptions === 'number') {
    expect(metrics.visibleOptions, `${label} visible options`).toBeGreaterThanOrEqual(options.minVisibleOptions);
  }

  for (const element of metrics.interactiveElements) {
    expect(element.left, `${label} interactive left: ${element.text}`).toBeGreaterThanOrEqual(0);
    expect(element.right, `${label} interactive right: ${element.text}`).toBeLessThanOrEqual(metrics.viewportWidth + 1);

    if (metrics.minInteractiveHeight > 0) {
      expect(element.height, `${label} interactive height: ${element.text}`).toBeGreaterThanOrEqual(
        metrics.minInteractiveHeight,
      );
    }
  }
}

async function openAgentModelSettings(page: import('@playwright/test').Page) {
  const selector = page.getByTestId('agent-model-selector');

  if (await selector.isVisible().catch(() => false)) {
    return;
  }

  const composer = page.getByTestId('ide-agent-composer');
  const toolsMenu = page.getByTestId('composer-tools-menu');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await composer.getByRole('button', { name: 'More composer tools' }).click({ force: true });

    if (await toolsMenu.isVisible().catch(() => false)) {
      break;
    }

    await expect(toolsMenu)
      .toBeVisible({ timeout: 3_000 })
      .catch(() => undefined);
  }

  await expect(toolsMenu).toBeVisible({ timeout: 10_000 });
  await expectFloatingSurfaceFitsViewport(toolsMenu, 'composer tools menu', { minInteractiveHeight: 44 });

  const settingsButton = toolsMenu.getByTestId('composer-tools-menu-settings');
  await expect(settingsButton).toBeVisible({ timeout: 10_000 });
  await settingsButton.click();
  await expect(selector).toBeVisible({ timeout: 10_000 });
}

async function expectAgentModelSelectorFitsViewport(page: import('@playwright/test').Page) {
  await openAgentModelSettings(page);

  const selectorMetrics = await page.getByTestId('agent-model-selector').evaluate((selector) => {
    const selectorRect = selector.getBoundingClientRect();

    const fields = Array.from(selector.querySelectorAll('[data-testid$="-combobox"]')).map((field) => {
      const rect = field.getBoundingClientRect();

      return {
        height: rect.height,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });

    return {
      bottom: selectorRect.bottom,
      documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      fields,
      left: selectorRect.left,
      right: selectorRect.right,
      top: selectorRect.top,
      viewportWidth: window.innerWidth,
    };
  });

  expect(selectorMetrics.documentOverflowsX).toBe(false);
  expect(selectorMetrics.left).toBeGreaterThanOrEqual(0);
  expect(selectorMetrics.right).toBeLessThanOrEqual(selectorMetrics.viewportWidth + 1);

  for (const field of selectorMetrics.fields) {
    expect(field.left).toBeGreaterThanOrEqual(0);
    expect(field.right).toBeLessThanOrEqual(selectorMetrics.viewportWidth + 1);
    expect(field.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByTestId('agent-provider-combobox').click();

  const providerListbox = page.getByTestId('agent-provider-listbox');
  await expect(providerListbox).toBeVisible({ timeout: 10_000 });
  await expect(providerListbox.getByTestId('agent-provider-option').first()).toBeVisible({ timeout: 10_000 });

  try {
    await expectFloatingSurfaceFitsViewport(providerListbox, 'provider selector dropdown', {
      minInteractiveHeight: 44,
      minVisibleOptions: 1,
      requireSearchFontSize: true,
    });
  } catch {
    await page.getByTestId('agent-provider-combobox').click();
    await expect(providerListbox).toBeVisible({ timeout: 10_000 });
    await expectFloatingSurfaceFitsViewport(providerListbox, 'provider selector dropdown after reopen', {
      minInteractiveHeight: 44,
      minVisibleOptions: 1,
      requireSearchFontSize: true,
    });
  }

  const preferredProvider = providerListbox
    .getByTestId('agent-provider-option')
    .filter({ hasText: /Anthropic/ })
    .first();
  const providerToSelect = (await preferredProvider.isVisible().catch(() => false))
    ? preferredProvider
    : providerListbox.getByTestId('agent-provider-option').first();

  await providerToSelect.click({ force: true });
  await expect(providerListbox).toHaveCount(0);

  await page.getByTestId('agent-model-combobox').click();

  const modelListbox = page.getByTestId('agent-model-listbox');
  await expect(modelListbox).toBeVisible({ timeout: 10_000 });

  const modelReadyState = modelListbox
    .getByTestId('agent-model-option')
    .first()
    .or(modelListbox.getByText(/Loading models|No models/i).first());

  await expect(modelReadyState).toBeVisible({ timeout: 20_000 });

  const hasModelOption = await modelListbox
    .getByTestId('agent-model-option')
    .first()
    .isVisible()
    .catch(() => false);

  await expectFloatingSurfaceFitsViewport(modelListbox, 'model selector dropdown', {
    minInteractiveHeight: 44,
    minVisibleOptions: hasModelOption ? 1 : undefined,
    requireSearchFontSize: true,
  });
  await page.keyboard.press('Escape');
  await expect(modelListbox).toHaveCount(0);
}

async function expectSettingsAiControlsFitViewport(page: import('@playwright/test').Page) {
  const metrics = await page.getByTestId('settings-hub-panel').evaluate((hub) => {
    const controls = Array.from(
      hub.querySelectorAll(
        '.bolt-project-agent-policy select, .bolt-project-ai-routing select, .bolt-project-ai-routing input:not([type="checkbox"]):not([type="hidden"]), .bolt-project-ai-routing button, .bolt-project-settings-provider-grid select, .bolt-project-settings-provider-grid input:not([type="hidden"]), .bolt-project-settings-provider-grid button',
      ),
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return {
          height: rect.height,
          left: rect.left,
          right: rect.right,
          text:
            element.getAttribute('aria-label') ||
            element.getAttribute('name') ||
            element.textContent?.replace(/\s+/g, ' ').trim() ||
            element.tagName,
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          width: rect.width,
        };
      })
      .filter((control) => control.visible);

    return {
      controls,
      documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.documentOverflowsX).toBe(false);
  expect(metrics.controls.length).toBeGreaterThanOrEqual(6);

  for (const control of metrics.controls) {
    expect(control.left, String(control.text)).toBeGreaterThanOrEqual(0);
    expect(control.right, String(control.text)).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(control.height, String(control.text)).toBeGreaterThanOrEqual(42);
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

async function expectMobileWebviewStartupFitsViewport(
  page: import('@playwright/test').Page,
  label: string,
  outputPath?: string,
) {
  const webview = page.locator('.bolt-workbench-mobile .bolt-project-webview-tool').first();

  await expect(webview).toBeVisible({ timeout: 45_000 });

  const metrics = await webview.evaluate((tool) => {
    function visible(element: Element | null) {
      if (!element) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    const toolbar = tool.querySelector('.bolt-project-webview-toolbar') as HTMLElement | null;
    const frame = tool.querySelector('.bolt-project-webview-frame') as HTMLElement | null;
    const viewport = tool.querySelector('.bolt-project-webview-viewport') as HTMLElement | null;
    const overlay = tool.querySelector('[data-testid="preview-loading-overlay"]') as HTMLElement | null;
    const splash = tool.querySelector('[data-testid="preview-splash-sequence"]') as HTMLElement | null;
    const card = tool.querySelector('.bolt-preview-loading-card') as HTMLElement | null;
    const deviceSelect = tool.querySelector('select[aria-label="Preview device"]') as HTMLElement | null;
    const mobileNav = document.querySelector('.bolt-mobile-replit-nav') as HTMLElement | null;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

    if (!toolbar || !frame || !viewport || !overlay || !card) {
      throw new Error('Missing mobile webview layout element');
    }

    const toolbarRect = toolbar.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const selectRect = deviceSelect?.getBoundingClientRect();
    const mobileNavStyle = mobileNav ? window.getComputedStyle(mobileNav) : undefined;

    const mobileNavRect =
      mobileNav &&
      mobileNavStyle?.display !== 'none' &&
      mobileNavStyle?.visibility !== 'hidden' &&
      mobileNav.getBoundingClientRect().height > 0
        ? mobileNav.getBoundingClientRect()
        : undefined;

    return {
      cardBottom: cardRect.bottom,
      cardTop: cardRect.top,
      documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
      frameBottom: frameRect.bottom,
      frameLeft: frameRect.left,
      frameRight: frameRect.right,
      mobileNavTop: mobileNavRect?.top,
      overlayBottom: overlayRect.bottom,
      overlayVisible: visible(overlay),
      selectLeft: selectRect?.left,
      selectRight: selectRect?.right,
      splashVisible: visible(splash),
      toolbarBottom: toolbarRect.bottom,
      toolbarLeft: toolbarRect.left,
      toolbarRight: toolbarRect.right,
      toolbarTop: toolbarRect.top,
      viewportBottom: viewportRect.bottom,
      viewportHeight,
      viewportLeft: viewportRect.left,
      viewportRight: viewportRect.right,
      viewportTop: viewportRect.top,
      viewportWidth,
    };
  });

  expect(metrics.documentOverflowsX, `${label} document horizontal overflow`).toBe(false);
  expect(metrics.toolbarLeft, `${label} toolbar left`).toBeGreaterThanOrEqual(0);
  expect(metrics.toolbarRight, `${label} toolbar right`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.frameLeft, `${label} frame left`).toBeGreaterThanOrEqual(0);
  expect(metrics.frameRight, `${label} frame right`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.viewportLeft, `${label} viewport left`).toBeGreaterThanOrEqual(metrics.frameLeft - 1);
  expect(metrics.viewportRight, `${label} viewport right`).toBeLessThanOrEqual(metrics.frameRight + 1);
  expect(metrics.overlayVisible, `${label} startup overlay visible`).toBe(true);
  expect(metrics.splashVisible, `${label} splash under startup overlay`).toBe(false);
  expect(metrics.cardTop, `${label} loading card top`).toBeGreaterThanOrEqual(metrics.viewportTop - 1);
  expect(metrics.cardBottom, `${label} loading card bottom`).toBeLessThanOrEqual(metrics.overlayBottom + 1);

  if (typeof metrics.selectLeft === 'number' && typeof metrics.selectRight === 'number') {
    expect(metrics.selectLeft, `${label} device select left`).toBeGreaterThanOrEqual(metrics.toolbarLeft - 1);
    expect(metrics.selectRight, `${label} device select right`).toBeLessThanOrEqual(metrics.toolbarRight + 1);
  }

  if (typeof metrics.mobileNavTop === 'number') {
    expect(metrics.frameBottom, `${label} frame bottom nav overlap`).toBeLessThanOrEqual(metrics.mobileNavTop - 1);
  } else {
    expect(metrics.frameBottom, `${label} frame bottom viewport`).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  }

  if (outputPath) {
    await page.screenshot({ path: outputPath, fullPage: false });
  }
}

test.describe('responsive IDE shell', () => {
  test('desktop keeps the full IDE workspace available', { tag: '@runtime' }, async ({ page }, testInfo) => {
    test.skip(isCompactIdeProject(testInfo), 'desktop-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive desktop project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="responsive-code-editor"]').first()).toBeVisible({ timeout: 45000 });
    await expect(page.getByRole('button', { name: /^(Run|Stop)$/ })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="ide-agent-panel"]').first()).toBeVisible();
    await expect(page.locator('.bolt-responsive-ide-desktop')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Project library panel' })).toBeVisible({ timeout: 15000 });
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

  test('desktop can collapse and restore the right preview panel', { tag: '@runtime' }, async ({ page }, testInfo) => {
    test.skip(isCompactIdeProject(testInfo), 'desktop-only assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive files toggle project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^(Run|Stop)$/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('complementary', { name: 'Project library panel' })).toBeVisible({ timeout: 15000 });

    const filesPanelToggle = page.getByTestId('ide-files-panel-toggle');
    await expect(filesPanelToggle).toBeVisible();
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Close the files panel');

    await filesPanelToggle.click();
    await expect(page.getByRole('complementary', { name: 'Project library panel' })).toHaveCount(0);
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Open the files panel');

    await filesPanelToggle.click();
    await expect(page.getByRole('complementary', { name: 'Project library panel' })).toBeVisible({ timeout: 15000 });
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Close the files panel');

    await page.getByRole('button', { name: 'Close right panel' }).click();
    await expect(page.getByRole('complementary', { name: 'Project library panel' })).toHaveCount(0);
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Open the files panel');
    await expect(page.locator('[data-testid="ide-agent-panel"]').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Editor and preview' })).toBeVisible();

    await page.locator('.bolt-project-ide-rail-item[aria-label^="Files"]').click();
    await expect(page.getByRole('complementary', { name: 'Project library panel' })).toBeVisible({ timeout: 15000 });
    await expect(filesPanelToggle).toHaveAttribute('aria-label', 'Close the files panel');
  });

  test(
    'desktop opens terminal as a workspace panel from the panel URL',
    { tag: '@runtime' },
    async ({ page }, testInfo) => {
      test.skip(isCompactIdeProject(testInfo), 'desktop-only assertion');
      test.setTimeout(120_000);

      const projectId = await createTestProject(page, 'Responsive terminal panel project');

      await page.goto(`/projects/${projectId}/ide?panel=terminal`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('tab', { name: /Terminal/ })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('button', { name: 'Vibecore Terminal' })).toBeVisible({ timeout: 15000 });
      await expect(page).toHaveURL(/panel=terminal/);
    },
  );

  test('mobile exposes icon-only tab navigation for core IDE panels', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only assertion');
    test.setTimeout(180_000);

    const projectId = await createTestProject(page, 'Responsive mobile project');

    await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 45_000 });
    await expectMobileBottomNavigationIsTouchSafe(page);

    await expect(page.getByTestId('tab-preview')).toBeVisible();
    await expect(page.getByTestId('tab-agent')).toBeVisible();
    await expect(page.getByTestId('tab-deployments')).toBeVisible();
    await expectBottomTabLabelsHidden(page);
    await expect(mobileNav.getByTestId('button-add-tab')).toBeVisible();
    await expect(mobileNav.getByTestId('button-more')).toBeVisible();

    await mobileNav.getByTestId('button-tab-switcher').click();

    const tabSwitcher = page.getByTestId('mobile-tab-switcher');

    await expect(tabSwitcher).toBeVisible({ timeout: 10_000 });
    await expect(tabSwitcher.getByTestId('tab-card-preview')).toBeVisible();
    await tabSwitcher.getByTestId('input-search-tabs').fill('deploy');
    await expect(tabSwitcher.getByTestId('tab-card-deployments')).toBeVisible();
    await expect(tabSwitcher.getByTestId('tab-card-agent')).toHaveCount(0);
    await tabSwitcher.getByTestId('button-clear-search').click();
    await expect(tabSwitcher.getByTestId('tab-card-agent')).toBeVisible();
    await tabSwitcher.getByTestId('button-close-switcher').click();
    await expect(tabSwitcher).toHaveCount(0);

    await mobileNav.getByTestId('button-more').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toBeVisible({ timeout: 10_000 });
    await expectFloatingSurfaceFitsViewport(page.getByTestId('mobile-more-menu-sheet'), 'mobile more menu', {
      minInteractiveHeight: 44,
    });
    await expect(page.getByTestId('mobile-more-menu-database')).toContainText('Database');
    await expect(page.getByTestId('mobile-more-menu-settings')).toContainText('Settings');
    await page.getByTestId('mobile-more-menu-close').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toHaveCount(0);
  });

  test('tablet exposes icon-only tab navigation and one tools entry point', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'tablet-only assertion');
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1024, height: 768 });

    const projectId = await createTestProject(page, 'Responsive tablet named tabs project');

    await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });

    const mobileNav = page.getByRole('navigation', { name: 'IDE panels' });
    await expect(mobileNav).toBeVisible({ timeout: 45_000 });
    await expectMobileBottomNavigationIsTouchSafe(page);
    await expectBottomTabLabelsHidden(page);
    await expect(mobileNav.getByTestId('button-add-tab')).toBeVisible();
    await expect(mobileNav.getByTestId('button-more')).toBeVisible();

    const toolsSheet = await openMobileToolsSheet(page);
    await expect(toolsSheet).toBeVisible({ timeout: 15_000 });
    await expect(toolsSheet.getByTestId('tool-item-deployments')).toContainText('Deployments');
    await expect(toolsSheet.getByTestId('tool-item-object-storage')).toContainText('Object Storage');
    await expect(toolsSheet.getByTestId('tool-item-commands')).toContainText('Commands');
    await expect(toolsSheet.getByTestId('tool-item-share')).toContainText('Share');
    await toolsSheet.getByTestId('tool-item-settings').click();
    await expectMobileServicePanel(page, 'settings');
    await expectMobileBottomNavigationIsTouchSafe(page);
    await mobileNav.getByTestId('tab-deployments').click();
    await expectMobileServicePanel(page, 'deployments');

    await mobileNav.getByTestId('button-tab-switcher').click();

    const tabSwitcher = page.getByTestId('mobile-tab-switcher');

    await expect(tabSwitcher).toBeVisible({ timeout: 10_000 });
    await expect(tabSwitcher.getByTestId('tab-card-settings')).toBeVisible();
    await tabSwitcher.getByTestId('button-close-tab-settings').click();
    await expect(tabSwitcher.getByTestId('tab-card-settings')).toHaveCount(0);
    await tabSwitcher.getByTestId('button-new-tab').click();
    await expect(toolsSheet).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(toolsSheet).toBeHidden({ timeout: 10_000 });

    await mobileNav.getByTestId('button-more').click();
    await expect(page.getByTestId('mobile-more-menu-sheet')).toBeVisible({ timeout: 10_000 });
    await expectFloatingSurfaceFitsViewport(page.getByTestId('mobile-more-menu-sheet'), 'tablet more menu', {
      minInteractiveHeight: 44,
    });
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

  test('mobile and tablet apply settings theme preferences', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(150_000);

    const projectId = await createTestProject(page, 'Responsive settings theme project');

    await page.goto(`/projects/${projectId}/ide?panel=settings`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/panel=settings/, { timeout: 90_000 });
    await expect(page.locator('[data-testid="ide-service-panel"][data-panel="settings"]').first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByTestId('settings-hub-panel')).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('button-settings-tab-preferences').click();
    await expect(page.getByText('Appearance & Keyboard')).toBeVisible({ timeout: 15_000 });

    const preferencesForm = page
      .locator('form')
      .filter({ has: page.locator('input[name="intent"][value="preferences"]') })
      .first();

    const themeSelect = preferencesForm.locator('select[name="theme"]');
    const settingsStatus = page.locator('.bolt-project-settings-status');

    await expect(themeSelect).toBeVisible();

    for (const theme of ['light', 'dark'] as const) {
      await themeSelect.selectOption(theme);
      await preferencesForm.getByRole('button', { name: 'Save preferences' }).click();
      await expect(settingsStatus).toContainText('IDE preferences saved.', { timeout: 45_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
      await expect.poll(() => page.evaluate(() => window.localStorage.getItem('bolt_theme'))).toBe(theme);

      const persistedSettings = await getWithNetworkRetry(page, `/api/projects/${projectId}/ide-panel/settings`);

      expect(persistedSettings.ok(), await persistedSettings.text()).toBeTruthy();

      const persistedPayload = await persistedSettings.json();

      expect(persistedPayload.data?.settingsState?.preferences?.theme).toBe(theme);
    }
  });

  test('mobile and tablet keep agent model controls and composer menus usable', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(180_000);

    const projectId = await createTestProject(page, 'Responsive agent model controls project');

    await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('ide-agent-composer')).toBeVisible({ timeout: 45_000 });
    await expectCompactIdeSurfaceFitsViewport(page, 'agent panel');

    await expectAgentModelSelectorFitsViewport(page);

    const apiKeyManager = page.getByTestId('api-key-manager');

    if (await apiKeyManager.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Edit API Key' }).click();
      await expect(page.getByPlaceholder('Enter API Key')).toBeVisible({ timeout: 10_000 });

      const apiKeyMetrics = await apiKeyManager.evaluate((manager) => {
        const rect = manager.getBoundingClientRect();
        const input = manager.querySelector('input[type="password"]')?.getBoundingClientRect();

        return {
          documentOverflowsX: document.documentElement.scrollWidth > window.innerWidth + 1,
          inputHeight: input?.height ?? 0,
          inputLeft: input?.left ?? 0,
          inputRight: input?.right ?? 0,
          left: rect.left,
          right: rect.right,
          viewportWidth: window.innerWidth,
        };
      });

      expect(apiKeyMetrics.documentOverflowsX).toBe(false);
      expect(apiKeyMetrics.left).toBeGreaterThanOrEqual(0);
      expect(apiKeyMetrics.right).toBeLessThanOrEqual(apiKeyMetrics.viewportWidth + 1);
      expect(apiKeyMetrics.inputLeft).toBeGreaterThanOrEqual(0);
      expect(apiKeyMetrics.inputRight).toBeLessThanOrEqual(apiKeyMetrics.viewportWidth + 1);
      expect(apiKeyMetrics.inputHeight).toBeGreaterThanOrEqual(44);

      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByPlaceholder('Enter API Key')).toHaveCount(0);
    }

    await mobileBottomNavigation(page).getByTestId('tab-preview').click();
    await expect(page.locator('.bolt-responsive-ide-mobile')).toHaveAttribute('data-mobile-panel', 'preview', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('ide-agent-composer')).toHaveCount(0);
    await expect(page.locator('.bolt-project-agent-suggestions')).toHaveCount(0);
    await expectCompactIdeSurfaceFitsViewport(page, 'preview panel without agent composer');

    await mobileBottomNavigation(page).getByTestId('tab-agent').click();
    await expect(page.locator('.bolt-responsive-ide-mobile')).toHaveAttribute('data-mobile-panel', 'chat', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('ide-agent-composer')).toBeVisible({ timeout: 45_000 });
  });

  test('mobile and tablet keep command palette and panel action menus inside the viewport', async ({
    page,
  }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(180_000);

    const projectId = await createTestProject(page, 'Responsive compact command menus project');

    await page.goto(`/projects/${projectId}/ide?panel=agent`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bolt-responsive-ide-mobile')).toBeVisible({ timeout: 45_000 });

    const toolsSheet = await openMobileToolsSheet(page);
    await toolsSheet.getByTestId('tool-item-commands').click();

    const commandPalette = page.locator('.bolt-project-command-palette').first();
    await expect(commandPalette).toBeVisible({ timeout: 10_000 });
    await expectFloatingSurfaceFitsViewport(commandPalette, 'command palette', {
      minInteractiveHeight: 44,
      requireSearchFontSize: true,
    });
    await commandPalette.getByRole('textbox', { name: 'Search commands' }).fill('settings');
    await expect(commandPalette.getByRole('button', { name: /Settings/ })).toBeVisible({ timeout: 10_000 });
    await expectFloatingSurfaceFitsViewport(commandPalette, 'filtered command palette', {
      minInteractiveHeight: 44,
      requireSearchFontSize: true,
    });
    await page.keyboard.press('Escape');
    await expect(commandPalette).toHaveCount(0);

    await page.goto(`/projects/${projectId}/ide?panel=settings`, { waitUntil: 'domcontentloaded' });
    await expectMobileServicePanel(page, 'settings');
    await page.getByTestId('ide-panel-actions').click();

    const panelActions = page.locator('.bolt-project-panel-actions-menu').first();
    await expect(panelActions).toBeVisible({ timeout: 10_000 });
    await expectFloatingSurfaceFitsViewport(panelActions, 'service panel actions menu', { minInteractiveHeight: 44 });
    await page.keyboard.press('Escape');
    await expect(panelActions).toHaveCount(0);
  });

  test('mobile and tablet keep AI provider settings controls responsive', async ({ page }, testInfo) => {
    test.skip(!isCompactIdeProject(testInfo), 'compact IDE assertion');
    test.setTimeout(120_000);

    const projectId = await createTestProject(page, 'Responsive AI settings controls project');

    await page.goto(`/projects/${projectId}/ide?panel=settings`, { waitUntil: 'domcontentloaded' });
    await expectMobileServicePanel(page, 'settings');
    await expect(page.getByTestId('settings-hub-panel')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('button-settings-tab-ai').click();
    await expect(page.getByText('AI Provider Controls')).toBeVisible({ timeout: 15_000 });
    await expectSettingsTabRailFitsViewport(page);
    await expectSettingsAiControlsFitViewport(page);
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
    await expectCompactIdeSurfaceFitsViewport(page, 'editor run panel');

    const runButton = mobileBottomNavigation(page).getByTestId('button-play-stop');
    await expect(runButton).toBeVisible({ timeout: 15_000 });

    const initialRunLabel = await runButton.getAttribute('aria-label');
    const initialRunVisualState = await readButtonVisualState(runButton);
    const editorRunButton = page.getByTestId('mobile-editor-run-toggle');
    await expect(editorRunButton).toBeVisible({ timeout: 15_000 });

    const initialEditorRunVisualState = await readButtonVisualState(editorRunButton);

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

    await expect(runButton).toHaveAttribute('aria-label', /^(Starting project|Stop running)$/, { timeout: 45_000 });
    await expect(runButton).toHaveAttribute('aria-pressed', 'true');
    await expect(runButton).toHaveAttribute('data-run-state', /^(starting|running|static)$/);
    await expect(runButton).toHaveClass(/bolt-mobile-replit-run--active/);
    await expect(runButton.locator('span').first()).toHaveClass(/i-ph:square-fill/);

    const activeRunVisualState = await readButtonVisualState(runButton);

    if (initialRunLabel === 'Run project') {
      expect(activeRunVisualState).not.toEqual(initialRunVisualState);
    }

    await expect(
      page.getByTestId('preview-splash-sequence').or(page.getByTestId('preview-loading-overlay')).first(),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('preview-iframe')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('preview-loading-overlay')).toContainText(/Starting npm run dev|Building|Ready/, {
      timeout: 45_000,
    });
    await expect(runButton).toHaveAttribute('aria-label', /^(Starting project|Stop running)$/, { timeout: 15_000 });
    await expect(runButton).toHaveAttribute('data-run-state', /^(starting|running|static)$/);

    await mobileBottomNavigation(page).getByTestId('tab-editor').click();
    await expect(page.locator('.bolt-responsive-ide-mobile')).toHaveAttribute('data-mobile-panel', 'editor', {
      timeout: 15_000,
    });
    await expect(editorRunButton).toHaveAttribute('aria-label', /^(Starting project|Stop running)$/, {
      timeout: 15_000,
    });
    await expect(editorRunButton).toHaveAttribute('aria-pressed', 'true');
    await expect(editorRunButton).toHaveAttribute('data-run-state', /^(starting|running|static)$/);
    await expect(editorRunButton.locator('span').first()).toHaveClass(/i-ph:square-fill/);

    const activeEditorRunVisualState = await readButtonVisualState(editorRunButton);

    if (initialRunLabel === 'Run project') {
      expect(activeEditorRunVisualState).not.toEqual(initialEditorRunVisualState);
    }
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
    await expectMobileWebviewStartupFitsViewport(
      page,
      testInfo.project.name,
      testInfo.outputPath(`webview-startup-layout-${testInfo.project.name}.png`),
    );

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
      const preferenceResponse = await page.request.post(`/api/projects/${projectId}/ide-panel/settings`, {
        form: {
          creditAlertThreshold: '80',
          intent: 'preferences',
          keyboardMode: 'false',
          theme,
        },
      });

      expect(preferenceResponse.ok()).toBe(true);

      await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.bolt-responsive-ide')).toHaveAttribute('data-mobile-panel', 'chat', {
        timeout: 15_000,
      });
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);

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
