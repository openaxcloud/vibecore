/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';
import * as memoryState from './IdeSettingsDraftState';

const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

let preview: ts.JsxElement | undefined;

function visit(node: ts.Node) {
  if (
    ts.isJsxElement(node) &&
    node.openingElement.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(tree) === 'className' &&
        attribute.initializer?.getText(tree) === '"bolt-project-memory-preview"',
    )
  ) {
    preview = node;
  }

  ts.forEachChild(node, visit);
}
visit(tree);

const imports = tree.statements
  .filter(
    (node) => ts.isImportDeclaration(node) && node.moduleSpecifier.getText(tree).includes('./IdeSettingsDraftState'),
  )
  .map((node) => node.getText(tree))
  .join('\n');
const code = ts.transpileModule(
  `${imports}\nexport function Preview({ memoryDraft, memoryTags, memoryType }) { const settings = { id: 'p1' }; const t = key => key; return memoryDraft.trim() ? (${preview!.getText(tree)}) : null; }`,
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } },
).outputText;

const exports: { Preview?: React.ComponentType<{ memoryDraft: string; memoryTags: string; memoryType: string }> } = {};
new Function('require', 'exports', 'React', code)(() => memoryState, exports, React);

const Preview = exports.Preview!;
afterEach(cleanup);
it('renders the actual Memory payload preview when a draft becomes non-empty', () => {
  const view = render(<Preview memoryDraft="" memoryTags="" memoryType="semantic" />);
  expect(view.container.querySelector('pre')).toBeNull();
  view.rerender(<Preview memoryDraft="Brouillon mémoire" memoryTags=" FR, ui,fr " memoryType="procedural" />);
  expect(JSON.parse(view.container.querySelector('pre')!.textContent!)).toEqual({
    scope: 'project',
    projectId: 'p1',
    memoryType: 'procedural',
    tags: ['fr', 'ui'],
    content: 'Brouillon mémoire',
  });
});

it('keeps long JSON complete inside a shrinkable settings card with a scrollable preview', () => {
  const draft = 'Mémoire longue / long memory '.repeat(100);
  const view = render(<Preview memoryDraft={draft} memoryTags="ui" memoryType="semantic" />);
  expect(JSON.parse(view.container.querySelector('pre')!.textContent!).content).toBe(draft);

  // Source guard only: actual card/field bounds remain a compiled-browser assertion.
  const styles = readFileSync(join(__dirname, 'ProjectSettingsPanel.module.scss'), 'utf8');
  expect(styles).toMatch(
    /\.panel\.panel :global\(\.bolt-project-settings-card\)\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  const globalStyles = readFileSync(join(__dirname, '../../styles/index.scss'), 'utf8');
  expect(globalStyles).toMatch(/\.bolt-project-memory-preview\s*\{[\s\S]*?pre\s*\{\s*overflow:\s*auto/);
});
