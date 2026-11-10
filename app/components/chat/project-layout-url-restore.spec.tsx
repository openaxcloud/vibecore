/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { openTabInPane } from '~/lib/project-editor-layout';

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

function visit(node: ts.Node) {
  if (ts.isVariableStatement(node)) {
    const text = node.getText(tree);

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

/*
 * Execute the actual URL effect, restoration predicate and completion callback.
 * Runtime/network dependencies are isolated; layout operations are the real engine.
 */
const compiled = ts.transpileModule(
  `return function Harness({ memory, panel = 'secrets', projectId = 'project-a', currentWorkspaceId }) {
  const projectIdeMode = true, useMobileIde = false;
  ${readiness.join('\n')}
  const gardeDeRestauration = useRef(creerGardeDeRestauration());
  const restoredProjectSelectionScope = useRef();
  ${defaultTree}
  const cloneDefaultPaneTree = () => structuredClone(DEFAULT_PANE_TREE);
  const [paneTree, setPaneTree] = useState(cloneDefaultPaneTree);
  const paneTreeRef = useRef(paneTree); paneTreeRef.current = paneTree;
  const activeProjectPanel = panel, appliedPanelNavigationId = panel;
  const mobileNavigationReady = true, mobilePopRevision = 0;
  const projectEditorWindowId = 'window-main';
  const appliedWorkspacePanelUrlRef = useRef(null), floatingPanesRef = useRef([]), appliedDeployAliasRef = useRef();
  const searchParams = new URLSearchParams();
  const findLeaf = () => undefined, findFloatingLeaf = () => undefined;
  const isIdeRightPanel = () => false, IDE_AGENT_PANEL = 'agent';
  const isIdeWorkspacePanel = (value) => Boolean(value);
  const setRightPanelMode = useCallback(() => {}, []), setRightPanelOpen = useCallback(() => {}, []);
  const setMobileIdePanel = useCallback(() => {}, []), setProjectAgentPanelOpen = useCallback(() => {}, []);
  const requestDeployPanelView = () => {}, ideMobileTarget = () => ({});
  const openWorkspacePanel = useCallback((value) => setPaneTree((root) => openTabInPane(
    { id: 'window-main', root, activePaneId: 'pane-main', floatingPanes: [] },
    { paneId: 'pane-main', tab: { id: 'tab-' + value, panel: value } }
  ).root), []);
  useEffect(() => { ${resetReadiness} gardeDeRestauration.current.oublier(); restoredProjectSelectionScope.current = undefined; setPaneTree(cloneDefaultPaneTree()); }, [projectId]);
  useEffect(() => {
    ${restoreEntry}
    let cancelled = false;
    const restoreFallbackTimer = undefined;
    ${restoreToken}
    memory.then((restoredTree) => {
      if (cancelled) return;
      ${restoreCheck}
      ${applyRestore}
      ${restoreSuccess}
      ${restoreScope}
    }).catch(() => {}).finally(${finalizer});
    return () => { cancelled = true; gardeDeRestauration.current.liberer(jeton); };
  }, [memory, projectId, currentWorkspaceId]);
  ${urlEffect}
  return React.createElement('div', {},
    React.createElement('output', { 'data-testid': 'tree' }, JSON.stringify(paneTree)),
    React.createElement('button', { onClick: () => setProjectStateReady(true) }, 'Fallback'),
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
  'openTabInPane',
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
  openTabInPane,
  laDispositionPeutEtreRestauree,
  resolveProjectEditorToolOpen,
  creerGardeDeRestauration,
) as React.ComponentType<{ memory: Promise<unknown>; panel?: string; projectId?: string; currentWorkspaceId?: string }>;

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
afterEach(cleanup);
describe('initial URL and delayed layout restoration', () => {
  it('restores saved tabs before adding the initial URL panel, even after the readiness fallback', async () => {
    const memory = deferred();
    const view = render(<Harness memory={memory.promise} />);
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
  it('does not reuse readiness across projects or accept a cancelled response on return', async () => {
    const first = deferred();
    const view = render(<Harness memory={first.promise} projectId="a" />);
    await act(async () => first.resolve(saved));

    const second = deferred();
    view.rerender(<Harness memory={second.promise} projectId="b" panel="git" />);
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).not.toContain('git');

    const returned = deferred();
    view.rerender(<Harness memory={returned.promise} projectId="a" />);
    await act(async () => second.resolve(saved));
    expect(read(view).tabs.map((tab: { panel: string }) => tab.panel)).not.toContain('secrets');
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
