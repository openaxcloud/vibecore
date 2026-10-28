/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Preview } from './Preview';
import { workbenchStore } from '~/lib/stores/workbench';

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    previewStoppedByUser: atom(false),
    previews: atom([]),
    workspaceLoading: atom(true),
    workspaceStatus: atom(undefined),
    workspaceLogs: atom([]),
    workspaceError: atom(undefined),
    files: atom({}),
    previewServerState: atom({ status: 'idle' }),
    refreshRuntimePorts: vi.fn().mockResolvedValue(undefined),
    isPreviewServerStarting: () => true,
    startPreviewServer: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}));
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const files = {
  'index.html': { type: 'file' as const, content: '<!doctype html><h1>Isolated preview</h1>', isBinary: false },
};

describe('Preview frame document identity', () => {
  it('replaces the iframe across static → boot → static without weakening its sandbox', () => {
    workbenchStore.files.set(files);

    const view = render(<Preview setSelectedElement={() => undefined} />);
    const original = view.getByTestId('preview-iframe');
    expect(original.getAttribute('srcdoc')).toContain('Isolated preview');
    expect(original.getAttribute('sandbox')).not.toContain('allow-same-origin');
    act(() => workbenchStore.files.set({ ...files }));
    expect(view.getByTestId('preview-iframe')).toBe(original);
    act(() => workbenchStore.files.set({}));

    const boot = view.getByTestId('preview-iframe');
    expect(boot.getAttribute('src')).toBe('about:blank');
    expect(boot).not.toBe(original);
    act(() => workbenchStore.files.set(files));

    const restored = view.getByTestId('preview-iframe');
    expect(restored).not.toBe(boot);
    expect(restored.getAttribute('srcdoc')).toBe(original.getAttribute('srcdoc'));
    expect(restored.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });
});
