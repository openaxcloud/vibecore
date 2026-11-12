import { createHash } from 'node:crypto';
import type { Page, Request, Response, Route } from '@playwright/test';

type Transport = 'native' | 'data';
type Category = `${'list' | 'schema'}-${Transport}`;
type Phase = 'navigation' | 'open-panel' | 'pending-verified' | 'ready-verified' | 'tables-verified';
type Stage =
  | 'fetch'
  | 'body'
  | 'integrity'
  | 'fulfill'
  | 'continue'
  | 'duplicate'
  | 'unheld-response'
  | 'request-failed';
type Event = { event: string; elapsedMs: number; category?: Category; status?: number; stage?: Stage };
type HeldResponse = {
  status: number;
  bytes: number;
  upstreamReadyMs: number;
  deliveredMs?: number;
  unchanged: boolean;
};

/** Attempt every cleanup step, without ever replacing the scenario's first error. */
export async function withDatabaseCleanup(work: () => Promise<void>, cleanup: (() => Promise<void>)[]) {
  let failed = false;
  let firstError: unknown;

  for (const step of [work, ...cleanup]) {
    try {
      await step();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }

  if (failed) {
    throw firstError;
  }
}

/** Never put URLs, project IDs, headers, response bodies or exception messages in diagnostics. */
export function databaseRequestCategory(
  url: string,
  method: string,
  origin: string,
  panelPath: string,
): Category | null {
  const parsed = new URL(url);

  if (method !== 'GET' || parsed.origin !== origin) {
    return null;
  }

  const transport = parsed.pathname === panelPath ? 'native' : parsed.pathname === `${panelPath}.data` ? 'data' : null;

  return transport ? `${parsed.searchParams.has('schemaKey') ? 'schema' : 'list'}-${transport}` : null;
}

/** Arm before navigation: retain the real upstream bytes for BOTH browser transports. */
export async function installDatabaseResponseGate(page: Page, projectId: string, appBaseUrl: string) {
  const origin = new URL(appBaseUrl).origin;
  const panelPath = `/api/projects/${projectId}/ide-panel/database`;
  const pattern = '**/api/projects/*/ide-panel/database*';
  const startedAt = Date.now();
  const events: Event[] = [];
  const responses: HeldResponse[] = [];
  const pending = new Set<Promise<void>>();
  const failedRequests = new WeakSet<Request>();

  let omittedEvents = 0;
  let released = false;
  let requestedAt = 0;
  let initialRequests = 0;
  let listRequests = 0;
  let routeListRequests = 0;
  let failure: Error | undefined;
  let release!: () => void;
  let ready!: () => void;
  let fail!: (error: Error) => void;

  const gate = new Promise<void>((resolve) => (release = resolve));
  const firstReady = new Promise<void>((resolve) => (ready = resolve));
  const failed = new Promise<never>((_, reject) => (fail = reject));

  // The rejection remains available to every guard, even if it precedes the first waiter.
  void failed.catch(() => undefined);

  function record(event: string, detail: Omit<Event, 'event' | 'elapsedMs'> = {}) {
    if (events.length === 128) {
      omittedEvents += 1;
      return;
    }

    events.push({ event, elapsedMs: Date.now() - startedAt, ...detail });
  }

  function reportFailure(stage: Stage, category?: Category) {
    record('failure', { stage, category });

    if (!failure) {
      failure = new Error(`Database response gate failed at ${stage}; see database-capture diagnostics`);
      fail(failure);
    }
  }

  const categoryOf = (request: Request) => databaseRequestCategory(request.url(), request.method(), origin, panelPath);

  const onRequest = (request: Request) => {
    const category = categoryOf(request);

    if (category) {
      record('browser-request', { category });

      if (category.startsWith('list-')) {
        listRequests += 1;

        if (listRequests > 1) {
          reportFailure('duplicate', category);
        }
      }
    }
  };
  const onResponse = (response: Response) => {
    const category = categoryOf(response.request());

    if (category) {
      record('browser-response', { category, status: response.status() });

      if (!released && category.startsWith('list-')) {
        reportFailure('unheld-response', category);
      }
    }
  };
  const onRequestFailed = (request: Request) => {
    const category = categoryOf(request);

    if (category) {
      failedRequests.add(request);
      reportFailure('request-failed', category);
    }
  };
  const routeHandler = (route: Route) => {
    const category = categoryOf(route.request());

    if (category) {
      record('route-entered', { category });
    }

    const isList = category?.startsWith('list-');

    if (isList) {
      routeListRequests += 1;
    }

    let stage: Stage = 'continue';

    const handler = (async () => {
      try {
        if (!isList || released) {
          await route.continue();
          return;
        }

        initialRequests += 1;
        requestedAt ||= Date.now();

        if (initialRequests !== 1) {
          stage = 'duplicate';
          throw new Error('More than one initial list request');
        }

        stage = 'fetch';

        const response = await route.fetch({ timeout: 60_000, maxRetries: 0, maxRedirects: 0 });
        record('upstream-response', { category: category!, status: response.status() });

        if (response.status() !== 200) {
          throw new Error('Unexpected upstream status');
        }

        stage = 'body';

        const bytes = await response.body();
        const fingerprint = createHash('sha256').update(bytes).digest('hex');

        const held: HeldResponse = {
          status: response.status(),
          bytes: bytes.length,
          upstreamReadyMs: Date.now() - startedAt,
          unchanged: false,
        };
        responses.push(held);
        record('upstream-body-ready', { category: category! });
        ready();
        await gate;

        if (failedRequests.has(route.request())) {
          stage = 'request-failed';
          throw new Error('Browser cancelled the retained request');
        }

        stage = 'integrity';

        if (createHash('sha256').update(bytes).digest('hex') !== fingerprint) {
          throw new Error('Upstream body changed');
        }

        stage = 'fulfill';
        await route.fulfill({ response, body: bytes });
        held.unchanged = true;
        held.deliveredMs = Date.now() - startedAt;
        record('delivered', { category: category! });
      } catch {
        // Surface the failed stage immediately without copying sensitive upstream errors.
        reportFailure(stage, category ?? undefined);
        await route.abort().catch(() => undefined);
      }
    })();
    pending.add(handler);
    void handler.finally(() => pending.delete(handler));

    return handler;
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const removeObservers = () => {
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  };

  try {
    await page.route(pattern, routeHandler);
  } catch (error) {
    removeObservers();
    throw error;
  }

  record('armed');

  function releaseResponses() {
    if (!released) {
      released = true;
      record('released');
      release();
    }
  }

  return {
    mark(phase: Phase) {
      if (['navigation', 'open-panel', 'pending-verified', 'ready-verified', 'tables-verified'].includes(phase)) {
        record(phase);
      }
    },
    async guard<T>(work: () => Promise<T>): Promise<T> {
      if (failure) {
        throw failure;
      }

      return Promise.race([work(), failed]);
    },
    async waitForInitialResponse() {
      if (failure) {
        throw failure;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.race([
          firstReady,
          failed,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              record('initial-response-timeout');
              failure ??= new Error(
                'No retained initial database response after 60000 ms; see database-capture diagnostics',
              );
              fail(failure);
              reject(failure);
            }, 60_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    assertHealthy() {
      if (failure) {
        throw failure;
      }
    },
    release: releaseResponses,
    async settle() {
      await Promise.all([...pending]);
    },
    async dispose() {
      releaseResponses();

      try {
        // Stop admitting handlers before draining, including ones entering during unroute.
        await page.unroute(pattern, routeHandler);
      } finally {
        try {
          while (pending.size > 0) {
            await Promise.all([...pending]);
          }
        } finally {
          removeObservers();
        }
      }
    },
    get requestedAt() {
      return requestedAt;
    },
    snapshot() {
      return {
        elapsedMs: Date.now() - startedAt,
        initialRequests,
        listRequests,
        routeListRequests,
        requestedMs: requestedAt ? requestedAt - startedAt : null,
        responses: responses.map((response) => ({ ...response })),
        events: events.map((event) => ({ ...event })),
        omittedEvents,
        failed: Boolean(failure),
      };
    },
  };
}
