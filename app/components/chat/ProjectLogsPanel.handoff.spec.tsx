/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { IdeSettingsDraftProvider, useIdeLogsView } from './IdeSettingsDraftState';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const source = readFileSync(resolve(import.meta.dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const declaration = tree.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectLogsPanel',
);

if (!declaration) {
  throw new Error('Actual Logs component missing');
}

const compiled = ts.transpileModule(`${declaration.getText(tree)}\nreturn ProjectLogsPanel;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const bindings = {
  useIdeLogsView,
  React,
  useState: React.useState,
  useEffect: React.useEffect,
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  resolvedBaseChatLanguage: () => 'en',
  runtimePortsFromPayload: () => [],
  runtimeWorkspaceFromPanelData: () => undefined,
  runtimeStatusText: () => 'idle',
  buildSystemLogEvents: () => [{ source: 'system', level: 'info', message: 'synthetic audit' }],
  filterLogEntries: (logs: unknown[]) => logs,
  normalizeLogEntryLevel: () => 'info',
  classNames: (...values: unknown[]) => values.filter(Boolean).join(' '),
  LogStreamView: ({ logs }: { logs: unknown[] }) => <output>{logs.length}</output>,
};
const Panel = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as React.ComponentType<{
  projectId?: string;
  paneId?: string;
  data: object;
  busy: boolean;
  reload: () => void;
}>;

const reload = vi.fn();
const button = (container: HTMLElement, key: string) => within(container).getByRole('button', { name: key });

const system = (container: HTMLElement) =>
  container.querySelectorAll('.bolt-project-console-streams button')[2] as HTMLButtonElement;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('keeps the actual Logs selection through the startup shell handoff', () => {
  const view = (shell: string) => (
    <IdeSettingsDraftProvider projectId="A">
      <Panel key={shell} projectId="A" paneId="main" data={{}} busy={false} reload={reload} />
    </IdeSettingsDraftProvider>
  );

  const mounted = render(view('loading'));
  const old = system(mounted.container);
  fireEvent.click(old);
  expect(old.getAttribute('aria-pressed')).toBe('true');
  mounted.rerender(view('ready'));
  expect(old.isConnected).toBe(false);
  expect(system(mounted.container).getAttribute('aria-pressed')).toBe('true');
});
it('preserves view controls and a paused poll across replacement, while Reload clears only the local clear marker', () => {
  vi.useFakeTimers();

  const view = (shell: string) => (
    <IdeSettingsDraftProvider projectId="A">
      <Panel key={shell} projectId="A" paneId="main" data={{}} busy={false} reload={reload} />
    </IdeSettingsDraftProvider>
  );

  const mounted = render(view('loading'));
  fireEvent.click(system(mounted.container));

  const click = (key: string) => fireEvent.click(button(mounted.container, key));
  click('chat.copy.toggleLiveTail_e5a60fa5');
  click('chat.copy.toggleSplitLogView_4cbcd801');
  click('chat.copy.toggleRegexSearch_4ed228f4');
  fireEvent.change(within(mounted.container).getByRole('textbox'), { target: { value: 'synthetic' } });
  fireEvent.click(mounted.container.querySelector('[data-level="warn"]')!);
  click('chat.copy.clearVisibleLogs_eb78a0d1');
  mounted.rerender(view('ready'));
  expect(within(mounted.container).getByRole('textbox').getAttribute('value')).toBe('synthetic');
  expect(mounted.container.querySelector('[data-level="warn"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(button(mounted.container, 'chat.copy.toggleRegexSearch_4ed228f4').getAttribute('aria-pressed')).toBe('true');
  expect(mounted.container.querySelector('.bolt-project-console-tool-split')).not.toBeNull();
  expect(button(mounted.container, 'chat.copy.toggleLiveTail_e5a60fa5').getAttribute('aria-pressed')).toBe('false');
  expect([...mounted.container.querySelectorAll('output')].map((n) => n.textContent)).toEqual(['0', '0']);
  vi.advanceTimersByTime(10000);
  expect(reload).not.toHaveBeenCalled();
  click('chat.copy.reloadLogsFromBackend_6896c671');
  expect(reload).toHaveBeenCalledTimes(1);
  fireEvent.click(mounted.container.querySelector('[data-level="all"]')!);
  expect(mounted.container.querySelector('output')?.textContent).toBe('1');
  click('chat.copy.toggleLiveTail_e5a60fa5');
  vi.advanceTimersByTime(5000);
  expect(reload).toHaveBeenCalledTimes(2);
  mounted.unmount();
  vi.advanceTimersByTime(5000);
  expect(reload).toHaveBeenCalledTimes(2);
});
it.each(['scoped', 'unwrapped', 'without-pane'] as const)(
  'isolates sibling panes and fallback instances (provider=%s)',
  (mode) => {
    const provider = mode !== 'unwrapped';
    const scoped = mode === 'scoped';

    const panels = (
      <>
        <section data-testid="one">
          <Panel projectId="A" paneId={scoped ? 'one' : undefined} data={{}} busy={false} reload={reload} />
        </section>
        <section data-testid="two">
          <Panel projectId="A" paneId={scoped ? 'two' : undefined} data={{}} busy={false} reload={reload} />
        </section>
      </>
    );
    const mounted = render(
      provider ? <IdeSettingsDraftProvider projectId="A">{panels}</IdeSettingsDraftProvider> : panels,
    );
    const one = within(mounted.container).getByTestId('one'),
      two = within(mounted.container).getByTestId('two');
    fireEvent.click(system(one));
    fireEvent.click(button(one, 'chat.copy.clearVisibleLogs_eb78a0d1'));
    expect(system(two).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(system(two));
    expect(two.querySelector('output')?.textContent).toBe('1');
  },
);

it('drops controls when the actual route provider changes project/window or unmounts', () => {
  const view = (projectId: string, windowId: string) => (
    <IdePaletteProvider projectId={projectId} windowId={windowId}>
      <Panel projectId={projectId} paneId="main" data={{}} busy={false} reload={reload} />
    </IdePaletteProvider>
  );

  const mounted = render(view('A', 'one'));
  fireEvent.click(system(mounted.container));
  mounted.rerender(view('B', 'one'));
  expect(system(mounted.container).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(system(mounted.container));
  mounted.rerender(view('B', 'two'));
  expect(system(mounted.container).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(system(mounted.container));
  mounted.unmount();

  const fresh = render(view('B', 'two'));
  expect(system(fresh.container).getAttribute('aria-pressed')).toBe('false');
});
