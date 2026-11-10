/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { useGlobalIdePalette } from '~/components/chat/IdePaletteState';
import { createI18nInstance } from '~/lib/i18n/runtime';

const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dashboard = readFileSync('tests/e2e/dashboard.spec.ts', 'utf8');
const dashboardTree = ts.createSourceFile('dashboard.spec.ts', dashboard, ts.ScriptTarget.Latest, true);

function findNode(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  const matches: ts.Node[] = [];

  const visit = (node: ts.Node) => {
    if (predicate(node)) {
      matches.push(node);
    }

    ts.forEachChild(node, visit);
  };
  visit(root);
  expect(matches).toHaveLength(1);

  return matches[0];
}

function initializer(name: string) {
  const node = findNode(tree, (item) => ts.isVariableDeclaration(item) && item.name.getText(tree) === name);
  const value = (node as ts.VariableDeclaration).initializer!;

  return (ts.isCallExpression(value) ? value.arguments[0] : value).getText(tree);
}

const palette = findNode(
  tree,
  (node) =>
    ts.isBinaryExpression(node) &&
    node.left.getText(tree) === 'commandPaletteOpen' &&
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken,
).getText(tree);
const addTab = findNode(
  tree,
  (node) =>
    ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(tree) === 'button' &&
    node.openingElement.attributes.properties.some(
      (prop) => ts.isJsxAttribute(prop) && prop.getText(tree) === 'data-testid="tab-add"',
    ),
).getText(tree);

const services = findNode(
  dashboardTree,
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(dashboardTree) === 'test' &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === 'IDE project services open as in-place panels instead of legacy project pages',
);
const visibility = findNode(
  services,
  (node) =>
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'toBeVisible' &&
    node.expression.expression.getText(dashboardTree).includes("'Command palette'"),
) as ts.CallExpression;

const assertion = (visibility.expression as ts.PropertyAccessExpression).expression as ts.CallExpression;
const locator = assertion.arguments[0].getText(dashboardTree);

function evaluate<T>(code: string, bindings: Record<string, unknown>): T {
  return new Function(
    ...Object.keys(bindings),
    ts.transpileModule(code, {
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  )(...Object.values(bindings));
}

/*
 * Execute the real Services locator with DOM accessibility queries, not a copied selector.
 * This does not claim browser visibility/actionability coverage; the E2E still owns it.
 */
function servicePalette() {
  return evaluate<HTMLElement>(`return ${locator};`, {
    page: {
      getByRole: (role: string, options: { name: string; exact: boolean }) => screen.getByRole(role, options),
      getByLabel: (label: string) => screen.getByLabelText(label, { exact: false }),
    },
  });
}

function mountPalette() {
  const openIdeTool = vi.fn();

  let open: () => void = () => {
    throw new Error('Palette has not rendered');
  };

  const t = createI18nInstance('en').t;

  const commandPaletteEntries = [
    { id: 'snapshots', kind: 'tool', panel: 'snapshots', title: 'Snapshots', description: 'Project snapshots' },
  ];

  function Palette() {
    const state = useGlobalIdePalette();
    const bindings = { React, t, ...state, commandPaletteEntries, openIdeTool, useMobileIde: false };
    open = evaluate<() => void>(`return (${initializer('openCommandPalette')});`, bindings);

    const runCommandPaletteEntry = evaluate<() => void>(`return (${initializer('runCommandPaletteEntry')});`, bindings);

    /*
     * Production conditional JSX, accessible labels and event handlers. Only unrelated
     * editor/runtime boundaries and the supplied tool entry are controlled here.
     */
    return evaluate<React.ReactNode>(`return (<>{${palette}}{${addTab}}</>);`, {
      ...bindings,
      runCommandPaletteEntry,
      commandPaletteAutoFocus: true,
      commandPaletteSections: [{ name: 'Tools', entries: commandPaletteEntries }],
      addTabButtonRef: null,
      commandPaletteShortcut: 'Ctrl+K',
      open: false,
      closeToolMenu: vi.fn(),
      openToolMenu: vi.fn(),
    });
  }

  render(<Palette />);

  return { open: () => act(() => open()), openIdeTool };
}

afterEach(cleanup);

it('keeps the Services keyboard check on the unique dialog instead of all three command-palette labels', () => {
  const fixture = mountPalette();
  fixture.open();

  const oldMatches = screen.getAllByLabelText('Command palette', { exact: false });
  expect(oldMatches.map((element) => element.getAttribute('data-testid'))).toEqual([
    'command-palette-backdrop',
    'project-command-palette',
    'tab-add',
  ]);
  expect(() => screen.getByLabelText('Command palette', { exact: false })).toThrow(/multiple elements/i);
  expect(servicePalette()).toBe(screen.getByTestId('project-command-palette'));
  expect(screen.getAllByRole('dialog', { name: 'Command palette' })).toHaveLength(1);
  expect(locator).toBe("page.getByRole('dialog', { name: 'Command palette', exact: true })");
  expect(visibility.arguments).toHaveLength(0); // Preserve the default visibility timeout.
  expect(services.getText(dashboardTree)).toContain(
    "await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');",
  );
  expect(services.getText(dashboardTree)).toContain("await page.keyboard.press('Escape');");
});

it.each(['Escape', 'backdrop'] as const)(
  'does not mistake the persistent Add tab button for a dialog after %s',
  (close) => {
    const fixture = mountPalette();
    expect(() => servicePalette()).toThrow();
    fixture.open();
    expect(servicePalette().getAttribute('aria-modal')).toBe('true');

    if (close === 'Escape') {
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search commands' }), { key: 'Escape' });
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Close command palette' }));
    }

    expect(screen.queryByTestId('project-command-palette')).toBeNull();
    expect(() => servicePalette()).toThrow();
    expect(screen.getByLabelText('Command palette', { exact: false })).toBe(screen.getByTestId('tab-add'));
    fixture.open();
    expect(servicePalette()).toBe(screen.getByTestId('project-command-palette'));
  },
);

it.each(['Enter', 'click'] as const)('retains production tool activation and dismissal by %s', (activation) => {
  const fixture = mountPalette();
  fixture.open();

  if (activation === 'Enter') {
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search commands' }), { key: 'Enter' });
  } else {
    fireEvent.click(screen.getByRole('option', { name: /Snapshots/ }));
  }

  expect(fixture.openIdeTool).toHaveBeenCalledExactlyOnceWith('snapshots');
  expect(screen.queryByTestId('project-command-palette')).toBeNull();
  expect(() => servicePalette()).toThrow();
});
