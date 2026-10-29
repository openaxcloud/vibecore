/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { useIdeSettingsFormDraft } from './IdeSettingsDraftState';
import { PanelButton, PanelToolTabs } from '~/components/project-ide/PanelPrimitives';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));

// Exercise the actual private panel with the existing route draft provider.
const source = readFileSync(resolve(import.meta.dirname, 'BaseChat.tsx'), 'utf8');
const ast = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const declaration = ast.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectSecurityPanel',
);

if (!declaration) {
  throw new Error('Security panel missing');
}

const compiled = ts.transpileModule(`${declaration.getText(ast)}\nreturn ProjectSecurityPanel;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

const runScan = vi.fn();

const bindings = {
  React,
  useState: React.useState,
  useIdeSettingsFormDraft,
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  useSecurityScanSession: () => ({
    session: { run: runScan, cancel: vi.fn() },
    snapshot: { status: 'idle', progress: 0 },
  }),
  codeExample: (value: string) => value,
  securityCountsFromVulnerabilities: () => ({}),
  githubSecurityHref: () => undefined,
  platformStateLabel: (_t: unknown, value: string) => value,
  formatSecurityDate: () => 'synthetic-date',
  scanProgressStage: () => 'idle',
  PanelButton,

  // Read-only summaries are outside the profile form under test.
  PanelRows: () => null,
  PanelToolTabs,
};

const Panel = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as React.ComponentType<any>;
const submit = vi.fn((event: React.FormEvent) => event.preventDefault());

function tree(shell = 'desktop', profile = 'workspace-runtime', project = 'synthetic-first', windowId = 'main') {
  return (
    <IdePaletteProvider projectId={project} windowId={windowId}>
      <section key={shell}>
        {['pane-a', 'pane-b'].map((paneId) => (
          <section aria-label={paneId} key={paneId}>
            <Panel
              paneId={paneId}
              projectId={project}
              project={{ id: project }}
              data={{ securityState: { settings: { scannerProfile: profile }, scans: [], vulnerabilities: [] } }}
              busy={false}
              onSubmit={submit}
            />
          </section>
        ))}
      </section>
    </IdePaletteProvider>
  );
}

function settings(view: ReturnType<typeof render>, pane = 'pane-a') {
  const scope = within(view.getByRole('region', { name: pane }));
  fireEvent.click(scope.getByRole('button', { name: 'baseChatAst.common.settings' }));

  return scope.getByLabelText<HTMLSelectElement>('chat.copy.scannerProfile_60cef8cf');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Security scanner profile draft', () => {
  it('preserves an edited profile across shell replacement without leaking to the other pane', () => {
    const view = render(tree());
    fireEvent.change(settings(view), { target: { value: 'sca' } });
    expect(settings(view, 'pane-b').value).toBe('workspace-runtime');
    view.rerender(tree('mobile'));
    expect(settings(view).value).toBe('sca');
    expect(settings(view, 'pane-b').value).toBe('workspace-runtime');
    expect(submit).not.toHaveBeenCalled();
    expect(runScan).not.toHaveBeenCalled();
  });

  it.each([
    ['synthetic-second', 'main'],
    ['synthetic-first', 'second'],
  ])('isolates a draft from project/window %s/%s', (project, windowId) => {
    const view = render(tree());
    fireEvent.change(settings(view), { target: { value: 'sca' } });
    view.rerender(tree('mobile', 'workspace-runtime', project, windowId));
    expect(settings(view).value).toBe('workspace-runtime');
  });

  it('hydrates untouched fields from fresh server values without a remount', () => {
    const view = render(tree());
    expect(settings(view).value).toBe('workspace-runtime');
    view.rerender(tree('desktop', 'sast'));
    expect(settings(view).value).toBe('sast');
  });

  it('keeps a dirty choice until the server confirms it, then accepts later server data', () => {
    const view = render(tree());
    fireEvent.change(settings(view), { target: { value: 'sca' } });
    view.rerender(tree('desktop', 'sast'));
    expect(settings(view).value).toBe('sca');
    view.rerender(tree('desktop', 'sca'));
    view.rerender(tree('mobile', 'workspace-runtime'));
    expect(settings(view).value).toBe('workspace-runtime');
  });

  it('does not discard a newer choice when an older submitted value is confirmed', () => {
    const view = render(tree());
    const profile = settings(view);
    fireEvent.change(profile, { target: { value: 'sca' } });
    fireEvent.submit(profile.closest('form')!);
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.change(profile, { target: { value: 'sast' } });
    view.rerender(tree('mobile', 'sca'));
    expect(settings(view).value).toBe('sast');
    expect(runScan).not.toHaveBeenCalled();
  });
});
