// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useEffect } from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Render the actual panel declaration with controlled leaf components and data.
 * This is isolated component coverage, not a production/browser recipe.
 */
const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const panel = tree.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectDebuggerPanel',
)!;
const bindings = {
  React,
  useEffect,
  useTranslation: () => ({ t: (key: string) => key, i18n: {} }),
  resolvedBaseChatLanguage: () => 'en',
  formatBaseChatAstNumber: (_language: string, value: number) => String(value),
  formatBaseChatAstDateTime: (_language: string, value: string) => value,
  platformStateLabel: (_t: unknown, value: string) => value,
  PanelButton: ({ variant: _variant, size: _size, ...props }: any) => <button {...props} />,
  PanelSectionTitle: ({ children }: any) => <h3>{children}</h3>,
  PanelInput: (props: any) => <input {...props} />,
  PanelRows: ({ rows, empty }: any) => (
    <div>
      {rows.length
        ? rows.map(([name, value]: string[]) => (
            <p key={name}>
              {name}: {value}
            </p>
          ))
        : empty}
    </div>
  ),
  codeExample: (value: string) => value,
};
const compiled = ts.transpileModule(`return (${panel.getText(tree)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

const Panel = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(status: string, adapter = 'node-inspector', reload?: (options?: { silent?: boolean }) => void) {
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
  render(
    <Panel
      busy={false}
      reload={reload}
      onSubmit={onSubmit}
      data={{
        debuggerState: {
          sessions: [
            {
              id: 'fixture',
              name: 'Fixture',
              adapter,
              status,
              callStack: [{ name: 'calculate', file: 'fixture.js', line: 3, column: 1 }],
              variables: [{ name: 'answer', value: '42' }],
              watchValues: [{ expression: 'answer', value: '42' }],
            },
          ],
          watches: [{ id: 'watch', expression: 'answer' }],
        },
      }}
    />,
  );

  return onSubmit;
}

describe('Actual debugger panel with controlled data', () => {
  it('submits step and Stop for a paused Node session and renders real snapshot rows', () => {
    const submit = mount('paused');
    const step = screen.getByRole('button', { name: 'baseChatAst.debugger.stepOver' }) as HTMLButtonElement;
    expect(step.disabled).toBe(false);
    fireEvent.click(step);
    expect(submit).toHaveBeenCalledOnce();
    expect(new FormData(step.form!).get('intent')).toBe('step-over');
    expect(new FormData(step.form!).get('sessionId')).toBe('fixture');
    expect((screen.getByRole('button', { name: 'chat.copy.stop_9e253470' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('calculate: fixture.js:3:1')).toBeTruthy();
    expect(screen.getByText('answer: 42')).toBeTruthy();
    expect(screen.getByText('answer = 42')).toBeTruthy();
  });
  it('offers Pause while running and disables step until paused', () => {
    mount('running');
    expect((screen.getByRole('button', { name: 'chat.debugger.pause' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'baseChatAst.debugger.stepOver' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it('polls live state silently without replacing the action form', () => {
    vi.useFakeTimers();

    const reload = vi.fn();
    mount('running', 'node-inspector', reload);

    const pause = screen.getByRole('button', { name: 'chat.debugger.pause' });
    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(screen.getByRole('button', { name: 'chat.debugger.pause' })).toBe(pause);
  });
  it('keeps unknown sessions stop-only and polls for an authoritative event', () => {
    vi.useFakeTimers();

    const reload = vi.fn();
    mount('unknown', 'node-inspector', reload);

    for (const name of [
      'chat.debugger.pause',
      'baseChatAst.debugger.continue',
      'baseChatAst.debugger.stepOver',
      'baseChatAst.debugger.stepInto',
      'baseChatAst.debugger.stepOut',
    ]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByRole('button', { name: 'chat.copy.stop_9e253470' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('calculate: fixture.js:3:1')).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledExactlyOnceWith({ silent: true });
  });
  it('does not advertise step controls for ordinary tracked commands', () => {
    mount('running', 'tracked-runtime-command');
    expect((screen.getByRole('button', { name: 'chat.debugger.pause' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'baseChatAst.debugger.stepOver' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
