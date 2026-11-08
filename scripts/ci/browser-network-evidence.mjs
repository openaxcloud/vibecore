/** Classify in memory; never retain arbitrary URLs, errors, IDs or request data. */
export function projectRequestFailure(request, time = Date.now()) {
  let error = 'other';
  let resource = 'other';
  let origin = 'other';
  let route = 'other';

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

  return { time: Number.isFinite(time) ? time : null, error, resource, origin, route };
}
export function createBrowserNetworkEvidence() {
  const events = [];

  let total = 0;

  return {
    capture(request) {
      total++;

      if (events.length === 128) {
        events.splice(32, 1);
      }

      events.push(projectRequestFailure(request));
    },
    snapshot() {
      return { total, omitted: Math.max(0, total - events.length), events: [...events] };
    },
  };
}
