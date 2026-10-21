import type { Page, Request, Response } from '@playwright/test';

/** Runs inside page.evaluate; keep it self-contained and emit only allowlisted metadata. */
export function collectIdeFailureState() {
  const visible = (node: Element) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  };

  const count = (selector: string) => Array.from(document.querySelectorAll(selector)).filter(visible).length;
  const editors = Array.from(document.querySelectorAll('[data-testid="tab-editor"]')).slice(0, 4);

  const containers = Array.from(document.querySelectorAll('[data-testid="ide-service-panel"][data-panel="database"]'));
  const visibleContainers = containers.filter(visible);

  const headings = containers
    .flatMap((container) => Array.from(container.querySelectorAll('h2')))
    .filter((node) => ['All databases', 'Toutes les bases de données'].includes(node.textContent?.trim() ?? ''));

  const heading = visibleContainers
    .flatMap((container) => Array.from(container.querySelectorAll('h2')))
    .find(
      (node) =>
        visible(node) && ['All databases', 'Toutes les bases de données'].includes(node.textContent?.trim() ?? ''),
    );

  const database = heading?.parentElement?.parentElement;

  const hasDbText = (copies: string[]) =>
    Array.from(database?.querySelectorAll('p') ?? []).some((node) => copies.includes(node.textContent?.trim() ?? ''));

  const panel = document.querySelector('[data-mobile-panel]')?.getAttribute('data-mobile-panel');

  return {
    mobilePanel: ['editor', 'files', 'chat', 'deploy', 'preview', 'terminal'].includes(panel ?? '') ? panel : 'other',
    databaseTabActive: document.querySelector('[data-testid="tab-database"]')?.getAttribute('aria-pressed') === 'true',
    databaseMounted: containers.length > 0,
    databaseVisible: visibleContainers.length > 0,
    databaseOuterBusy: visibleContainers.some((container) =>
      Array.from(container.querySelectorAll('[aria-busy="true"]')).some(visible),
    ),
    databaseHeadingPresent: headings.length > 0,
    databaseHeadingVisible: Boolean(heading && visible(heading)),
    databasePanelInUrl: new URL(window.location.href).searchParams.get('panel') === 'database',
    databaseEmpty: hasDbText(['No database yet', 'Aucune base de données pour le moment']),
    databaseLoadFailed: hasDbText(['Could not load the databases.', 'Impossible de charger les bases de données.']),
    databaseInnerLoading: Boolean(database?.querySelector('[role="status"]')),
    securityRows: count('.bolt-panel-row'),
    gitSourceFields: count('[data-testid="git-tab-pr-source"]'),
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
}

type RequestKind = 'env-vars' | 'databases' | 'database-panel' | 'git-panel' | 'security-panel';
type RequestState = 'awaiting-response' | 'receiving-body' | 'finished' | 'failed';
type RequestEvidence = {
  id: number;
  kind: RequestKind;
  method: string;
  startedAtMs: number;
  state: RequestState;
  responseAtMs?: number;
  status?: number;
  finishedAtMs?: number;
  failedAtMs?: number;
  failureCode?: string;
};

const MAX_REQUESTS = 24;

const FAILURE_CODES = new Set([
  'ERR_ABORTED',
  'ERR_TIMED_OUT',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_CLOSED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_NETWORK_CHANGED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_FAILED',
]);

function requestKind(url: string): RequestKind | undefined {
  try {
    const path = new URL(url).pathname;

    return /\/env-vars$/.test(path)
      ? 'env-vars'
      : /\/databases$/.test(path)
        ? 'databases'
        : /\/ide-panel\/database(?:\.data)?$/.test(path)
          ? 'database-panel'
          : /\/ide-panel\/git(?:\.data)?$/.test(path)
            ? 'git-panel'
            : /\/ide-panel\/security(?:\.data)?$/.test(path)
              ? 'security-panel'
              : undefined;
  } catch {
    return undefined;
  }
}

/** No URL, headers, body, request identifier from the app, or raw failure text is emitted. */
export function createIdeRequestDiagnostics(started: number, clock = Date.now) {
  const requests = new Map<Request, RequestEvidence>();
  const responses: Array<{ kind: RequestKind; status: number; elapsedMs: number }> = [];

  let droppedRequests = 0;

  const onRequest = (request: Request) => {
    const kind = requestKind(request.url());

    if (!kind || requests.has(request)) {
      return;
    }

    if (requests.size >= MAX_REQUESTS) {
      droppedRequests += 1;
      return;
    }

    const method = request.method();
    requests.set(request, {
      id: requests.size + 1,
      kind,
      method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method) ? method : 'OTHER',
      startedAtMs: clock() - started,
      state: 'awaiting-response',
    });
  };
  const onResponse = (response: Response) => {
    const kind = requestKind(response.url());

    if (!kind) {
      return;
    }

    const elapsedMs = clock() - started;

    if (responses.length < MAX_REQUESTS) {
      responses.push({ kind, status: response.status(), elapsedMs });
    }

    const record = requests.get(response.request());

    if (record) {
      record.status = response.status();
      record.responseAtMs = elapsedMs;
      record.state = 'receiving-body';
    }
  };
  const onRequestFinished = (request: Request) => {
    const record = requests.get(request);

    if (record) {
      record.finishedAtMs = clock() - started;
      record.state = 'finished';
    }
  };
  const onRequestFailed = (request: Request) => {
    const record = requests.get(request);

    if (record) {
      const code = /^(?:net::)?(ERR_[A-Z_]+)(?:$|[\s:])/.exec(request.failure()?.errorText ?? '')?.[1];
      record.failureCode = code && FAILURE_CODES.has(code) ? code : 'OTHER';
      record.failedAtMs = clock() - started;
      record.state = 'failed';
    }
  };

  return {
    onRequest,
    onResponse,
    onRequestFinished,
    onRequestFailed,
    snapshot() {
      const elapsedMs = clock() - started;
      const records = Array.from(requests.values(), (record) => ({ ...record }));

      return {
        responses: responses.map((response) => ({ ...response })),
        requests: records,
        pendingRequests: records
          .filter((record) => record.state === 'awaiting-response' || record.state === 'receiving-body')
          .map((record) => ({
            id: record.id,
            kind: record.kind,
            state: record.state,
            ageMs: elapsedMs - record.startedAtMs,
          })),
        droppedRequests,
      };
    },
  };
}

export async function withIdeRequestDiagnostics<T>(
  page: Pick<Page, 'on' | 'off'>,
  started: number,
  run: (diagnostics: ReturnType<typeof createIdeRequestDiagnostics>) => Promise<T>,
) {
  const diagnostics = createIdeRequestDiagnostics(started);
  page.on('request', diagnostics.onRequest);
  page.on('response', diagnostics.onResponse);
  page.on('requestfinished', diagnostics.onRequestFinished);
  page.on('requestfailed', diagnostics.onRequestFailed);

  try {
    return await run(diagnostics);
  } finally {
    page.off('request', diagnostics.onRequest);
    page.off('response', diagnostics.onResponse);
    page.off('requestfinished', diagnostics.onRequestFinished);
    page.off('requestfailed', diagnostics.onRequestFailed);
  }
}
