/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IdePaletteProvider } from './IdePaletteState';
import { useIdeSettingsDraft } from './IdeSettingsDraftState';
vi.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});

let state: ReturnType<typeof useIdeSettingsDraft>;

function Panel() {
  state = useIdeSettingsDraft('p1');
  return (
    <>
      <button onClick={() => state.setSettingsTab('memory')}>Memory</button>
      <output>{state.settingsTab}</output>
      <textarea aria-label="draft" value={state.memoryDraft} onChange={(e) => state.setMemoryDraft(e.target.value)} />
      <span>{state.memoryError}</span>
    </>
  );
}

function tree(shell: string, projectId = 'p1', windowId = 'main', show = true) {
  return (
    <IdePaletteProvider projectId={projectId} windowId={windowId}>
      {show && <Panel key={shell} />}
    </IdePaletteProvider>
  );
}

const ok = () => Promise.resolve(new Response(JSON.stringify({ memories: [], preference: { enabled: true } })));
beforeEach(() => vi.stubGlobal('fetch', vi.fn(ok)));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('keeps the selected panel and draft through responsive shell replacement and reopening', async () => {
  const view = render(tree('phone'));
  fireEvent.click(view.getByText('Memory'));
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'Long brouillon français' } });
  await waitFor(() => expect(state.memoryLoading).toBe(false));
  view.rerender(tree('desktop'));
  expect(view.getByLabelText<HTMLTextAreaElement>('draft').value).toBe('Long brouillon français');
  expect(state.settingsTab).toBe('memory');
  view.rerender(tree('desktop', 'p1', 'main', false));
  view.rerender(tree('desktop'));
  expect(state.memoryDraft).toBe('Long brouillon français');
});
it.each([
  ['p2', 'main'],
  ['p1', 'second'],
])('drops drafts when scope changes to %s/%s', (project, window) => {
  const view = render(tree('phone'));
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'private project draft' } });
  view.rerender(tree('desktop', project, window));
  expect(state.memoryDraft).toBe('');
  expect(state.settingsTab).toBe('project');
});
it('retains pending write and blocks duplicate submission across a shell replacement', async () => {
  let resolve!: (response: Response) => void;

  const request = new Promise<Response>((done) => {
    resolve = done;
  });
  vi.mocked(fetch).mockImplementationOnce(() => request);

  const view = render(tree('phone'));
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'persist me' } });

  const event = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;

  let pending!: Promise<void>;
  act(() => {
    pending = state.saveMemory(event);
  });
  view.rerender(tree('desktop'));
  expect(state.memoryLoading).toBe(true);
  await act(() => state.saveMemory(event));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve(new Response('{}', { status: 503 }));
    await pending;
  });
  expect(state.memoryDraft).toBe('persist me');
  expect(state.memoryError).toBe('baseChatAst.memory.saveFailedHttp');
});
it('does not report a skipped write as saved or clear its draft', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{"skipped":"quota_exceeded"}', { status: 202 }));

  const view = render(tree('phone'));
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'persist me' } });
  await act(() => state.saveMemory({ preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>));
  expect(state.memoryDraft).toBe('persist me');
  expect(state.memoryNotice).toBe('baseChatAst.memory.notSaved');
});
it('does not fetch before Memory opens', () => {
  render(tree('phone'));
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps newer text when an earlier save succeeds and clears the submitted text after an unchanged save', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );

  const view = render(tree('phone'));
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'first draft' } });

  const event = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;

  let pending!: Promise<void>;
  act(() => {
    pending = state.saveMemory(event);
  });
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'next draft' } });
  await act(async () => {
    resolve(new Response('{}'));
    await pending;
  });
  expect(state.memoryDraft).toBe('next draft');
  await act(() => state.saveMemory(event));
  expect(state.memoryDraft).toBe('');
  expect(state.memoryNotice).toBe('baseChatAst.memory.saved');
});
it('aborts the previous scope and does not refresh or contaminate the new project after an old write completes', async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );

  const view = render(tree('phone'));
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'old project' } });

  let pending!: Promise<void>;
  act(() => {
    pending = state.saveMemory({ preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>);
  });

  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  view.rerender(tree('desktop', 'p2'));
  expect(signal?.aborted).toBe(true);
  fireEvent.change(view.getByLabelText('draft'), { target: { value: 'new project' } });
  await act(async () => {
    resolve(new Response('{}'));
    await pending;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(state.memoryDraft).toBe('new project');
  expect(state.memoryNotice).toBe('');
  expect(state.memoryLoading).toBe(false);
});
it('retains a load error without starting another request on shell replacement', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));

  const view = render(tree('phone'));
  fireEvent.click(view.getByText('Memory'));
  await waitFor(() => expect(state.memoryError).toBe('baseChatAst.memory.loadFailedHttp'));

  const calls = vi.mocked(fetch).mock.calls.length;
  view.rerender(tree('desktop'));
  expect(state.memoryError).toBe('baseChatAst.memory.loadFailedHttp');
  expect(fetch).toHaveBeenCalledTimes(calls);
});
it('keeps editing fields and supports explicit clearing across replacement', () => {
  const view = render(tree('phone'));
  act(() => state.startEditMemory({ id: 'm1', content: 'original', memoryType: 'semantic', tags: ['fr'] }));
  act(() => {
    state.setMemoryEditDraft('editing');
    state.setMemoryDraft('new memory');
    state.setMemoryTags('tag');
  });
  view.rerender(tree('desktop'));
  expect(state.memoryEditId).toBe('m1');
  expect(state.memoryEditDraft).toBe('editing');
  expect(state.memoryEditTags).toBe('fr');
  act(() => {
    state.setMemoryDraft('');
    state.setMemoryTags('');
    state.setMemoryType('semantic');
  });
  view.rerender(tree('tablet'));
  expect(state.memoryDraft).toBe('');
  expect(state.memoryTags).toBe('');
  expect(state.memoryEditDraft).toBe('editing');
});
it.each(['tags', 'type', 'content'])(
  'preserves the entire new draft when only %s changes during save',
  async (field) => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(tree('phone'));
    act(() => {
      state.setMemoryDraft('original');
      state.setMemoryTags('original-tag');
      state.setMemoryType('semantic');
    });

    let pending!: Promise<void>;
    act(() => {
      pending = state.saveMemory({ preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>);
    });
    act(() => {
      if (field === 'tags') {
        state.setMemoryTags('new-tag');
      }

      if (field === 'type') {
        state.setMemoryType('procedural');
      }

      if (field === 'content') {
        state.setMemoryDraft('new content');
      }
    });
    await act(async () => {
      resolve(new Response('{}'));
      await pending;
    });
    expect(state.memoryDraft).toBe(field === 'content' ? 'new content' : 'original');
    expect(state.memoryTags).toBe(field === 'tags' ? 'new-tag' : 'original-tag');
    expect(state.memoryType).toBe(field === 'type' ? 'procedural' : 'semantic');
  },
);
