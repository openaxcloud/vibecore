/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

it('does not reload an old project when its settings save completes after navigation', async () => {
  let finish!: (r: Response) => void;

  const mutation = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = String(input);

      if (init?.method === 'POST') {
        return mutation;
      }

      if (url.includes('/ide-panel/git')) {
        return Response.json(envelope(url.includes('/A/') ? 'A' : 'B'));
      }

      if (url.includes('/files/.gitignore')) {
        return new Response('');
      }

      return Response.json({ connections: [], data: { terminalState: { sshConnections: [] } } });
    }),
  );

  const view = render(panel('A'));
  await screen.findByText('Commit A');
  fireEvent.click(screen.getByTestId('git-settings-toggle'));
  fireEvent.submit(screen.getByRole('textbox', { name: 'Remote origin URL' }).closest('form')!);
  view.rerender(panel('B'));
  await screen.findByText('Commit B');

  const requestsBeforeCompletion = vi.mocked(fetch).mock.calls.length;
  await act(async () => finish(Response.json({ status: 'ok' })));
  expect(screen.queryByText('Commit A')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(requestsBeforeCompletion);
  expect(screen.getByText('Commit B')).toBeTruthy();
});

for (const intent of ['configure-remote', 'remove-remote']) {
  it(`ignores ${intent} completion after changing workspace within the same project`, async () => {
    let finish!: (r: Response) => void;

    const mutation = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => {
        const url = String(input);

        if (init?.method === 'POST') {
          return mutation;
        }

        if (url.includes('/ide-panel/git')) {
          const workspaceId = new URL(url, 'https://example.invalid').searchParams.get('workspaceId')!;
          const payload = envelope('A');
          payload.data.activeWorkspaceId = workspaceId;
          payload.data.commits[0].message = `Commit ${workspaceId}`;

          return Response.json(payload);
        }

        if (url.includes('/files/.gitignore')) {
          return new Response('');
        }

        return Response.json({ connections: [], data: { terminalState: { sshConnections: [] } } });
      }),
    );

    const view = render(panel('A'));
    await screen.findByText('Commit w1');
    fireEvent.click(screen.getByTestId('git-settings-toggle'));

    if (intent === 'configure-remote') {
      fireEvent.submit(screen.getByRole('textbox', { name: 'Remote origin URL' }).closest('form')!);
    } else {
      fireEvent.click(screen.getByTestId('git-remote-remove'));
    }

    workspace.currentWorkspaceId = 'w2';
    view.rerender(panel('A'));
    await screen.findByText('Commit w2');

    const count = vi.mocked(fetch).mock.calls.length;
    await act(async () => finish(Response.json({ status: 'ok' })));
    expect(screen.queryByText('Commit w1')).toBeNull();
    expect(screen.getByText('Commit w2')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(count);
    fireEvent.submit(view.container.querySelector('input[value="create-branch"]')!.closest('form')!);

    const latest = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .at(-1)!;
    expect(String(latest[0])).toBe('/api/projects/A/ide-panel/git');
    expect((latest[1]!.body as FormData).get('workspaceId')).toBe('w2');
  });
}
it('keeps reopened settings independent from a save started before Close', async () => {
  const pending: Array<(r: Response) => void> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = String(input);

      if (init?.method === 'POST') {
        return new Promise<Response>((resolve) => pending.push(resolve));
      }

      if (url.includes('/ide-panel/git')) {
        return Response.json(envelope('A'));
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
  fireEvent.submit(screen.getByRole('textbox', { name: 'Remote origin URL' }).closest('form')!);
  fireEvent.click(screen.getByTestId('git-settings-toggle'));
  fireEvent.click(screen.getByTestId('git-settings-toggle'));
  fireEvent.submit(screen.getByRole('textbox', { name: 'Remote origin URL' }).closest('form')!);

  const count = vi.mocked(fetch).mock.calls.length;
  await act(async () => pending[0](Response.json({ status: 'ok' })));
  expect(fetch).toHaveBeenCalledTimes(count);
  expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true);
  await act(async () => pending[1](Response.json({ status: 'ok' })));
  expect(screen.getByRole('button', { name: 'Update' })).toHaveProperty('disabled', false);
});
