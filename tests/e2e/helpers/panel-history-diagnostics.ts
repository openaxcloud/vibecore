import type { Page, TestInfo } from '@playwright/test';

type HistoryObservation = {
  at: number;
  event: string;
  url: string;
  idx: number | null;
  key: string | null;
  length: number;
  destination?: string;
  destinationIndex?: number | null;
};

type BrowserProbe = { navigationApi: boolean; events: HistoryObservation[] };

/** Log only the two panel URLs used by this test, never arbitrary query values or project identifiers. */
function panelUrl(raw: string) {
  try {
    const url = new URL(raw);

    const path = /^\/projects\/[^/]+\/ide$/.test(url.pathname)
      ? '/projects/:projectId/ide'
      : /^\/@[^/]+\/[^/]+$/.test(url.pathname)
        ? '/@:account/:project'
        : '[other-route]';

    const panel = url.searchParams.get('panel');

    return `${path}?panel=${panel === 'preview' || panel === 'deployments' ? panel : '[other-panel]'}`;
  } catch {
    return '[unavailable]';
  }
}

/** Setup runs before navigation; marks are synchronous and final collection runs after the test's existing cleanup. */
export async function installPanelHistoryDiagnostics(page: Page) {
  const startedAt = Date.now();
  const phases: Array<{ at: number; event: string; url: string }> = [];
  await page.addInitScript(() => {
    type ObservedWindow = Window & {
      __panelHistoryDiagnostic?: BrowserProbe;
      navigation?: { addEventListener: (name: string, listener: (event: Event) => void) => void };
    };

    const observedWindow = window as ObservedWindow;
    const probe: BrowserProbe = { navigationApi: Boolean(observedWindow.navigation), events: [] };
    observedWindow.__panelHistoryDiagnostic = probe;

    // This function is serialized into the page and must not close over module values.
    const safeUrl = (raw: string) => {
      try {
        const url = new URL(raw, location.href);

        const path = /^\/projects\/[^/]+\/ide$/.test(url.pathname)
          ? '/projects/:projectId/ide'
          : /^\/@[^/]+\/[^/]+$/.test(url.pathname)
            ? '/@:account/:project'
            : '[other-route]';

        const panel = url.searchParams.get('panel');

        return `${path}?panel=${panel === 'preview' || panel === 'deployments' ? panel : '[other-panel]'}`;
      } catch {
        return '[unavailable]';
      }
    };
    const record = (event: string, destination?: { url?: string; index?: number }) => {
      const state = history.state as { idx?: unknown; key?: unknown } | null;
      probe.events.push({
        at: Date.now(),
        event,
        url: safeUrl(location.href),
        idx: typeof state?.idx === 'number' ? state.idx : null,
        key: typeof state?.key === 'string' && /^[a-z\d_-]{1,32}$/i.test(state.key) ? state.key : null,
        length: history.length,
        ...(destination
          ? {
              destination: safeUrl(destination.url ?? location.href),
              destinationIndex: typeof destination.index === 'number' ? destination.index : null,
            }
          : {}),
      });

      if (probe.events.length > 48) {
        probe.events.shift();
      }
    };
    observedWindow.navigation?.addEventListener('navigate', (event) => {
      const navigation = event as Event & { navigationType?: string; destination?: { url?: string; index?: number } };

      const kind = ['push', 'replace', 'traverse', 'reload'].includes(navigation.navigationType ?? '')
        ? navigation.navigationType
        : 'unknown';
      record(`navigate:${kind}`, navigation.destination);
    });
    observedWindow.navigation?.addEventListener('currententrychange', () => record('currententrychange'));
    addEventListener('popstate', () => record('popstate'));
    record('initial');
  });

  return {
    mark(event: string) {
      phases.push({ at: Date.now(), event, url: panelUrl(page.url()) });
    },
    async flush(testInfo: TestInfo) {
      const probe = await page
        .evaluate(() => (window as Window & { __panelHistoryDiagnostic?: BrowserProbe }).__panelHistoryDiagnostic)
        .catch(() => undefined);

      const browserEvents = probe?.events ?? [];

      const markedPhases = phases.map((phase) => {
        const last = browserEvents.filter((entry) => entry.at <= phase.at).at(-1);

        return {
          ...phase,
          idx: last?.idx ?? null,
          key: last?.key ?? null,
          length: last?.length ?? null,
          historyObservedAtMs: last ? last.at - startedAt : null,
        };
      });
      const events = [...browserEvents, ...markedPhases]
        .sort((a, b) => a.at - b.at)
        .map(({ at, ...entry }) => ({ timeMs: at - startedAt, ...entry }));
      const report = {
        schema: 1,
        test: 'interrupted-move-browser-back',
        browserVersion: page.context().browser()?.version() ?? 'unavailable',
        navigationApi: probe?.navigationApi ?? false,
        historySource: 'Native events; phase history fields are the latest observed event, timestamped explicitly',
        events,
      };

      const body = JSON.stringify(report);
      console.log(`PANEL_HISTORY_DIAGNOSTIC ${body}`);
      await testInfo
        .attach('panel-history-diagnostic.json', { body, contentType: 'application/json' })
        .catch(() => console.log('PANEL_HISTORY_DIAGNOSTIC_ATTACHMENT_UNAVAILABLE'));
    },
  };
}
