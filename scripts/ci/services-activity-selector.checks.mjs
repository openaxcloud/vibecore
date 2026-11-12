import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { getByRole } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const component = read('app/components/chat/BaseChat.tsx');
const tree = ts.createSourceFile('BaseChat.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const owner = tree.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectActivityPanel',
);

let label;

function visit(node) {
  if (
    ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(tree) === 'label' &&
    node.getText(tree).includes('value={actionFilter}')
  ) {
    label = node.getText(tree);
  }

  ts.forEachChild(node, visit);
}
visit(owner);
assert.ok(label, 'Render the real Activity type filter subtree');

const compiled = ts.transpileModule(`function Filter() { return (${label}); }`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({
  React,
  actionFilter: 'all',
  setActionFilter: () => {},
  filterOptions: { actions: ['project.secret.upsert'] },
  t: (key) => ({ 'chat.copy.type_3deb7456': 'Type', 'chat.copy.allEventTypes_85756507': 'All event types' })[key],
  formatProjectActivityAction: () => 'Secrets / upsert',
});

const Filter = vm.runInContext(`${compiled}; Filter`, context);

const require = createRequire(import.meta.url);
const playwrightRequire = createRequire(require.resolve('@playwright/test'));
const coreRequire = createRequire(playwrightRequire.resolve('playwright'));
const coreRoot = dirname(coreRequire.resolve('playwright-core/package.json'));
const { source } = require(join(coreRoot, 'lib/generated/injectedScriptSource.js'));
const injectedTree = ts.createSourceFile('injected.js', source, ts.ScriptTarget.Latest, true);

const functions = [
  'shouldSkipForTextMatching',
  'normalizeWhiteSpace',
  'elementText',
  'getElementLabels',
  'getAriaLabelledByElements',
  'createTextMatcher',
];
const actualLabelEngine = injectedTree.statements
  .filter((node) => ts.isFunctionDeclaration(node) && functions.includes(node.name?.text))
  .map((node) => node.getText(injectedTree))
  .join('\n');

test('actual Playwright exact-label matcher rejects Activity Type because its label includes option text', () => {
  const dom = new JSDOM(renderToStaticMarkup(React.createElement(Filter)));

  try {
    const scope = vm.createContext({
      Node: dom.window.Node,
      HTMLInputElement: dom.window.HTMLInputElement,
      normalizedWhitespaceCache: undefined,
      select: dom.window.document.querySelector('select'),
    });
    const result = vm.runInContext(
      `${actualLabelEngine}; const labels = getElementLabels(new Map(), select); ({ full: labels[0].full, matches: labels.some(createTextMatcher('"Type"s', true).matcher) });`,
      scope,
    );
    assert.equal(result.matches, false, 'previous locator cannot resolve even after backend response and rendering');
    assert.ok(result.full.includes('All event types'));
    assert.ok(result.full.includes('Secrets / upsert'));
  } finally {
    dom.window.close();
  }
});

test('strict accessible combobox name identifies the same real filter and retains its backend event option', () => {
  const dom = new JSDOM(renderToStaticMarkup(React.createElement(Filter)));

  try {
    const select = getByRole(dom.window.document.body, 'combobox', { name: 'Type', exact: true });
    assert.equal(select, dom.window.document.querySelector('select'));
    assert.equal(select.value, 'all');
    assert.ok([...select.options].some((option) => option.value === 'project.secret.upsert'));

    const dashboard = read('tests/e2e/dashboard.spec.ts');
    assert.ok(
      dashboard.includes(
        "activityPanel.getByRole('combobox', { name: 'Type', exact: true }).selectOption('project.secret.upsert')",
      ),
    );
    assert.ok(!dashboard.includes("activityPanel.getByLabel('Type', { exact: true })"));

    for (const assertion of [
      'displayedEvent.id).toBe(connectionEvent.id)',
      'displayedEvent.createdAt).toBe(connectionEvent.createdAt)',
      "displayedEvent.metadata.key).toBe('DATABASE_URL')",
    ]) {
      assert.ok(dashboard.includes(assertion));
    }
  } finally {
    dom.window.close();
  }
});
