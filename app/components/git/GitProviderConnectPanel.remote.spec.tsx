/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { GitProviderConnectPanel } from '~/components/git/GitProviderConnectPanel';
import { createI18nInstance } from '~/lib/i18n/runtime';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-toastify', () => ({ toast }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function panel(projectId = 'isolated-A', onRemoteConfigured = vi.fn()) {
  return (
    <I18nextProvider i18n={createI18nInstance('en')}>
      <GitProviderConnectPanel projectId={projectId} onRemoteConfigured={onRemoteConfigured} />
    </I18nextProvider>
  );
}

function drawer() {
  fireEvent.click(screen.getByRole('button', { name: /Add remote URL from the Git panel/i }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Remote URL', exact: true }), {
    target: { value: 'https://example.invalid/repo.git' },
  });

  return screen.getByRole('button', { name: /Save remote/i }).closest('form')!;
}
it('shows an actionable failure when picking a repository fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url, init) =>
      init?.method === 'POST'
        ? Response.json({ error: 'synthetic failure' }, { status: 503 })
        : Response.json({
            repos: [
              {
                id: 1,
                full_name: 'isolated/repo',
                html_url: 'https://example.invalid/repo',
                default_branch: 'main',
                private: false,
              },
            ],
          }),
    ),
  );
  render(panel());
  fireEvent.click(screen.getByRole('button', { name: /Choose from your GitHub repositories/i }));
  fireEvent.click(await screen.findByRole('button', { name: /isolated\/repo/ }));
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
});
it('serializes custom remote form submissions before pending renders', async () => {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(vi.fn())));
  render(panel());

  const form = drawer();
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('ignores the old project response after navigation', async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    ),
  );

  const callback = vi.fn();
  const view = render(panel('isolated-A', callback));
  fireEvent.submit(drawer());
  view.rerender(panel('isolated-B', callback));
  await act(async () => resolve(Response.json({ ok: true })));
  expect(callback).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});
it('ignores remote success after the panel unmounts on navigation', async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    ),
  );

  const callback = vi.fn();
  const view = render(panel('isolated-A', callback));
  fireEvent.submit(drawer());
  view.unmount();
  await act(async () => resolve(Response.json({ ok: true })));
  expect(callback).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});
it('does not submit when the enclosing Git operation is busy', () => {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(vi.fn())));

  const view = render(panel());
  const form = drawer();
  view.rerender(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <GitProviderConnectPanel projectId="isolated-A" busy />
    </I18nextProvider>,
  );
  fireEvent.submit(form);
  expect(fetch).not.toHaveBeenCalled();
});
it('renders the same remote failure for the custom URL flow', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'synthetic failure' }, { status: 503 })));
  render(panel());
  fireEvent.submit(drawer());
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(toast.success).not.toHaveBeenCalled();
});
it('closing a custom remote before submit does not send anything', () => {
  vi.stubGlobal('fetch', vi.fn());
  render(panel());
  drawer();
  fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('retains custom inputs after error and allows a successful retry', async () => {
  const callback = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'failed' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true })),
  );
  render(panel('isolated-A', callback));

  const form = drawer();
  fireEvent.submit(form);
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox', { name: 'Remote URL', exact: true })).toHaveProperty(
    'value',
    'https://example.invalid/repo.git',
  );
  fireEvent.submit(form);
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('an old response cannot release a new project mutation lock', async () => {
  let resolveA!: (r: Response) => void;
  let resolveB!: (r: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((r) => {
          resolveA = r;
        }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((r) => {
          resolveB = r;
        }),
      ),
  );

  const callback = vi.fn();
  const view = render(panel('isolated-A', callback));
  fireEvent.submit(drawer());
  view.rerender(panel('isolated-B', callback));

  const formB = drawer();
  fireEvent.submit(formB);
  await act(async () => resolveA(Response.json({ ok: true })));
  fireEvent.submit(formB);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(callback).not.toHaveBeenCalled();
  await act(async () => resolveB(Response.json({ ok: true })));
  expect(callback).toHaveBeenCalledTimes(1);
});
