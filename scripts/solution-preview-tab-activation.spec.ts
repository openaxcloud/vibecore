import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { activatePreviewTab } from './solution-preview-tab-activation.js';

type ActivationFixture = 'complete' | 'selection-only' | 'url-only';

function fixtureDocument(mode: ActivationFixture): string {
  return `<!doctype html>
    <html>
      <body>
        <main id="fixture-root"></main>
        <script>
          const mode = ${JSON.stringify(mode)};
          const root = document.querySelector('#fixture-root');
          window.previewClickCount = 0;

          const render = (selected) => {
            root.innerHTML = [
              '<div role="tablist">',
              '  <div role="tab" data-testid="tab-preview" aria-selected="' + String(selected) + '">',
              '    <button type="button" class="bolt-project-tab-main" title="Webview">Webview</button>',
              '  </div>',
              '</div>',
            ].join('');

            root.querySelector('[data-testid="tab-preview"] > button').addEventListener('click', () => {
              window.previewClickCount += 1;

              if (mode !== 'selection-only') {
                history.pushState({}, '', '?panel=preview');
              }

              render(mode !== 'url-only');
            });
          };

          render(false);
        </script>
      </body>
    </html>`;
}

async function mountFixture(page: Page, mode: ActivationFixture): Promise<void> {
  await page.route('https://preview-tab.test/**', (route) =>
    route.fulfill({
      body: fixtureDocument(mode),
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

  it('survives the SPA history navigation and tab rerender caused by the click', async () => {
    await mountFixture(page, 'complete');

    await activatePreviewTab(page, 2_000);

    expect(await page.getByTestId('tab-preview').getAttribute('aria-selected')).toBe('true');
    expect(new URL(page.url()).searchParams.get('panel')).toBe('preview');
    expect(await page.evaluate('window.previewClickCount')).toBe(1);
  });

  it('fails closed when the rerender does not prove tab selection', async () => {
    await mountFixture(page, 'url-only');

    await expect(activatePreviewTab(page, 250)).rejects.toThrow(
      'Preview tab activation was not proven: [data-testid="tab-preview"] did not reach aria-selected="true".',
    );
  });

  it('fails closed when selection changes without the Preview URL state', async () => {
    await mountFixture(page, 'selection-only');

    await expect(activatePreviewTab(page, 250)).rejects.toThrow(
      'Preview tab activation was not proven: the IDE URL did not reach panel=preview.',
    );
  });
});
