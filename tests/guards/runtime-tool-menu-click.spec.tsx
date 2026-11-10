/** @vitest-environment jsdom */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import React from 'react';
import { createPortal } from 'react-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Test-only helper is outside the application alias.
import { createServiceProgress, SERVICE_PHASES } from '../e2e/helpers/runtime-service-progress';
import { IdePaletteProvider, useIdePalette } from '~/components/chat/IdePaletteState';
import {
  TAB_DRAG_PANE_MIME,
  TAB_DRAG_TAB_MIME,
  dropSlotForTab,
  isProjectEditorTabDrag,
} from '~/components/chat/project-editor-tab-drag';
import {
  PROJECT_EDITOR_TOOL_CATEGORY_LABEL_KEYS,
  projectEditorToolsByCategory,
  resolveProjectEditorToolOpen,
} from '~/components/chat/project-editor-tool-catalog';
import { PanelEmptyState } from '~/components/project-ide/PanelPrimitives';
import { getBaseChatAstCopy } from '~/lib/i18n/catalogs/base-chat-ast';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { formatKeybindingCombo } from '~/lib/keybindings';
import { SHELL_TERMINAL_LABEL } from '~/lib/mobile-ide-tabs';
import { ECODE_MOBILE_TAB_META_BASE } from '~/lib/mobile-tab-meta';
import { classNames } from '~/utils/classNames';

/*
 * Execute the private production tab bar, catalog, translations and route-owned
 * palette state without importing BaseChat's unrelated editor/runtime services.
 * This proves the detached-node failure mechanism, not that it caused a specific
 * CI failure. The real dashboard scenario still asserts its URL and service panel.
 */
const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionNames = ['IdeTabBar', 'moveTabFocus', 'toolDisplayTitle', 'panelTitle'];

const functions = tree.statements.filter(
  (node) => ts.isFunctionDeclaration(node) && functionNames.includes(node.name?.text ?? ''),
);
const descriptions = tree.statements.filter(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some((declaration) => declaration.name.getText(tree) === 'IDE_TOOL_DESCRIPTIONS'),
);
expect(functions).toHaveLength(functionNames.length);
expect(descriptions).toHaveLength(1);

const bindings = {
  React,
  useState: React.useState,
  useRef: React.useRef,
  useEffect: React.useEffect,
  useLayoutEffect: React.useLayoutEffect,
  useCallback: React.useCallback,
  useTranslation,
  useIdePalette,
  createPortal,
  PROJECT_EDITOR_TOOL_CATEGORY_LABEL_KEYS,
  projectEditorToolsByCategory,
  TAB_DRAG_PANE_MIME,
  TAB_DRAG_TAB_MIME,
  dropSlotForTab,
  isProjectEditorTabDrag,
  PanelEmptyState,
  getBaseChatAstCopy,
  formatKeybindingCombo,
  SHELL_TERMINAL_LABEL,
  ECODE_MOBILE_TAB_META_BASE,
  classNames,
};
const componentCode = ts.transpileModule(
  [...descriptions, ...functions].map((node) => node.getText(tree)).join('\n') + '\nreturn IdeTabBar;',
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText;
const IdeTabBar = new Function(...Object.keys(bindings), componentCode)(
  ...Object.values(bindings),
) as React.ComponentType<{
  activePanel: 'editor';
  paneId: string;
  tabs: [];
  onSelect: () => void;
  onOpenTool: (panel: string) => void;
}>;

const dashboard = readFileSync('tests/e2e/dashboard.spec.ts', 'utf8');

const dashboardTree = ts.createSourceFile(
  'dashboard.spec.ts',
  dashboard,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const helper = dashboardTree.statements.filter(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'clickIdeToolMenuItem',
);
expect(helper).toHaveLength(1);

interface ScopedMenuDriver {
  getByRole: (role: 'button', options: { name: RegExp }) => { click: () => Promise<void> };
}

const clickIdeToolMenuItem = new Function(
  ts.transpileModule(helper[0].getText(dashboardTree) + '\nreturn clickIdeToolMenuItem;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText,
)() as (menu: ScopedMenuDriver, name: RegExp) => Promise<void>;

afterEach(cleanup);

function mountPalette(open = true) {
  const i18n = createI18nInstance('en');
  const onOpenTool = vi.fn<(panel: string) => void>();
  const onSelect = vi.fn();

  const layout = (shell: string) => (
    <I18nextProvider i18n={i18n}>
      <IdePaletteProvider projectId="palette-regression" windowId="main">
        <IdeTabBar
          key={shell}
          activePanel="editor"
          paneId="pane-main"
          tabs={[]}
          onSelect={onSelect}
          onOpenTool={onOpenTool}
        />
      </IdePaletteProvider>
    </I18nextProvider>
  );

  const view = render(layout('loading-shell'));

  if (open) {
    fireEvent.click(view.getByTestId('tab-add'));
  }

  return {
    view,
    onOpenTool,
    replaceShell: () => view.rerender(layout('loaded-shell')),
    menu: () => view.getByRole('dialog', { name: 'Add tab command palette' }),
  };
}

describe('runtime tool menu selection across shell replacement', () => {
  it('delivers a connected synthetic click to the real Snapshots handler and closes the palette', () => {
    const fixture = mountPalette();
    const button = within(fixture.menu()).getByRole('button', { name: /Snapshots/ });

    expect(button.getAttribute('data-testid')).toBe('feature-snapshots');
    act(() => button.click());
    expect(fixture.onOpenTool.mock.calls).toEqual([['snapshots']]);
    expect(fixture.view.queryByRole('dialog', { name: 'Add tab command palette' })).toBeNull();
  });

  it('retains the detached-menu baseline: finding and clicking its button does not activate the replacement', () => {
    const fixture = mountPalette();
    const staleMenu = fixture.menu();
    fixture.replaceShell();

    expect(staleMenu.isConnected).toBe(false);
    expect(fixture.menu()).not.toBe(staleMenu);

    // The old evaluate helper reported success from exactly this detached DOM operation.
    const staleButton = within(staleMenu).getByRole('button', { name: /Snapshots/ });
    expect(staleButton.isConnected).toBe(false);
    act(() => staleButton.click());
    expect(fixture.onOpenTool).not.toHaveBeenCalled();
    expect(fixture.menu().isConnected).toBe(true);

    fireEvent.click(within(fixture.menu()).getByRole('button', { name: /Snapshots/ }));
    expect(fixture.onOpenTool.mock.calls).toEqual([['snapshots']]);
    expect(fixture.view.queryByRole('dialog', { name: 'Add tab command palette' })).toBeNull();
  });

  it('executes the dashboard helper through a scoped live role action after the shell changes', async () => {
    const fixture = mountPalette();
    const originalMenu = fixture.menu();
    const name = /Snapshots/;

    const click = vi.fn(async () => {
      fixture.replaceShell();
      expect(originalMenu.isConnected).toBe(false);
      fireEvent.click(within(fixture.menu()).getByRole('button', { name }));
    });
    const getByRole = vi.fn((role: 'button', options: { name: RegExp }) => {
      expect(role).toBe('button');
      expect(options).toEqual({ name });
      expect(options.name).toBe(name);

      return { click };
    });

    /*
     * This jsdom driver models locator resolution at action time. It is not a
     * browser actionability test; the real Playwright scenario remains intact.
     * Executing the extracted helper also prevents reintroducing evaluate/force.
     */
    await clickIdeToolMenuItem({ getByRole }, name);
    expect(getByRole).toHaveBeenCalledTimes(1);
    expect(click.mock.calls).toEqual([[]]);
    expect(fixture.onOpenTool.mock.calls).toEqual([['snapshots']]);
    expect(fixture.view.queryByRole('dialog', { name: 'Add tab command palette' })).toBeNull();
  });
});

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

const services = findNode(
  dashboardTree,
  (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText(dashboardTree) === 'test' &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === 'IDE project services open as in-place panels instead of legacy project pages',
);
const panels = findNode(
  services,
  (node) => ts.isVariableDeclaration(node) && node.name.getText(dashboardTree) === 'inIdePanels',
) as ts.VariableDeclaration;
const panelLoop = findNode(
  services,
  (node) => ts.isForOfStatement(node) && node.expression.getText(dashboardTree) === 'inIdePanels',
) as ts.ForOfStatement;
const navigation = (panelLoop.statement as ts.Block).statements.filter((node) =>
  node.getText(dashboardTree).includes('await openIdeTool('),
);
expect(navigation).toHaveLength(1);

function evaluate<T>(code: string, bindings: Record<string, unknown> = {}): T {
  return new Function(
    ...Object.keys(bindings),
    ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
  )(...Object.values(bindings));
}

const servicePanels = evaluate<readonly (readonly [string, string])[]>(
  `return ${panels.initializer!.getText(dashboardTree)};`,
);
const openIdeTool = findNode(
  services,
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'openIdeTool',
).getText(dashboardTree);

async function runServicesNavigation(fixture: ReturnType<typeof mountPalette>, panel: string) {
  const entry = servicePanels.find(([, id]) => id === panel);
  expect(entry).toBeDefined();

  /*
   * Run the actual E2E loop's selection and helper against the production menu.
   * This DOM driver only covers accessible lookup, search and click handlers;
   * HTTP, URL, browser actionability and panel assertions remain in Playwright.
   */
  const menu = {
    getByRole: (role: 'button' | 'textbox', options: { name: string | RegExp; exact?: boolean }) => ({
      click: async () => fireEvent.click(within(fixture.menu()).getByRole(role, options)),
      fill: async (value: string) =>
        fireEvent.change(within(fixture.menu()).getByRole(role, options), { target: { value } }),
    }),
    getByTestId: (testId: string) => ({
      click: async () => fireEvent.click(within(fixture.menu()).getByTestId(testId)),
    }),
  };

  const page = {};

  await evaluate<Promise<void>>(`return (async () => { ${openIdeTool}\n${navigation[0].getText(dashboardTree)} })();`, {
    page,
    label: entry![0],
    panel,
    clickIdeToolMenuItem,
    openVisibleIdeToolMenu: async (target: unknown) => {
      expect(target).toBe(page);
      fireEvent.click(fixture.view.getByTestId('tab-add'));
      expect(fixture.menu().isConnected).toBe(true);

      return menu;
    },
  });
}

describe('runtime Services catalog navigation', () => {
  it('reproduces the obsolete Env vars name and unsearched Domains lookup failures', () => {
    const fixture = mountPalette();
    const menu = within(fixture.menu());

    expect(menu.queryByRole('button', { name: /Env vars/ })).toBeNull();
    expect(menu.getByRole('button', { name: 'Environment variables Environment variables' })).toBe(
      menu.getByTestId('feature-env'),
    );
    expect(menu.queryByRole('button', { name: /Domains/ })).toBeNull();
    expect(menu.queryByTestId('feature-domains')).toBeNull();
    expect(projectEditorToolsByCategory().flatMap(([, tools]) => tools.map((tool) => tool.id))).not.toContain(
      'domains',
    );

    fireEvent.change(menu.getByRole('textbox', { name: 'Search commands, tools, or files' }), {
      target: { value: 'Domains' },
    });
    expect(menu.getByRole('button', { name: /Domains/ })).toBe(menu.getByTestId('feature-domains'));
  });

  it.each(['env', 'domains'] as const)(
    'executes the Services loop navigation for %s through the real catalog and dismisses the menu',
    async (panel) => {
      const fixture = mountPalette(false);
      await runServicesNavigation(fixture, panel);

      expect(fixture.onOpenTool).toHaveBeenCalledExactlyOnceWith(panel);
      expect(fixture.view.queryByRole('dialog', { name: 'Add tab command palette' })).toBeNull();
      expect(resolveProjectEditorToolOpen(panel)).toEqual(
        panel === 'domains' ? { panel: 'deployments', deployView: 'domains' } : { panel: 'env' },
      );
    },
  );
});

describe('bounded Services progress evidence', () => {
  it('records only allowed phases, elapsed time and remaining budget with bounded copies', () => {
    let now = 1000;

    const progress = createServiceProgress(
      1000,
      () => 120_000,
      () => now,
    );
    progress.mark('setup');
    now = 121_500;
    progress.mark('edit-secret-open-menu');
    progress.mark('private URL or secret' as never);
    expect(progress.snapshot().events).toEqual([
      { phase: 'setup', elapsedMs: 0, remainingBudgetEstimateMs: 120_000 },
      { phase: 'edit-secret-open-menu', elapsedMs: 120_500, remainingBudgetEstimateMs: 0 },
    ]);

    const copy = progress.snapshot();
    copy.events[0].elapsedMs = -1;
    expect(progress.snapshot().events[0].elapsedMs).toBe(0);

    for (let index = 0; index < 100; index++) {
      progress.mark('complete');
    }
    expect(progress.snapshot().events).toHaveLength(32);
    expect(progress.snapshot().omitted).toBe(70);
    expect(JSON.stringify(progress.snapshot()).length).toBeLessThan(4096);
    expect(JSON.stringify(progress.snapshot())).not.toContain('private');
  });

  it('keeps the useful phase order and all pre-diagnostic assertions and budgets', () => {
    const dashboard = readFileSync('tests/e2e/dashboard.spec.ts', 'utf8');
    const phases = [...dashboard.matchAll(/progress\.mark\('([^']+)'\)/g)].map((match) => match[1]);
    expect(phases).toEqual(SERVICE_PHASES);

    for (const phase of ['edit-secret-open-panel', 'edit-secret-open-menu', 'edit-secret-select-edit']) {
      expect(dashboard).toContain(`await test.step('${phase}', async () => {`);
    }

    const services = dashboard.slice(
      dashboard.indexOf("test(\n  'IDE project services open"),
      dashboard.indexOf("\ntest('IDE light theme"),
    );

    const tree = ts.createSourceFile('dashboard.spec.ts', services, ts.ScriptTarget.Latest, true);
    const assertionsAndBudgets: string[] = [];

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        (/^expect\(/.test(node.getText(tree)) || node.expression.getText(tree) === 'test.setTimeout')
      ) {
        assertionsAndBudgets.push(node.getText(tree).replace(/\s/g, ''));
      }

      ts.forEachChild(node, visit);
    };
    visit(tree);

    /*
     * Baseline HEAD 528ff6d: every Services expect call (including matcher arguments) and test budget,
     * in traversal order. Intentional future assertion changes must update this baseline.
     */
    expect(assertionsAndBudgets).toHaveLength(319);
    expect(createHash('sha256').update(JSON.stringify(assertionsAndBudgets)).digest('hex')).toBe(
      '4298240d2036ceb8b534375eaab631e737d6a9ad53161ee98e4159f20053e4b0',
    );

    const diagnostics = readFileSync('tests/e2e/helpers/runtime-desktop-diagnostics.ts', 'utf8');

    /*
     * The Node-side progress survives even if the timed-out browser cannot be evaluated,
     * including the existing 64 KiB fallback, without another browser call or delay.
     */
    expect(diagnostics.match(/serviceProgress: serviceProgress.get\(testInfo\)\?\.snapshot\(\)/g)).toHaveLength(2);
  });
});
