/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {} });

  return {
    searchParams: new URLSearchParams(),
    loaderData: {} as { id?: string; projectId?: string },
    completerFilSiVide: vi.fn(),
    getProjectIdeMemory: vi.fn(),
    saveProjectIdeMemory: vi.fn(),
    setMessages: vi.fn(async () => undefined),
    openDatabase: vi.fn(async () => ({ name: 'fil-serveur-spec-db' })),
    noop: vi.fn(),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => mocks.loaderData,
    useNavigate: () => mocks.noop,
    useSearchParams: () => [mocks.searchParams, mocks.noop],
  };
});

vi.mock('react-toastify', () => ({
  toast: { info: mocks.noop, error: mocks.noop, success: mocks.noop },
}));

vi.mock('~/lib/persistence/db', () => ({
  openDatabase: () => mocks.openDatabase(),
  getMessages: vi.fn(async () => undefined),
  getNextId: vi.fn(async () => 'chat-next'),
  getUrlId: vi.fn(async () => 'chat-url'),
  setMessages: (...a: unknown[]) => mocks.setMessages(...a),
  duplicateChat: vi.fn(),
  createChatFromMessages: vi.fn(),
  getSnapshot: vi.fn(async () => undefined),
  setSnapshot: vi.fn(async () => undefined),
}));

vi.mock('~/lib/persistence/projectIdeMemory', () => ({
  getProjectIdeMemory: (...a: unknown[]) => mocks.getProjectIdeMemory(...a),
  saveProjectIdeMemory: (...a: unknown[]) => mocks.saveProjectIdeMemory(...a),
}));

vi.mock('~/lib/persistence/serveur-fil-projet', () => ({
  completerFilSiVide: (...a: unknown[]) => mocks.completerFilSiVide(...a),
}));

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: { workdir: '/home/project', createDirectory: mocks.noop, writeFile: mocks.noop },
}));
vi.mock('~/lib/stores/logs', () => ({ logStore: { logError: mocks.noop } }));
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: { firstArtifact: undefined, files: { get: () => ({}) } },
}));
vi.mock('~/utils/projectCommands', () => ({
  detectProjectCommands: vi.fn(async () => []),
  createCommandActionsString: vi.fn(() => ''),
  escapeBoltActionAttribute: vi.fn((v: string) => v),
}));

import { chatId, chatMetadata, useChatHistory } from '~/lib/persistence/useChatHistory';

describe('isolated actual history hook navigation race', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatId.set(undefined);
    chatMetadata.set(undefined);
    mocks.saveProjectIdeMemory.mockResolvedValue(undefined);
  });
  afterEach(cleanup);
  it.each(['rerender', 'remount'] as const)(
    'departed project cannot overwrite current identity after %s',
    async (transition) => {
      let finishA!: (v: unknown) => void;

      const oldMemory = new Promise((resolve) => {
        finishA = resolve;
      });
      mocks.completerFilSiVide.mockResolvedValue(undefined);
      mocks.getProjectIdeMemory.mockImplementation((id: string) =>
        id === 'A'
          ? oldMemory
          : Promise.resolve({
              chat: {
                id: 'project:B',
                messages: [{ id: 'b1', role: 'user', content: 'B' }],
                metadata: { aiConversationId: 'conversation-B' },
              },
            }),
      );
      mocks.loaderData = { projectId: 'A' };

      const oldView = renderHook(() => useChatHistory());
      await waitFor(() => expect(mocks.getProjectIdeMemory).toHaveBeenCalledWith('A'));

      if (transition === 'remount') {
        oldView.unmount();
      }

      mocks.loaderData = { projectId: 'B' };

      const currentView = transition === 'remount' ? renderHook(() => useChatHistory()) : oldView;

      if (transition === 'rerender') {
        currentView.rerender();
      }

      await waitFor(() => expect(currentView.result.current.ready).toBe(true));
      expect(chatId.get()).toBe('project:B');
      await act(async () =>
        finishA({
          chat: {
            id: 'project:A',
            messages: [{ id: 'a1', role: 'user', content: 'A' }],
            metadata: { aiConversationId: 'conversation-A' },
          },
        }),
      );
      expect(chatId.get()).toBe('project:B');
      expect(chatMetadata.get()?.aiConversationId).toBe('conversation-B');
    },
  );
  it('late server fallback from unmounted A cannot adopt its conversation into B', async () => {
    const actual = await vi.importActual<typeof import('./serveur-fil-projet')>('./serveur-fil-projet');

    let finishServer!: (v: import('./serveur-fil-projet').FilServeur) => void;

    const server = new Promise<import('./serveur-fil-projet').FilServeur>((resolve) => {
      finishServer = resolve;
    });
    mocks.saveProjectIdeMemory.mockResolvedValue(undefined);
    mocks.completerFilSiVide.mockImplementation((messages, project, setter, _loader, adopt, identity) =>
      actual.completerFilSiVide(messages, project, setter, () => server, adopt, identity),
    );
    mocks.getProjectIdeMemory.mockImplementation((id: string) =>
      Promise.resolve({
        chat: { id: `project:${id}`, messages: id === 'A' ? [] : [{ id: 'b1', role: 'user', content: 'B' }] },
      }),
    );
    chatMetadata.set(undefined);
    mocks.loaderData = { projectId: 'A' };

    const oldView = renderHook(() => useChatHistory());
    await waitFor(() => expect(oldView.result.current.ready).toBe(true));
    oldView.unmount();
    mocks.loaderData = { projectId: 'B' };

    const currentView = renderHook(() => useChatHistory());
    await waitFor(() => expect(currentView.result.current.ready).toBe(true));
    expect(chatId.get()).toBe('project:B');
    await act(async () =>
      finishServer({ messages: [{ id: 'a1', role: 'assistant', content: 'A' }], conversationId: 'conversation-A' }),
    );
    expect(chatMetadata.get()?.aiConversationId).toBeUndefined();
    expect(mocks.saveProjectIdeMemory).not.toHaveBeenCalled();
    expect(currentView.result.current.initialMessages.map((message) => message.id)).toEqual(['b1']);
  });

  it('an obsolete memory rejection does not replace the active project or show a toast', async () => {
    let rejectA!: (reason: Error) => void;

    const oldMemory = new Promise((_resolve, reject) => {
      rejectA = reject;
    });
    mocks.completerFilSiVide.mockResolvedValue(undefined);
    mocks.getProjectIdeMemory.mockImplementation((id: string) =>
      id === 'A'
        ? oldMemory
        : Promise.resolve({ chat: { id: 'project:B', messages: [{ id: 'b1', role: 'user', content: 'B' }] } }),
    );
    mocks.loaderData = { projectId: 'A' };

    const oldView = renderHook(() => useChatHistory());
    oldView.unmount();
    mocks.loaderData = { projectId: 'B' };

    const currentView = renderHook(() => useChatHistory());
    await waitFor(() => expect(currentView.result.current.ready).toBe(true));
    await act(async () => rejectA(new Error('synthetic delayed read failure')));
    expect(chatId.get()).toBe('project:B');
    expect(mocks.noop).not.toHaveBeenCalled();
  });
});
