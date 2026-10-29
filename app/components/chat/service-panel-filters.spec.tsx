/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { useIdeSettingsFormDraft } from './IdeSettingsDraftState';
import { ProjectSecretsPanel } from './ProjectSecretsPanel';
import { PanelButton, PanelEmptyState, PanelInput, PanelToolTabs } from '~/components/project-ide/PanelPrimitives';
import { EmptyState } from '~/components/ui/EmptyState';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('~/lib/reveler-un-secret', () => ({ revelerUnSecret: vi.fn() }));

// Exercise the actual private Env component and its scope helpers.
const source = readFileSync(resolve(import.meta.dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const declarations = tree.statements.filter((node) => {
  if (ts.isFunctionDeclaration(node)) {
    return ['ProjectEnvPanel', 'normalizeEnvScope', 'maskEnvValue'].includes(node.name?.text ?? '');
  }

  return (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some((item) => item.name.getText(tree) === 'ENV_VAR_SCOPES')
  );
});
const compiled = ts.transpileModule(
  `${declarations.map((node) => node.getText(tree)).join('\n')}\nreturn ProjectEnvPanel;`,
  {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const bindings = {
  React,
  useState: React.useState,
  useEffect: React.useEffect,
  useIdeSettingsFormDraft,
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  resolvedBaseChatLanguage: () => 'en',
  chatKey: (key: string) => key,
  PanelButton,
  PanelEmptyState,
  PanelInput,
  PanelToolTabs,
  EmptyState,
};

const Env = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as React.ComponentType<any>;
const submit = vi.fn();

function content(panel: 'env' | 'secrets', shell: string, projectId = 'p1', paneId?: string) {
  return panel === 'env' ? (
    <Env key={shell} projectId={projectId} paneId={paneId} data={{ envVars: [] }} onSubmit={submit} busy={false} />
  ) : (
    <ProjectSecretsPanel
      key={shell}
      projectId={projectId}
      paneId={paneId}
      data={{ secrets: [] }}
      onSubmit={submit}
      busy={false}
      language="en"
    />
  );
}

function scoped(panel: 'env' | 'secrets', shell: string, project = 'p1', pane = 'pane1', window = 'main') {
  return (
    <IdePaletteProvider projectId={project} windowId={window}>
      {content(panel, shell, project, pane)}
    </IdePaletteProvider>
  );
}

function query(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('.bolt-project-panel-toolbar input, .bolt-secrets-filter input')!;
}
beforeEach(() => {
  submit.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(['env', 'secrets'] as const)('%s non-sensitive filter', (panel) => {
  it('survives actual panel remount without writing browser storage or submitting', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const view = render(scoped(panel, 'mobile'));
    const old = query(view.container);
    fireEvent.change(old, { target: { value: 'synthetic filter' } });
    view.rerender(scoped(panel, 'desktop'));
    expect(old.isConnected).toBe(false);
    expect(query(view.container).value).toBe('synthetic filter');
    expect(submit).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
  });
  it('isolates panes, projects and windows', () => {
    const view = render(scoped(panel, 'mobile'));
    fireEvent.change(query(view.container), { target: { value: 'pane one' } });
    view.rerender(scoped(panel, 'desktop', 'p1', 'pane2'));
    expect(query(view.container).value).toBe('');
    view.rerender(scoped(panel, 'desktop', 'p1', 'pane1'));
    expect(query(view.container).value).toBe('pane one');
    view.rerender(scoped(panel, 'desktop', 'p2', 'pane1'));
    expect(query(view.container).value).toBe('');
    fireEvent.change(query(view.container), { target: { value: 'second project' } });
    view.rerender(scoped(panel, 'desktop', 'p2', 'pane1', 'second'));
    expect(query(view.container).value).toBe('');
  });
  it('keeps unscoped legacy callers local', () => {
    const view = render(
      <IdePaletteProvider projectId="p1" windowId="main">
        {content(panel, 'mobile', 'p1')}
      </IdePaletteProvider>,
    );
    fireEvent.change(query(view.container), { target: { value: 'legacy filter' } });
    view.rerender(
      <IdePaletteProvider projectId="p1" windowId="main">
        {content(panel, 'desktop', 'p1')}
      </IdePaletteProvider>,
    );
    expect(query(view.container).value).toBe('');
  });
});
it('does not share an Env filter with Secrets or retain Env key/value fields', () => {
  const view = render(scoped('env', 'mobile'));
  fireEvent.change(query(view.container), { target: { value: 'env filter' } });
  fireEvent.change(view.container.querySelector('input[name="key"]')!, { target: { value: 'SYNTHETIC_KEY' } });
  fireEvent.change(view.container.querySelector('input[name="value"]')!, {
    target: { value: 'synthetic unsaved value' },
  });
  view.rerender(scoped('env', 'desktop'));
  expect(query(view.container).value).toBe('env filter');
  expect(view.container.querySelector<HTMLInputElement>('input[name="key"]')!.value).toBe('');
  expect(view.container.querySelector<HTMLInputElement>('input[name="value"]')!.value).toBe('');
  view.rerender(scoped('secrets', 'desktop'));
  expect(query(view.container).value).toBe('');
  expect(submit).not.toHaveBeenCalled();
});
