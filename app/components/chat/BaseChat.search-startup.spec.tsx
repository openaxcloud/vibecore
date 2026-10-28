/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { resolveIdePanelKey } from '~/lib/ide/panel-registry';

const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const names = [
  'projectPanelResolution',
  'activeProjectPanel',
  '[mobilePanel, setMobilePanel]',
  '[activeMobileOpenTabId, setActiveMobileOpenTabId]',
];

const declarations = new Map<string, string>();

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
    declarations.set(node.name.getText(tree), `const ${node.getText(tree)};`);
  }

  ts.forEachChild(node, visit);
}
visit(tree);

const code = ts.transpileModule(
  `export function InitialSurface({ panel, projectIdeMode }) { const searchParams = new URLSearchParams(panel ? { panel } : {}); ${names.map((name) => declarations.get(name)).join('\n')} return <output data-surface={mobilePanel} data-tab={activeMobileOpenTabId}/>; }`,
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } },
).outputText;

const exports: { InitialSurface?: React.ComponentType<{ panel?: string; projectIdeMode: boolean }> } = {};
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
