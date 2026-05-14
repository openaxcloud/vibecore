import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProjectIdeMemoryCacheForTest,
  flushProjectIdeMemorySaves,
  getProjectIdeMemory,
  getProjectIdeMemoryStorageKey,
  saveProjectIdeMemory,
  setProjectIdeMemorySaveDebounceMsForTest,
} from './projectIdeMemory';

function installLocalStorage() {
  const store = new Map<string, string>();

  const localStorageMock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });

  return { localStorageMock, store };
}

describe('project IDE memory persistence', () => {
  beforeEach(() => {
    clearProjectIdeMemoryCacheForTest();

    /*
     * The existing tests assert that `await saveProjectIdeMemory(...)` has
     * already flushed both the local cache and the network PUT. Collapse the
     * debounce to 0 so they keep observing the historical synchronous path;
     * dedicated debounce tests live in the suite below.
     */
    setProjectIdeMemorySaveDebounceMsForTest(0);

    installLocalStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ideState: null }),
      })),
    );
  });

  afterEach(() => {
    clearProjectIdeMemoryCacheForTest();
    vi.unstubAllGlobals();
  });

  it('writes layout, tabs, conversation, widths, cursor and scroll state to localStorage before the network save', async () => {
    const projectId = 'project-local-write';

    await saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        messages: [{ id: 'm1', role: 'user', content: 'Restore this conversation' }],
      },
      ui: {
        paneTree: {
          type: 'leaf',
          id: 'pane-main',
          tabs: [{ id: 'tab-editor', panel: 'editor', filePath: '/home/project/src/App.tsx' }],
          activeTabId: 'tab-editor',
        },
        activePaneId: 'pane-main',
        agentWidth: 512,
        terminalBottomOpen: true,
        terminalBottomHeight: 320,
        rightPanelOpen: true,
        rightPanelWidth: 480,
        cursorPositions: { '/home/project/src/App.tsx': { line: 12, column: 4, offset: 128 } },
        scrollPositions: { 'pane-main': 244 },
      },
    });

    const raw = globalThis.localStorage.getItem(getProjectIdeMemoryStorageKey(projectId));
    expect(raw).toBeTruthy();

    const stored = JSON.parse(raw!);
    expect(stored.chat.messages[0].content).toBe('Restore this conversation');
    expect(stored.ui.paneTree.tabs[0].filePath).toBe('/home/project/src/App.tsx');
    expect(stored.ui.agentWidth).toBe(512);
    expect(stored.ui.terminalBottomHeight).toBe(320);
    expect(stored.ui.cursorPositions['/home/project/src/App.tsx']).toEqual({ line: 12, column: 4, offset: 128 });
    expect(stored.ui.scrollPositions['pane-main']).toBe(244);
    expect(stored.updatedAt).toEqual(expect.any(String));
  });

  it('restores from localStorage when the API is unavailable', async () => {
    const projectId = 'project-local-fallback';
    globalThis.localStorage.setItem(
      getProjectIdeMemoryStorageKey(projectId),
      JSON.stringify({
        updatedAt: '2026-04-29T10:00:00.000Z',
        ui: {
          paneTree: {
            type: 'leaf',
            id: 'pane-main',
            tabs: [{ id: 'tab-files', panel: 'files' }],
            activeTabId: 'tab-files',
          },
          agentWidth: 640,
          terminalBottomOpen: true,
          terminalBottomHeight: 444,
        },
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
      })),
    );

    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.paneTree?.type).toBe('leaf');
    expect(restored.ui?.agentWidth).toBe(640);
    expect(restored.ui?.terminalBottomHeight).toBe(444);
  });

  it('prefers the newest state between server and localStorage', async () => {
    const projectId = 'project-newest';
    globalThis.localStorage.setItem(
      getProjectIdeMemoryStorageKey(projectId),
      JSON.stringify({
        updatedAt: '2026-04-29T12:00:00.000Z',
        ui: { agentWidth: 620 },
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ideState: {
            state: {
              updatedAt: '2026-04-29T11:00:00.000Z',
              ui: { agentWidth: 380 },
            },
          },
        }),
      })),
    );

    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.agentWidth).toBe(620);
  });

  it('persists project chat messages in insertion order and can clear the active conversation', async () => {
    const projectId = 'project-chat-order';

    const messages = [
      { id: 'u1', role: 'user' as const, content: 'First user request' },
      { id: 'a1', role: 'assistant' as const, content: 'First assistant response' },
      { id: 'u2', role: 'user' as const, content: 'Second user request' },
    ];

    await saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        messages,
      },
    });

    let restored = await getProjectIdeMemory(projectId);
    expect(restored.chat?.messages?.map((message) => message.id)).toEqual(['u1', 'a1', 'u2']);
    expect(restored.chat?.messages?.[0].role).toBe('user');
    expect(restored.chat?.messages?.[2].content).toBe('Second user request');

    await saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        messages: [],
        clearMessages: true,
        conversations: [
          {
            id: 'archived-1',
            messages,
          },
        ],
      },
    });

    restored = await getProjectIdeMemory(projectId);
    expect(restored.chat?.messages).toEqual([]);
    expect(restored.chat?.conversations?.[0].messages.map((message) => message.id)).toEqual(['u1', 'a1', 'u2']);
  });

  it('merges chat saves so UI-only persistence cannot erase the conversation', async () => {
    const projectId = 'project-chat-merge';

    await saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        messages: [{ id: 'u1', role: 'user', content: 'Original prompt' }],
      },
    });

    await saveProjectIdeMemory(projectId, {
      ui: {
        activeWorkspacePanel: 'preview',
        agentWidth: 720,
      },
    });

    await saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        messages: [
          { id: 'u1', role: 'user', content: 'Original prompt' },
          { id: 'a1', role: 'assistant', content: 'Generated response' },
        ],
      },
    });

    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.activeWorkspacePanel).toBe('preview');
    expect(restored.chat?.messages?.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(restored.chat?.messages?.[1].content).toBe('Generated response');
  });

  it('persists locked IDE files and folders in project memory', async () => {
    const projectId = 'project-locks';

    await saveProjectIdeMemory(projectId, {
      ui: {
        lockedItems: [
          { path: '/home/project/src/App.tsx', type: 'file' },
          { path: '/home/project/src/admin', type: 'folder' },
        ],
      },
    });

    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.lockedItems).toEqual([
      { path: '/home/project/src/App.tsx', type: 'file' },
      { path: '/home/project/src/admin', type: 'folder' },
    ]);
  });

  it('persists deleted IDE paths in project memory', async () => {
    const projectId = 'project-deleted-paths';

    await saveProjectIdeMemory(projectId, {
      ui: {
        deletedPaths: ['/home/project/src/old.tsx', '/home/project/tmp'],
      },
    });

    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.deletedPaths).toEqual(['/home/project/src/old.tsx', '/home/project/tmp']);
  });

  it('persists the terminal as a first-class workspace panel', async () => {
    const projectId = 'project-terminal-panel';

    await saveProjectIdeMemory(projectId, {
      ui: {
        workspaceTabs: ['editor', 'terminal', 'preview'],
        activeWorkspacePanel: 'terminal',
        paneTree: {
          type: 'leaf',
          id: 'pane-main',
          tabs: [
            { id: 'tab-editor', panel: 'editor' },
            { id: 'tab-terminal', panel: 'terminal' },
          ],
          activeTabId: 'tab-terminal',
        },
      },
    });

    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.workspaceTabs).toEqual(['editor', 'terminal', 'preview']);
    expect(restored.ui?.activeWorkspacePanel).toBe('terminal');
    expect(restored.ui?.paneTree).toMatchObject({
      type: 'leaf',
      activeTabId: 'tab-terminal',
      tabs: [
        { id: 'tab-editor', panel: 'editor' },
        { id: 'tab-terminal', panel: 'terminal' },
      ],
    });
  });
});

describe('project IDE memory save debouncing', () => {
  beforeEach(() => {
    clearProjectIdeMemoryCacheForTest();
    setProjectIdeMemorySaveDebounceMsForTest(5_000);
    installLocalStorage();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await flushProjectIdeMemorySaves();
    vi.useRealTimers();
    clearProjectIdeMemoryCacheForTest();
    vi.unstubAllGlobals();
  });

  it('writes the latest state to localStorage synchronously even before the network PUT fires', () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ideState: null }) }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-debounce-local';

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 612 } });

    const raw = globalThis.localStorage.getItem(getProjectIdeMemoryStorageKey(projectId));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).ui.agentWidth).toBe(612);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('coalesces 8 rapid saves into a single network PUT after the debounce window', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init: { body: string }) => ({
      ok: true,
      json: async () => ({ ideState: null }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-debounce-coalesce';

    for (let i = 0; i < 8; i += 1) {
      void saveProjectIdeMemory(projectId, { ui: { agentWidth: 300 + i } });
    }

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];

    if (!call) {
      throw new Error('expected a recorded fetch call');
    }

    const lastBody = JSON.parse(call[1].body) as { state: { ui: { agentWidth: number } } };
    expect(lastBody.state.ui.agentWidth).toBe(307);
  });

  it('resets the debounce timer when a new save arrives before the window elapses', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ideState: null }) }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-debounce-reset';

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 100 } });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).not.toHaveBeenCalled();

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 200 } });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushProjectIdeMemorySaves fires the pending PUT immediately', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ideState: null }) }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-debounce-flush';

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 712 } });
    expect(fetchMock).not.toHaveBeenCalled();

    await flushProjectIdeMemorySaves(projectId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects the shared debounced promise when the PUT fails permanently', async () => {
    /*
     * 400-class status triggers persistWithRetry's retry loop (1 s + 4 s + 12 s
     * back-off). Advance past every back-off in turn so the eventual rejection
     * surfaces synchronously to the spec.
     */
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-debounce-error';

    const savePromise = saveProjectIdeMemory(projectId, { ui: { agentWidth: 808 } });

    const observed = savePromise.then(
      () => 'resolved' as const,
      (error) => (error as Error).message,
    );

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(12_000);

    await expect(observed).resolves.toMatch(/Failed to save project IDE memory/);
  });
});
