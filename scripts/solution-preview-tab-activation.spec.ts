import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { activatePreviewTab } from './solution-preview-tab-activation.js';

type ActivationFixture = 'complete' | 'selection-only' | 'url-only';

type FixtureOptions = {
  activePaneIndexes?: number[];
  diagnosticTestId?: string;
  initialPreviewTabId?: string;
  mode?: ActivationFixture;
  panePreviewCounts?: number[];
  rerenderPreviewTabId?: string;
};

function fixtureDocument(options: FixtureOptions = {}): string {
  const config = {
    activePaneIndexes: options.activePaneIndexes ?? [0],
    diagnosticTestId: options.diagnosticTestId ?? null,
    initialPreviewTabId: options.initialPreviewTabId ?? 'tab-preview-default',
    mode: options.mode ?? 'complete',
    panePreviewCounts: options.panePreviewCounts ?? [1],
    rerenderPreviewTabId: options.rerenderPreviewTabId ?? null,
  };

  return `<!doctype html>
    <html>
      <head>
        <style>
          .bolt-project-main-panes { display: flex; gap: 16px; }
          .bolt-project-pane-leaf { min-width: 260px; padding: 8px; }
          .bolt-project-tab-main { min-width: 120px; min-height: 36px; }
        </style>
      </head>
      <body>
        <main id="fixture-root"></main>
        <script>
          const config = ${JSON.stringify(config)};
          const root = document.querySelector('#fixture-root');
          window.previewClickCount = 0;
          window.clickedPaneIds = [];

          const previewId = (paneIndex, tabIndex) => {
            if (paneIndex === 0 && tabIndex === 0) {
              return window.previewClickCount > 0 && config.rerenderPreviewTabId
                ? config.rerenderPreviewTabId
                : config.initialPreviewTabId;
            }

            return 'tab-preview-' + paneIndex + '-' + tabIndex;
          };

          const render = (selectedPaneIndex = -1, selectedTabIndex = -1) => {
            root.replaceChildren();

            const panes = document.createElement('div');
            panes.className = 'bolt-project-main-panes';

            config.panePreviewCounts.forEach((previewCount, paneIndex) => {
              const pane = document.createElement('section');
              pane.className = 'bolt-project-pane-leaf';
              pane.dataset.paneId = 'pane-' + paneIndex;
              pane.dataset.active = String(config.activePaneIndexes.includes(paneIndex));

              const tabBar = document.createElement('div');
              tabBar.className = 'bolt-project-tabbar';

              const tabs = document.createElement('div');
              tabs.className = 'bolt-project-tabs';
              tabs.setAttribute('role', 'tablist');

              for (let tabIndex = 0; tabIndex < previewCount; tabIndex += 1) {
                const tabId = previewId(paneIndex, tabIndex);
                const tab = document.createElement('div');
                tab.setAttribute('role', 'tab');
                tab.setAttribute('data-panel', 'preview');
                tab.setAttribute('data-tab-id', tabId);
                tab.setAttribute(
                  'data-testid',
                  paneIndex === 0 && tabIndex === 0 && config.diagnosticTestId
                    ? config.diagnosticTestId
                    : 'tab-' + tabId,
                );
                tab.setAttribute(
                  'aria-selected',
                  String(selectedPaneIndex === paneIndex && selectedTabIndex === tabIndex),
                );

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'bolt-project-tab-main';
                button.title = 'Webview';
                button.textContent = 'Webview';
                button.addEventListener('click', () => {
                  window.previewClickCount += 1;
                  window.clickedPaneIds.push(pane.dataset.paneId);

                  if (config.mode !== 'selection-only') {
                    history.pushState({}, '', '?panel=preview');
                  }

                  render(config.mode === 'url-only' ? -1 : paneIndex, config.mode === 'url-only' ? -1 : tabIndex);
                });

                tab.appendChild(button);
                tabs.appendChild(tab);
              }

              tabBar.appendChild(tabs);
              pane.appendChild(tabBar);
              panes.appendChild(pane);
            });

            root.appendChild(panes);
          };

          render();
        </script>
      </body>
    </html>`;
}

async function mountFixture(page: Page, options: FixtureOptions = {}): Promise<void> {
  await page.route('https://preview-tab.test/**', (route) =>
    route.fulfill({
      body: fixtureDocument(options),
      contentType: 'text/html',
      status: 200,
    }),
  );
  await page.goto('https://preview-tab.test/projects/proof/ide');
}

describe.sequential('Solutions Preview tab activation', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('activates the production default Preview tab without assuming a static test id', async () => {
    await mountFixture(page);

    await activatePreviewTab(page, 2_000);

    expect(await page.getByTestId('tab-preview').count()).toBe(0);
    expect(await page.getByTestId('tab-tab-preview-default').getAttribute('aria-selected')).toBe('true');
    expect(new URL(page.url()).searchParams.get('panel')).toBe('preview');
    expect(await page.evaluate('window.previewClickCount')).toBe(1);
  });

  it('re-resolves the semantic Preview tab when persisted restoration changes its UUID after click', async () => {
    const initialId = 'tab-preview-11111111-1111-4111-8111-111111111111';
    const restoredId = 'tab-preview-22222222-2222-4222-8222-222222222222';

    await mountFixture(page, {
      initialPreviewTabId: initialId,
      rerenderPreviewTabId: restoredId,
    });

    await activatePreviewTab(page, 2_000);

    expect(await page.getByTestId(`tab-${initialId}`).count()).toBe(0);
    expect(await page.getByTestId(`tab-${restoredId}`).getAttribute('aria-selected')).toBe('true');
    expect(await page.evaluate('window.previewClickCount')).toBe(1);
  });

  it('targets only the Preview tab in the single active pane when two panes are visible', async () => {
    await mountFixture(page, {
      activePaneIndexes: [1],
      panePreviewCounts: [1, 1],
    });

    await activatePreviewTab(page, 2_000);

    expect(await page.evaluate('window.clickedPaneIds')).toEqual(['pane-1']);
    expect(
      await page
        .locator('.bolt-project-pane-leaf[data-pane-id="pane-1"] [role="tab"][data-panel="preview"]')
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      await page
        .locator('.bolt-project-pane-leaf[data-pane-id="pane-0"] [role="tab"][data-panel="preview"]')
        .getAttribute('aria-selected'),
    ).toBe('false');
  });

  it.each([
    ['no Preview tab', [0]],
    ['two Preview tabs', [2]],
  ])('fails closed when the active pane exposes %s', async (_label, panePreviewCounts) => {
    await mountFixture(page, { panePreviewCounts });

    await expect(activatePreviewTab(page, 250)).rejects.toThrow(
      'The active IDE pane must expose exactly one visible Preview tab',
    );
    expect(await page.evaluate('window.previewClickCount')).toBe(0);
  });

  it.each([
    ['no active pane', []],
    ['two active panes', [0, 1]],
  ])('fails closed when the desktop layout has %s', async (_label, activePaneIndexes) => {
    await mountFixture(page, { activePaneIndexes, panePreviewCounts: [1, 1] });

    await expect(activatePreviewTab(page, 250)).rejects.toThrow(
      'The desktop IDE must expose exactly one visible active pane',
    );
    expect(await page.evaluate('window.previewClickCount')).toBe(0);
  });

  it('fails closed when the diagnostic test id is unrelated to the production tab id', async () => {
    await mountFixture(page, { diagnosticTestId: 'tab-preview' });

    await expect(activatePreviewTab(page, 250)).rejects.toThrow(
      'does not match the production tab-tab-preview-default diagnostic relation',
    );
    expect(await page.evaluate('window.previewClickCount')).toBe(0);
  });

  it('fails closed when the rerender does not prove tab selection', async () => {
    await mountFixture(page, { mode: 'url-only' });

    await expect(activatePreviewTab(page, 250)).rejects.toThrow(
      'Preview tab activation was not proven: the active [data-panel="preview"] tab did not reach aria-selected="true".',
    );
  });

  it('fails closed when selection changes without the Preview URL state', async () => {
    await mountFixture(page, { mode: 'selection-only' });

    await expect(activatePreviewTab(page, 250)).rejects.toThrow(
      'Preview tab activation was not proven: the IDE URL did not reach panel=preview.',
    );
  });
});
