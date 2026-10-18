/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { createServer, type RequestListener, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { resolve } from 'node:path';
import { transferableAbortController } from 'node:util';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ts from 'typescript';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetProjectPanelCacheForTests,
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

// Node's real HTTP fetch needs its native AbortSignal, not jsdom's other realm.
vi.stubGlobal('AbortController', transferableAbortController().constructor);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
afterAll(() => vi.unstubAllGlobals());

const translate = (key: string) => key;
type Extracted = {
  Panel: React.ComponentType<{ projectId: string; panel: string }>;
  extractedFetch: typeof fetch;
  slowLoadMs: number;
};

function wrapper(fetcher: typeof fetch): Extracted {
  const bindings = {
    React,
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
    ProjectIdePanelContent: ({ data }: { data: { attempt?: string } }) => <div data-attempt={data.attempt} />,
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
