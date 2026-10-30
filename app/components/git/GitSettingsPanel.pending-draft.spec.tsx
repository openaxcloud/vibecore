/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GitTab } from './GitTab';
import { createI18nInstance } from '~/lib/i18n/runtime';

const workspace = vi.hoisted(() => ({ currentWorkspaceId: 'w1' }));
vi.mock('~/lib/runtime/CurrentWorkspaceContext', () => ({ useCurrentWorkspace: () => workspace }));
beforeEach(() => {
  workspace.currentWorkspaceId = 'w1';
});
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { files: { get: () => ({}), listen: () => vi.fn() } } }));
vi.mock('~/components/git/GitDiffView', () => ({ GitDiffView: () => null }));
vi.mock('~/components/git/GitMergeEditor', () => ({ GitMergeEditor: () => null }));
vi.mock('~/lib/chat/use-connector-popup', () => ({
  useConnectorPopup: () => ({ state: { phase: 'idle' }, launch: vi.fn(), reset: vi.fn() }),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const i18n = createI18nInstance('en');

function panel(id: string) {
  return (
    <I18nextProvider i18n={i18n}>
      <GitTab projectId={id} />
    </I18nextProvider>
  );
}

function envelope(id: string) {
  return {
    status: 'ok',
    project: { id, gitRepositoryUrl: `https://example.invalid/${id}.git`, gitDefaultBranch: `branch-${id}` },
    data: {
      activeWorkspaceId: 'w1',
      status: { branch: `branch-${id}`, fileStatuses: [] },
      branches: [`branch-${id}`],
      commits: [{ sha: id, shortSha: id, message: `Commit ${id}` }],
    },
  };
}

for (const editWhilePending of [true, false]) {
  it(`keeps the intended draft after metadata refresh (edit while pending: ${editWhilePending})`, async () => {
    const submittedUrl = 'https://example.invalid/submitted.git';
    const editedUrl = 'https://example.invalid/next-draft.git';

    let finish!: (r: Response) => void;

    const mutation = new Promise<Response>((resolve) => {
      finish = resolve;
    });

    let persistedUrl = 'https://example.invalid/A.git';
    let submittedBody: FormData | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => {
        const url = String(input);

        if (init?.method === 'POST' && url.includes('/ide-panel/git')) {
          submittedBody = init.body as FormData;
          await mutation;
          persistedUrl = String(submittedBody.get('remoteUrl'));

          return Response.json({ status: 'ok' });
        }

        if (url.includes('/ide-panel/git')) {
          const payload = envelope('A');
          payload.project.gitRepositoryUrl = persistedUrl;

          return Response.json(payload);
        }

        if (url.includes('/files/.gitignore')) {
          return new Response('');
        }

        return Response.json({ connections: [], data: { terminalState: { sshConnections: [] } } });
      }),
    );
    render(panel('A'));
    await screen.findByText('Commit A');
    fireEvent.click(screen.getByTestId('git-settings-toggle'));

    const input = screen.getByRole('textbox', { name: 'Remote origin URL' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: ` ${submittedUrl} ` } });
    fireEvent.submit(input.closest('form')!);
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true);

    if (editWhilePending) {
      fireEvent.change(input, { target: { value: editedUrl } });
    }

    expect(input.value).toBe(editWhilePending ? editedUrl : ` ${submittedUrl} `);
    expect(submittedBody!.get('remoteUrl')).toBe(submittedUrl);
    expect(submittedBody!.get('workspaceId')).toBe('w1');
    await act(async () => finish(Response.json({ status: 'ok' })));
    expect(persistedUrl).toBe(submittedUrl);
    expect(screen.getByRole('textbox', { name: 'Remote origin URL' })).toBe(input);
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(input.value).toBe(editWhilePending ? editedUrl : submittedUrl);

    if (!editWhilePending) {
      persistedUrl = 'https://example.invalid/external-change.git';
      fireEvent.focus(window);
      await waitFor(() => expect(input.value).toBe(persistedUrl));
    }
  });
}

it('retains typing between save success and the delayed metadata response', async () => {
  let finishMetadata!: (r: Response) => void;

  const metadata = new Promise<Response>((resolve) => {
    finishMetadata = resolve;
  });

  let savedUrl: string | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = String(input);

      if (init?.method === 'POST') {
        savedUrl = String((init.body as FormData).get('remoteUrl'));
        return Response.json({ status: 'ok' });
      }

      if (url.includes('/ide-panel/git')) {
        return savedUrl ? metadata : Response.json(envelope('A'));
      }

      if (url.includes('/files/.gitignore')) {
        return new Response('');
      }

      return Response.json({ connections: [], data: { terminalState: { sshConnections: [] } } });
    }),
  );
  render(panel('A'));
  await screen.findByText('Commit A');
  fireEvent.click(screen.getByTestId('git-settings-toggle'));

  const input = screen.getByRole('textbox', { name: 'Remote origin URL' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'https://example.invalid/submitted.git' } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toHaveProperty('disabled', false));
  fireEvent.change(input, { target: { value: 'https://example.invalid/after-success.git' } });

  const payload = envelope('A');
  payload.project.gitRepositoryUrl = savedUrl!;
  await act(async () => finishMetadata(Response.json(payload)));
  expect(input.value).toBe('https://example.invalid/after-success.git');
});

it('keeps the newer draft after error and submits it on retry', async () => {
  let finish!: (r: Response) => void;

  const first = new Promise<Response>((resolve) => {
    finish = resolve;
  });

  let count = 0;
  let persistedUrl = 'https://example.invalid/A.git';

  const posted: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = String(input);

      if (init?.method === 'POST') {
        posted.push(String((init.body as FormData).get('remoteUrl')));

        if (++count === 1) {
          return first;
        }

        persistedUrl = posted.at(-1)!;

        return Response.json({ status: 'ok' });
      }

      if (url.includes('/ide-panel/git')) {
        const payload = envelope('A');
        payload.project.gitRepositoryUrl = persistedUrl;

        return Response.json(payload);
      }

      if (url.includes('/files/.gitignore')) {
        return new Response('');
      }

      return Response.json({ connections: [], data: { terminalState: { sshConnections: [] } } });
    }),
  );
  render(panel('A'));
  await screen.findByText('Commit A');
  fireEvent.click(screen.getByTestId('git-settings-toggle'));

  const input = screen.getByRole('textbox', { name: 'Remote origin URL' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'https://example.invalid/failed.git' } });
  fireEvent.submit(input.closest('form')!);
  fireEvent.change(input, { target: { value: 'https://example.invalid/retry.git' } });
  await act(async () => finish(Response.json({}, { status: 503 })));
  expect(input.value).toBe('https://example.invalid/retry.git');
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toHaveProperty('disabled', false));
  expect(posted).toEqual(['https://example.invalid/failed.git', 'https://example.invalid/retry.git']);
  expect(input.value).toBe(persistedUrl);
  fireEvent.click(screen.getByTestId('git-settings-toggle'));
  fireEvent.click(screen.getByTestId('git-settings-toggle'));
  expect(screen.getByRole('textbox', { name: 'Remote origin URL' })).toHaveProperty('value', persistedUrl);
});

for (const editWhilePending of [true, false]) {
  it(`keeps removal acknowledgement separate from newer typing (${editWhilePending})`, async () => {
    let finish!: (r: Response) => void;

    const mutation = new Promise<Response>((resolve) => {
      finish = resolve;
    });

    let persistedUrl = 'https://example.invalid/A.git';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => {
        const url = String(input);

        if (init?.method === 'POST') {
          expect((init.body as FormData).get('intent')).toBe('remove-remote');
          await mutation;
          persistedUrl = '';

          return Response.json({ status: 'ok' });
        }

        if (url.includes('/ide-panel/git')) {
          const payload = envelope('A');
          payload.project.gitRepositoryUrl = persistedUrl;

          return Response.json(payload);
        }

        if (url.includes('/files/.gitignore')) {
          return new Response('');
        }

        return Response.json({ connections: [], data: { terminalState: { sshConnections: [] } } });
      }),
    );
    render(panel('A'));
    await screen.findByText('Commit A');
    fireEvent.click(screen.getByTestId('git-settings-toggle'));

    const input = screen.getByRole('textbox', { name: 'Remote origin URL' }) as HTMLInputElement;
    fireEvent.click(screen.getByTestId('git-remote-remove'));
    expect(input.disabled).toBe(false);

    if (editWhilePending) {
      fireEvent.change(input, { target: { value: 'https://example.invalid/replacement.git' } });
    }

    await act(async () => finish(Response.json({ status: 'ok' })));
    expect(persistedUrl).toBe('');
    expect(input.value).toBe(editWhilePending ? 'https://example.invalid/replacement.git' : '');
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
}
