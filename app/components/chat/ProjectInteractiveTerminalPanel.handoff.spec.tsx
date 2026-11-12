/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React, { StrictMode, useCallback, useEffect, useState, type ReactNode } from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as handoff from '~/components/workbench/terminal/TerminalInteractionHandoff';

const baseSource = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const chatSource = readFileSync(join(__dirname, 'Chat.client.tsx'), 'utf8');

function extract(source: string, name: string) {
  const tree = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const declaration = tree.statements.find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );

  if (!declaration) {
    throw new Error(`Published terminal handoff component missing: ${name}`);
  }

  return declaration.getText(tree).replace(/^export\s+/, '');
}

let ready = false;

const fetchPanel = vi.fn(() => new Promise<Response>(() => undefined));
const t = (key: string) => (key === 'chat.copy.runtimePanels_8560a91c' ? 'Runtime panels' : key);
const leaf = () => <div />;
const children = ({ children }: { children: ReactNode }) => <>{children}</>;

/*
 * Run the actual terminal wrapper, hub and Chat startup branch. Only expensive
 * runtime leaves and transport are isolated; the hub toggle, tab navigation and
 * React's PendingComposerShell -> ChatImpl subtree replacement are real.
 */
const dependencies = {
  React,
  useState,
  useEffect,
  useCallback,
  Suspense: React.Suspense,
  ...handoff,
  useTranslation: () => ({ t, i18n: { language: 'en' } }),
  resolvedBaseChatLanguage: () => 'en',
  runtimePortsFromPayload: () => [],
  runtimeWorkspaceFromPanelData: () => undefined,
  runtimeStatusText: () => 'loading',
  formatBaseChatAstNumber: (_language: string, value: number) => String(value),
  ClientOnly: ({ children }: { children: () => ReactNode }) => children(),
  TerminalTabsFallback: leaf,
  PanelBoundary: children,
  PanelGroup: children,
  LazyTerminalTabs: () => <button>Shell sessions</button>,
  SHELL_TERMINAL_LABEL: 'Shell',
  PanelRows: leaf,
  PanelButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  PanelInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  TERMINAL_SCRIPT_TEMPLATES: [],
  fetch: fetchPanel,
  renderLogger: { trace: () => undefined },
  useChatHistory: () => ({
    ready,
    initialMessages: [],
    storeMessageHistory: () => undefined,
    importChat: () => undefined,
    exportChat: () => undefined,
  }),
  useStore: () => '',
  description: {},
  useEditorCompositionHandoff: (value: boolean) => value,
  workbenchStore: { setReloadedMessages: () => undefined },
  PendingComposerShell: (props: PanelProps) => <components.Panel {...props} paneId="pane-a" />,
  ChatImpl: (props: PanelProps) => <components.Panel {...props} paneId="pane-a" />,
};

interface PanelProps {
  projectId?: string;
  paneId?: string;
}

const javascript = ts.transpileModule(
  [
    extract(baseSource, 'ProjectInteractiveTerminalPanel'),
    extract(baseSource, 'ProjectTerminalPanel'),
    extract(chatSource, 'Chat'),
    'return { Panel: ProjectInteractiveTerminalPanel, Chat };',
  ].join('\n'),
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const components = new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies)) as {
  Panel: React.ComponentType<PanelProps>;
  Chat: React.ComponentType<{ projectId: string; projectIdeMode: boolean }>;
};

const { Panel, Chat } = components;

function Host({
  projectId = 'project-a',
  workspaceId = 'workspace-a',
  windowId = 'window-a',
  children,
}: {
  projectId?: string;
  workspaceId?: string;
  windowId?: string;
  children?: ReactNode;
}) {
  return (
    <StrictMode>
      <handoff.TerminalInteractionHandoffProvider projectId={projectId} workspaceId={workspaceId} windowId={windowId}>
        {children ?? <Chat projectId={projectId} projectIdeMode />}
      </handoff.TerminalInteractionHandoffProvider>
    </StrictMode>
  );
}

const toggle = () => fireEvent.click(screen.getByRole('button', { name: 'Runtime panels' }));

const expectClosed = () => {
  expect(screen.getByRole('button', { name: 'Runtime panels' }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByTestId('terminal-hub-panel')).toBeNull();
};

beforeEach(() => {
  ready = false;
  fetchPanel.mockClear();
});
afterEach(cleanup);

describe('Runtime panels during the real Chat startup handoff', () => {
  it('keeps an explicitly opened hub and its real script control when the pending shell is replaced', () => {
    const view = render(<Host />);
    toggle();

    const firstHub = screen.getByTestId('terminal-hub-panel');
    expect(screen.getByTestId('tab-scripts')).toBeTruthy();
    ready = true;
    view.rerender(<Host />);
    expect(firstHub.isConnected).toBe(false);
    expect(screen.getByRole('button', { name: 'Runtime panels' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByTestId('tab-scripts'));
    expect(screen.getByTestId('button-create-script')).toBeTruthy();
    expect(screen.getByTestId('tab-environment')).toBeTruthy();
  });

  it('leaves an untouched closed hub closed across startup', () => {
    const view = render(<Host />);
    ready = true;
    view.rerender(<Host />);
    expectClosed();
  });

  it('does not undo an explicit close before or after a shell replacement', () => {
    const view = render(<Host />);
    toggle();
    toggle();
    ready = true;
    view.rerender(<Host />);
    expectClosed();
    toggle();
    expect(screen.getByTestId('terminal-hub-panel')).toBeTruthy();
    toggle();
    ready = false;
    view.rerender(<Host />);
    expectClosed();
  });

  it.each(['projectId', 'workspaceId', 'windowId'] as const)('does not transfer an open hub across %s', (field) => {
    const view = render(<Host />);
    toggle();
    view.rerender(<Host {...{ [field]: 'different-scope' }} />);
    expectClosed();
    view.rerender(<Host />);
    expectClosed();
  });

  it('keeps separate pane states and respects closing just one pane', () => {
    const panes = (generation: number) => (
      <Host>
        <section data-testid="pane-a" key={`a-${generation}`}>
          <Panel projectId="project-a" paneId="pane-a" />
        </section>
        <section data-testid="pane-b" key={`b-${generation}`}>
          <Panel projectId="project-a" paneId="pane-b" />
        </section>
      </Host>
    );

    const view = render(panes(0));
    fireEvent.click(within(screen.getByTestId('pane-a')).getByRole('button', { name: 'Runtime panels' }));
    view.rerender(panes(1));
    expect(within(screen.getByTestId('pane-a')).getByTestId('terminal-hub-panel')).toBeTruthy();
    expect(within(screen.getByTestId('pane-b')).queryByTestId('terminal-hub-panel')).toBeNull();
    fireEvent.click(within(screen.getByTestId('pane-b')).getByRole('button', { name: 'Runtime panels' }));
    fireEvent.click(within(screen.getByTestId('pane-a')).getByRole('button', { name: 'Runtime panels' }));
    view.rerender(panes(2));
    expect(within(screen.getByTestId('pane-a')).queryByTestId('terminal-hub-panel')).toBeNull();
    expect(within(screen.getByTestId('pane-b')).getByTestId('terminal-hub-panel')).toBeTruthy();
  });

  it('discards route state after leaving and returning', () => {
    const view = render(<Host />);
    toggle();
    view.rerender(<div />);
    view.rerender(<Host />);
    expectClosed();
  });

  it.each([false, true])('keeps unidentified legacy instances local (provider=%s)', (provider) => {
    const tree = (generation: number) => {
      const panel = <Panel key={generation} projectId="project-a" />;
      return provider ? <Host>{panel}</Host> : panel;
    };

    const view = render(tree(0));
    toggle();
    view.rerender(tree(1));
    expectClosed();
  });

  it('requires the real route provider to surround both loading and active shells', () => {
    const route = readFileSync(join(__dirname, '../../routes/projects.$projectId.ide.tsx'), 'utf8');
    const start = route.indexOf('<TerminalInteractionHandoffProvider');
    const end = route.indexOf('</TerminalInteractionHandoffProvider>', start);
    const wrapped = route.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(wrapped).toContain('projectId={projectId}');
    expect(wrapped).toContain('workspaceId={currentWorkspaceId}');
    expect(wrapped).toContain("windowId={searchParams.get('peWindow') || 'window-main'}");
    expect(wrapped).toContain('<Suspense fallback={optimisticShell}>');
    expect(wrapped).toContain('<ProjectIdeChat');
    expect(baseSource).toContain('<ProjectInteractiveTerminalPanel projectId={projectId} paneId={paneId} />');
  });
});
