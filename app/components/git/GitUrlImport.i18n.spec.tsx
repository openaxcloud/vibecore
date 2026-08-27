/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  gitClone: vi.fn(),
  importChat: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-router', () => ({
  useSearchParams: () => [new URLSearchParams('url=https://github.com/e-code/demo-repo')],
}));

vi.mock('react-toastify', () => ({
  toast: { error: harness.toastError },
}));

vi.mock('remix-utils/client-only', () => ({
  ClientOnly: ({ children }: { children: () => React.ReactNode }) => children(),
}));

vi.mock('~/components/chat/BaseChat', () => ({ BaseChat: () => <div>base-chat</div> }));
vi.mock('~/components/chat/Chat.client', () => ({ Chat: () => <div>chat-ready</div> }));
vi.mock('~/components/ui/LoadingOverlay', () => ({
  LoadingOverlay: ({ message }: { message: string }) => <div role="status">{message}</div>,
}));
vi.mock('~/lib/hooks/useGit', () => ({
  useGit: () => ({ ready: true, gitClone: harness.gitClone }),
}));
vi.mock('~/lib/persistence', () => ({
  useChatHistory: () => ({ ready: true, importChat: harness.importChat }),
}));
vi.mock('./decode-cloned-files', () => ({
  decodeClonedFiles: () => [{ path: 'src/App.tsx', content: 'export const App = () => null;' }],
}));

import { GitUrlImport } from './GitUrlImport.client';
import { createI18nInstance } from '~/lib/i18n/runtime';

beforeEach(() => {
  harness.gitClone.mockReset();
  harness.importChat.mockReset();
  harness.toastError.mockReset();
});

afterEach(cleanup);

describe('<GitUrlImport /> i18n', () => {
  it('localizes the loading state and synthesized French chat metadata', async () => {
    let resolveClone: ((value: { workdir: string; data: Record<string, string> }) => void) | undefined;
    harness.gitClone.mockReturnValue(
      new Promise((resolve) => {
        resolveClone = resolve;
      }),
    );
    harness.importChat.mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <GitUrlImport />
      </I18nextProvider>,
    );

    expect(screen.getByRole('status').textContent).toBe('Veuillez patienter pendant le clonage du dépôt…');

    resolveClone?.({ workdir: '/workspace/demo-repo', data: { 'src/App.tsx': 'encoded' } });

    await waitFor(() => expect(harness.importChat).toHaveBeenCalledOnce());

    const [title, messages, metadata] = harness.importChat.mock.calls[0];
    expect(title).toBe('Projet Git : demo-repo');
    expect(metadata).toEqual({ gitUrl: 'https://github.com/e-code/demo-repo' });
    expect(messages[0].content).toContain(
      'Clonage du dépôt https://github.com/e-code/demo-repo dans /workspace/demo-repo',
    );
    expect(messages[0].content).toContain('title="Fichiers clonés avec Git"');
    expect(messages[0].content).not.toContain('Git Cloned Files');
    expect(harness.toastError).not.toHaveBeenCalled();
  });
});
