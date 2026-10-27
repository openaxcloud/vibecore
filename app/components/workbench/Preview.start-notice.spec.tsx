/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { atom } from 'nanostores';
import { toast } from 'react-toastify';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Preview } from './Preview';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    previews: atom([]),
    workspaceLoading: atom(false),
    workspaceStatus: atom(undefined),
    workspaceLogs: atom([]),
    workspaceError: atom(undefined),
    files: atom({}),
    previewServerState: atom({ command: 'npm run dev' }),
    refreshRuntimePorts: vi.fn().mockResolvedValue(undefined),
    isPreviewServerStarting: () => false,
    startPreviewServer: vi.fn().mockResolvedValue('npm run dev'),
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
