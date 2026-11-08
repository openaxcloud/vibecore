/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React, { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetProjectPanelCacheForTests,
  readProjectPanelCache,
  writeProjectPanelCache,
} from '~/lib/ide/panel-payload-cache';
import { createPanelRequest, waitForPanelRetry } from '~/lib/ide/panel-request';
import { classNames } from '~/utils/classNames';
import { projectPanelRefreshIntervalMs } from '~/utils/project-panel-refresh';

/*
 * Execute the private production wrapper and log body, not a copied loading
 * predicate. Transport, unrelated stores and localization are explicit seams.
 * The layout probe sees the FIRST commit before passive effects: assertions
 * after act() alone would miss a console mounted and immediately removed by
 * the initial load. jsdom is not used to claim Chromium CSSOM behavior.
 */
function declarations(file: string, names: string[]) {
  const source = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const nodes = tree.statements.filter(
    (node) =>
      (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some((declaration) => names.includes(declaration.name.getText(tree)))),
  );
  expect(nodes).toHaveLength(names.length);

  return nodes.map((node) => node.getText(tree).replace(/^export\s+/, '')).join('\n');
}

const compiled = ts.transpileModule(
  [
    declarations('components/chat/BaseChat.tsx', [
      'PROJECT_PANEL_FETCH_MAX_ATTEMPTS',
      'PROJECT_PANEL_FETCH_BASE_RETRY_MS',
      'PROJECT_PANEL_SLOW_LOAD_MS',
      'panneauEnVol',
      'projectPanelFetchMethod',
      'projectPanelFetchRetryDelay',
      'shouldRetryProjectPanelFetch',
      'shouldRetryProjectPanelNetworkError',
      'ProjectIdeApiServicePanel',
      'LOG_FOLLOW_BOTTOM_THRESHOLD_PX',
      'LogStreamView',
    ]),
    declarations('components/project-ide/PanelPrimitives.tsx', [
      'PANEL_BUTTON_VARIANT_CLASSES',
      'PanelButton',
      'IdePanelHeader',
    ]),
    declarations('components/ui/PanelBoundary.tsx', ['PanelLoading']),
    'return { Panel: ProjectIdeApiServicePanel, LogStreamView };',
  ].join('\n'),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;

interface LogFixture {
  level: string;
  message: string;
  timestamp: string;
}

interface PayloadFixture {
  status: 'ok';
  data: { runtimeLogs: { logs: LogFixture[] } };
}

interface PanelProps {
  projectId?: string;
  panel: string;
  initialPayload?: PayloadFixture;
}

interface ContentProps {
  data: { runtimeLogs?: { logs: LogFixture[] } };
  reload: (options?: { silent?: boolean; retry?: boolean }) => Promise<void>;
}

interface Extracted {
  Panel: React.ComponentType<PanelProps>;
  LogStreamView: React.ComponentType<{ logs: LogFixture[]; empty: string }>;
}

interface PendingRequest {
  url: string;
  signal?: AbortSignal | null;
  respond: (body: unknown, status?: number) => void;
}

const translate = (key: string) => key;
const consoleSelector = '.bolt-project-console-body';
const loadingSelector = '[aria-busy="true"]';

function payload(message: string): PayloadFixture {
  return {
    status: 'ok',
    data: { runtimeLogs: { logs: [{ level: 'info', message, timestamp: '2026-11-08T12:00:00Z' }] } },
  };
}

function harness() {
  const requests: PendingRequest[] = [];

  const transport = vi.fn<typeof fetch>(
    (input, init) =>
      new Promise<Response>((resolveResponse) => {
        requests.push({
          url: String(input),
          signal: init?.signal,
          respond: (body, status = 200) =>
            resolveResponse(
              new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
            ),
        });
      }),
  );

  let latestContent: ContentProps | undefined;

  const bindings = {
    React,
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
    createPanelRequest,
    waitForPanelRetry,
    readProjectPanelCache,
    writeProjectPanelCache,
    projectPanelRefreshIntervalMs,
    classNames,
    useTranslation: () => ({ t: translate, i18n: { resolvedLanguage: 'en' } }),
    resolvedBaseChatLanguage: () => 'en',
    getErrorSurfacesCopy: () => ({ 'panelBoundary.loading': 'Loading fixture' }),
    useStore: () => undefined,
    workbenchStore: { selectedFile: undefined },
    useProjectCollaboration: () => ({}),
    IDE_PRIMARY_ACCENT_CLASSES: '',
    panelTitle: () => 'Logs',
    panelIcon: () => '',
    isPanelAuthError: () => false,
    PanelErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
    ProjectIdePanelContent: (props: ContentProps) => {
      latestContent = props;

      return <extracted.LogStreamView logs={props.data.runtimeLogs?.logs ?? []} empty="No fixture logs" />;
    },
    PanelEmptyState: () => <div data-empty-state />,
    formatLogTime: (_language: string, timestamp: string) => timestamp,
    normalizeLogEntryLevel: (entry: LogFixture) => entry.level,
    platformStateLabel: (_t: typeof translate, level: string) => level,
    fetch: transport,
  };

  const extracted: Extracted = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));

  return { ...extracted, requests, transport, content: () => latestContent };
}

let root: Root | undefined;
let container: HTMLDivElement;

interface CommitSnapshot {
  loading: boolean;
  console: Element | null;
}

async function mount(panelComponent: Extracted['Panel'], props: PanelProps) {
  const commits: CommitSnapshot[] = [];

  function CommitProbe() {
    useLayoutEffect(() => {
      commits.push({
        loading: Boolean(container.querySelector(loadingSelector)),
        console: container.querySelector(consoleSelector),
      });
    }, []);

    return React.createElement(panelComponent, props);
  }

  root = createRoot(container);
  await act(async () => root!.render(<CommitProbe />));

  return commits;
}

async function respond(request: PendingRequest, body: unknown, status = 200) {
  await act(async () => request.respond(body, status));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  __resetProjectPanelCacheForTests();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ProjectIdeApiServicePanel loading lifecycle', () => {
  it('renders the initial loader before effects, without briefly mounting a cold console', async () => {
    const { Panel, requests } = harness();
    const props = { projectId: 'cold', panel: 'logs' };
    const initial = renderToString(<Panel {...props} />);
    expect(initial).toContain('aria-busy="true"');
    expect(initial).not.toContain('bolt-project-console-body');
    expect(requests).toHaveLength(0);

    const commits = await mount(Panel, props);
    expect(commits).toEqual([{ loading: true, console: null }]);
    expect(requests).toHaveLength(1);
    expect(container.querySelector(loadingSelector)).not.toBeNull();
    expect(container.querySelector(consoleSelector)).toBeNull();
  });

  it.each(['SSR', 'cache'] as const)(
    'keeps %s content connected from the first commit during refresh',
    async (seed) => {
      const { Panel, requests } = harness();
      const seeded = payload(`${seed} fixture`);
      const props: PanelProps = { projectId: 'warm', panel: 'logs' };

      if (seed === 'SSR') {
        props.initialPayload = seeded;
      } else {
        writeProjectPanelCache('warm:logs', { payload: seeded, lastLoadedAt: 'fixture' });
      }

      const initial = renderToString(<Panel {...props} />);
      expect(initial).toContain(`${seed} fixture`);
      expect(initial).not.toContain('aria-busy="true"');

      const [first] = await mount(Panel, props);
      expect(first.loading).toBe(false);
      expect(first.console).not.toBeNull();
      expect(first.console?.isConnected).toBe(true);
      expect(requests).toHaveLength(1);
      expect(container.querySelector(loadingSelector)).toBeNull();

      await respond(requests[0], payload('refreshed fixture'));
      expect(container.querySelector(consoleSelector)).toBe(first.console);
      expect(first.console?.textContent).toContain('refreshed fixture');
      expect(first.console?.isConnected).toBe(true);
    },
  );

  it('replaces the pending loader only after a successful initial response', async () => {
    const { Panel, requests } = harness();
    await mount(Panel, { projectId: 'success', panel: 'logs' });
    expect(container.querySelector(consoleSelector)).toBeNull();
    expect(readProjectPanelCache('success:logs')).toBeUndefined();

    await respond(requests[0], payload('loaded fixture'));
    expect(container.querySelector(loadingSelector)).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(consoleSelector)?.textContent).toContain('loaded fixture');
    expect(readProjectPanelCache('success:logs')?.payload).toEqual(payload('loaded fixture'));
  });

  it.each([400, 200])('shows an initial HTTP %s failure instead of staying busy or caching success', async (status) => {
    const { Panel, requests } = harness();
    await mount(Panel, { projectId: 'failure', panel: 'logs' });
    await respond(
      requests[0],
      { status: 'error', error: { code: 'FIXTURE_FAILURE', message: 'fixture only', retryable: true } },
      status,
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain(status === 200 ? 'FIXTURE_FAILURE' : 'baseChatAst.panel.loadFailedHttp');
    expect(container.querySelector(loadingSelector)).toBeNull();
    expect(readProjectPanelCache('failure:logs')).toBeUndefined();

    const retry = alert!.querySelector<HTMLButtonElement>('button')!;
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    expect(requests).toHaveLength(2);
    await respond(requests[1], payload('recovered fixture'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(loadingSelector)).toBeNull();
    expect(container.querySelector(consoleSelector)?.textContent).toContain('recovered fixture');
  });

  it('keeps a remounted cold panel loading while it joins the interrupted shared request', async () => {
    const { Panel, requests } = harness();
    await mount(Panel, { projectId: 'interrupted', panel: 'logs' });
    expect(requests).toHaveLength(1);
    await act(async () => root!.unmount());
    root = undefined;

    const commits = await mount(Panel, { projectId: 'interrupted', panel: 'logs' });
    expect(commits).toEqual([{ loading: true, console: null }]);
    expect(requests).toHaveLength(1);
    expect(requests[0].signal?.aborted).toBe(false);
    await respond(requests[0], payload('shared result fixture'));
    expect(container.querySelector(loadingSelector)).toBeNull();
    expect(container.querySelector(consoleSelector)?.textContent).toContain('shared result fixture');
    expect(container.querySelector(consoleSelector)?.isConnected).toBe(true);
  });

  it('keeps keyed project changes isolated from a late response after unmount', async () => {
    const { Panel, requests } = harness();
    const commits: CommitSnapshot[] = [];
    const source = readFileSync(resolve(import.meta.dirname, 'BaseChat.tsx'), 'utf8');

    /*
     * The production service callsite remounts on this key. An unkeyed prop
     * update would exercise a different lifecycle from switching IDE projects.
     */
    expect(source).toContain("key={`${projectId ?? 'project'}:${panel}`}");

    function ProjectSwitch({ projectId }: { projectId: string }) {
      const panel = 'logs';
      useLayoutEffect(() => {
        commits.push({
          loading: Boolean(container.querySelector(loadingSelector)),
          console: container.querySelector(consoleSelector),
        });
      }, [projectId]);

      return <Panel key={`${projectId ?? 'project'}:${panel}`} projectId={projectId} panel={panel} />;
    }

    root = createRoot(container);
    await act(async () => root!.render(<ProjectSwitch projectId="previous" />));
    await act(async () => root!.render(<ProjectSwitch projectId="current" />));
    expect(requests.map((request) => request.url)).toEqual([
      '/api/projects/previous/ide-panel/logs',
      '/api/projects/current/ide-panel/logs',
    ]);

    /*
     * The old shared request is allowed to finish and populate its own cache.
     * It must neither satisfy the new project's loading state nor paint its log.
     */
    await respond(requests[0], payload('previous project fixture'));
    expect(readProjectPanelCache('previous:logs')?.payload).toEqual(payload('previous project fixture'));
    expect(readProjectPanelCache('current:logs')).toBeUndefined();
    expect(container.querySelector(loadingSelector)).not.toBeNull();
    expect(container.querySelector(consoleSelector)).toBeNull();
    expect(container.textContent).not.toContain('previous project fixture');

    await respond(requests[1], payload('current project fixture'));
    expect(container.querySelector(loadingSelector)).toBeNull();
    expect(container.querySelector(consoleSelector)?.textContent).toContain('current project fixture');
    expect(container.textContent).not.toContain('previous project fixture');
    expect(readProjectPanelCache('current:logs')?.payload).toEqual(payload('current project fixture'));
    expect(commits).toEqual([
      { loading: true, console: null },
      { loading: true, console: null },
    ]);
  });

  it('preserves the console through a pending automatic refresh and its visible failure', async () => {
    const { Panel, requests } = harness();
    await mount(Panel, { projectId: 'poll', panel: 'logs' });
    await respond(requests[0], payload('last good fixture'));

    const body = container.querySelector(consoleSelector);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(projectPanelRefreshIntervalMs('logs'));
    });
    expect(requests).toHaveLength(2);
    expect(container.querySelector(consoleSelector)).toBe(body);
    expect(body?.isConnected).toBe(true);
    expect(container.querySelector(loadingSelector)).toBeNull();

    await respond(requests[1], { error: 'fixture refresh failure' }, 400);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector(consoleSelector)).toBe(body);
    expect(body?.textContent).toContain('last good fixture');
    expect(container.querySelector(loadingSelector)).toBeNull();
    expect(readProjectPanelCache('poll:logs')?.payload).toEqual(payload('last good fixture'));
  });

  it('keeps loaded content connected during a manual reload', async () => {
    const { Panel, requests, content } = harness();
    await mount(Panel, { projectId: 'reload', panel: 'logs' });
    await respond(requests[0], payload('before reload fixture'));

    const body = container.querySelector(consoleSelector);
    await act(async () => {
      void content()!.reload();
    });
    expect(requests).toHaveLength(2);
    expect(container.querySelector(consoleSelector)).toBe(body);
    expect(body?.isConnected).toBe(true);
    expect(container.querySelector(loadingSelector)).toBeNull();
    await respond(requests[1], payload('after reload fixture'));
    expect(container.querySelector(consoleSelector)).toBe(body);
    expect(body?.textContent).toContain('after reload fixture');
  });

  it('does not start loading or issue requests without a project identifier', async () => {
    const { Panel, transport } = harness();
    const initial = renderToString(<Panel panel="logs" />);
    expect(initial).not.toContain('aria-busy="true"');

    const [first] = await mount(Panel, { panel: 'logs' });
    expect(first.loading).toBe(false);
    expect(first.console?.isConnected).toBe(true);
    expect(container.querySelector(loadingSelector)).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(projectPanelRefreshIntervalMs('logs'));
    });
    expect(transport).not.toHaveBeenCalled();
    expect(container.querySelector(loadingSelector)).toBeNull();
  });
});
