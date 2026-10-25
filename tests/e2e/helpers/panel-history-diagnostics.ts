import type { Frame, Page, TestInfo } from '@playwright/test';

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

type FrameObservation = { at: number; event: string; [key: string]: unknown };
type BrowserProbe = { navigationApi: boolean; events: HistoryObservation[]; frames: FrameObservation[] };

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
  const frameEvents: FrameObservation[] = [];
  const frameIds = new WeakMap<Frame, number>();

  let nextFrameId = 0;

  const frameId = (frame: Frame) => {
    if (!frameIds.has(frame)) {
      frameIds.set(frame, ++nextFrameId);
    }

    return frameIds.get(frame)!;
  };
  const listeners = (['frameattached', 'framedetached', 'framenavigated'] as const).map((event) => {
    const listener = (frame: Frame) => {
      const url = frame.url();

      const entry: FrameObservation = {
        at: Date.now(),
        event,
        frame: frameId(frame),
        parent: frame.parentFrame() ? frameId(frame.parentFrame()!) : null,
        main: frame === page.mainFrame(),
        urlClass: url === 'about:blank' ? 'blank' : url === 'about:srcdoc' ? 'srcdoc' : url ? 'other' : 'empty',
      };
      frameEvents.push(entry);

      if (frameEvents.length > 48) {
        frameEvents.shift();
      }

      // Observation only; never await this sample in the test's action sequence.
      void page
        .evaluate(() => ({ idx: history.state?.idx ?? null, length: history.length }))
        .then((sample) => Object.assign(entry, sample, { sampledAt: Date.now() }))
        .catch(() => undefined);
    };

    if (event === 'frameattached') {
      page.on('frameattached', listener);
    } else if (event === 'framedetached') {
      page.on('framedetached', listener);
    } else {
      page.on('framenavigated', listener);
    }

    return { event, listener };
  });
  await page.addInitScript(() => {
    if (window !== window.top) {
      return;
    }

    type ObservedWindow = Window & {
      __panelHistoryDiagnostic?: BrowserProbe;
      navigation?: { addEventListener: (name: string, listener: (event: Event) => void) => void };
    };

    const observedWindow = window as ObservedWindow;
    const probe: BrowserProbe = { navigationApi: Boolean(observedWindow.navigation), events: [], frames: [] };
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

    const elements = new WeakMap<Element, number>();

    let nextElementId = 0;

    const elementId = (element: Element) => {
      if (!elements.has(element)) {
        elements.set(element, ++nextElementId);
      }

      return elements.get(element)!;
    };
    const hash = (value: string) => {
      let result = 2166136261;

      for (let index = 0; index < value.length; index++) {
        result = Math.imul(result ^ value.charCodeAt(index), 16777619);
      }

      return (result >>> 0).toString(16);
    };

    const classify = (value: string | null) =>
      value === null ? 'absent' : value === '' ? 'empty' : value === 'about:blank' ? 'blank' : 'other';

    const frameRecord = (event: string, element: Element, extra: Record<string, unknown> = {}) => {
      probe.frames.push({
        at: Date.now(),
        event,
        element: elementId(element),
        preview: element.getAttribute('data-testid') === 'preview-iframe',
        pane: Array.from(document.querySelectorAll('.bolt-project-pane-leaf')).indexOf(
          element.closest('.bolt-project-pane-leaf')!,
        ),
        idx: typeof history.state?.idx === 'number' ? history.state.idx : null,
        length: history.length,
        ...extra,
      });

      if (probe.frames.length > 48) {
        probe.frames.shift();
      }
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLIFrameElement) {
          const value = mutation.target.getAttribute(mutation.attributeName!);
          frameRecord('iframe-attribute', mutation.target, {
            attribute: mutation.attributeName,
            oldClass: classify(mutation.oldValue),
            newClass: classify(value),
            oldHash: hash(mutation.oldValue ?? ''),
            newHash: hash(value ?? ''),
            valueLength: value?.length ?? 0,
          });
        }

        if (mutation.type === 'childList') {
          for (const [event, nodes] of [
            ['iframe-added', mutation.addedNodes],
            ['iframe-removed', mutation.removedNodes],
          ] as const) {
            for (const node of Array.from(nodes)) {
              if (!(node instanceof Element)) {
                continue;
              }

              for (const iframe of [
                ...(node.matches('iframe') ? [node] : []),
                ...Array.from(node.querySelectorAll('iframe')),
              ]) {
                frameRecord(event, iframe, { srcClass: classify(iframe.getAttribute('src')) });
              }
            }
          }
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['src', 'srcdoc'],
    });
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

      for (const { event, listener } of listeners) {
        if (event === 'frameattached') {
          page.off('frameattached', listener);
        } else if (event === 'framedetached') {
          page.off('framedetached', listener);
        } else {
          page.off('framenavigated', listener);
        }
      }

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
        schema: 2,
        test: 'interrupted-move-browser-back',
        browserVersion: page.context().browser()?.version() ?? 'unavailable',
        navigationApi: probe?.navigationApi ?? false,
        historySource: 'Native events; phase history fields are the latest observed event, timestamped explicitly',
        events,
        frameSource:
          'DOM attributes sample top history synchronously; Playwright frame events sample it asynchronously at sampledAtMs. IDs are local counters, hashes FNV1a; no URLs or document contents.',
        frames: [...(probe?.frames ?? []), ...frameEvents]
          .sort((a, b) => a.at - b.at)
          .map(({ at, sampledAt, ...entry }) => ({
            timeMs: at - startedAt,
            ...entry,
            ...(typeof sampledAt === 'number' ? { sampledAtMs: sampledAt - startedAt } : {}),
          })),
        omittedFrameEvents: 0,
      };

      // Preserve all top-level navigation/phase observations, plus the beginning and end of frame activity.
      while (JSON.stringify(report).length > 19_500 && report.frames.length > 0) {
        report.frames.splice(report.frames.length > 12 ? 8 : 0, 1);
        report.omittedFrameEvents++;
      }

      const body = JSON.stringify(report);
      console.log(`PANEL_HISTORY_DIAGNOSTIC ${body}`);
      await testInfo
        .attach('panel-history-diagnostic.json', { body, contentType: 'application/json' })
        .catch(() => console.log('PANEL_HISTORY_DIAGNOSTIC_ATTACHMENT_UNAVAILABLE'));
    },
  };
}
