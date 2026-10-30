/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Preview } from './Preview';
import { idePanelsEn, idePanelsFr } from '~/lib/i18n/catalogs/ide-panels';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    appendWorkspaceLog: vi.fn(),
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
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ''}`,
  }),
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

async function mountPreview() {
  workbenchStore.previews.set([{ port: 5173, ready: true, serving: true, baseUrl: 'https://fixture.invalid' }]);

  const view = render(<Preview setSelectedElement={() => undefined} autoStart={false} />);
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(view.getByTitle('idePanels.preview.webviewLogs'));

  const frame = view.getByTestId('preview-iframe') as HTMLIFrameElement;

  return { view, frame, status: () => view.getByRole('region', { name: 'idePanels.preview.logsLabel' }).textContent };
}

function report(
  frame: HTMLIFrameElement,
  type = 'PREVIEW_ERROR',
  origin = new URL(frame.src).origin,
  source: MessageEventSource | null = frame.contentWindow,
) {
  fireEvent(
    window,
    new MessageEvent('message', { source, origin, data: { type, message: 'Unexpected token in App.tsx' } }),
  );
}
it('labels document load without claiming a functional application', () => {
  expect(idePanelsEn['idePanels.preview.rendered']).toBe('Preview page loaded.');
  expect(idePanelsFr['idePanels.preview.rendered']).toBe('Page d’aperçu chargée.');
});
it.each(['PREVIEW_ERROR', 'PREVIEW_UNHANDLED_REJECTION'])(
  'replaces the loaded status with %s from the current frame',
  async (type) => {
    const { frame, status } = await mountPreview();
    fireEvent.load(frame);
    expect(status()).toContain('idePanels.preview.rendered');
    report(frame, type);
    expect(status()).not.toContain('idePanels.preview.rendered');
    expect(status()).toContain('Unexpected token in App.tsx');
  },
);
it('does not overwrite an error received before iframe load', async () => {
  const { frame, status } = await mountPreview();
  report(frame);
  fireEvent.load(frame);
  expect(status()).toContain('Unexpected token in App.tsx');
  expect(status()).not.toContain('idePanels.preview.rendered');
});
it('ignores errors from an unrelated window or previous origin', async () => {
  const { frame, status } = await mountPreview();
  fireEvent.load(frame);
  report(frame, 'PREVIEW_ERROR', 'https://old-project.invalid');
  report(frame, 'PREVIEW_ERROR', new URL(frame.src).origin, window);
  expect(status()).toContain('idePanels.preview.rendered');
  expect(workbenchStore.appendWorkspaceLog).not.toHaveBeenCalled();
});
it('clears a previous document error on navigation and rejects its old origin', async () => {
  const { frame, status } = await mountPreview();
  report(frame);
  expect(status()).toContain('Unexpected token in App.tsx');
  await act(async () => {
    workbenchStore.previews.set([{ port: 5173, ready: true, serving: true, baseUrl: 'https://next-project.invalid' }]);
  });
  fireEvent.load(frame);
  report(frame, 'PREVIEW_ERROR', 'https://fixture.invalid');
  expect(status()).toContain('idePanels.preview.rendered');
  expect(status()).not.toContain('Unexpected token in App.tsx');
});
it('ignores a late error after user Stop removes the frame', async () => {
  const { frame, status } = await mountPreview();
  const source = frame.contentWindow;
  await act(async () => {
    workbenchStore.previewStoppedByUser.set(true);
  });
  report(frame, 'PREVIEW_ERROR', 'https://fixture.invalid', source);
  expect(status()).not.toContain('Unexpected token in App.tsx');
  expect(workbenchStore.appendWorkspaceLog).not.toHaveBeenCalled();
});
