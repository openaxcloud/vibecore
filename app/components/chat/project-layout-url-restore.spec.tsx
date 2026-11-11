/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deposerDisposition,
  lireDispositionTransmise,
  oublierDispositionTransmise,
  porteeDisposition,
} from './ide-layout-handoff';
import { laDispositionPeutEtreRestauree } from './ide-layout-restore';
import { resolveProjectEditorToolOpen } from './project-editor-tool-catalog';
import { creerGardeDeRestauration } from './project-ide-restore-guard';
import {
  clearProjectIdeMemoryCacheForTest,
  flushProjectIdeMemorySaves,
  getProjectIdeMemory,
  getProjectIdeMemorySync,
  saveProjectIdeMemory,
  setProjectIdeMemorySaveDebounceMsForTest,
} from '~/lib/persistence/projectIdeMemory';
import { openTabInPane, splitPane, moveTab } from '~/lib/project-editor-layout';

const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

let defaultTree = '';
let urlEffect = '';
let restoreCheck = '';
let applyRestore = '';
let finalizer = '';

let restoreEntry = '',
  restoreToken = '',
  restoreSuccess = '',
  restoreScope = '',
  persistence = '';

const readiness: string[] = [];

let resetReadiness = '';
let applyOpening = '';
let handoffEffect = '';
let handoffMirror = '';
let restoreWindow = '';
let layoutScope = '';
let initialHandoff = '';
const layoutState: string[] = [];
const openingHelpers: string[] = [];

function visit(node: ts.Node) {
  if (
    ts.isFunctionDeclaration(node) &&
    [
      'makePaneTab',
      'runProjectEditorWindowOp',
      'findFirstLeaf',
      'flattenPaneLeafIds',
      'normalizeFloatingPanes',
      'normalizePaneTree',
      'ensureCorePaneTabs',
      'collectPaneTabs',
      'findLeaf',
      'findFloatingLeaf',
    ].includes(node.name?.text ?? '')
  ) {
    openingHelpers.push(node.getText(tree));
  }

  if (ts.isVariableStatement(node)) {
    const text = node.getText(tree);

    if (text.startsWith('const porteeDeLaDisposition = porteeDisposition(')) {
      layoutScope = text;
    }

    if (text.startsWith('const [dispositionTransmise] =')) {
      initialHandoff = text;
    }

    if (text.startsWith('const dispositionCouranteRef =')) {
      handoffMirror = text;
    }

    if (text.startsWith('const restoredFloating =') && ts.isBlock(node.parent)) {
      const statements = node.parent.statements;
      const start = statements.indexOf(node);
      const end = statements.findIndex(
        (statement, index) =>
          index > start && ts.isIfStatement(statement) && statement.expression.getText(tree) === 'restoredTree',
      );
      restoreWindow = statements
        .slice(start, end)
        .map((statement) => statement.getText(tree))
        .join('\n');
    }

    if (text.startsWith('const openWorkspacePanel = useCallback(')) {
      applyOpening = text;
    }

    if (
      text.startsWith('const [paneLayout,') ||
      text.startsWith('const { paneTree } = paneLayout;') ||
      text.startsWith('const setPaneTree = useCallback(')
    ) {
      layoutState.push(text);
    }

    if (text.startsWith('const DEFAULT_PANE_TREE:')) {
      defaultTree = text;
    }

    if (text.startsWith('const [projectStateReady,') || text.startsWith('const [projectLayoutReadyFor,')) {
      readiness.push(text);
    }

    if (text.startsWith('const jeton = gardeDeRestauration.current.lancer(')) {
      restoreToken = text;
    }

    if (text.startsWith('const dispositionIntacte =')) {
      restoreCheck = text;
    }
  }

  if (ts.isIfStatement(node) && node.expression.getText(tree).includes('gardeDeRestauration.current.peutLancer')) {
    restoreEntry = node.getText(tree);
  }

  if (ts.isExpressionStatement(node)) {
    const text = node.getText(tree);

    if (text.startsWith('gardeDeRestauration.current.reussir(')) {
      restoreSuccess = text;
    }

    if (text.startsWith('restoredProjectSelectionScope.current = { projectId,')) {
      restoreScope = text;
    }
  }

  if (ts.isIfStatement(node) && node.expression.getText(tree) === 'restoredTree && dispositionIntacte') {
    applyRestore = node.getText(tree);
  }

  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useLayoutHandoffEffect') {
    handoffEffect = node.getText(tree);
  }

  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') {
    const text = node.arguments[0]?.getText(tree) ?? '';

    if (text.includes('const restoredScope =') && text.includes('const existingWindows =')) {
      persistence = node.arguments[0].getText(tree);
    }

    if (text.includes('const appliedPanelUrl = appliedWorkspacePanelUrlRef.current')) {
      urlEffect = node.getText(tree);
    }

    if (text.includes('gardeDeRestauration.current.oublier()')) {
      resetReadiness = text.match(/setProjectLayoutReadyFor\(undefined\);/)?.[0] ?? '';
    }

    if (text.includes("__vibecoreStartupMark?.('layout-restore-requested')")) {
      const scan = (child: ts.Node) => {
        if (
          ts.isCallExpression(child) &&
          ts.isPropertyAccessExpression(child.expression) &&
          child.expression.name.text === 'finally'
        ) {
          finalizer = child.arguments[0].getText(tree);
        }

        ts.forEachChild(child, scan);
      };
      scan(node.arguments[0]);
    }
  }

  ts.forEachChild(node, visit);
}
visit(tree);
expect({
  defaultTree,
  applyOpening,
  urlEffect,
  restoreCheck,
  applyRestore,
  finalizer,
  restoreEntry,
  restoreToken,
  restoreSuccess,
  restoreScope,
  persistence,
  resetReadiness,
}).toEqual(
  expect.objectContaining(
    Object.fromEntries(
      [
        'defaultTree',
        'applyOpening',
        'urlEffect',
        'restoreCheck',
        'applyRestore',
        'finalizer',
        'restoreEntry',
        'restoreToken',
        'restoreSuccess',
        'restoreScope',
        'persistence',
        'resetReadiness',
      ].map((name) => [name, expect.stringMatching(/\S/)]),
    ),
  ),
);
expect(readiness).toHaveLength(2);
expect(layoutState).toHaveLength(3);
expect(openingHelpers).toHaveLength(10);
expect(handoffEffect).toContain('deposerDisposition');
expect(handoffMirror).toContain('dispositionCouranteRef');
expect(restoreWindow).toContain('setActivePaneId');
expect(layoutScope).toContain('currentWorkspaceId');
expect(initialHandoff).toContain('lireDispositionTransmise');

/*
 * Execute the actual URL effect, restoration predicate and completion callback.
 * Runtime/network dependencies are isolated; layout operations are the real engine.
 */
const compiled = ts.transpileModule(
  `return function Harness({ memory, panel = 'secrets', projectId = 'project-a', currentWorkspaceId, handoff, navigationId, suspendOnGit = false }) {
  const projectIdeMode = true, useMobileIde = false;
  const suspendedRender = useRef(new Promise(() => {}));
  ${readiness.join('\n')}
  const gardeDeRestauration = useRef(creerGardeDeRestauration());
  const restoredProjectSelectionScope = useRef();
  ${defaultTree}
  const cloneDefaultPaneTree = () => structuredClone(DEFAULT_PANE_TREE);
  const projectEditorWindowId = 'window-main';
  const searchParams = new URLSearchParams();
  const PROJECT_EDITOR_WINDOW_PARAM = 'peWindow', DEFAULT_PROJECT_EDITOR_WINDOW = 'window-main';
  ${layoutScope}
  ${initialHandoff}
  ${layoutState.join('\n')}
  const provisionalPaneTreeRef = useRef(paneLayout.provisionalPaneTree);
  const provisionalPanelNavigationRef = useRef(dispositionTransmise?.provisionalPanelNavigation);
  const paneTreeRef = useRef(paneTree);
  const activeProjectPanel = panel, appliedPanelNavigationId = navigationId ?? panel;
  const mobileNavigationReady = true, mobilePopRevision = 0;
  const appliedWorkspacePanelUrlRef = useRef(null), floatingPanesRef = useRef([]), appliedDeployAliasRef = useRef();
  const isIdeRightPanel = () => false, IDE_AGENT_PANEL = 'agent';
  const isIdeWorkspacePanel = (value) => Boolean(value);
  const setRightPanelMode = useCallback(() => {}, []), setRightPanelOpen = useCallback(() => {}, []);
  const setMobileIdePanel = useCallback(() => {}, []), setProjectAgentPanelOpen = useCallback(() => {}, []);
  const requestDeployPanelView = () => {}, ideMobileTarget = () => ({});
  const [workspaceTabs, setWorkspaceTabs] = useState(['editor']);
  const [activeWorkspacePanel, setActiveWorkspacePanel] = useState('editor');
  const [activePaneId, setActivePaneId] = useState(dispositionTransmise?.activePaneId ?? 'pane-main');
  const activePaneIdRef = useRef(activePaneId);
  const [floatingPanes, setFloatingPanes] = useState(dispositionTransmise?.floatingPanes ?? []);
  const setProjectPanelSearchParam = useCallback(() => {}, []);
  const workbenchStore = { setSelectedFile() {}, currentView: { set() {} }, setShowWorkbench() {}, toggleTerminal() {} };
  const engineOpenTabInPane = openTabInPane;
  ${openingHelpers.join('\n')}
  ${applyOpening}
  const useLayoutHandoffEffect = useLayoutEffect;
  ${handoffMirror}
  ${handoffEffect}
  useEffect(() => {
    ${resetReadiness}
    gardeDeRestauration.current.oublier();
    restoredProjectSelectionScope.current = undefined;
  }, [projectId]);
  useEffect(() => {
    ${restoreEntry}
    let cancelled = false;
    const restoreFallbackTimer = undefined;
    ${restoreToken}
    memory.then((restoredTree) => {
      if (cancelled) return;
      const windowSlice = { paneTree: restoredTree, activePaneId: restoredTree?.id };
      ${restoreCheck}
      ${applyRestore}
      ${restoreWindow}
      ${restoreSuccess}
      ${restoreScope}
    }).catch(() => {}).finally(${finalizer});
    return () => { cancelled = true; gardeDeRestauration.current.liberer(jeton); };
  }, [memory, panel, projectId, currentWorkspaceId]);
  ${urlEffect}
  if (suspendOnGit && paneTree.type === 'leaf' && paneTree.tabs.some((tab) => tab.panel === 'git')) {
    throw suspendedRender.current;
  }
  return React.createElement('div', {},
    React.createElement('output', { 'data-testid': 'tree' }, JSON.stringify(paneTree)),
    React.createElement('output', { 'data-testid': 'handoff' }, JSON.stringify({ paneTree, activePaneId, floatingPanes, provisionalPaneTree: paneLayout.provisionalPaneTree, provisionalPanelNavigation: provisionalPanelNavigationRef.current })),
    React.createElement('button', { onClick: () => setProjectStateReady(true) }, 'Fallback'),
    React.createElement('button', { onClick: () => React.startTransition(() => openWorkspacePanel('git', { provisional: true })) }, 'Transition Git'),
    React.createElement('button', { onClick: () => {
      const next = splitPane({ id: 'window-main', root: paneTree, floatingPanes, activePaneId }, {
        paneId: 'pane-main', tabId: 'tab-editor-default', direction: 'horizontal', newPaneId: 'user-editor-pane', splitId: 'user-editor-split'
      });
      setPaneTree(next.root); setFloatingPanes(next.floatingPanes); setActivePaneId(next.activePaneId);
    } }, 'Split editor'),
    React.createElement('button', { onClick: () => {
      const tab = findLeaf(paneTree, 'pane-main').tabs.find((tab) => tab.panel === 'secrets');
      const next = moveTab({ id: 'window-main', root: paneTree, floatingPanes, activePaneId }, {
        sourcePaneId: 'pane-main', targetPaneId: 'user-editor-pane', tabId: tab.id
      });
      setPaneTree(next.root); setFloatingPanes(next.floatingPanes); setActivePaneId(next.activePaneId);
      appliedWorkspacePanelUrlRef.current = {
        projectId, workspaceId: currentWorkspaceId, windowId: projectEditorWindowId,
        navigationId: 'move-location', panel: 'secrets', tabId: tab.id, targetPaneId: 'user-editor-pane'
      };
    } }, 'Move secrets'),
    React.createElement('button', { onClick: () => setActivePaneId('pane-main') }, 'Focus main'),
    React.createElement('button', { onClick: () => setActivePaneId('user-editor-pane') }, 'Focus editor'),
    React.createElement('button', { onClick: () => setPaneTree((current) => ({ type: 'split', id: 'user-split', direction: 'horizontal', ratio: 0.5, first: current, second: { type: 'leaf', id: 'user-pane', tabs: [{ id: 'user-tab', panel: 'terminal' }], activeTabId: 'user-tab' } })) }, 'Split'),
    React.createElement('button', { onClick: () => setPaneTree((current) => ({ ...current, tabs: current.tabs.filter((tab) => tab.panel !== 'editor'), activeTabId: 'tab-preview-default' })) }, 'Close editor')
  );
};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const Harness = new Function(
  'React',
  'useState',
  'useRef',
  'useCallback',
  'useEffect',
  'useLayoutEffect',
  'deposerDisposition',
  'lireDispositionTransmise',
  'porteeDisposition',
  'openTabInPane',
  'splitPane',
  'moveTab',
  'laDispositionPeutEtreRestauree',
  'resolveProjectEditorToolOpen',
  'creerGardeDeRestauration',
  compiled,
)(
  React,
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  deposerDisposition,
  lireDispositionTransmise,
  porteeDisposition,
  openTabInPane,
  splitPane,
  moveTab,
  laDispositionPeutEtreRestauree,
  resolveProjectEditorToolOpen,
  creerGardeDeRestauration,
) as React.ComponentType<{
  memory: Promise<unknown>;
  panel?: string;
  projectId?: string;
  currentWorkspaceId?: string;
  handoff?: unknown;
  navigationId?: string;
  suspendOnGit?: boolean;
}>;

function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

const saved = {
  type: 'leaf',
  id: 'pane-main',
  tabs: [
    { id: 'saved-editor', panel: 'editor' },
    { id: 'saved-preview', panel: 'preview', pinned: true },
    { id: 'saved-snapshots', panel: 'snapshots' },
    { id: 'saved-publish', panel: 'deployments' },
  ],
  activeTabId: 'saved-publish',
};

function read(view: ReturnType<typeof render>) {
  return JSON.parse(view.getByTestId('tree').textContent!);
}
beforeEach(oublierDispositionTransmise);
afterEach(cleanup);
describe('initial URL and delayed layout restoration', () => {
  it('restores saved tabs before adding the initial URL panel, even after the readiness fallback', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'preview', 'secrets']);
    fireEvent.click(view.getByRole('button', { name: 'Fallback' }));
    await act(async () => memory.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'secrets',
    ]);
  });
  it('preserves a newer user split while memory is pending', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    fireEvent.click(view.getByRole('button', { name: 'Split' }));
    await act(async () => memory.resolve(saved));
    expect(read(view)).toMatchObject({ id: 'user-split', second: { id: 'user-pane' } });
  });
  it('does not restore an editor the user just closed', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    fireEvent.click(view.getByRole('button', { name: 'Close editor' }));
    await act(async () => memory.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['preview', 'secrets']);
  });
  it.each(['empty', 'failure'])('opens the requested URL after a terminal %s result', async (result) => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    await act(async () => (result === 'empty' ? memory.resolve() : memory.reject(new Error('load failed'))));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toContain('secrets');
  });
  it('isolates remounted projects and rejects a cancelled response on return', async () => {
    const first = deferred();
    const view = render(<Harness key="a" memory={first.promise} projectId="a" />);
    await act(async () => first.resolve(saved));

    const second = deferred();
    view.rerender(<Harness key="b" memory={second.promise} projectId="b" panel="git" />);
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'preview', 'git']);

    const returned = deferred();
    view.rerender(<Harness key="a-returned" memory={returned.promise} projectId="a" />);
    await act(async () => second.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'preview', 'secrets']);
    await act(async () => returned.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'secrets',
    ]);
  });
  it('applies the latest URL when it changes during loading', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    view.rerender(<Harness memory={memory.promise} panel="git" />);
    await act(async () => memory.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'git',
    ]);
  });
  it('keeps automatic opening and restoration safe under StrictMode replay', async () => {
    const memory = deferred();
    const view = render(
      <React.StrictMode>
        <Harness memory={memory.promise} />
      </React.StrictMode>,
    );
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'preview', 'secrets']);
    await act(async () => memory.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'secrets',
    ]);
  });

  it('carries the automatic-layout baseline across the startup shell handoff', async () => {
    const memory = deferred();
    const startup = render(<Harness memory={memory.promise} />);
    const handoff = lireDispositionTransmise(porteeDisposition('project-a', 'window-main'))!;
    startup.unmount();
    const view = render(<Harness memory={memory.promise} handoff={handoff} />);
    await act(async () => memory.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'secrets',
    ]);
  });

  it('preserves a real user split across handoff and delayed memory', async () => {
    const memory = deferred();
    const startup = render(<Harness memory={memory.promise} />);
    fireEvent.click(startup.getByRole('button', { name: 'Split' }));
    const handoff = lireDispositionTransmise(porteeDisposition('project-a', 'window-main'))!;
    startup.unmount();
    const view = render(<Harness memory={memory.promise} handoff={handoff} />);
    await act(async () => memory.resolve(saved));
    expect(read(view)).toMatchObject({ id: 'user-split', second: { id: 'user-pane' } });
  });

  for (const complete of [false, true]) {
    const phase = complete ? 'memory completion' : 'readiness fallback';

    it(`preserves a split and focused editor after ${phase}`, async () => {
      const memory = deferred();
      const view = render(<Harness memory={memory.promise} />);
      fireEvent.click(view.getByRole('button', { name: 'Split editor' }));
      const before = read(view);

      if (complete) {
        await act(async () => memory.resolve(saved));
      } else {
        fireEvent.click(view.getByRole('button', { name: 'Fallback' }));
      }

      expect(read(view)).toEqual(before);
    });
  }

  it('preserves focus-only changes and the exact split across a shell handoff', async () => {
    const memory = deferred();
    const startup = render(<Harness memory={memory.promise} />);
    fireEvent.click(startup.getByRole('button', { name: 'Split editor' }));
    fireEvent.click(startup.getByRole('button', { name: 'Focus main' }));
    fireEvent.click(startup.getByRole('button', { name: 'Focus editor' }));
    const handoff = lireDispositionTransmise(porteeDisposition('project-a', 'window-main'))!;
    startup.unmount();
    const view = render(<Harness memory={memory.promise} handoff={handoff} />);
    expect(read(view)).toEqual(handoff.paneTree);
    await act(async () => memory.resolve(saved));
    expect(read(view)).toEqual(handoff.paneTree);
    expect(JSON.parse(view.getByTestId('handoff').textContent!).activePaneId).toBe('user-editor-pane');
  });

  it('still applies a genuinely new navigation after a user split', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    fireEvent.click(view.getByRole('button', { name: 'Split editor' }));
    view.rerender(<Harness memory={memory.promise} panel="git" navigationId="new-location" />);
    const before = read(view);
    expect(before.second.tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'git']);
    await act(async () => memory.resolve(saved));
    expect(read(view)).toEqual(before);
  });

  it('does not expose an uncommitted transition through the restoration baseline or handoff', async () => {
    const memory = deferred();
    const view = render(
      <React.Suspense fallback={<div>Pending transition</div>}>
        <Harness memory={memory.promise} suspendOnGit />
      </React.Suspense>,
    );
    const before = lireDispositionTransmise(porteeDisposition('project-a', 'window-main'));
    fireEvent.click(view.getByRole('button', { name: 'Transition Git' }));
    expect(lireDispositionTransmise(porteeDisposition('project-a', 'window-main'))).toEqual(before);
    expect(read(view)).toEqual(before?.paneTree);
    await act(async () => memory.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'secrets',
    ]);
  });

  it('honors a new same-panel navigation after focus changes', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    fireEvent.click(view.getByRole('button', { name: 'Split editor' }));
    view.rerender(<Harness memory={memory.promise} navigationId="new-secrets-location" />);
    const before = read(view);
    expect(before.second.tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'secrets']);
    await act(async () => memory.resolve(saved));
    expect(read(view)).toEqual(before);
  });

  it('does not replay an acknowledged tab move after focus changes and memory completes', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    fireEvent.click(view.getByRole('button', { name: 'Split editor' }));
    fireEvent.click(view.getByRole('button', { name: 'Move secrets' }));
    view.rerender(<Harness memory={memory.promise} navigationId="move-location" />);
    fireEvent.click(view.getByRole('button', { name: 'Focus main' }));
    const before = read(view);
    expect(before.first.tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['preview']);
    await act(async () => memory.resolve(saved));
    expect(read(view)).toEqual(before);
  });

  it('publishes a move acknowledgement before any further layout commit or unmount', () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    fireEvent.click(view.getByRole('button', { name: 'Split editor' }));
    fireEvent.click(view.getByRole('button', { name: 'Move secrets' }));
    const scope = porteeDisposition('project-a', 'window-main');
    const before = lireDispositionTransmise(scope);
    view.rerender(<Harness memory={memory.promise} navigationId="move-location" />);
    const acknowledged = lireDispositionTransmise(scope);
    expect(acknowledged?.provisionalPanelNavigation?.navigationId).toBe('move-location');
    expect(acknowledged?.paneTree).toBe(before?.paneTree);
    view.unmount();
    expect(lireDispositionTransmise(scope)?.provisionalPanelNavigation?.navigationId).toBe('move-location');
  });

  it('preserves focus set before a move acknowledgement through an immediate shell handoff', async () => {
    const memory = deferred();
    const startup = render(<Harness memory={memory.promise} />);
    fireEvent.click(startup.getByRole('button', { name: 'Split editor' }));
    fireEvent.click(startup.getByRole('button', { name: 'Move secrets' }));
    fireEvent.click(startup.getByRole('button', { name: 'Focus main' }));
    startup.rerender(<Harness memory={memory.promise} navigationId="move-location" />);
    const before = read(startup);
    expect(before.first.tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['preview']);
    startup.unmount();
    const view = render(<Harness memory={memory.promise} navigationId="move-location" />);
    expect(read(view)).toEqual(before);
    await act(async () => memory.resolve(saved));
    expect(read(view)).toEqual(before);
  });

  it('does not inherit a different workspace layout during a keyed scope remount', async () => {
    const first = deferred();
    const view = render(<Harness key="workspace-a" memory={first.promise} currentWorkspaceId="workspace-a" />);
    fireEvent.click(view.getByRole('button', { name: 'Split editor' }));
    const second = deferred();
    view.rerender(<Harness key="workspace-b" memory={second.promise} currentWorkspaceId="workspace-b" />);
    expect(read(view).type).toBe('leaf');
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'preview', 'secrets']);
    await act(async () => first.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual(['editor', 'preview', 'secrets']);
    await act(async () => second.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'secrets',
    ]);
  });

  it('keeps subsequent URL navigation and deployment aliases working', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
    await act(async () => memory.resolve(saved));
    view.rerender(<Harness memory={memory.promise} panel="git" />);
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).toContain('git');
    view.rerender(<Harness memory={memory.promise} panel="domains" />);
    expect(read(view).activeTabId).toBe('saved-publish');
  });
});

describe('actual layout persistence effect', () => {
  beforeEach(() => {
    localStorage.clear();
    clearProjectIdeMemoryCacheForTest();
    setProjectIdeMemorySaveDebounceMsForTest(0);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ideState: null })),
    );
  });
  afterEach(() => {
    clearProjectIdeMemoryCacheForTest();
    vi.unstubAllGlobals();
  });
  it('blocks fallback and wrong scopes, then preserves restored tabs across save/cache-clear/reload', async () => {
    expect(persistence).not.toBe('');

    const restoredProjectSelectionScope: { current?: { projectId: string; workspaceId?: string } } = {};
    const save = vi.fn(saveProjectIdeMemory);

    const paneTree = openTabInPane(
      { id: 'window-main', root: saved as never, activePaneId: 'pane-main', floatingPanes: [] },
      { paneId: 'pane-main', tab: { id: 'secrets', panel: 'secrets' } },
    ).root;

    const context: Record<string, unknown> = {
      projectIdeMode: true,
      projectId: 'p',
      projectStateReady: true,
      currentWorkspaceId: 'w1',
      restoredProjectSelectionScope,
      getProjectIdeMemorySync,
      saveProjectIdeMemory: save,
      paneTree,
      activePaneId: 'pane-main',
      floatingPanes: [],
      projectEditorWindowId: 'window-main',
      isSecondaryProjectEditorWindow: false,
      projectSelectionToPersist: () => undefined,
      pendingProjectSelectedFile: { current: undefined },
    };

    for (const name of [
      'selectedFile',
      'currentView',
      'rightPanelOpen',
      'rightPanelMode',
      'rightPanelWidth',
      'workspaceTabs',
      'activeWorkspacePanel',
      'agentWidth',
      'terminalBottomOpen',
      'terminalBottomHeight',
      'cursorPositions',
      'scrollPositions',
      'recentTabIds',
      'closedTabs',
      'mobilePanel',
      'editorMinimapEnabled',
      'backendLockedItems',
      'backendDeletedPaths',
    ]) {
      context[name] = undefined;
    }

    const code = ts.transpileModule(`(${persistence})();`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;

    const run = () => new Function(...Object.keys(context), code)(...Object.values(context));
    run();
    expect(save).not.toHaveBeenCalled();
    restoredProjectSelectionScope.current = { projectId: 'p', workspaceId: 'old-workspace' };
    run();
    expect(save).not.toHaveBeenCalled();
    restoredProjectSelectionScope.current = { projectId: 'other-project', workspaceId: 'w1' };
    run();
    expect(save).not.toHaveBeenCalled();
    restoredProjectSelectionScope.current = { projectId: 'p', workspaceId: 'w1' };
    run();
    await flushProjectIdeMemorySaves();
    expect(save).toHaveBeenCalledOnce();
    clearProjectIdeMemoryCacheForTest();

    const restored = await getProjectIdeMemory('p', 'w1');
    expect(restored.ui?.paneTree).toEqual(paneTree);
    expect(restored.ui?.projectEditorWindows?.['window-main'].paneTree).toEqual(paneTree);
    expect(restored.ui?.paneTree?.type === 'leaf' && restored.ui.paneTree.tabs.map((tab) => tab.panel)).toEqual([
      'editor',
      'preview',
      'snapshots',
      'deployments',
      'secrets',
    ]);
  });
});
