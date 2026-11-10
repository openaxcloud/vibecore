/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';
import * as keepalive from './mobile-workbench-keepalive';
import { resolveProjectEditorToolOpen } from './project-editor-tool-catalog';
import * as registry from '~/lib/ide/panel-registry';

const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const names = [
  'projectPanelResolution',
  'activeProjectPanel',
  '[mobilePanel, setMobilePanel]',
  '[activeMobileOpenTabId, setActiveMobileOpenTabId]',
  '[mobileWorkbenchKeepAlive, setMobileWorkbenchKeepAlive]',
  'lastMobileWorkbenchPanelRef',
  'mobileWorkbenchPanelActive',
  'setMobileIdePanel',
];

const declarations = new Map<string, string>();

let urlEffect = '';
let keepAliveEffect = '';

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
    declarations.set(node.name.getText(tree), `const ${node.getText(tree)};`);
  }

  if (ts.isExpressionStatement(node) && node.getText(tree).startsWith('useEffect(')) {
    const text = node.getText(tree);

    if (text.includes('const appliedPanelUrl = appliedWorkspacePanelUrlRef.current;')) {
      urlEffect = text;
    }

    if (text.includes('setMobileWorkbenchKeepAlive(true);')) {
      keepAliveEffect = text;
    }
  }

  ts.forEachChild(node, visit);
}
visit(tree);

const chatSource = readFileSync(join(__dirname, 'Chat.client.tsx'), 'utf8');
const chatTree = ts.createSourceFile('Chat.client.tsx', chatSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const chat = chatTree.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'Chat',
);

if (declarations.size !== names.length || !urlEffect || !keepAliveEffect || !chat) {
  throw new Error('Actual compact startup declarations, effects, or Chat handoff missing');
}

interface Commit {
  phase: string;
  surface: string;
  tab: string;
  workbenchMounted: boolean;
}

const commits: Commit[] = [];

let ready = false;

/*
 * Execute the actual state initializers, navigation callback, complete URL
 * effect and keepalive effect inside the actual Chat startup branch. The
 * expensive editor/runtime leaves and persistence are isolated. Different
 * PendingComposerShell/ChatImpl types preserve React's real subtree replacement.
 *
 * JSDOM does not perform layout. We assert the missing-workbench commit that
 * makes the runtime selector return no candidate, not pixel sizes or animation
 * timing. Recording in a layout effect observes the DOM before passive URL
 * reconciliation, which render()/act() otherwise flush before assertions.
 */
const code = ts.transpileModule(
  `
  const noop = () => {};
  const workbenchStore = { setShowWorkbench: noop, setReloadedMessages: noop };
  const persistMobilePanel = noop, openWorkspacePanel = noop, setProjectAgentPanelOpen = noop;
  const projectId = 'preview-startup', currentWorkspaceId = 'workspace', projectEditorWindowId = 'window-main';
  const appliedPanelNavigationId = 'route', projectStateReady = true, mobilePopRevision = 0;
  const projectLayoutReadyFor = projectId;
  const findLeaf = noop, findFloatingLeaf = noop, requestDeployPanelView = noop;
  const renderLogger = { trace: noop }, description = {};
  const useStore = () => '';
  const useEditorCompositionHandoff = (value) => value;

  function Surface({ phase }) {
    const projectIdeMode = true, useMobileIde = true, mobileNavigationReady = true;
    const search = window.location.search;
    const searchParams = useMemo(() => new URLSearchParams(search), [search]);
    ${names
      .filter((name) => name !== 'setMobileIdePanel')
      .map((name) => declarations.get(name))
      .join('\n')}
    const ensureMobileOpenTab = useCallback((tab) => setActiveMobileOpenTabId(tab), []);
    const setMobileServicePanel = noop;
    ${declarations.get('setMobileIdePanel')}
    const appliedWorkspacePanelUrlRef = useRef(null), appliedDeployAliasRef = useRef();
    const paneTreeRef = useRef(null), floatingPanesRef = useRef([]);
    ${keepAliveEffect}
    ${urlEffect}
    const mounted = shouldMountMobileWorkbench({ useMobileIde, mobilePanel, workbenchKeepAlive: mobileWorkbenchKeepAlive });
    useLayoutEffect(() => record({ phase, surface: mobilePanel, tab: activeMobileOpenTabId, workbenchMounted: mounted }));
    return <section data-surface={mobilePanel} data-tab={activeMobileOpenTabId}>
      <button onClick={() => { window.history.replaceState(null, '', '?panel=preview'); setMobileIdePanel('preview'); }}>Preview</button>
      {mounted ? <div data-testid="mobile-workbench-keepalive" data-active={mobileWorkbenchPanelActive ? 'true' : 'false'} /> : null}
    </section>;
  }
  function PendingComposerShell() { return <Surface phase="pending" />; }
  function ChatImpl() { return <Surface phase="active" />; }
  ${chat.getText(chatTree)}
  `,
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } },
).outputText;

const exports: { Chat?: React.ComponentType<{ projectIdeMode: boolean; projectId: string }> } = {};

const bindings = {
  React,
  useState: React.useState,
  useMemo: React.useMemo,
  useRef: React.useRef,
  useCallback: React.useCallback,
  useEffect: React.useEffect,
  useLayoutEffect: React.useLayoutEffect,
  ...registry,
  ...keepalive,
  resolveProjectEditorToolOpen,
  useChatHistory: () => ({ ready, initialMessages: [] }),
  record: (commit: Commit) => {
    commits.push(commit);
  },
};
new Function('exports', ...Object.keys(bindings), code)(exports, ...Object.values(bindings));

const Chat = exports.Chat!;

afterEach(() => {
  cleanup();
  commits.length = 0;
  ready = false;
  window.history.replaceState(null, '', '/');
});

it.each(['preview', 'editor', 'search', 'terminal', 'shell'])(
  'commits the requested %s surface and tab before passive URL reconciliation',
  (panel) => {
    window.history.replaceState(null, '', `/projects/preview-startup/ide?panel=${panel}`);
    ready = true;
    render(<Chat projectIdeMode projectId="preview-startup" />);

    const expected = panel === 'shell' ? 'terminal' : panel;

    expect(commits[0]).toEqual({ phase: 'active', surface: expected, tab: expected, workbenchMounted: true });
    expect(commits.every((commit) => commit.surface === expected && commit.tab === expected)).toBe(true);
  },
);

it('keeps Preview mounted in the first active commit when the pending Chat shell is replaced', () => {
  window.history.replaceState(null, '', '/projects/preview-startup/ide?panel=agent');

  const view = render(<Chat projectIdeMode projectId="preview-startup" />);
  fireEvent.click(view.getByRole('button', { name: 'Preview' }));

  const pendingWorkbench = view.getByTestId('mobile-workbench-keepalive');
  expect(pendingWorkbench.getAttribute('data-active')).toBe('true');
  commits.length = 0;

  ready = true;
  view.rerender(<Chat projectIdeMode projectId="preview-startup" />);

  expect(pendingWorkbench.isConnected).toBe(false);
  expect(window.location.search).toBe('?panel=preview');
  expect(commits[0]).toEqual({ phase: 'active', surface: 'preview', tab: 'preview', workbenchMounted: true });
  expect(commits.every((commit) => commit.surface === 'preview' && commit.tab === 'preview')).toBe(true);
  expect(view.getByTestId('mobile-workbench-keepalive').getAttribute('data-active')).toBe('true');
});

it.each(['', '?panel=agent', '?panel=invalid-panel'])(
  'does not force Preview during startup or handoff for %s',
  (query) => {
    window.history.replaceState(null, '', `/projects/preview-startup/ide${query}`);

    const view = render(<Chat projectIdeMode projectId="preview-startup" />);
    ready = true;
    view.rerender(<Chat projectIdeMode projectId="preview-startup" />);

    expect(commits.every((commit) => commit.surface === 'chat' && commit.tab === 'agent')).toBe(true);
    expect(view.queryByTestId('mobile-workbench-keepalive')).toBeNull();
  },
);
