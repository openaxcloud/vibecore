import { test as base } from '@playwright/test';
import { loadEnv } from 'vite';

/* Diagnostic fixture only: no store writes, runtime substitution or timing changes. */
export const test = base.extend<{ fileTabDiagnostics: { mark: (phase: string) => void } }>({
  fileTabDiagnostics: [
    async ({ page }, use, testInfo) => {
      const started = Date.now();
      const events: object[] = [];

      let phase = 'setup';
      let firstMonacoMs: number | null = null;
      let ideNavigationMs: number | null = null;
      let monacoContentReadyMs: number | null = null;
      let lastDom: unknown = null;
      let droppedEvents = 0;

      const record = (event: object) => {
        if (events.length === 128) {
          events.shift();
          droppedEvents++;
        }

        events.push({ ms: Date.now() - started, phase, ...event });
      };

      await page.exposeFunction('__fileTabDiagnostic', (state: { monacoPresent: boolean }) => {
        lastDom = state;

        if (firstMonacoMs === null && state.monacoPresent) {
          firstMonacoMs = Date.now() - started;
        }

        record({ kind: 'dom', state });
      });
      await page.addInitScript(() => {
        if (window !== window.top) {
          return;
        }

        const diagnosticWindow = window as typeof window & {
          __fileTabDiagnostic: (state: unknown) => Promise<void>;
        };

        let last = '';
        let pending = false;

        const sample = () => {
          pending = false;

          const tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab-id]'))
            .slice(0, 12)
            .map((tab) => {
              const label = tab.getAttribute('aria-label') ?? '';
              const rect = tab.getBoundingClientRect();
              const style = getComputedStyle(tab);
              const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              const id = tab.getAttribute('data-tab-id') ?? '';

              return {
                id: /^tab-[a-zA-Z0-9-]{1,100}$/.test(id) ? id : '[redacted]',

                // Only the synthetic fixture's known labels may enter the attachment.
                ariaLabel:
                  /^(?:(?:Pinned tab: )?\/(?:audit\.txt|other\.txt|README\.md)(?:, unsaved changes)?|Editor|Pinned tab: Webview)$/.test(
                    label,
                  )
                    ? label
                    : '[redacted]',
                pinned: tab.getAttribute('data-pinned') === 'true',
                dirty: tab.getAttribute('data-dirty') === 'true',
                active: tab.getAttribute('aria-selected') === 'true',
                visible:
                  rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none',
                disabled: tab.hasAttribute('disabled') || tab.getAttribute('aria-disabled') === 'true',
                receivesCenterPointer: hit !== null && tab.contains(hit),
                pointerEvents: style.pointerEvents === 'none' ? 'none' : 'enabled',
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              };
            });

          const editors = Array.from(document.querySelectorAll('.monaco-editor .view-lines')).slice(0, 2);

          const state = {
            monacoPresent: editors.length > 0,
            editors: editors.map((editor) => ({
              original: editor.textContent?.includes('PERSISTENCE-ORIGINAL-20261012') ?? false,
              draft: editor.textContent?.includes('UNSAVED-A-UNIQUE') ?? false,
              second: editor.textContent?.includes('SECOND-DOCUMENT') ?? false,
              initial: editor.textContent?.includes('File tab identity audit') ?? false,
            })),
            tabs,
          };

          const serialized = JSON.stringify(state);

          if (serialized !== last) {
            last = serialized;
            void diagnosticWindow.__fileTabDiagnostic(state).catch(() => undefined);
          }
        };

        new MutationObserver(() => {
          if (!pending) {
            pending = true;
            requestAnimationFrame(sample);
          }
        }).observe(document, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['aria-label', 'aria-selected', 'data-pinned', 'data-dirty', 'style', 'class'],
        });
      });

      const requestKind = (url: string, method: string) => {
        const parsed = new URL(url);

        if (parsed.hostname === 'stackblitz.com' && parsed.pathname === '/headless') {
          return 'webcontainer-bootstrap';
        }

        if (/^\/api\/(runtime|runtime-token)(\/|$)/.test(parsed.pathname)) {
          return 'remote-runtime-api';
        }

        if (method !== 'GET' && /^\/api\/projects\/[^/]+\/files(?:\/|$)/.test(parsed.pathname)) {
          return 'file-write-api';
        }

        return null;
      };

      page.on('request', (request) => {
        const kind = requestKind(request.url(), request.method());

        if (kind) {
          record({ kind, event: 'request', method: request.method() });
        }
      });
      page.on('response', (response) => {
        const kind = requestKind(response.url(), response.request().method());

        if (kind) {
          record({ kind, event: 'response', status: response.status() });
        }
      });
      page.on('requestfailed', (request) => {
        const kind = requestKind(request.url(), request.method());

        if (kind) {
          record({ kind, event: 'failed' });
        }
      });
      page.on('console', (message) => {
        const text = message.text();

        if (/Autosave failed for \/(?:home\/project\/)?audit\.txt(?:\s|$)/.test(text)) {
          record({ kind: 'autosave-failed', file: 'audit.txt' });
        } else if (text.includes('FilesStore') && text.includes('File updated')) {
          // The existing product log does not identify the path: do not infer one.
          record({ kind: 'files-store-write-completed', file: 'unknown' });
        } else if (text.includes('FilesStore') && text.includes('Failed to update file content')) {
          record({ kind: 'files-store-write-failed', file: 'unknown' });
        }
      });

      await use({
        mark: (nextPhase) => {
          phase = nextPhase;

          if (phase === 'ide-navigation') {
            ideNavigationMs = Date.now() - started;
          }

          if (phase === 'monaco-initial-content-ready') {
            monacoContentReadyMs = Date.now() - started;
          }

          record({ kind: 'phase' });
        },
      });

      if (testInfo.status === testInfo.expectedStatus) {
        return;
      }

      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve();
        }, 2_000);
      });
      const collect = async () => {
        /*
         * Fixture teardown still runs after the original 30 s test timeout.
         * Trial clicks never activate a tab; their tiny budget is diagnostic only.
         */
        const domAtFailure = lastDom;
        const trials: Record<string, string> = {};

        for (const [name, locator] of [
          ['exactPinnedDraft', page.getByRole('tab', { name: 'Pinned tab: /audit.txt, unsaved changes', exact: true })],
          ['auditRegardlessOfDirtyLabel', page.locator('[role="tab"][data-tab-id]').filter({ hasText: 'audit.txt' })],
        ] as const) {
          if (expired) {
            return;
          }

          if (page.isClosed()) {
            trials[name] = 'page-closed';
            continue;
          }

          try {
            await locator.click({ trial: true, timeout: 500 });
            trials[name] = 'actionable';
          } catch {
            trials[name] = 'not-actionable-within-500ms';
          }
        }

        if (expired) {
          return;
        }

        const env = loadEnv('production', process.cwd(), ['RUNTIME_MODE', 'VITE_RUNTIME_MODE', 'VITE_SAAS_COMMERCIAL']);

        const mode = (value: string | undefined) =>
          value === 'remote-kubernetes' || value === 'webcontainer' ? value : value === undefined ? 'unset' : 'other';

        if (expired) {
          return;
        }

        await testInfo.attach('file-tab-failure-diagnostic', {
          contentType: 'application/json',
          body: JSON.stringify(
            {
              phase,
              firstMonacoMs,
              ideNavigationMs,
              monacoContentReadyMs,
              domAtFailure,
              actionabilityTrialsAfterFailure: trials,
              trialLimit:
                'Trial clicks may scroll; these observations follow the failure and do not prove prior actionability.',
              droppedEvents,
              runtimeConfiguration: {
                source: 'selected production build inputs on the test runner; browser requests are separate evidence',
                RUNTIME_MODE: mode(env.RUNTIME_MODE),
                VITE_RUNTIME_MODE: mode(env.VITE_RUNTIME_MODE),
                VITE_SAAS_COMMERCIAL: env.VITE_SAAS_COMMERCIAL === 'true',
              },
              saveEvidenceLimit:
                'No HTTP response or dirty flag alone proves a WebContainer write; absent completion evidence means unknown.',
              events,
            },
            null,
            2,
          ),
        });
      };

      try {
        // A diagnostic failure must never replace or add to the test failure.
        await Promise.race([collect().catch(() => undefined), deadline]);
      } finally {
        expired = true;
        clearTimeout(timer);
      }
    },
    { auto: true },
  ],
});
