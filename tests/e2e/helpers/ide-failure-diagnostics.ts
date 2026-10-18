import { test as base, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

type Diagnostics = { mark(label: string): void };

async function state(page: Page) {
  return page.evaluate(() => {
    const visible = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    };

    const count = (selector: string) => Array.from(document.querySelectorAll(selector)).filter(visible).length;
    const editors = Array.from(document.querySelectorAll('[data-testid="tab-editor"]')).slice(0, 4);

    const heading = Array.from(document.querySelectorAll('h2')).find((node) =>
      ['All databases', 'Toutes les bases de données'].includes(node.textContent?.trim() ?? ''),
    );

    const database = heading?.parentElement?.parentElement;

    const hasDbText = (copies: string[]) =>
      Array.from(database?.querySelectorAll('p') ?? []).some((node) => copies.includes(node.textContent?.trim() ?? ''));

    const panel = document.querySelector('[data-mobile-panel]')?.getAttribute('data-mobile-panel');

    return {
      mobilePanel: ['editor', 'files', 'chat', 'deploy', 'preview', 'terminal'].includes(panel ?? '') ? panel : 'other',
      databaseTabActive:
        document.querySelector('[data-testid="tab-database"]')?.getAttribute('aria-pressed') === 'true',
      databaseMounted: Boolean(database && visible(database)),
      databaseEmpty: hasDbText(['No database yet', 'Aucune base de données pour le moment']),
      databaseLoadFailed: hasDbText(['Could not load the databases.', 'Impossible de charger les bases de données.']),
      databaseLoading: Boolean(database?.querySelector('[role="status"]')),
      cards: count('[data-testid="db-carte"]'),
      tables: count('[data-testid="db-table"]'),
      statuses: count('[role="status"]'),
      alerts: count('[role="alert"]'),
      moreMenu: count('[data-testid="mobile-more-menu-sheet"]'),
      tabSwitcher: count('[data-testid="mobile-tab-switcher"]'),
      codeEditors: count('.cm-content'),
      editorTabs: editors.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          visible: visible(node),
          centerReceivesEvents: node.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          ),
          active: node.getAttribute('aria-pressed') === 'true',
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    };
  });
}

/** Bounded metadata only: no URLs, headers, response bodies, DOM text or screenshots. */
export const test = base.extend<{ ideDiagnostics: Diagnostics }>({
  ideDiagnostics: [
    async ({ page }, use, testInfo) => {
      const enabled =
        testInfo.title === 'la liste des tables n’est pas vide, et chaque ligne est nommée' ||
        testInfo.title === 'existing mobile menu keeps the file reachable after locale and navigation at 390px';

      const started = Date.now();
      const samples: Array<Record<string, unknown>> = [];

      let pendingSample: Promise<void> | undefined;

      const responses: unknown[] = [];

      const observe = (response: import('@playwright/test').Response) => {
        const path = new URL(response.url()).pathname;

        const kind = /\/env-vars$/.test(path)
          ? 'env-vars'
          : /\/databases$/.test(path)
            ? 'databases'
            : /\/ide-panel\/database$/.test(path)
              ? 'database-panel'
              : undefined;

        if (kind && responses.length < 24) {
          responses.push({ kind, status: response.status(), elapsedMs: Date.now() - started });
        }
      };
      const mark = (label: string) => {
        if (!enabled || samples.length >= 16) {
          return;
        }

        const sample: Record<string, unknown> = { label, elapsedMs: Date.now() - started };
        samples.push(sample);

        /*
         * Never spend the scenario's action budget waiting for diagnostics.
         * At most one DOM observation can be outstanding.
         */
        if (pendingSample) {
          sample.stateSkipped = true;
          return;
        }

        pendingSample = state(page)
          .then((snapshot) => {
            sample.state = snapshot;
            sample.observedAtMs = Date.now() - started;
          })
          .catch(() => {
            sample.unavailable = true;
          })
          .finally(() => {
            pendingSample = undefined;
          });
      };
      const bounded = async (operation: Promise<unknown>) => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        try {
          await Promise.race([
            operation,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 1000);
            }),
          ]);
        } catch {
          // Diagnostics must never replace the original failure.
        } finally {
          clearTimeout(timer);
        }
      };

      if (enabled) {
        page.on('response', observe);
      }

      try {
        await use({ mark });
      } finally {
        page.off('response', observe);

        if (enabled && testInfo.status !== testInfo.expectedStatus) {
          mark('failure');

          if (pendingSample) {
            await bounded(pendingSample);
          }

          /*
           * Keep the same bounded, secret-free evidence readable when an artifact
           * cannot be downloaded. No URLs, bodies, headers or DOM text are logged.
           */
          const metadata = JSON.stringify({ samples, responses });
          console.error(`IDE_FAILURE_METADATA ${metadata}`);

          await bounded(
            testInfo.attach('ide-failure-metadata', {
              body: metadata,
              contentType: 'application/json',
            }),
          );
        }
      }
    },
    { auto: false },
  ],
});
