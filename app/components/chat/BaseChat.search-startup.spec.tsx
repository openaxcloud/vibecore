/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, fireEvent } from '@testing-library/react';
import React, { useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';
import { resolveIdePanelKey } from '~/lib/ide/panel-registry';

const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const names = [
  'projectPanelResolution',
  'activeProjectPanel',
  '[mobilePanel, setMobilePanel]',
  '[activeMobileOpenTabId, setActiveMobileOpenTabId]',
  '[previousEditorDestination, setPreviousEditorDestination]',
];

const declarations = new Map<string, string>();

let compactGuard = '';
afterEach(cleanup);

function visit(node: ts.Node) {
  if (ts.isIfStatement(node) && node.expression.getText(tree) === 'previousEditorDestination !== activeProjectPanel') {
    compactGuard = node.getText(tree);
  }

  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
    declarations.set(node.name.getText(tree), `const ${node.getText(tree)};`);
  }

  ts.forEachChild(node, visit);
}
visit(tree);

const code = ts.transpileModule(
  `export function InitialSurface({ panel, projectIdeMode, compact = true }) { const useMobileIde = compact; const searchParams = new URLSearchParams(panel ? { panel } : {}); ${names.map((name) => declarations.get(name)).join('\n')} ${compactGuard} return <output data-surface={mobilePanel} data-tab={activeMobileOpenTabId} onClick={() => { setMobilePanel('chat'); setActiveMobileOpenTabId('agent'); }}/>; }`,
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } },
).outputText;

const exports: {
  InitialSurface?: React.ComponentType<{ panel?: string; projectIdeMode: boolean; compact?: boolean }>;
} = {};
new Function('exports', 'React', 'useState', 'useMemo', 'resolveIdePanelKey', code)(
  exports,
  React,
  useState,
  useMemo,
  resolveIdePanelKey,
);

const InitialSurface = exports.InitialSurface!;

it('renders the actual Search startup surface and tab before URL effects', () => {
  expect(renderToStaticMarkup(<InitialSurface panel="search" projectIdeMode />)).toContain(
    'data-surface="search" data-tab="search"',
  );
});

it.each([undefined, 'agent', 'files', 'invalid-panel'])('preserves Agent startup for %s', (panel) => {
  expect(renderToStaticMarkup(<InitialSurface panel={panel} projectIdeMode />)).toContain(
    'data-surface="chat" data-tab="agent"',
  );
});

it('does not change the legacy chat startup', () => {
  expect(renderToStaticMarkup(<InitialSurface panel="search" projectIdeMode={false} />)).toContain(
    'data-surface="chat" data-tab="agent"',
  );
});

it('initializes an explicit Editor project route without an Agent commit', () => {
  expect(renderToStaticMarkup(<InitialSurface panel="editor" projectIdeMode />)).toContain(
    'data-surface="editor" data-tab="editor"',
  );
});

it('synchronizes only the explicit Editor surface before entering compact layout', () => {
  const view = render(<InitialSurface panel="files" projectIdeMode compact={false} />);
  view.rerender(<InitialSurface panel="editor" projectIdeMode compact={false} />);
  expect(view.container.querySelector('output')?.dataset.surface).toBe('editor');
  view.rerender(<InitialSurface panel="editor" projectIdeMode compact />);
  expect(view.container.querySelector('output')?.dataset.surface).toBe('editor');
  expect(view.container.querySelector('output')?.dataset.tab).toBe('editor');
});

it.each([undefined, 'agent', 'files', 'invalid-panel'])(
  'does not redirect %s to Editor when entering compact layout',
  (panel) => {
    const view = render(<InitialSurface panel={panel} projectIdeMode compact={false} />);
    view.rerender(<InitialSurface panel={panel} projectIdeMode compact />);
    expect(view.container.querySelector('output')?.dataset.surface).toBe('chat');
  },
);

it('preserves a pending Agent choice until the URL changes and restores Editor on Back', () => {
  const view = render(<InitialSurface panel="editor" projectIdeMode compact />);
  fireEvent.click(view.container.querySelector('output')!);
  view.rerender(<InitialSurface panel="editor" projectIdeMode compact={false} />);
  expect(view.container.querySelector('output')?.dataset.surface).toBe('chat');
  view.rerender(<InitialSurface panel="editor" projectIdeMode compact />);
  expect(view.container.querySelector('output')?.dataset.surface).toBe('chat');
  view.rerender(<InitialSurface panel="agent" projectIdeMode compact />);
  expect(view.container.querySelector('output')?.dataset.surface).toBe('chat');
  view.rerender(<InitialSurface panel="editor" projectIdeMode compact />);
  expect(view.container.querySelector('output')?.dataset.surface).toBe('editor');
});

it.each(['terminal', 'shell'])('reserves the canonical Terminal startup surface before URL effects for %s', (panel) => {
  expect(renderToStaticMarkup(<InitialSurface panel={panel} projectIdeMode />)).toContain(
    'data-surface="terminal" data-tab="terminal"',
  );
});
