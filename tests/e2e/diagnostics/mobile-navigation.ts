import { test as base } from '@playwright/test';

/** Read-only, bounded observations; no waits or changes to navigation/requests. */
export const test = base.extend<{ mobileNavigationDiagnostics: { mark: (phase: string) => void } }>({
  mobileNavigationDiagnostics: [
    async ({ page }, use, testInfo) => {
      const started = Date.now();
      const events: object[] = [];

      let dropped = 0;
      let phase = 'setup';

      const record = (event: object) => {
        if (events.length >= 160) {
          events.shift();
          dropped++;
        }

        events.push({ ms: Date.now() - started, phase, ...event });
      };
      const routeKind = (url: string) => {
        const path = new URL(url, 'http://localhost').pathname;

        if (/^\/dashboard(?:\.data)?$/.test(path)) {
          return 'dashboard';
        }

        if (/^\/projects\/[^/]+\/ide(?:\.data)?$/.test(path)) {
          return 'ide';
        }

        if (/^\/api\/projects\/[^/]+\/export\/zip$/.test(path)) {
          return 'archive';
        }

        if (/^\/login(?:\.data)?$/.test(path)) {
          return 'login';
        }

        return 'other';
      };
      await page.exposeFunction('__mobileNavigationSample', (state: object) => record({ kind: 'browser', state }));
      await page.addInitScript(() => {
        if (window !== window.top) {
          return;
        }

        const diagnosticWindow = window as typeof window & {
          __mobileNavigationSample: (state: object) => Promise<void>;
          __reactRouterDataRouter?: {
            state: {
              navigation?: { state?: string; location?: { pathname?: string } };
              location?: { pathname?: string };
            };
          };
        };
        const route = (path: string | undefined) => {
          if (path === undefined) {
            return 'none';
          }

          if (path === '/dashboard') {
            return 'dashboard';
          }

          if (/^\/projects\/[^/]+\/ide$/.test(path)) {
            return 'ide';
          }

          if (path === '/login') {
            return 'login';
          }

          return 'other';
        };

        let last = '';
        let emitted = 0;

        const sample = (event: string) => {
          const router = diagnosticWindow.__reactRouterDataRouter?.state;

          const state = {
            event,
            path: route(location.pathname),
            historyLength: history.length,
            historyIndex: typeof history.state?.idx === 'number' ? history.state.idx : null,
            ready: document.readyState,
            routerPath: route(router?.location?.pathname),
            navigation: ['idle', 'loading', 'submitting'].includes(router?.navigation?.state ?? '')
              ? router?.navigation?.state
              : 'unavailable',
            destination: route(router?.navigation?.location?.pathname),
            ideHeader: Boolean(document.querySelector('[data-testid="mobile-ide-header"]')),
            dashboardEnglishHeading: [...document.querySelectorAll('h1')].some(
              (node) => node.textContent === 'Dashboard',
            ),
            busyCount: Math.min(document.querySelectorAll('[aria-busy="true"], [role="progressbar"]').length, 20),
          };

          const serialized = JSON.stringify(state);

          if (serialized !== last && emitted < 120) {
            last = serialized;
            emitted++;
            void diagnosticWindow.__mobileNavigationSample(state).catch(() => undefined);
          }
        };
        window.addEventListener('popstate', () => sample('popstate'));
        window.addEventListener('pageshow', () => sample('pageshow'));
        window.addEventListener('pagehide', () => sample('pagehide'));

        const timer = setInterval(() => sample('sample'), 100);
        setTimeout(() => clearInterval(timer), 90_000);
      });
      page.on('request', (request) => {
        const route = routeKind(request.url());

        if (route !== 'other') {
          record({ kind: 'request', route, method: request.method(), redirected: Boolean(request.redirectedFrom()) });
        }
      });
      page.on('response', (response) => {
        const route = routeKind(response.url());

        if (route !== 'other') {
          const location = response.headers().location;
          record({
            kind: 'response',
            route,
            status: response.status(),
            redirectTarget: location ? routeKind(location) : 'none',
          });
        }
      });
      page.on('requestfailed', (request) => {
        const route = routeKind(request.url());

        if (route !== 'other') {
          record({ kind: 'request-failed', route });
        }
      });
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          record({ kind: 'frame-navigation', route: routeKind(frame.url()) });
        }
      });
      await use({
        mark: (nextPhase) => {
          phase = nextPhase;
          record({ kind: 'phase' });
        },
      });

      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        // Diagnostic failure must never replace the original test result.
        await Promise.race([
          testInfo
            .attach('mobile-navigation-diagnostic', {
              contentType: 'application/json',
              body: JSON.stringify({ status: testInfo.status, dropped, events }, null, 2),
            })
            .catch(() => undefined),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 2_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    { auto: false },
  ],
});
