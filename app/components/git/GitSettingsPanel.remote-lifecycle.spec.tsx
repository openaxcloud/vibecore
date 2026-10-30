/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GitSettingsPanel } from './GitSettingsPanel';
import { createI18nInstance } from '~/lib/i18n/runtime';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-toastify', () => ({ toast }));
vi.mock('~/lib/chat/use-connector-popup', () => ({
  useConnectorPopup: () => ({ state: { phase: 'idle' }, launch: vi.fn(), reset: vi.fn() }),
}));

const i18n = createI18nInstance('en');
const pending: Array<(r: Response) => void> = [];
beforeEach(() => {
  pending.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      if (init?.method === 'POST') {
        return new Promise<Response>((resolve) => pending.push(resolve));
      }

      if (String(input).includes('/files/.gitignore')) {
        return new Response('');
      }

      return Response.json({ connections: [], data: { terminalState: { sshConnections: [] } } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function panel(id: string, callback = vi.fn(), busy = false) {
  return (
    <I18nextProvider i18n={i18n}>
      <GitSettingsPanel
        projectId={id}
        gitRepositoryUrl={`https://example.invalid/${id}.git`}
        workspaceId={`workspace-${id}`}
        onClose={vi.fn()}
        onRemoteConfigured={callback}
        busy={busy}
      />
    </I18nextProvider>
  );
}

function save() {
  fireEvent.submit(screen.getByRole('textbox', { name: 'Remote origin URL' }).closest('form')!);
}

function posts() {
  return vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
}

it('serializes repeated save and remove before pending state renders', async () => {
  render(panel('A'));
  act(() => {
    save();
    save();
    fireEvent.click(screen.getByTestId('git-remote-remove'));
  });
  expect(posts()).toHaveLength(1);
  expect((posts()[0][1]!.body as FormData).get('intent')).toBe('configure-remote');
  await act(async () => pending[0](Response.json({ ok: true })));
});
it('serializes remove with save until remove finishes', async () => {
  render(panel('A'));
  act(() => {
    fireEvent.click(screen.getByTestId('git-remote-remove'));
    fireEvent.click(screen.getByTestId('git-remote-remove'));
    save();
  });
  expect(posts()).toHaveLength(1);
  expect((posts()[0][1]!.body as FormData).get('intent')).toBe('remove-remote');
  await act(async () => pending[0](Response.json({ ok: true })));
});
it('does not start settings mutations while the enclosing Git operation is busy', () => {
  render(panel('A', vi.fn(), true));
  save();
  fireEvent.click(screen.getByTestId('git-remote-remove'));
  expect(posts()).toHaveLength(0);
});

for (const status of [200, 503]) {
  it(`ignores remote response ${status} after closing settings`, async () => {
    const callback = vi.fn();
    const view = render(panel('A', callback));
    save();
    view.unmount();
    await act(async () => pending[0](Response.json({}, { status })));
    expect(callback).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
}
it('keeps the new A generation locked when the earlier A completes after A B A', async () => {
  const callback = vi.fn();
  const view = render(panel('A', callback));
  save();
  view.rerender(panel('B', callback));
  view.rerender(panel('A', callback));
  save();
  await act(async () => pending[0](Response.json({ ok: true })));
  expect(callback).not.toHaveBeenCalled();
  save();
  expect(posts()).toHaveLength(2);
  expect(posts().map(([url]) => String(url))).toEqual([
    '/api/projects/A/ide-panel/git',
    '/api/projects/A/ide-panel/git',
  ]);
  await act(async () => pending[1](Response.json({ ok: true })));
  expect(callback).toHaveBeenCalledTimes(1);
});
it('retains the remote draft after failure and permits retry', async () => {
  render(panel('A'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Remote origin URL' }), {
    target: { value: 'https://example.invalid/retry.git' },
  });
  save();
  await act(async () => pending[0](Response.json({}, { status: 503 })));
  expect(screen.getByRole('textbox', { name: 'Remote origin URL' })).toHaveProperty(
    'value',
    'https://example.invalid/retry.git',
  );
  save();
  expect(posts()).toHaveLength(2);
  await act(async () => pending[1](Response.json({ ok: true })));
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(toast.success).toHaveBeenCalledTimes(1);
});
it('resets remote and branch drafts on scope change even when the configured URL is unchanged', () => {
  const settings = (projectId: string) => (
    <I18nextProvider i18n={i18n}>
      <GitSettingsPanel
        projectId={projectId}
        gitRepositoryUrl="https://example.invalid/shared.git"
        defaultBranch={`branch-${projectId}`}
        onClose={vi.fn()}
      />
    </I18nextProvider>
  );

  const view = render(settings('A'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Remote origin URL' }), {
    target: { value: 'https://example.invalid/draft-A.git' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Default branch' }), { target: { value: 'draft-A' } });
  view.rerender(settings('B'));
  expect(screen.getByRole('textbox', { name: 'Remote origin URL' })).toHaveProperty(
    'value',
    'https://example.invalid/shared.git',
  );
  expect(screen.getByRole('textbox', { name: 'Default branch' })).toHaveProperty('value', 'branch-B');
});
it('preserves an edited branch on a same-scope remote metadata refresh', () => {
  const settings = (url: string) => (
    <I18nextProvider i18n={i18n}>
      <GitSettingsPanel projectId="A" gitRepositoryUrl={url} defaultBranch="main" onClose={vi.fn()} />
    </I18nextProvider>
  );

  const view = render(settings('https://example.invalid/one.git'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Default branch' }), { target: { value: 'my-draft' } });
  view.rerender(settings('https://example.invalid/two.git'));
  expect(screen.getByRole('textbox', { name: 'Default branch' })).toHaveProperty('value', 'my-draft');
});
