/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { createServer, type RequestListener, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { Socket } from 'node:net';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import ts from 'typescript';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseHeading } from '~/components/database/DatabaseHeading';
import {
  __resetProjectPanelCacheForTests,
  PROJECT_PANEL_CACHE_MAX,
  readProjectPanelCache,
  writeProjectPanelCache,
} from '~/lib/ide/panel-payload-cache';
import { createPanelRequest, waitForPanelRetry } from '~/lib/ide/panel-request';
import { createSingleFlight } from '~/lib/ide/single-flight';
import { classNames } from '~/utils/classNames';
import { projectPanelRefreshIntervalMs } from '~/utils/project-panel-refresh';

/*
 * Execute the actual private wrapper and button, extracted by AST instead of
 * copying their logic. Only unrelated UI/store/localization dependencies are
 * seams. Responses below are explicit HTTP fixtures, never claimed as real DBs.
 */
const app = resolve(import.meta.dirname, '../..');

function declarations(file: string, names: string[]) {
  const source = readFileSync(resolve(app, file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const nodes = tree.statements.filter(
    (node) =>
      (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some((d) => names.includes(d.name.getText(tree)))),
  );
  expect(nodes).toHaveLength(names.length);

  return nodes.map((node) => node.getText(tree).replace(/^export\s+/, '')).join('\n');
}

const wrapperSource = readFileSync(resolve(app, 'components/chat/BaseChat.tsx'), 'utf8');
const wrapperTree = ts.createSourceFile('BaseChat.tsx', wrapperSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

let fetchCallback = '';

function findFetch(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(wrapperTree) === 'fetchPanel' &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  ) {
    fetchCallback = node.initializer.arguments[0].getText(wrapperTree);
  }

  node.forEachChild(findFetch);
}
findFetch(wrapperTree);

const compiled = ts.transpileModule(
  [
    declarations('components/chat/BaseChat.tsx', [
      'PROJECT_PANEL_FETCH_MAX_ATTEMPTS',
      'PROJECT_PANEL_FETCH_BASE_RETRY_MS',
      'panneauEnVol',
      'PROJECT_PANEL_SLOW_LOAD_MS',
      'projectPanelFetchMethod',
      'projectPanelFetchRetryDelay',
      'shouldRetryProjectPanelFetch',
      'shouldRetryProjectPanelNetworkError',
      'ProjectIdeApiServicePanel',
    ]),
    declarations('components/project-ide/PanelPrimitives.tsx', [
      'PANEL_BUTTON_VARIANT_CLASSES',
      'PanelButton',
      'IdePanelHeader',
    ]),
    declarations('components/ui/PanelBoundary.tsx', ['PanelLoading']),
    `const extractedFetch = ${fetchCallback};`,
    'return { Panel: ProjectIdeApiServicePanel, extractedFetch, slowLoadMs: PROJECT_PANEL_SLOW_LOAD_MS };',
  ].join('\n'),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;

const nativeFetch = globalThis.fetch;

/*
 * Node's HTTP fetch needs its native AbortSignal, not jsdom's other realm.
 * The root Vite config aliases node:util to a browser polyfill. Load this
 * test-only primitive through Node's loader to retain the real HTTP contract.
 */
const { transferableAbortController } = createRequire(import.meta.url)('node:util') as typeof import('node:util');
vi.stubGlobal('AbortController', transferableAbortController().constructor);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
afterAll(() => vi.unstubAllGlobals());

let language = 'en';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

const translate = (key: string) => key;

const databaseHeading = () =>
  [...document.querySelectorAll('h2')].find((node) =>
    ['All databases', 'Toutes les bases de données'].includes(node.textContent ?? ''),
  );
type Extracted = {
  Panel: React.ComponentType<{
    projectId?: string;
    panel: string;
    initialPayload?: unknown;
    requestedWorkspaceId?: string;
  }>;
  extractedFetch: typeof fetch;
  slowLoadMs: number;
};

function wrapper(fetcher: typeof fetch): Extracted {
  const bindings = {
    React,
    DatabaseHeading,
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
    createSingleFlight,
    createPanelRequest,
    waitForPanelRetry,
    readProjectPanelCache,
    writeProjectPanelCache,
    projectPanelRefreshIntervalMs,
    classNames,
    t: translate,
    useTranslation: () => ({ t: translate, i18n: { resolvedLanguage: 'en' } }),
    useStore: () => undefined,
    workbenchStore: { selectedFile: undefined },
    useProjectCollaboration: () => ({}),
    getErrorSurfacesCopy: () => ({ 'panelBoundary.loading': 'Loading' }),
    IDE_PRIMARY_ACCENT_CLASSES: '',
    panelTitle: () => 'Database',
    panelIcon: () => '',
    isPanelAuthError: () => false,
    PanelErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
    ProjectIdePanelContent: ({ data, busy }: { data: { attempt?: string }; busy: boolean }) => (
      <div data-panel-content data-attempt={data.attempt} data-busy={String(busy)} />
    ),
    PanelEmptyState: () => <div data-empty />,
    fetch: fetcher,
  };
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as Extracted;
}

let root: Root | undefined;
let server: Server | undefined;

const sockets = new Set<Socket>();
const pendingResponses = new Set<ServerResponse>();
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function until(predicate: () => boolean, timeout = 2000) {
  const limit = Date.now() + timeout;

  while (!predicate()) {
    if (Date.now() > limit) {
      throw new Error('Expected panel recovery did not occur');
    }

    await act(async () => {
      await pause(10);
    });
  }
}

async function listen(handler: RequestListener) {
  server = createServer((request, response) => {
    pendingResponses.add(response);
    response.on('close', () => pendingResponses.delete(response));
    handler(request, response);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected an ephemeral loopback TCP port');
  }

  return `http://127.0.0.1:${address.port}`;
}

function send(response: ServerResponse, attempt: string) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ status: 'ok', data: { attempt } }));
}

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => {
    for (const response of pendingResponses) {
      if (!response.writableEnded && !response.destroyed) {
        send(response, 'cleanup-only-fixture');
      }
    }
    await pause(20);
  });

  if (root) {
    await act(async () => root?.unmount());
  }

  root = undefined;
  await Promise.all(
    [...sockets].map(
      (socket) =>
        new Promise<void>((done) => {
          socket.once('close', done);
          socket.destroy();
        }),
    ),
  );

  if (server) {
    await new Promise<void>((done) => server!.close(() => done()));
  }

  server = undefined;
  document.body.innerHTML = '';
  __resetProjectPanelCacheForTests();
  language = 'en';
});

describe('actual panel wrapper: explicit Retry over loopback HTTP', () => {
  it('cancels shared A, serves B to two consumers and a remount, preserving another key and cache B', async () => {
    const requests: ServerResponse[] = [];

    let firstClosed = false;
    let otherRequests = 0;

    const origin = await listen((request, response) => {
      if (request.url?.includes('/other/')) {
        otherRequests += 1;
        send(response, 'other');

        return;
      }

      requests.push(response);

      if (requests.length === 1) {
        response.on('close', () => {
          firstClosed = !response.writableEnded;
        });
      }
    });

    const { Panel, slowLoadMs } = wrapper((input, init) => nativeFetch(new URL(String(input), origin), init));
    expect(slowLoadMs).toBe(7000);
    document.body.innerHTML = '<div id="root"></div>';

    const mount = () => (
      <>
        <Panel projectId="fixture" panel="database" />
        <Panel projectId="fixture" panel="database" />
        <Panel projectId="other" panel="database" />
      </>
    );
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(mount()));
    await until(() => requests.length === 1 && otherRequests === 1);
    await act(async () => {
      await pause(slowLoadMs + 30);
    });

    const retries = [...document.querySelectorAll('button')].filter(
      (button) => button.textContent === 'chat.copy.retry_9f5cd8a2',
    );
    expect(retries).toHaveLength(2);
    expect(retries[0].disabled).toBe(false);
    await act(async () => retries[0].click());
    await until(() => requests.length === 2 && firstClosed);
    expect(otherRequests).toBe(1);

    // The replacement remains pending across unmount/remount; no third GET.
    await act(async () => root!.unmount());
    root = createRoot(document.getElementById('root')!);
    await act(async () =>
      root!.render(
        <>
          <Panel projectId="fixture" panel="database" />
          <Panel projectId="fixture" panel="database" />
        </>,
      ),
    );
    expect(requests).toHaveLength(2);
    await act(async () => {
      send(requests[1], 'B');
      await pause(20);
    });
    await until(() => document.querySelectorAll('[data-attempt="B"]').length === 2);
    expect(readProjectPanelCache('fixture:database')?.payload.data.attempt).toBe('B');
    expect(readProjectPanelCache('other:database')?.payload.data.attempt).toBe('other');
    expect(requests).toHaveLength(2);
  }, 15_000);

  it('stops the actual fetch retry loop during backoff (controlled 503 transport and clock)', async () => {
    vi.useFakeTimers();

    const transport = vi.fn<typeof fetch>(async (_input, init) => {
      init?.signal?.throwIfAborted();
      return new Response('{}', { status: 503, headers: { 'retry-after': '5' } });
    });

    const { extractedFetch } = wrapper(transport);
    const controller = new AbortController();
    const result = extractedFetch('/api/projects/fixture/ide-panel/database', { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('database context before an initial response', () => {
  it.each([
    ['en', 'All databases'],
    ['fr', 'Toutes les bases de données'],
  ])('keeps %s context in the first render, pending response, error and recovery', async (locale, title) => {
    language = locale;

    const requests: ServerResponse[] = [];

    const origin = await listen((_request, response) => {
      requests.push(response);
    });

    const { Panel } = wrapper((input, init) => nativeFetch(new URL(String(input), origin), init));

    // No effect has run yet: absence of data must not mount the data consumer.
    const initial = renderToString(<Panel projectId="fixture" panel="database" />);
    expect(initial).toContain(title);
    expect(initial).toContain('aria-busy="true"');
    expect(initial).not.toContain('data-panel-content');
    expect(initial).not.toContain('data-empty');
    expect(requests).toHaveLength(0);

    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(<Panel projectId="fixture" panel="database" />));
    await until(() => requests.length === 1);
    expect(databaseHeading()?.textContent).toBe(title);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[data-panel-content], [data-empty]')).toBeNull();

    // Real loopback HTTP failure, deliberately non-retryable transport status.
    await act(async () => {
      requests[0].writeHead(400, { 'content-type': 'application/json' });
      requests[0].end(JSON.stringify({ status: 'error' }));
      await pause(20);
    });
    await until(() => Boolean(document.querySelector('[role="alert"]')));
    expect(databaseHeading()?.textContent).toBe(title);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.querySelector('[data-panel-content], [data-empty]')).toBeNull();

    const retry = document.querySelector<HTMLButtonElement>('[role="alert"] button')!;
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    await until(() => requests.length === 2);
    expect(databaseHeading()?.textContent).toBe(title);
    await act(async () => {
      send(requests[1], 'recovered');
      await pause(20);
    });
    await until(() => Boolean(document.querySelector('[data-attempt="recovered"]')));
    expect(document.querySelector('[role="alert"], [aria-busy="true"]')).toBeNull();
    expect(databaseHeading()).toBeUndefined(); // Context now belongs to the actual content.
  });

  it('does not imply loading without a project identifier', () => {
    const transport = vi.fn<typeof fetch>();
    const { Panel } = wrapper(transport);
    const initial = renderToString(<Panel panel="database" />);
    expect(initial).toContain('All databases');
    expect(initial).toContain('role="alert"');
    expect(initial).toContain('chat.copy.missingProjectIdReloadTheIde_66a40459');
    expect(initial).not.toContain('aria-busy="true"');
    expect(initial).not.toContain('data-panel-content');
    expect(transport).not.toHaveBeenCalled();
  });

  it('keeps an HTTP 200 error envelope out of the consumer and shows pending recovery', async () => {
    const requests: ServerResponse[] = [];

    const origin = await listen((_request, response) => {
      requests.push(response);

      if (requests.length === 1) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'error',
            error: { code: 'PANEL_UPSTREAM', message: 'fixture-only', retryable: true },
          }),
        );
      }
    });

    const { Panel } = wrapper((input, init) => nativeFetch(new URL(String(input), origin), init));
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(<Panel projectId="fixture" panel="database" />));
    await until(() => Boolean(document.querySelector('[role="alert"]')));
    expect(databaseHeading()?.textContent).toBe('All databases');
    expect(document.querySelector('[aria-busy="true"], [data-panel-content], [data-empty]')).toBeNull();

    const retry = document.querySelector<HTMLButtonElement>('[role="alert"] button')!;
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    await until(() => requests.length === 2);
    expect(databaseHeading()?.textContent).toBe('All databases');
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[role="alert"], [data-panel-content], [data-empty]')).toBeNull();
    await act(async () => {
      send(requests[1], 'recovered-envelope');
      await pause(20);
    });
    await until(() => Boolean(document.querySelector('[data-attempt="recovered-envelope"]')));
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('preserves recovery during the automatic poll after an error envelope', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

    const requests: ServerResponse[] = [];

    const origin = await listen((_request, response) => {
      requests.push(response);

      if (requests.length === 1) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'error',
            error: { code: 'PANEL_UPSTREAM', message: 'fixture-only', retryable: true },
          }),
        );
      }
    });

    const { Panel } = wrapper((input, init) => nativeFetch(new URL(String(input), origin), init));
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(<Panel projectId="fixture" panel="database" />));
    await until(() => Boolean(document.querySelector('[role="alert"]')));
    expect(projectPanelRefreshIntervalMs('database')).toBe(60_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await until(() => requests.length === 2);
    expect(databaseHeading()?.textContent).toBe('All databases');
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('[data-panel-content], [data-empty]')).toBeNull();

    const retry = document.querySelector<HTMLButtonElement>('[role="alert"] button')!;
    expect(retry.disabled).toBe(false);

    // Recovery stays actionable while the poll is in flight, including replacement.
    await act(async () => retry.click());
    await until(() => requests.length === 3);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => {
      send(requests[2], 'recovered-from-poll');
      await pause(20);
    });
    await until(() => Boolean(document.querySelector('[data-attempt="recovered-from-poll"]')));
    expect(document.querySelector('[role="alert"], [aria-busy="true"]')).toBeNull();
  });

  it('keeps cached data mounted during a silent refresh', async () => {
    const requests: ServerResponse[] = [];

    const origin = await listen((_request, response) => {
      requests.push(response);
    });

    const { Panel } = wrapper((input, init) => nativeFetch(new URL(String(input), origin), init));
    writeProjectPanelCache('fixture:database', {
      payload: { status: 'ok', data: { attempt: 'cached' } },
      lastLoadedAt: new Date().toISOString(),
    });
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    await act(async () => root!.render(<Panel projectId="fixture" panel="database" />));
    await until(() => requests.length === 1);
    expect(document.querySelector('[data-attempt="cached"]')).not.toBeNull();
    expect(databaseHeading()).toBeUndefined();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('panel cache arriving between render and effect', () => {
  const cached = (attempt: string) => ({
    payload: { status: 'ok', data: { attempt } },
    lastLoadedAt: new Date().toISOString(),
  });

  /*
   * Force the real interleaving without sleeps or changing the wrapper hooks:
   * another consumer populates the shared cache after this instance's render,
   * but before its initial passive effect chooses foreground/silent loading.
   */
  function SeedAfterRender({ children, cacheKey }: React.PropsWithChildren<{ cacheKey: string }>) {
    React.useLayoutEffect(() => {
      writeProjectPanelCache(cacheKey, cached('other-consumer'));
    }, [cacheKey]);
    return <>{children}</>;
  }

  function deferredResponse() {
    let resolve!: (response: Response) => void;

    const promise = new Promise<Response>((done) => {
      resolve = done;
    });

    return { promise, resolve };
  }

  function mount(children: React.ReactNode) {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);

    return act(async () => root!.render(children));
  }

  const loaded = (attempt: string) =>
    new Response(JSON.stringify(cached(attempt).payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('clears cold-instance busy after a successful load despite another consumer warming the cache', async () => {
    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    await mount(
      <SeedAfterRender cacheKey="fixture:security">
        <Panel projectId="fixture" panel="security" />
      </SeedAfterRender>,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[data-panel-content]')).toBeNull();
    await act(async () => response.resolve(loaded('fresh')));

    const content = document.querySelector('[data-attempt="fresh"]');
    expect(content).not.toBeNull();
    expect(content?.getAttribute('data-busy')).toBe('false');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(readProjectPanelCache('fixture:security')?.payload.data.attempt).toBe('fresh');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('leaves Retry actionable after a failed cold load despite the late cache entry', async () => {
    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    await mount(
      <SeedAfterRender cacheKey="fixture:security">
        <Panel projectId="fixture" panel="security" />
      </SeedAfterRender>,
    );
    await act(async () => response.resolve(new Response('{}', { status: 400 })));

    const retry = document.querySelector<HTMLButtonElement>('[role="alert"] button');
    expect(retry).not.toBeNull();
    expect(retry?.disabled).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('shares a cold request across consumers and keeps the survivor usable after one unmounts', async () => {
    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    await mount(
      <SeedAfterRender cacheKey="fixture:security">
        <Panel key="first" projectId="fixture" panel="security" />
        <Panel key="second" projectId="fixture" panel="security" />
      </SeedAfterRender>,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    await act(async () =>
      root!.render(
        <SeedAfterRender cacheKey="fixture:security">
          <Panel key="second" projectId="fixture" panel="security" />
        </SeedAfterRender>,
      ),
    );
    await act(async () => response.resolve(loaded('shared')));
    expect(document.querySelectorAll('[data-attempt="shared"]')).toHaveLength(1);
    expect(document.querySelector('[data-attempt="shared"]')?.getAttribute('data-busy')).toBe('false');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['other', 'security'],
    ['fixture', 'logs'],
  ])('keeps a keyed switch to %s/%s independent from the abandoned request', async (projectId, panel) => {
    const oldResponse = deferredResponse();
    const nextResponse = deferredResponse();

    const transport = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(nextResponse.promise);

    const { Panel } = wrapper(transport);
    await mount(
      <SeedAfterRender cacheKey="fixture:security">
        <Panel key="fixture:security" projectId="fixture" panel="security" />
      </SeedAfterRender>,
    );
    await act(async () => root!.render(<Panel key={`${projectId}:${panel}`} projectId={projectId} panel={panel} />));
    expect(transport).toHaveBeenCalledTimes(2);
    await act(async () => oldResponse.resolve(loaded('old')));
    expect(document.querySelector('[data-panel-content]')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(readProjectPanelCache(`${projectId}:${panel}`)).toBeUndefined();
    await act(async () => nextResponse.resolve(loaded('next')));
    expect(document.querySelector('[data-attempt="next"]')?.getAttribute('data-busy')).toBe('false');
    expect(readProjectPanelCache('fixture:security')?.payload.data.attempt).toBe('old');
    expect(readProjectPanelCache(`${projectId}:${panel}`)?.payload.data.attempt).toBe('next');
  });

  it('keeps a genuinely seeded stale view usable while its refresh is pending and after failure', async () => {
    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    writeProjectPanelCache('fixture:security', cached('stale'));
    await mount(<Panel projectId="fixture" panel="security" />);
    expect(document.querySelector('[data-attempt="stale"]')?.getAttribute('data-busy')).toBe('false');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    await act(async () => response.resolve(new Response('{}', { status: 400 })));
    expect(document.querySelector('[data-attempt="stale"]')?.getAttribute('data-busy')).toBe('false');
    expect(document.querySelector<HTMLButtonElement>('[role="alert"] button')?.disabled).toBe(false);
    expect(readProjectPanelCache('fixture:security')?.payload.data.attempt).toBe('stale');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('survives StrictMode replay with one SSR consumer and one cold consumer of the same request', async () => {
    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    await mount(
      <React.StrictMode>
        <SeedAfterRender cacheKey="fixture:security">
          <Panel projectId="fixture" panel="security" initialPayload={cached('ssr').payload} />
          <Panel projectId="fixture" panel="security" />
        </SeedAfterRender>
      </React.StrictMode>,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-attempt="ssr"]')?.getAttribute('data-busy')).toBe('false');
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    await act(async () => response.resolve(loaded('strict-shared')));
    expect(document.querySelectorAll('[data-attempt="strict-shared"][data-busy="false"]')).toHaveLength(2);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['security', 400],
    ['database', 200],
  ])('recovers %s through explicit Retry after HTTP %i with a late cache entry', async (panel, status) => {
    const first = deferredResponse();
    const second = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { Panel } = wrapper(transport);
    const key = `fixture:${panel}`;
    await mount(
      <SeedAfterRender cacheKey={key}>
        <Panel projectId="fixture" panel={panel} />
      </SeedAfterRender>,
    );
    await act(async () =>
      first.resolve(
        new Response(
          JSON.stringify({
            status: 'error',
            data: null,
            error: { code: 'UPSTREAM', message: 'fixture', retryable: true },
          }),
          { status },
        ),
      ),
    );

    const retry = document.querySelector<HTMLButtonElement>('[role="alert"] button');
    expect(retry).not.toBeNull();
    expect(retry?.disabled).toBe(false);
    expect(readProjectPanelCache(key)?.payload.data.attempt).toBe('other-consumer');
    await act(async () => retry!.click());
    expect(transport).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => second.resolve(loaded('retry-recovered')));
    expect(document.querySelector('[data-attempt="retry-recovered"]')?.getAttribute('data-busy')).toBe('false');
    expect(document.querySelector('[role="alert"], [aria-busy="true"]')).toBeNull();
    expect(readProjectPanelCache(key)?.payload.data.attempt).toBe('retry-recovered');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('keeps committed cached content usable when the shared cache is evicted before passive effects', async () => {
    function EvictAfterRender({ children }: React.PropsWithChildren) {
      React.useLayoutEffect(() => {
        __resetProjectPanelCacheForTests();
      }, []);
      return <>{children}</>;
    }

    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    writeProjectPanelCache('fixture:security', cached('committed-before-eviction'));
    await mount(
      <EvictAfterRender>
        <Panel projectId="fixture" panel="security" />
      </EvictAfterRender>,
    );
    expect(readProjectPanelCache('fixture:security')).toBeUndefined();
    expect(document.querySelector('[data-attempt="committed-before-eviction"]')?.getAttribute('data-busy')).toBe(
      'false',
    );
    await act(async () => response.resolve(new Response('{}', { status: 400 })));
    expect(document.querySelector('[data-attempt="committed-before-eviction"]')?.getAttribute('data-busy')).toBe(
      'false',
    );
    expect(document.querySelector<HTMLButtonElement>('[role="alert"] button')?.disabled).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('keeps committed cached content usable after normal capacity eviction before passive effects', async () => {
    function EvictAfterRender({ children }: React.PropsWithChildren) {
      React.useLayoutEffect(() => {
        for (let index = 0; index < PROJECT_PANEL_CACHE_MAX; index += 1) {
          writeProjectPanelCache(`other-${index}:security`, cached(`unrelated-${index}`));
        }
      }, []);
      return <>{children}</>;
    }

    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    writeProjectPanelCache('fixture:security', cached('committed-before-eviction'));
    await mount(
      <EvictAfterRender>
        <Panel projectId="fixture" panel="security" />
      </EvictAfterRender>,
    );
    expect(readProjectPanelCache('fixture:security')).toBeUndefined();
    expect(document.querySelector('[data-attempt="committed-before-eviction"]')?.getAttribute('data-busy')).toBe(
      'false',
    );
    await act(async () => response.resolve(new Response('{}', { status: 400 })));
    expect(document.querySelector('[data-attempt="committed-before-eviction"]')?.getAttribute('data-busy')).toBe(
      'false',
    );
    expect(document.querySelector<HTMLButtonElement>('[role="alert"] button')?.disabled).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('preserves committed content after HTTP failure when normal cache capacity evicts its entry', async () => {
    function EvictAfterRender({ children }: React.PropsWithChildren) {
      React.useLayoutEffect(() => {
        for (let index = 0; index < PROJECT_PANEL_CACHE_MAX; index += 1) {
          writeProjectPanelCache(`other-${index}:security`, cached(`unrelated-${index}`));
        }
      }, []);
      return <>{children}</>;
    }

    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    writeProjectPanelCache('fixture:security', cached('committed-before-failure'));
    await mount(
      <EvictAfterRender>
        <Panel projectId="fixture" panel="security" />
      </EvictAfterRender>,
    );
    expect(readProjectPanelCache('fixture:security')).toBeUndefined();
    await act(async () => response.resolve(new Response('{}', { status: 400 })));
    expect(document.querySelector('[data-attempt="committed-before-failure"]')?.getAttribute('data-busy')).toBe(
      'false',
    );
    expect(document.querySelector<HTMLButtonElement>('[role="alert"] button')?.disabled).toBe(false);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('uses newly committed content after cache eviction when its initial-load effect reruns', async () => {
    const first = deferredResponse();
    const refresh = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockReturnValueOnce(refresh.promise);
    const { Panel } = wrapper(transport);
    await mount(<Panel projectId="fixture" panel="security" />);
    await act(async () => first.resolve(loaded('committed-after-mount')));

    for (let index = 0; index < PROJECT_PANEL_CACHE_MAX; index += 1) {
      writeProjectPanelCache(`other-${index}:security`, cached(`unrelated-${index}`));
    }

    expect(readProjectPanelCache('fixture:security')).toBeUndefined();
    await act(async () => root!.render(<Panel projectId="fixture" panel="security" initialPayload={null} />));
    expect(transport).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-attempt="committed-after-mount"]')?.getAttribute('data-busy')).toBe('false');
    await act(async () => refresh.resolve(new Response('{}', { status: 400 })));
    expect(document.querySelector('[data-attempt="committed-after-mount"]')?.getAttribute('data-busy')).toBe('false');
  });

  it('returns to foreground loading after a failed Retry clears committed content but leaves stale cache', async () => {
    const first = deferredResponse();
    const retryResponse = deferredResponse();
    const refresh = deferredResponse();

    const transport = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retryResponse.promise)
      .mockReturnValueOnce(refresh.promise);

    const { Panel } = wrapper(transport);
    writeProjectPanelCache('fixture:security', cached('stale'));
    await mount(<Panel projectId="fixture" panel="security" />);
    await act(async () => first.resolve(new Response('{}', { status: 400 })));
    await act(async () => document.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    await act(async () => retryResponse.resolve(new Response('{}', { status: 400 })));
    expect(document.querySelector('[data-attempt="stale"]')).toBeNull();
    expect(readProjectPanelCache('fixture:security')?.payload.data.attempt).toBe('stale');
    await act(async () => root!.render(<Panel projectId="fixture" panel="security" initialPayload={null} />));
    expect(transport).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[data-panel-content]')).toBeNull();
    await act(async () => refresh.resolve(loaded('recovered-after-clear')));
    expect(document.querySelector('[data-attempt="recovered-after-clear"]')?.getAttribute('data-busy')).toBe('false');
  });

  it('keeps a null initial payload cold when another consumer warms the cache after render', async () => {
    const response = deferredResponse();
    const transport = vi.fn<typeof fetch>(() => response.promise);
    const { Panel } = wrapper(transport);
    await mount(
      <SeedAfterRender cacheKey="fixture:security">
        <Panel projectId="fixture" panel="security" initialPayload={null} />
      </SeedAfterRender>,
    );
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[data-panel-content]')).toBeNull();
    await act(async () => response.resolve(loaded('fresh-after-null')));
    expect(document.querySelector('[data-attempt="fresh-after-null"]')?.getAttribute('data-busy')).toBe('false');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('keeps the replacement latest-wins when the aborted transport ignores cancellation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const first = deferredResponse();
    const replacement = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockReturnValueOnce(replacement.promise);
    const { Panel, slowLoadMs } = wrapper(transport);
    await mount(
      <SeedAfterRender cacheKey="fixture:security">
        <Panel projectId="fixture" panel="security" />
      </SeedAfterRender>,
    );
    await act(async () => vi.advanceTimersByTimeAsync(slowLoadMs));

    const retry = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'chat.copy.retry_9f5cd8a2',
    );
    expect(retry).toBeDefined();
    expect(retry?.disabled).toBe(false);
    await act(async () => retry!.click());
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(transport.mock.calls[1][1]?.signal?.aborted).toBe(false);
    await act(async () => replacement.resolve(loaded('replacement')));
    expect(document.querySelector('[data-attempt="replacement"]')?.getAttribute('data-busy')).toBe('false');
    await act(async () => first.resolve(loaded('obsolete-ignores-abort')));
    expect(document.querySelector('[data-attempt="replacement"]')?.getAttribute('data-busy')).toBe('false');
    expect(document.querySelector('[data-attempt="obsolete-ignores-abort"], [aria-busy="true"]')).toBeNull();
    expect(readProjectPanelCache('fixture:security')?.payload.data.attempt).toBe('replacement');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['other', 'security', undefined],
    ['fixture', 'logs', undefined],
    ['fixture', 'security', 'other-workspace'],
  ])('keeps return navigation isolated from late %s/%s/%s results', async (projectId, panel, workspaceId) => {
    const first = deferredResponse();
    const other = deferredResponse();
    const transport = vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockReturnValueOnce(other.promise);
    const { Panel } = wrapper(transport);
    const otherKey = `${projectId}:${panel}${workspaceId ? `:${workspaceId}` : ''}`;
    const initial = <Panel key="fixture:security" projectId="fixture" panel="security" />;
    await mount(<SeedAfterRender cacheKey="fixture:security">{initial}</SeedAfterRender>);
    await act(async () =>
      root!.render(<Panel key={otherKey} projectId={projectId} panel={panel} requestedWorkspaceId={workspaceId} />),
    );
    expect(String(transport.mock.calls[1][0])).toBe(
      `/api/projects/${projectId}/ide-panel/${panel}${workspaceId ? `?workspaceId=${workspaceId}` : ''}`,
    );
    await act(async () => root!.render(initial));
    expect(transport).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-attempt="other-consumer"]')?.getAttribute('data-busy')).toBe('false');
    await act(async () => first.resolve(loaded('returned-first-scope')));
    expect(document.querySelector('[data-attempt="returned-first-scope"]')?.getAttribute('data-busy')).toBe('false');
    await act(async () => other.resolve(loaded('abandoned-other-scope')));
    expect(document.querySelector('[data-attempt="abandoned-other-scope"], [aria-busy="true"]')).toBeNull();
    expect(readProjectPanelCache('fixture:security')?.payload.data.attempt).toBe('returned-first-scope');
    expect(readProjectPanelCache(otherKey)?.payload.data.attempt).toBe('abandoned-other-scope');
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
