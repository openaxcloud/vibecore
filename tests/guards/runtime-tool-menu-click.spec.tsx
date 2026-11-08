/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import React from 'react';
import { createPortal } from 'react-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function mountPalette() {
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
  fireEvent.click(view.getByTestId('tab-add'));

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
