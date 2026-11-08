/** Classify in memory; never retain arbitrary URLs, errors, IDs or request data. */
export function projectRequestFailure(request, time = Date.now(), phase = 'unknown') {
  let error = 'other';
  let resource = 'other';
  let origin = 'other';
  let route = 'other';
  let ageMs = null;

  try {
    const start = request.timing().startTime;

    if (Number.isFinite(start) && start > 0 && Number.isFinite(time) && time >= start) {
      ageMs = Math.min(75 * 60_000, Math.floor(time - start));
    }
  } catch {
    /* Timing may be unavailable for a closed request. */
  }

  try {
    const errors = {
      'net::ERR_NETWORK_CHANGED': 'networkChanged',
      'net::ERR_ABORTED': 'aborted',
      'net::ERR_CONNECTION_REFUSED': 'connectionRefused',
      'net::ERR_CONNECTION_RESET': 'connectionReset',
      'net::ERR_TIMED_OUT': 'timedOut',
      'net::ERR_NAME_NOT_RESOLVED': 'nameNotResolved',
      'net::ERR_FAILED': 'failed',
    };

    const code = request.failure()?.errorText;
    error = Object.hasOwn(errors, code) ? errors[code] : 'other';

    const kind = request.resourceType();

    if (['document', 'script', 'stylesheet', 'image', 'font', 'xhr', 'fetch', 'websocket'].includes(kind)) {
      resource = kind;
    }

    const url = new URL(request.url());

    if (['http:', 'https:'].includes(url.protocol)) {
      if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        origin = { 5173: 'app', 3001: 'api', 3020: 'preview', 5174: 'admin' }[url.port] ?? 'loopbackOther';
      } else if (/^[a-z0-9-]+-\d+\.localhost$/.test(url.hostname) && url.port === '3020') {
        origin = 'preview';
      } else {
        origin = 'external';
      }

      if (/^\/assets\/[^/]+\.(?:js|mjs)$/.test(url.pathname)) {
        route = 'builtScript';
      } else if (url.pathname.startsWith('/api/runtime/')) {
        route = 'runtimeApi';
      } else if (/\/(?:projects|workspaces)\/[^/]+\/ide-state$/.test(url.pathname)) {
        route = 'ideState';
      } else if (url.pathname.startsWith('/api/')) {
        route = 'appApi';
      } else if (/^\/(?:@vite|@fs|node_modules)\//.test(url.pathname)) {
        route = 'devAsset';
      } else if (resource === 'document') {
        route = 'document';
      }
    }
  } catch {
    /* Missing/closed request data stays in fixed unknown categories. */
  }

  return {
    time: Number.isFinite(time) ? time : null,
    error,
    resource,
    origin,
    route,
    ageMs,
    phase: ['initial', 'loading', 'interactive', 'loaded', 'closed'].includes(phase) ? phase : 'unknown',
  };
}
export function createBrowserNetworkEvidence() {
  const events = [];
  const phases = new WeakMap();

  let total = 0;

  return {
    trackPage(page) {
      let frame;

      try {
        frame = page.mainFrame();
      } catch {
        return () => {};
      }

      const set = (phase) => phases.set(frame, phase);
      set('initial');

      const onRequest = (request) => {
        try {
          if (request.isNavigationRequest() && request.frame() === frame) {
            set('loading');
          }
        } catch {
          /* Detached frames have no usable lifecycle. */
        }
      };

      const onDom = () => set('interactive');
      const onLoad = () => set('loaded');

      const stop = () => {
        set('closed');
        page.off('request', onRequest);
        page.off('domcontentloaded', onDom);
        page.off('load', onLoad);
        page.off('close', stop);
      };
      page.on('request', onRequest);
      page.on('domcontentloaded', onDom);
      page.on('load', onLoad);
      page.on('close', stop);

      return stop;
    },
    capture(request) {
      total++;

      if (events.length === 128) {
        events.splice(32, 1);
      }

      let phase = 'unknown';

      try {
        phase = phases.get(request.frame()) ?? 'unknown';
      } catch {
        /* Detached request. */
      }
      events.push(projectRequestFailure(request, Date.now(), phase));
    },
    snapshot() {
      return { total, omitted: Math.max(0, total - events.length), events: [...events] };
    },
  };
}
