/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { atom } from 'nanostores';
import { toast } from 'react-toastify';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Preview } from './Preview';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    previewStoppedByUser: atom(false),
    previews: atom([]),
    workspaceLoading: atom(false),
    workspaceStatus: atom(undefined),
    workspaceLogs: atom([]),
    workspaceError: atom(undefined),
    files: atom({}),
    previewServerState: atom({ status: 'idle', command: 'npm run dev' }),
    refreshRuntimePorts: vi.fn().mockResolvedValue(undefined),
    isPreviewServerStarting: () => false,
    startPreviewServer: vi.fn().mockResolvedValue('npm run dev'),
    restartPreviewServer: vi.fn().mockResolvedValue('npm run dev'),
    reinstallDependencies: vi.fn().mockResolvedValue('npm run dev'),
  },
}));
vi.mock('react-toastify', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  workbenchStore.previewStoppedByUser.set(false);
  workbenchStore.previews.set([]);
  workbenchStore.workspaceStatus.set(undefined);
  workbenchStore.workspaceLoading.set(false);
  workbenchStore.previewServerState.set({ status: 'idle', command: 'npm run dev' });
  vi.mocked(workbenchStore.startPreviewServer).mockResolvedValue('npm run dev');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('keeps automatic retries and inline status but announces start only once per visit', async () => {
  const view = render(<Preview setSelectedElement={() => undefined} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(workbenchStore.startPreviewServer).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500);
  });
  expect(workbenchStore.startPreviewServer).toHaveBeenCalledTimes(2);
  expect(toast.info).toHaveBeenCalledTimes(1);
  expect(view.container.textContent).toContain('idePanels.preview.startingCommand');
});
it('preserves a transient failure and allows the first subsequent successful start notice', async () => {
  vi.mocked(workbenchStore.startPreviewServer).mockRejectedValueOnce(new Error('Remote runtime request failed: 502'));

  const view = render(<Preview setSelectedElement={() => undefined} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(toast.info).not.toHaveBeenCalled();
  expect(view.container.textContent).toContain('idePanels.preview.startFailed');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500);
  });
  expect(workbenchStore.startPreviewServer).toHaveBeenCalledTimes(2);
  expect(toast.info).toHaveBeenCalledTimes(1);
});

it('keeps an intentional stop idle across automatic recovery timers and requires an explicit Run', async () => {
  workbenchStore.previewStoppedByUser.set(true);

  const view = render(<Preview setSelectedElement={() => undefined} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(workbenchStore.startPreviewServer).not.toHaveBeenCalled();
  expect(workbenchStore.reinstallDependencies).not.toHaveBeenCalled();
  expect(view.getByTestId('preview-not-running-state')).toBeTruthy();
  expect(view.queryByTestId('preview-iframe')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'idePanels.preview.runPreview' }));
  expect(workbenchStore.restartPreviewServer).toHaveBeenCalledWith({ intent: 'user' });
});

it('does not announce or display a late automatic start after Stop during its await', async () => {
  let finish!: (label: string) => void;
  vi.mocked(workbenchStore.startPreviewServer).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );

  const view = render(<Preview setSelectedElement={() => undefined} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(workbenchStore.startPreviewServer).toHaveBeenCalledTimes(1);
  await act(async () => {
    workbenchStore.previewStoppedByUser.set(true);
  });
  await act(async () => {
    finish('npm run dev');
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(workbenchStore.startPreviewServer).toHaveBeenCalledTimes(1);
  expect(toast.info).not.toHaveBeenCalled();
  expect(view.getByTestId('preview-not-running-state')).toBeTruthy();
  expect(view.container.textContent).not.toContain('idePanels.preview.startingCommand');
});

it('marks the reinstall button as explicit user intent while automatic reinstall remains blocked', async () => {
  workbenchStore.previewStoppedByUser.set(true);

  const view = render(<Preview setSelectedElement={() => undefined} />);
  fireEvent.click(view.getByRole('button', { name: 'idePanels.preview.reinstallDependencies' }));
  expect(workbenchStore.reinstallDependencies).toHaveBeenCalledWith({ intent: 'user' });
});

it('removes a retained not-ready iframe after confirmed Stop and ignores its pending reload', async () => {
  workbenchStore.previews.set([{ port: 5173, ready: false, baseUrl: 'https://fixture.invalid' }]);

  const view = render(<Preview setSelectedElement={() => undefined} />);
  await act(async () => {
    await Promise.resolve();
  });

  const frame = view.getByTestId('preview-iframe');
  fireEvent.load(frame);
  await act(async () => {
    workbenchStore.previewStoppedByUser.set(true);
  });
  expect(view.queryByTestId('preview-iframe')).toBeNull();
  expect(view.getByTestId('preview-not-running-state')).toBeTruthy();

  const calls = vi.mocked(workbenchStore.refreshRuntimePorts).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(workbenchStore.refreshRuntimePorts).toHaveBeenCalledTimes(calls);
  expect(view.container.textContent).not.toContain('idePanels.preview.serverStartingRetry');
});

it('preserves a pending Stop and exposes a failed kill rather than claiming a confirmed idle preview', async () => {
  workbenchStore.previewStoppedByUser.set(true);
  workbenchStore.previews.set([{ port: 5173, ready: false, baseUrl: 'https://fixture.invalid' }]);
  workbenchStore.previewServerState.set({ status: 'stopping' });

  const view = render(<Preview setSelectedElement={() => undefined} />);
  expect(view.queryByTestId('preview-iframe')).toBeNull();
  expect((view.getByRole('button', { name: 'Stopping' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    workbenchStore.previewServerState.set({ status: 'error', error: 'Fixture kill not confirmed' });
  });
  expect(view.container.textContent).toContain('Fixture kill not confirmed');
  expect((view.getByRole('button', { name: 'idePanels.preview.runPreview' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it('offers Run after reload with stored Stop even if workspace provisioning reports starting', async () => {
  workbenchStore.previewStoppedByUser.set(true);
  workbenchStore.workspaceLoading.set(true);
  workbenchStore.workspaceStatus.set({ id: 'fixture', status: 'starting' } as never);

  const view = render(<Preview projectId="fixture" setSelectedElement={() => undefined} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(workbenchStore.startPreviewServer).not.toHaveBeenCalled();
  expect(view.queryByTestId('preview-iframe')).toBeNull();
  expect((view.getByRole('button', { name: 'idePanels.preview.runPreview' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it.each(['running', 'starting'] as const)(
  'does not revive an iframe from a previous project %s state after stored Stop',
  async (status) => {
    workbenchStore.previewStoppedByUser.set(true);
    workbenchStore.previewServerState.set({ status });
    workbenchStore.previews.set([{ port: 5173, ready: true, baseUrl: 'https://fixture.invalid' }]);

    const view = render(<Preview setSelectedElement={() => undefined} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(view.queryByTestId('preview-iframe')).toBeNull();
    expect(view.getByTestId('preview-not-running-state')).toBeTruthy();
    expect(workbenchStore.startPreviewServer).not.toHaveBeenCalled();
    expect(workbenchStore.refreshRuntimePorts).not.toHaveBeenCalled();
  },
);
