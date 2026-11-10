/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { createI18nInstance } from '~/lib/i18n/runtime';

const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function evaluate(code: string, bindings: Record<string, unknown>) {
  const compiled = ts.transpileModule(code, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}

function declaration(name: string) {
  const node = tree.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);

  if (!node) {
    throw new Error(`Missing production function ${name}`);
  }

  return node.getText(tree);
}
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it('preserves the production default and persisted 320–720px bounds', () => {
  const read = evaluate(
    `${declaration('readProjectBottomTerminalUiState')}\nreturn readProjectBottomTerminalUiState;`,
    {
      PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY: 'terminal-test',
    },
  );
  expect(read()).toEqual({ height: 420, open: false, stored: false });

  for (const [input, expected] of [
    [240, 320],
    [540, 540],
    [900, 720],
  ]) {
    window.localStorage.setItem('terminal-test', JSON.stringify({ height: input, open: true }));
    expect(read()).toEqual({ height: expected, open: true, stored: true });
  }
});

it('renders the actual height, tabs, debugger/output mapping, refresh and close controls', () => {
  const refreshRuntimePorts = vi.fn().mockResolvedValue(undefined);
  const onActiveChange = vi.fn();
  const onClose = vi.fn();

  const Component = evaluate(`${declaration('ProjectBottomTerminal')}\nreturn ProjectBottomTerminal;`, {
    React,
    useTranslation: () => ({ t: createI18nInstance('en').t }),
    useStore: () => null,
    workbenchStore: { refreshRuntimePorts },
    useDiagnosticsStore: () => 0,
    workspaceUiState: () => 'offline',
    SHELL_TERMINAL_LABEL: 'Shell (Terminal)',

    // Controlled child boundaries, not a runtime/PTY test. The parent JSX and callbacks are production code.
    ClientOnly: () => <div data-testid="controlled-shell" />,
    TerminalTabsFallback: () => null,
    ProjectIdeServicePanel: ({ panel }: { panel: string }) => <div data-testid={`service-${panel}`} />,
    ProjectProblemsPanel: () => <div data-testid="controlled-problems" />,
  });

  const props = { height: 420, active: 'terminal', onActiveChange, onClose };
  const view = render(<Component {...props} />);
  expect(screen.getByRole('status', { name: 'Pinned terminal' }).textContent).toBe('420px');
  expect(screen.getByTestId('controlled-shell')).toBeTruthy();

  for (const [label, active] of [
    ['Shell (Terminal)', 'terminal'],
    ['Output', 'output'],
    ['Debug Console', 'debug'],
  ]) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onActiveChange).toHaveBeenLastCalledWith(active);
  }
  fireEvent.click(screen.getByRole('button', { name: /Open problems/i }));
  expect(onActiveChange).toHaveBeenLastCalledWith('problems');

  for (const [active, testId] of [
    ['output', 'service-logs'],
    ['debug', 'service-debugger'],
    ['problems', 'controlled-problems'],
  ]) {
    view.rerender(<Component {...props} height={540} active={active} />);
    expect(screen.getByTestId(testId)).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Pinned terminal' }).textContent).toBe('540px');
  }
  fireEvent.click(screen.getByRole('button', { name: 'Refresh runtime logs' }));
  expect(refreshRuntimePorts).toHaveBeenCalledOnce();
  expect(onActiveChange).toHaveBeenLastCalledWith('terminal');
  fireEvent.click(screen.getByRole('button', { name: 'Close terminal panel' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('keeps the readout and CSS height synchronized throughout a real resize callback and clamps both limits', () => {
  let callback = '';

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(tree) === 'startTerminalResize' &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      callback = node.initializer.arguments[0].getText(tree);
    }

    ts.forEachChild(node, visit);
  };
  visit(tree);
  expect(callback).not.toBe('');

  const setTerminalBottomHeight = vi.fn();
  const handler = evaluate(`return (${callback});`, { terminalBottomHeight: 420, setTerminalBottomHeight });

  const { container } = render(
    <div>
      <div className="bolt-project-main-panes" />
      <div className="bolt-project-bottom-terminal-shell">
        <div data-testid="resize" onMouseDown={handler} />
        <output className="bolt-project-bottom-terminal-size">420px</output>
      </div>
    </div>,
  );
  fireEvent.mouseDown(screen.getByTestId('resize'), { clientY: 500 });

  for (const [clientY, expected] of [
    [380, 540],
    [900, 320],
    [0, 720],
  ]) {
    fireEvent.mouseMove(window, { clientY });
    expect(container.querySelector('output')?.textContent).toBe(`${expected}px`);
    expect(
      (container.querySelector('.bolt-project-bottom-terminal-shell') as HTMLElement).style.getPropertyValue(
        '--project-terminal-height',
      ),
    ).toBe(`${expected}px`);
    expect(
      (container.querySelector('.bolt-project-main-panes') as HTMLElement).style.getPropertyValue(
        '--project-terminal-bottom-height',
      ),
    ).toBe(`${expected}px`);
    expect(setTerminalBottomHeight).not.toHaveBeenCalled();
  }
  fireEvent.mouseUp(window);
  expect(setTerminalBottomHeight).toHaveBeenCalledExactlyOnceWith(720);
  fireEvent.mouseMove(window, { clientY: 380 });
  expect(container.querySelector('output')?.textContent).toBe('720px');
});

/*
 * Execute the E2E's actual assertions, not a duplicate implementation of its contract.
 * Controlled metrics verify assertion sensitivity; they do not prove browser geometry.
 */
const dashboard = readFileSync('tests/e2e/dashboard.spec.ts', 'utf8');
const metricsAssertionsStart = dashboard.indexOf('    expect(terminalMetrics.height)');

const metricsAssertionsEnd = dashboard.indexOf(
  "    await expect(pinnedTerminal.getByRole('button'",
  metricsAssertionsStart,
);

const metricsAssertions = dashboard.slice(metricsAssertionsStart, metricsAssertionsEnd);

const assertTerminalMetrics = (terminalMetrics: Record<string, unknown>) => {
  expect(metricsAssertionsStart).toBeGreaterThan(0);
  expect(metricsAssertionsEnd).toBeGreaterThan(metricsAssertionsStart);
  evaluate(metricsAssertions, { expect, terminalMetrics });
};
const validMetrics = {
  height: 420,
  borderTop: 'rgb(26, 32, 48)',
  background: 'rgb(10, 15, 28)',
  tabbarHeight: 38,
  tabbarBackground: 'rgb(14, 21, 37)',
  tabbarImage: 'none',
  hasStatus: true,
  hasTerminalMeta: true,
  activeTabBorder: 'rgb(43, 50, 69)',
  activeTabShadow: 'rgb(59, 130, 246) 0px 2px 0px 0px inset',
  expectedBorder: 'rgb(26, 32, 48)',
  expectedBackground: 'rgb(10, 15, 28)',
  expectedTabbarBackground: 'rgb(14, 21, 37)',
  expectedActiveBorder: 'rgb(43, 50, 69)',
  expectedAccent: 'rgb(59, 130, 246)',
  tokens: ['#1a2030', '#0a0f1c', '#0e1525', '#2b3245', '#3b82f6'],
};

it('accepts current-contract controlled metrics using the actual Services E2E assertions', () => {
  expect(() => assertTerminalMetrics(validMetrics)).not.toThrow();
});

it.each([
  ['obsolete default', { height: 240 }],
  ['below minimum', { height: 319 }],
  ['above maximum', { height: 721 }],
  ['incorrect default within bounds', { height: 500 }],
  ['incorrect app color', { background: 'rgb(255, 0, 0)' }],
  ['transparent app', { background: 'rgba(0, 0, 0, 0)', expectedBackground: 'rgba(0, 0, 0, 0)' }],
  ['incorrect tabbar color', { tabbarBackground: 'rgb(255, 0, 0)' }],
  ['transparent tabbar', { tabbarBackground: 'rgba(0, 0, 0, 0)', expectedTabbarBackground: 'rgba(0, 0, 0, 0)' }],
  ['incorrect tabbar height', { tabbarHeight: 39 }],
  ['obsolete gradient', { tabbarImage: 'linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))' }],
  ['incorrect top border', { borderTop: 'rgb(255, 0, 0)' }],
  ['incorrect active border', { activeTabBorder: 'rgb(255, 0, 0)' }],
  ['missing active accent', { activeTabShadow: 'none' }],
  ['incorrect active accent', { activeTabShadow: 'rgb(255, 0, 0) 0px 2px 0px 0px inset' }],
  ['missing status', { hasStatus: false }],
  ['missing metadata', { hasTerminalMeta: false }],
  ['unresolved semantic token', { tokens: ['#1a2030', '', '#0e1525', '#2b3245', '#3b82f6'] }],
])('rejects %s using the actual Services E2E assertions', (_label, invalidMetrics) => {
  expect(() => assertTerminalMetrics({ ...validMetrics, ...invalidMetrics })).toThrow();
});
