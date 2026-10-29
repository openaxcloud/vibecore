/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { useIdeSettingsFormDraft } from './IdeSettingsDraftState';
import { PanelInput } from '~/components/project-ide/PanelPrimitives';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// Render the actual private component and the real route provider, not a draft-state replica.
const source = readFileSync(resolve(import.meta.dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const declaration = tree.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'CollaborationDraftForm',
);

if (!declaration) {
  throw new Error('Collaboration draft form missing');
}

const compiled = ts.transpileModule(`${declaration.getText(tree)}\nreturn CollaborationDraftForm;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

let renderedSubmit: ((event: React.FormEvent<HTMLFormElement>) => Promise<void>) | undefined;

const bindings = {
  React: {
    ...React,
    createElement: (type: any, props: any, ...children: any[]) => {
      if (type === 'form') {
        renderedSubmit = props.onSubmit;
      }

      return React.createElement(type, props, ...children);
    },
  },
  useRef: React.useRef,
  useIdeSettingsFormDraft,
};
const DraftForm = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as React.ComponentType<{
  projectId: string;
  paneId: string;
  formKind: 'invite' | 'comment';
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: (
    bind: (
      field:
        | 'collaboration.invitee'
        | 'collaboration.inviteRole'
        | 'collaboration.comment'
        | 'collaboration.filePath'
        | 'collaboration.line',
    ) => { value: string; onChange: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> },
  ) => React.ReactNode;
}>;

interface PendingRequest {
  form: HTMLFormElement;
  resolve: () => void;
}

let requests: PendingRequest[];

const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();

  const form = event.currentTarget;

  return new Promise<void>((resolve) => requests.push({ form, resolve }));
});
beforeEach(() => {
  requests = [];
  submit.mockClear();
  renderedSubmit = undefined;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fields(shell = 'desktop', project = 'p1', extra = false, onSubmit = submit) {
  const scopes = extra
    ? [
        [project, 'pane-a'],
        [project, 'pane-b'],
        ['p2', 'pane-a'],
      ]
    : [[project, 'pane-a']];
  return (
    <IdePaletteProvider projectId="provider-route" windowId="main">
      <section key={shell}>
        {scopes.flatMap(([projectId, paneId]) =>
          (['collaboration.invitee', 'collaboration.comment'] as const).map((field) => {
            const label = `${projectId}-${paneId}-${field}`;
            return (
              <DraftForm
                key={label}
                projectId={projectId}
                paneId={paneId}
                formKind={field === 'collaboration.invitee' ? 'invite' : 'comment'}
                onSubmit={onSubmit}
              >
                {(bind) => (
                  <>
                    <PanelInput aria-label={label} name={field} {...bind(field)} />
                    {field === 'collaboration.invitee' ? (
                      <select aria-label={`${label}-role`} {...bind('collaboration.inviteRole')}>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <>
                        <PanelInput aria-label={`${label}-path`} {...bind('collaboration.filePath')} />
                        <PanelInput aria-label={`${label}-line`} {...bind('collaboration.line')} />
                      </>
                    )}
                    <button>Submit</button>
                  </>
                )}
              </DraftForm>
            );
          }),
        )}
      </section>
    </IdePaletteProvider>
  );
}

const invite = 'p1-pane-a-collaboration.invitee';
const comment = 'p1-pane-a-collaboration.comment';

async function finish(request: PendingRequest, success: boolean) {
  await act(async () => {
    if (success) {
      request.form.reset();
    }

    request.resolve();
    await Promise.resolve();
  });
}

describe('CollaborationDraftForm', () => {
  it('preserves the complete unsent form through remounts, isolated by project and pane', () => {
    const view = render(fields('desktop', 'p1', true));
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'draft@example.test' } });
    fireEvent.change(view.getByLabelText(comment), { target: { value: 'Unsent comment' } });
    fireEvent.change(view.getByLabelText(`${invite}-role`), { target: { value: 'viewer' } });
    fireEvent.change(view.getByLabelText(`${comment}-path`), { target: { value: 'src/example.ts' } });
    fireEvent.change(view.getByLabelText(`${comment}-line`), { target: { value: '42' } });
    view.rerender(fields('mobile', 'p1', true));
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('draft@example.test');
    expect(view.getByLabelText<HTMLInputElement>(comment).value).toBe('Unsent comment');
    expect(view.getByLabelText<HTMLSelectElement>(`${invite}-role`).value).toBe('viewer');
    expect(view.getByLabelText<HTMLInputElement>(`${comment}-path`).value).toBe('src/example.ts');
    expect(view.getByLabelText<HTMLInputElement>(`${comment}-line`).value).toBe('42');
    expect(view.getByLabelText<HTMLInputElement>('p1-pane-b-collaboration.invitee').value).toBe('');
    expect(view.getByLabelText<HTMLInputElement>('p2-pane-a-collaboration.invitee').value).toBe('');
    view.rerender(fields('desktop-again', 'p1', true));
    expect(view.getByLabelText<HTMLInputElement>(comment).value).toBe('Unsent comment');
  });

  it('consumes an acknowledged submission even after its original form is detached', async () => {
    const view = render(fields());
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'draft@example.test' } });
    fireEvent.change(view.getByLabelText(comment), { target: { value: 'Other form stays' } });
    fireEvent.submit(view.getByLabelText(invite).closest('form')!);
    view.rerender(fields('mobile'));
    expect(requests[0].form.isConnected).toBe(false);

    let acknowledgement: { cancelable: boolean; prevented: boolean } | undefined;
    requests[0].form.addEventListener(
      'reset',
      (event) => {
        acknowledgement = { cancelable: event.cancelable, prevented: event.defaultPrevented };
      },
      { once: true },
    );
    await finish(requests[0], true);
    expect(acknowledgement).toEqual({ cancelable: true, prevented: true });
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('');
    expect(view.getByLabelText<HTMLInputElement>(comment).value).toBe('Other form stays');
  });

  it.each([false, true])('preserves newer edits after acknowledgement (ABA=%s)', async (aba) => {
    const view = render(fields());
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'original@example.test' } });
    fireEvent.submit(view.getByLabelText(invite).closest('form')!);
    view.rerender(fields('mobile'));
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'new@example.test' } });

    if (aba) {
      fireEvent.change(view.getByLabelText(invite), { target: { value: 'original@example.test' } });
    }

    await finish(requests[0], true);
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe(
      aba ? 'original@example.test' : 'new@example.test',
    );
  });

  it('retains failed and pending drafts and removes its acknowledgement listener after failure', async () => {
    const view = render(fields());
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'draft@example.test' } });
    fireEvent.submit(view.getByLabelText(invite).closest('form')!);
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('draft@example.test');
    await finish(requests[0], false);
    requests[0].form.reset();
    view.rerender(fields('mobile'));
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('draft@example.test');
  });

  it('does not consume another project or pane when an old request completes', async () => {
    const view = render(fields('desktop', 'p1', true));
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'first@example.test' } });
    fireEvent.change(view.getByLabelText('p2-pane-a-collaboration.invitee'), {
      target: { value: 'second@example.test' },
    });
    fireEvent.change(view.getByLabelText('p1-pane-b-collaboration.invitee'), {
      target: { value: 'pane-b@example.test' },
    });
    fireEvent.submit(view.getByLabelText(invite).closest('form')!);
    await finish(requests[0], true);
    expect(view.getByLabelText<HTMLInputElement>('p2-pane-a-collaboration.invitee').value).toBe('second@example.test');
    expect(view.getByLabelText<HTMLInputElement>('p1-pane-b-collaboration.invitee').value).toBe('pane-b@example.test');
  });

  it('captures the immediate edit when change and submission share one React batch', async () => {
    const view = render(fields());
    act(() => {
      fireEvent.change(view.getByLabelText(invite), { target: { value: 'immediate@example.test' } });
      fireEvent.submit(view.getByLabelText(invite).closest('form')!);
    });
    await finish(requests[0], true);
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('');
  });

  it('blocks duplicate submission only for the pending form', async () => {
    const view = render(fields());
    const form = view.getByLabelText(invite).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(view.getByLabelText(comment).closest('form')!);
    expect(submit).toHaveBeenCalledTimes(2);
    await finish(requests[0], false);
    await finish(requests[1], false);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(3);
    await finish(requests[2], false);
  });

  it('keeps the entire comment when its destination changes during a pending submission', async () => {
    const view = render(fields());
    fireEvent.change(view.getByLabelText(comment), { target: { value: 'Comment retained' } });
    fireEvent.change(view.getByLabelText(`${comment}-path`), { target: { value: 'src/original.ts' } });
    fireEvent.change(view.getByLabelText(`${comment}-line`), { target: { value: '12' } });
    fireEvent.submit(view.getByLabelText(comment).closest('form')!);
    view.rerender(fields('mobile'));
    fireEvent.change(view.getByLabelText(`${comment}-path`), { target: { value: 'src/new.ts' } });
    await finish(requests[0], true);
    expect(view.getByLabelText<HTMLInputElement>(comment).value).toBe('Comment retained');
    expect(view.getByLabelText<HTMLInputElement>(`${comment}-path`).value).toBe('src/new.ts');
    expect(view.getByLabelText<HTMLInputElement>(`${comment}-line`).value).toBe('12');
  });

  it('consumes every field of the unchanged acknowledged comment together', async () => {
    const view = render(fields());
    fireEvent.change(view.getByLabelText(comment), { target: { value: 'Comment sent' } });
    fireEvent.change(view.getByLabelText(`${comment}-path`), { target: { value: 'src/original.ts' } });
    fireEvent.change(view.getByLabelText(`${comment}-line`), { target: { value: '12' } });
    fireEvent.submit(view.getByLabelText(comment).closest('form')!);
    view.rerender(fields('mobile'));
    await finish(requests[0], true);

    for (const label of [comment, `${comment}-path`, `${comment}-line`]) {
      expect(view.getByLabelText<HTMLInputElement>(label).value).toBe('');
    }
  });

  it('preserves an invitation and its role after a newer role edit on the still-connected form', async () => {
    const view = render(fields());
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'draft@example.test' } });
    fireEvent.submit(view.getByLabelText(invite).closest('form')!);
    fireEvent.change(view.getByLabelText(`${invite}-role`), { target: { value: 'viewer' } });
    await finish(requests[0], true);
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('draft@example.test');
    expect(view.getByLabelText<HTMLSelectElement>(`${invite}-role`).value).toBe('viewer');
    view.rerender(fields('mobile'));
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('draft@example.test');
    expect(view.getByLabelText<HTMLSelectElement>(`${invite}-role`).value).toBe('viewer');
  });

  it('does not consume a new project when its previous project submission completes', async () => {
    const view = render(fields());
    fireEvent.change(view.getByLabelText(invite), { target: { value: 'first@example.test' } });
    fireEvent.submit(view.getByLabelText(invite).closest('form')!);
    view.rerender(fields('mobile', 'p2'));
    fireEvent.change(view.getByLabelText('p2-pane-a-collaboration.invitee'), {
      target: { value: 'second@example.test' },
    });
    await finish(requests[0], true);
    expect(view.getByLabelText<HTMLInputElement>('p2-pane-a-collaboration.invitee').value).toBe('second@example.test');
    view.rerender(fields('desktop', 'p1'));
    expect(view.getByLabelText<HTMLInputElement>(invite).value).toBe('');
  });

  it('removes the native listener and unlocks the form when submit throws synchronously', async () => {
    const throwing = vi.fn(() => {
      throw new Error('synthetic submit failure');
    });

    const view = render(fields('desktop', 'p1', false, throwing as typeof submit));
    const form = view.getByLabelText(comment).closest('form')!;
    const add = vi.spyOn(form, 'addEventListener');
    const remove = vi.spyOn(form, 'removeEventListener');
    await expect(renderedSubmit!({ currentTarget: form, preventDefault: vi.fn() } as any)).rejects.toThrow(
      'synthetic submit failure',
    );

    const listener = add.mock.calls.find(([name]) => name === 'reset')![1];
    expect(remove).toHaveBeenCalledWith('reset', listener);
    await expect(renderedSubmit!({ currentTarget: form, preventDefault: vi.fn() } as any)).rejects.toThrow(
      'synthetic submit failure',
    );
    expect(throwing).toHaveBeenCalledTimes(2);
  });
});
