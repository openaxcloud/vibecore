/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * Execute the real visibility setter and restoration condition. Loading IDE
 * memory must not undo a newer close/reopen made through the files control.
 */
const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations: string[] = [];
const restorations: string[] = [];
const effects = new Map<string, string>();

function visit(node: ts.Node) {
  if (ts.isVariableStatement(node)) {
    const names = node.declarationList.declarations.flatMap((declaration) =>
      ts.isArrayBindingPattern(declaration.name)
        ? declaration.name.elements.map((element) => element.getText(tree))
        : [declaration.name.getText(tree)],
    );

    if (names.some((name) => ['rightPanelOpen', 'rightPanelVisibilityChanged', 'setRightPanelOpen'].includes(name))) {
      declarations.push(node.getText(tree));
    }
  }

  if (ts.isIfStatement(node) && node.expression.getText(tree).includes("typeof ui?.rightPanelOpen === 'boolean'")) {
    restorations.push(node.getText(tree));
  }

  if (ts.isIfStatement(node) && node.expression.getText(tree) === 'isIdeRightPanel(activeProjectPanel)') {
    effects.set('url', node.getText(tree));
  }

  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') {
    const callback = node.arguments[0]?.getText(tree) ?? '';

    if (callback.includes('rightPanelVisibilityChanged.current = false')) {
      expect(node.arguments[1]?.getText(tree)).toContain('projectId');
      effects.set('reset', 'rightPanelVisibilityChanged.current = false;');
    }

    if (callback.includes('typeof projectFilesPanelRequest.open')) {
      effects.set('request', callback);
    }

    if (callback.includes('const handleToggleFilesPanel')) {
      effects.set('event', callback);
    }
  }

  ts.forEachChild(node, visit);
}

visit(tree);
expect(restorations).toHaveLength(1);
expect(effects.size).toBe(4);

const compiled = ts.transpileModule(
  `return function FilesPanelRestoreHarness({ memory, projectId = 'project-a', request, panel }) {
    ${declarations.join('\n')}
    const projectIdeMode = true;
    const projectFilesPanelRequest = request;
    const activeProjectPanel = panel;
    const useMobileIde = false;
    const setRightPanelMode = () => {};
    const setMobileIdePanel = () => {};
    const setProjectPanelSearchParam = () => {};
    const isIdeRightPanel = (value) => value === 'files';
    useEffect(() => { ${effects.get('reset')} }, [projectId]);
    useEffect(${effects.get('request')}, [projectId, request]);
    useEffect(${effects.get('event')}, [projectId]);
    useEffect(() => { ${effects.get('url')} }, [projectId, panel]);
    return React.createElement('div', {},
      React.createElement('output', { 'data-testid': 'files-state' }, String(rightPanelOpen)),
      React.createElement('button', { onClick: () => setRightPanelOpen((open) => !open) }, 'Toggle files'),
      React.createElement('button', { onClick: () => { const ui = memory; ${restorations[0]} } }, 'Resolve memory')
    );
  };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const FilesPanelRestoreHarness = new Function('React', 'useState', 'useRef', 'useCallback', 'useEffect', compiled)(
  React,
  useState,
  useRef,
  useCallback,
  useEffect,
) as React.ComponentType<{
  memory: { rightPanelOpen?: boolean };
  projectId?: string;
  request?: { projectId: string; open: boolean; requestId: number };
  panel?: string;
}>;

afterEach(cleanup);

describe('files panel visibility restoration', () => {
  it('restores an untouched panel from saved memory', () => {
    const view = render(<FilesPanelRestoreHarness memory={{ rightPanelOpen: false }} />);
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('false');
  });

  it('does not undo a close then reopen when an older closed state arrives', () => {
    const view = render(<FilesPanelRestoreHarness memory={{ rightPanelOpen: false }} />);
    fireEvent.click(view.getByRole('button', { name: 'Toggle files' }));
    expect(view.getByTestId('files-state').textContent).toBe('false');
    fireEvent.click(view.getByRole('button', { name: 'Toggle files' }));
    expect(view.getByTestId('files-state').textContent).toBe('true');
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('true');
  });

  it('does not reopen a panel explicitly closed during restoration', () => {
    const view = render(<FilesPanelRestoreHarness memory={{ rightPanelOpen: true }} />);
    fireEvent.click(view.getByRole('button', { name: 'Toggle files' }));
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('false');
  });

  it('keeps a panel interactive after restoration', () => {
    const view = render(<FilesPanelRestoreHarness memory={{ rightPanelOpen: false }} />);
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    fireEvent.click(view.getByRole('button', { name: 'Toggle files' }));
    expect(view.getByTestId('files-state').textContent).toBe('true');
    fireEvent.click(view.getByRole('button', { name: 'Toggle files' }));
    expect(view.getByTestId('files-state').textContent).toBe('false');
  });

  it('restores the next project after a choice in the previous project', () => {
    const view = render(<FilesPanelRestoreHarness projectId="project-a" memory={{ rightPanelOpen: true }} />);
    fireEvent.click(view.getByRole('button', { name: 'Toggle files' }));
    expect(view.getByTestId('files-state').textContent).toBe('false');
    view.rerender(<FilesPanelRestoreHarness projectId="project-b" memory={{ rightPanelOpen: true }} />);
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('true');
  });

  it('ignores a retained request from the previous project without blocking restoration', () => {
    const request = { projectId: 'project-a', open: true, requestId: 1 };

    const view = render(
      <FilesPanelRestoreHarness projectId="project-a" request={request} memory={{ rightPanelOpen: true }} />,
    );
    view.rerender(
      <FilesPanelRestoreHarness projectId="project-b" request={request} memory={{ rightPanelOpen: false }} />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('false');
  });

  it('keeps the current project header request when its memory arrives later', () => {
    const request = { projectId: 'project-a', open: true, requestId: 1 };
    const view = render(<FilesPanelRestoreHarness request={request} memory={{ rightPanelOpen: false }} />);
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('true');
  });

  it('lets the explicit files URL override old closed memory after changing projects', () => {
    const view = render(<FilesPanelRestoreHarness projectId="project-a" memory={{ rightPanelOpen: false }} />);
    fireEvent.click(view.getByRole('button', { name: 'Toggle files' }));
    view.rerender(<FilesPanelRestoreHarness projectId="project-b" panel="files" memory={{ rightPanelOpen: false }} />);
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('true');
  });

  it('ignores a header event for another project and accepts its own', () => {
    const view = render(<FilesPanelRestoreHarness memory={{ rightPanelOpen: true }} />);
    fireEvent(
      window,
      new CustomEvent('vibecore:toggle-project-files-panel', { detail: { projectId: 'project-b', open: false } }),
    );
    expect(view.getByTestId('files-state').textContent).toBe('true');
    fireEvent(
      window,
      new CustomEvent('vibecore:toggle-project-files-panel', { detail: { projectId: 'project-a', open: false } }),
    );
    fireEvent.click(view.getByRole('button', { name: 'Resolve memory' }));
    expect(view.getByTestId('files-state').textContent).toBe('false');
  });
});
