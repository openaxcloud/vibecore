/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { toast } from 'react-toastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitTab } from './GitTab';
import { createI18nInstance } from '~/lib/i18n/runtime';

vi.mock('~/lib/runtime/CurrentWorkspaceContext', () => ({ useCurrentWorkspace: () => ({ currentWorkspaceId: 'w1' }) }));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { files: { get: () => ({}), listen: () => vi.fn() } } }));
vi.mock('~/components/git/GitSettingsPanel', () => ({ GitSettingsPanel: () => null }));
vi.mock('~/components/git/GitProviderConnectPanel', () => ({ GitProviderConnectPanel: () => null }));
vi.mock('~/components/git/GitDiffView', () => ({ GitDiffView: () => null }));
vi.mock('~/components/git/GitMergeEditor', () => ({ GitMergeEditor: () => null }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const state = {
  status: 'ok',
  project: { id: 'p1', gitRepositoryUrl: 'https://example.invalid/repo' },
  data: {
    activeWorkspaceId: 'w1',
    status: { branch: 'main', fileStatuses: [] },
    branches: ['main'],
    commits: [{ sha: 'abcdef123456', shortSha: 'abcdef12', message: 'Isolated test commit' }],
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function mount(projectId = 'p1') {
  return (
    <I18nextProvider i18n={createI18nInstance('en')}>
      <GitTab projectId={projectId} />
    </I18nextProvider>
  );
}

describe('Git panel async recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(state)));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('serializes rapid submissions before React renders busy state', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (_url, options) =>
      options?.method === 'POST' ? mutation.promise : Response.json(state),
    );

    const view = render(mount());
    await screen.findByText('Isolated test commit');

    const form = view.container.querySelector('input[value="create-branch"]')!.closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    await act(async () => {
      mutation.resolve(Response.json({ status: 'ok' }));
    });
  });

  it('isolates a pending mutation from the next project and its busy lock', async () => {
    const oldMutation = deferred<Response>();
    const newMutation = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (options?.method === 'POST') {
        return String(url).includes('/p1/') ? oldMutation.promise : newMutation.promise;
      }

      return Response.json(state);
    });

    const view = render(mount());
    await screen.findByText('Isolated test commit');
    fireEvent.submit(view.container.querySelector('input[value="create-branch"]')!.closest('form')!);
    view.rerender(mount('p2'));
    await screen.findByText('Isolated test commit');

    const nextForm = view.container.querySelector('input[value="create-branch"]')!.closest('form')!;
    fireEvent.submit(nextForm);
    expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2);
    await act(async () => {
      oldMutation.resolve(Response.json({ status: 'ok' }));
    });
    fireEvent.submit(nextForm);
    expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2);
    await act(async () => {
      newMutation.resolve(Response.json({ status: 'ok' }));
    });
  });

  it('does not notify or reload after unmounting a pending mutation', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (_url, options) =>
      options?.method === 'POST' ? mutation.promise : Response.json(state),
    );

    const view = render(mount());
    await screen.findByText('Isolated test commit');
    fireEvent.submit(view.container.querySelector('input[value="create-branch"]')!.closest('form')!);
    view.unmount();

    const requestCount = vi.mocked(fetch).mock.calls.length;
    await act(async () => {
      mutation.resolve(Response.json({ status: 'ok' }));
    });
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not repopulate a different project with an old response', async () => {
    const old = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(old.promise);

    const view = render(mount());
    view.rerender(mount('p2'));
    await screen.findByText('Isolated test commit');
    await act(async () => {
      old.resolve(
        Response.json({
          ...state,
          data: { ...state.data, commits: [{ sha: 'old', shortSha: 'old', message: 'Wrong project' }] },
        }),
      );
    });
    expect(screen.queryByText('Wrong project')).toBeNull();
  });

  it('cancels discard with Escape without sending a mutation', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        ...state,
        data: { ...state.data, status: { branch: 'main', fileStatuses: [{ path: 'isolated.txt', status: 'M' }] } },
      }),
    );
    render(mount());
    fireEvent.click(await screen.findByTestId('git-discard-all'));

    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it('shows commit-detail failures and prevents restoring an uninspected commit', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes('commitSha=') ? Response.json({ status: 'error' }, { status: 503 }) : Response.json(state),
    );
    render(mount());
    fireEvent.click(await screen.findByText('Isolated test commit'));
    await screen.findByRole('alert');
    expect((screen.getByTestId('git-restore-commit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a closed commit detail closed when its request finishes', async () => {
    const detail = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).includes('commitSha=') ? detail.promise : Response.json(state),
    );
    render(mount());
    fireEvent.click(await screen.findByText('Isolated test commit'));

    const close = screen.getByRole('button', { name: /close commit/i });
    fireEvent.click(close);
    await act(async () => {
      detail.resolve(Response.json({ data: { commitDetail: { sha: 'abcdef123456', files: [], diff: '' } } }));
    });
    await waitFor(() => expect(screen.queryByTestId('git-commit-detail')).toBeNull());
  });

  it('surfaces a failed refresh when no trustworthy initial state exists', async () => {
    const initial = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValue(Response.json({}, { status: 503 }));
    render(mount());
    fireEvent.focus(window);
    await screen.findByRole('alert');
    expect(screen.getByText('Failed to load git panel.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh git status' })).toBeTruthy();
    expect(screen.queryByText('Isolated test commit')).toBeNull();
    await act(async () => {
      initial.resolve(Response.json(state));
    });
  });

  it('finishes initial loading when a background refresh supersedes it', async () => {
    const initial = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(initial.promise);
    render(mount());
    fireEvent.focus(window);
    await screen.findByText('Isolated test commit');
    initial.resolve(Response.json(state));
  });
});
