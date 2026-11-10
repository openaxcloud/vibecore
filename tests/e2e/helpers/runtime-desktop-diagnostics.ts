import { writeFile } from 'node:fs/promises';
import type { ConsoleMessage, Page, Request, Response, TestInfo } from '@playwright/test';

// Node-only test observer shared with the audit; outside the frontend ~/ alias.
// eslint-disable-next-line no-restricted-imports
import { createBrowserNetworkEvidence } from '../../../scripts/ci/browser-network-evidence.mjs';

// eslint-disable-next-line no-restricted-imports -- Shared test-only observer.
import { attachSecretsLifecycleEvidence } from '../../../scripts/ci/secrets-lifecycle-evidence.mjs';
import { createServiceProgress } from './runtime-service-progress';

const secretsLifecycle = new WeakMap<TestInfo, Awaited<ReturnType<typeof attachSecretsLifecycleEvidence>>>();

export async function startSecretsLifecycleEvidence(page: Page, testInfo: TestInfo) {
  secretsLifecycle.set(testInfo, await attachSecretsLifecycleEvidence(page));
}

const serviceProgress = new WeakMap<TestInfo, ReturnType<typeof createServiceProgress>>();

export function runtimeServiceProgress(testInfo: TestInfo) {
  let progress = serviceProgress.get(testInfo);

  if (!progress) {
    progress = createServiceProgress(Date.now(), () => testInfo.timeout);
    serviceProgress.set(testInfo, progress);
  }

  return progress;
}

const RESOURCE_KINDS = ['document', 'script', 'stylesheet', 'image', 'font', 'xhr', 'fetch', 'other'] as const;
type ResourceKind = (typeof RESOURCE_KINDS)[number];
type RuntimeCase = (fixtures: { page: Page; isMobile: boolean }, testInfo: TestInfo) => Promise<void>;

/** Browser-only observer. All emitted strings are fixed labels, never DOM content or URLs. */
export function installDesktopBrowserProbe() {
  if (window !== window.top) {
    return;
  }

  const target = window as unknown as {
    __vibecoreStartupMark?: (phase: string) => void;
    __desktopLayoutProbe?: {
      phases: Array<{ phase: string; at: number }>;
      changes: Array<{ surface: string; ids: number[]; at: number }>;
      clicks: Array<{ event: string; trusted: boolean; connected: boolean; at: number }>;
      dropped: number;
      id(element: Element): number;
      stop(): void;
    };
  };
  const allowedPhases = new Set([
    'entry-module-evaluated',
    'catalogues-ready',
    'hydrate-requested',
    'ide-route-evaluated',
    'chat-module-resolved',
    'layout-restore-requested',
    'layout-memory-ready',
    'layout-restored',
    'monaco-import-requested',
    'monaco-import-resolved',
    'monaco-effect-mounted',
    'monaco-create-start',
    'monaco-create-ready',
  ]);

  const previousMark = target.__vibecoreStartupMark;
  const phases: Array<{ phase: string; at: number }> = [];
  const changes: Array<{ surface: string; ids: number[]; at: number }> = [];
  const clicks: Array<{ event: string; trusted: boolean; connected: boolean; at: number }> = [];
  const ids = new WeakMap<Element, number>();
  const last = new Map<string, string>();

  const surfaces = [
    ['shell', '.bolt-responsive-ide'],
    ['agent', '[data-testid="ide-agent-panel"]'],
    ['palette', '[data-testid="ide-add-tab-command-palette"]'],
  ] as const;

  let nextId = 0;
  let stopped = false;

  const probe = {
    phases,
    changes,
    clicks,
    dropped: 0,
    id(element: Element) {
      if (!ids.has(element)) {
        ids.set(element, ++nextId);
      }

      return ids.get(element)!;
    },
    stop() {
      stopped = true;
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onClick, true);

      if (target.__vibecoreStartupMark === mark) {
        target.__vibecoreStartupMark = previousMark;
      }
    },
  };
  const mark = (phase: string) => {
    if (allowedPhases.has(phase)) {
      if (phases.length < 64) {
        phases.push({ phase, at: performance.now() });
      } else {
        probe.dropped += 1;
      }
    }

    return previousMark?.(phase);
  };
  const onClick = (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest('.bolt-project-tool-menu button') : null;

    if (button) {
      if (clicks.length < 32) {
        clicks.push({
          event: event.type,
          trusted: event.isTrusted,
          connected: button.isConnected,
          at: performance.now(),
        });
      } else {
        probe.dropped += 1;
      }
    }
  };
  const sample = () => {
    if (stopped) {
      return;
    }

    for (const [surface, selector] of surfaces) {
      const currentIds = Array.from(document.querySelectorAll(selector)).slice(0, 4).map(probe.id);
      const signature = currentIds.join(',');

      if (last.get(surface) !== signature) {
        last.set(surface, signature);

        if (changes.length < 96) {
          changes.push({ surface, ids: currentIds, at: performance.now() });
        } else {
          probe.dropped += 1;
        }
      }
    }
  };

  const trackedSelector = surfaces.map(([, selector]) => selector).join(',');

  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) =>
      [...record.addedNodes, ...record.removedNodes].some(
        (node) => node instanceof Element && (node.matches(trackedSelector) || node.querySelector(trackedSelector)),
      ),
    );

    if (relevant) {
      sample();
    }
  });
  target.__desktopLayoutProbe = probe;
  target.__vibecoreStartupMark = mark;
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerdown', onClick, true);
  observer.observe(document, { childList: true, subtree: true });
  sample();
}

/** A bounded explicit projection, not a serialization of window/document or the probe itself. */
export function collectDesktopBrowserEvidence() {
  const target = window as unknown as {
    __desktopLayoutProbe?: {
      phases: Array<{ phase: string; at: number }>;
      changes: Array<{ surface: string; ids: number[]; at: number }>;
      clicks: Array<{ event: string; trusted: boolean; connected: boolean; at: number }>;
      dropped: number;
      id(element: Element): number;
      stop(): void;
    };
  };

  const probe = target.__desktopLayoutProbe;
  probe?.stop();

  const panel = new URL(window.location.href).searchParams.get('panel');
  const allowedPanels = ['snapshots', 'deployments', 'editor', 'files', 'preview', 'terminal', 'agent', 'settings'];

  return {
    capturedAt: performance.now(),
    probeInstalled: Boolean(probe),
    readyState: document.readyState,
    themeReady: document.documentElement.hasAttribute('data-ecode-theme-ready'),
    selectedPanel: panel === null ? null : allowedPanels.includes(panel) ? panel : 'other',
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scripts: {
      elements: document.scripts.length,
      resources: performance
        .getEntriesByType('resource')
        .filter((entry) => (entry as PerformanceResourceTiming).initiatorType === 'script').length,
    },
    phases: probe?.phases ?? [],
    changes: probe?.changes ?? [],
    clicks: probe?.clicks ?? [],
    dropped: probe?.dropped ?? 0,
    surfaces: [
      '[data-ecode-ide-boot-splash]',
      '.bolt-responsive-ide',
      '[data-testid="ide-agent-panel"]',
      '[data-testid="ide-add-tab-command-palette"]',
      '[data-testid="responsive-code-editor"]',
      '#root-error-heading',
    ].map((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));

      return {
        selector,
        count: elements.length,
        elements: elements.slice(0, 4).map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);

          return {
            id: probe?.id(element) ?? null,
            connected: element.isConnected,
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y,
            hidden: style.display === 'none' || style.visibility === 'hidden',
            desktop: element.classList.contains('bolt-responsive-ide-desktop'),
            compact: element.classList.contains('bolt-responsive-ide-mobile'),
          };
        }),
      };
    }),
  };
}

function resourceKind(request: Request): ResourceKind {
  const kind = request.resourceType();

  return RESOURCE_KINDS.includes(kind as ResourceKind) ? (kind as ResourceKind) : 'other';
}

/** Categorize locally; never retain the error text, stack, request URL, or any request data. */
function errorKind(name: string, message: string) {
  if (/hydration|Minified React error #(?:418|423)/i.test(message)) {
    return 'hydration';
  }

  if (/dynamically imported module|Loading chunk|ChunkLoadError/i.test(message)) {
    return 'module-load';
  }

  if (/i18n-catalogue|catalogue i18n/i.test(message)) {
    return 'catalogue';
  }

  return ['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError'].includes(name) ? name : 'other';
}

export function withDesktopLayoutEvidence(run: RuntimeCase): RuntimeCase {
  // Destructuring is required by Playwright's fixture dependency discovery.
  return async ({ page, isMobile }, testInfo) => {
    const requests = Object.fromEntries(
      RESOURCE_KINDS.map((kind) => [kind, { started: 0, finished: 0, failed: 0 }]),
    ) as Record<ResourceKind, { started: number; finished: number; failed: number }>;

    const networkFailures = createBrowserNetworkEvidence();
    const stopNetworkPhases = networkFailures.trackPage(page);
    const statuses = { success: 0, redirect: 0, clientError: 0, serverError: 0, other: 0 };
    const errors: Record<string, number> = {};
    const onRequest = (request: Request) => requests[resourceKind(request)].started++;
    const onFinished = (request: Request) => requests[resourceKind(request)].finished++;

    const onFailed = (request: Request) => {
      requests[resourceKind(request)].failed++;
      networkFailures.capture(request);
    };

    const onResponse = (response: Response) => {
      const status = response.status();

      const kind =
        status >= 500
          ? 'serverError'
          : status >= 400
            ? 'clientError'
            : status >= 300
              ? 'redirect'
              : status >= 200
                ? 'success'
                : 'other';
      statuses[kind] += 1;
    };
    const recordError = (name: string, message: string) => {
      const kind = errorKind(name, message);
      errors[kind] = (errors[kind] ?? 0) + 1;
    };

    const onError = (error: Error) => recordError(error.name, error.message);

    const onConsole = (message: ConsoleMessage) => {
      if (message.type() === 'error') {
        recordError('console', message.text());
      }
    };

    page.on('request', onRequest);
    page.on('requestfinished', onFinished);
    page.on('requestfailed', onFailed);
    page.on('response', onResponse);
    page.on('pageerror', onError);
    page.on('console', onConsole);

    // Starts at wrapper entry, not Playwright fixture setup. Remaining time is an estimate.
    runtimeServiceProgress(testInfo);

    try {
      await page.addInitScript(installDesktopBrowserProbe).catch(() => undefined);
      await run({ page, isMobile }, testInfo);
    } catch (error) {
      let deadline: ReturnType<typeof setTimeout> | undefined;

      try {
        if (testInfo.expectedStatus !== 'skipped') {
          const browser = await Promise.race([
            page.evaluate(collectDesktopBrowserEvidence).catch(() => null),
            new Promise<null>((resolve) => {
              deadline = setTimeout(() => resolve(null), 3_000);
            }),
          ]);

          const payload = JSON.stringify({
            browser,
            serviceProgress: serviceProgress.get(testInfo)?.snapshot(),
            secretsLifecycle: secretsLifecycle.get(testInfo)?.snapshot(),
            requests,
            statuses,
            errors,
            networkFailures: networkFailures.snapshot(),
          });
          await writeFile(
            testInfo.outputPath('desktop-layout-evidence.json'),
            Buffer.byteLength(payload, 'utf8') <= 64 * 1024
              ? payload
              : JSON.stringify({
                  browser: null,
                  serviceProgress: serviceProgress.get(testInfo)?.snapshot(),
                  secretsLifecycle: secretsLifecycle.get(testInfo)?.snapshot(),
                  requests,
                  statuses,
                  errors,
                  networkFailures: networkFailures.snapshot(),
                  omitted: 'size-limit',
                }),
          );
        }
      } catch {
        // Evidence failures cannot replace the scenario's original failure.
      } finally {
        clearTimeout(deadline);
      }

      throw error;
    } finally {
      secretsLifecycle.get(testInfo)?.stop();
      stopNetworkPhases();
      page.off('request', onRequest);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFailed);
      page.off('response', onResponse);
      page.off('pageerror', onError);
      page.off('console', onConsole);

      // Never wait inside the scenario's action budget; fixture teardown also disposes the document.
      void page
        .evaluate(() => {
          const target = window as unknown as { __desktopLayoutProbe?: { stop(): void } };
          target.__desktopLayoutProbe?.stop();
        })
        .catch(() => undefined);
    }
  };
}
