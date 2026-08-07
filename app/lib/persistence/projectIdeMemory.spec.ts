import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProjectIdeMemoryCacheForTest,
  flushProjectIdeMemorySaves,
  getProjectIdeMemory,
  getProjectIdeMemoryStorageKey,
  getProjectIdeMemoryVersionForTest,
  PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS,
  saveProjectIdeMemory,
  setProjectIdeMemorySaveDebounceMsForTest,
  setProjectIdeMemoryUnloadingForTest,
} from './projectIdeMemory';
import { persistenceRuntimeEn } from '~/lib/i18n/catalogs/persistence-runtime';

function makeHeaders(entries: Record<string, string> = {}) {
  const normalized = new Map<string, string>();

  for (const [key, value] of Object.entries(entries)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    get(name: string): string | null {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

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

  it('times out hung API reads and restores local IDE state', async () => {
    vi.useFakeTimers();

    try {
      const projectId = 'project-hung-read-fallback';
      globalThis.localStorage.setItem(
        getProjectIdeMemoryStorageKey(projectId),
        JSON.stringify({
          updatedAt: '2026-04-29T10:00:00.000Z',
          ui: {
            activeWorkspacePanel: 'settings',
            agentWidth: 555,
          },
        }),
      );

      const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const restoredPromise = getProjectIdeMemory(projectId);

      await vi.advanceTimersByTimeAsync(PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS);

      await expect(restoredPromise).resolves.toMatchObject({
        ui: {
          activeWorkspacePanel: 'settings',
          agentWidth: 555,
        },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/projects/${projectId}/ide-state`,
        expect.objectContaining({
          credentials: 'include',
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses an empty local state for unauthenticated IDE memory reads instead of throwing', async () => {
    const projectId = 'project-auth-expired';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
      })),
    );

    const restored = await getProjectIdeMemory(projectId);
    expect(restored).toEqual({});
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

  it('can mark a queued project prompt as consumed without erasing chat messages', async () => {
    const projectId = 'project-pending-prompt';

    await saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        pendingPrompt: {
          id: 'pending-1',
          prompt: 'Build a production project workspace',
          model: 'gpt-4o',
          provider: 'OpenAI',
          createdAt: '2026-05-25T10:00:00.000Z',
        },
        messages: [{ id: 'u1', role: 'user', content: 'Existing prompt' }],
      },
    });

    await saveProjectIdeMemory(projectId, {
      chat: {
        pendingPrompt: null,
      },
    });

    const restored = await getProjectIdeMemory(projectId);
    expect(restored.chat?.pendingPrompt).toBeNull();
    expect(restored.chat?.messages?.map((message) => message.id)).toEqual(['u1']);
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

  it('uses a 1.5 s default debounce window (Phase 0 #4)', async () => {
    // Clear any test override so the production default applies.
    clearProjectIdeMemoryCacheForTest();
    installLocalStorage();

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ideState: null }) }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-debounce-default';

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 320 } });

    // Just before 1.5 s — nothing fires.
    await vi.advanceTimersByTimeAsync(1_400);
    expect(fetchMock).not.toHaveBeenCalled();

    // Cross the 1.5 s threshold — single PUT.
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushes the pending save on a visibility-hidden lifecycle event', async () => {
    clearProjectIdeMemoryCacheForTest();
    setProjectIdeMemorySaveDebounceMsForTest(1_500);
    installLocalStorage();

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ideState: null }) }));
    vi.stubGlobal('fetch', fetchMock);

    /*
     * Capture the registered lifecycle handlers so we can fire them manually
     * without needing a real DOM lifecycle event.
     */
    const lifecycleHandlers: Record<string, EventListener> = {};

    const stubWindow = {
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        lifecycleHandlers[event] = handler;
      }),
      removeEventListener: vi.fn(),
    };

    const stubDocument = { visibilityState: 'visible' as DocumentVisibilityState };
    vi.stubGlobal('window', stubWindow as unknown as Window);
    vi.stubGlobal('document', stubDocument as unknown as Document);

    const projectId = 'project-debounce-visibility';

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 999 } });
    expect(fetchMock).not.toHaveBeenCalled();

    /*
     * Simulate a tab going to background; the flush should fire the PUT
     * synchronously without waiting on the 1.5 s timer.
     */
    stubDocument.visibilityState = 'hidden';
    lifecycleHandlers.visibilitychange?.(new Event('visibilitychange'));

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the unload-flush PUT with keepalive:true so the browser does not abort it during teardown (Bug 1)', async () => {
    clearProjectIdeMemoryCacheForTest();
    setProjectIdeMemorySaveDebounceMsForTest(1_500);
    installLocalStorage();

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ideState: null }) }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-keepalive-unload';

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 444 } });
    expect(fetchMock).not.toHaveBeenCalled();

    /*
     * The lifecycle listeners flip this flag right before flushing on a genuine
     * tab close / navigation (pagehide / beforeunload). Simulate that, then
     * flush, and assert the PUT carries keepalive so the browser will not abort
     * it during document teardown.
     */
    setProjectIdeMemoryUnloadingForTest(true);

    try {
      await flushProjectIdeMemorySaves(projectId);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const call = fetchMock.mock.calls[0];

      if (!call) {
        throw new Error('expected a recorded fetch call');
      }

      const init = call[1] as RequestInit;
      expect(init.method).toBe('PUT');
      expect(init.keepalive).toBe(true);
    } finally {
      setProjectIdeMemoryUnloadingForTest(false);
    }
  });

  it('omits keepalive on an ordinary (non-unload) debounced PUT', async () => {
    clearProjectIdeMemoryCacheForTest();
    setProjectIdeMemorySaveDebounceMsForTest(1_500);
    installLocalStorage();
    setProjectIdeMemoryUnloadingForTest(false);

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ideState: null }) }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-keepalive-normal';

    void saveProjectIdeMemory(projectId, { ui: { agentWidth: 321 } });
    await vi.advanceTimersByTimeAsync(1_500);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];

    if (!call) {
      throw new Error('expected a recorded fetch call');
    }

    const init = call[1] as RequestInit;
    expect(init.keepalive).toBeUndefined();
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

    await expect(observed).resolves.toBe(persistenceRuntimeEn['persistence.ide.saveFailed'].replace('{status}', '400'));
  });

  it('keeps the chat REPLACE flag on the coalesced PUT when a later ordinary save lands in the debounce window', async () => {
    /*
     * Bug 1 regression — an authoritative chat replace (clearMessages: true,
     * e.g. after a rewind that produced a SHORTER list) followed within the
     * debounce window by an ordinary chat save (pendingPrompt: null) must NOT
     * downgrade the coalesced PUT from a REPLACE to a union-merge, otherwise
     * the rewound messages resurrect on reload.
     */
    const fetchMock = vi.fn(async (_url: unknown, _init: { body: string }) => ({
      ok: true,
      json: async () => ({ ideState: null }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-debounce-clear-sticky';

    // First save: authoritative rewind/replace.
    void saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        messages: [{ id: 'u1', role: 'user', content: 'kept after rewind' }],
        clearMessages: true,
      },
    });

    // Second save inside the window: ordinary chat-scope save, no clearMessages.
    void saveProjectIdeMemory(projectId, {
      chat: { pendingPrompt: null },
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];

    if (!call) {
      throw new Error('expected a recorded fetch call');
    }

    const body = JSON.parse(call[1].body) as { state: { chat?: { clearMessages?: boolean; pendingPrompt?: unknown } } };
    expect(body.state.chat?.clearMessages).toBe(true);
    expect(body.state.chat?.pendingPrompt).toBeNull();
  });
});

/*
 * Phase 0 #4 — optimistic concurrency. These specs live in their own
 * describe so they can run with real timers (the retry-on-412 path issues
 * back-to-back fetches and shouldn't be coupled to the debounce suite's
 * fake clock).
 */
describe('project IDE memory ETag / If-Match', () => {
  beforeEach(() => {
    clearProjectIdeMemoryCacheForTest();
    setProjectIdeMemorySaveDebounceMsForTest(0);
    installLocalStorage();
  });

  afterEach(() => {
    clearProjectIdeMemoryCacheForTest();
    vi.unstubAllGlobals();
  });

  it('captures the server etag on GET and sends it as If-Match on the next PUT', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: { method?: string; headers?: Record<string, string> }) => {
      if (!init || (init.method ?? 'GET').toUpperCase() === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: makeHeaders({ etag: '"7"' }),
          json: async () => ({ ideState: { state: { ui: { agentWidth: 480 } }, version: 7 } }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: makeHeaders({ etag: '"8"' }),
        clone() {
          return this;
        },
        json: async () => ({ ideState: { state: { ui: { agentWidth: 600 } }, version: 8 } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-etag-roundtrip';

    await getProjectIdeMemory(projectId);
    expect(getProjectIdeMemoryVersionForTest(projectId)).toBe(7);

    await saveProjectIdeMemory(projectId, { ui: { agentWidth: 600 } });

    const putCall = fetchMock.mock.calls.find(
      ([, init]) => (init as { method?: string } | undefined)?.method === 'PUT',
    );

    if (!putCall) {
      throw new Error('expected a PUT call');
    }

    const putHeaders = (putCall[1] as { headers: Record<string, string> }).headers;
    expect(putHeaders['if-match']).toBe('"7"');
    expect(getProjectIdeMemoryVersionForTest(projectId)).toBe(8);
  });

  it('recovers from a 412 by adopting the server state and retrying with the new If-Match', async () => {
    const putHeaderHistory: Array<string | undefined> = [];

    const fetchMock = vi.fn(async (_url: unknown, init?: { method?: string; headers?: Record<string, string> }) => {
      if (!init || (init.method ?? 'GET').toUpperCase() === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: makeHeaders({ etag: '"3"' }),
          json: async () => ({ ideState: { state: { ui: { agentWidth: 200 } }, version: 3 } }),
        };
      }

      putHeaderHistory.push(init.headers?.['if-match']);

      if (putHeaderHistory.length === 1) {
        return {
          ok: false,
          status: 412,
          headers: makeHeaders({ etag: '"5"' }),
          json: async () => ({
            error: 'IDE state was modified by another session',
            code: 'IDE_STATE_PRECONDITION_FAILED',
            ideState: { state: { ui: { agentWidth: 999, terminalBottomHeight: 222 } }, version: 5 },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: makeHeaders({ etag: '"6"' }),
        clone() {
          return this;
        },
        json: async () => ({ ideState: { state: { ui: { agentWidth: 800 } }, version: 6 } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-etag-412';

    await getProjectIdeMemory(projectId);
    expect(getProjectIdeMemoryVersionForTest(projectId)).toBe(3);

    await saveProjectIdeMemory(projectId, { ui: { agentWidth: 800 } });

    expect(putHeaderHistory).toEqual(['"3"', '"5"']);
    expect(getProjectIdeMemoryVersionForTest(projectId)).toBe(6);

    /*
     * After the 412 recovery, the cache holds the merged result: the local
     * patch (agentWidth: 800) layered on top of the server state we
     * adopted (terminalBottomHeight: 222 from the conflicting tab).
     */
    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.agentWidth).toBe(800);
    expect(restored.ui?.terminalBottomHeight).toBe(222);
  });

  it('does not throw on a persistent 412 conflict — the re-merged state stays pending for the next flush', async () => {
    let putCount = 0;
    let serverVersion = 3;

    const fetchMock = vi.fn(async (_url: unknown, init?: { method?: string; headers?: Record<string, string> }) => {
      if (!init || (init.method ?? 'GET').toUpperCase() === 'GET') {
        return {
          ok: true,
          status: 200,
          headers: makeHeaders({ etag: `"${serverVersion}"` }),
          json: async () => ({ ideState: { state: { ui: { agentWidth: 200 } }, version: serverVersion } }),
        };
      }

      /*
       * Every PUT loses the version race — a sustained conflict (agent + IDE both
       * writing during generation). Bump the server version each time so If-Match
       * never matches.
       */
      putCount += 1;
      serverVersion += 1;

      return {
        ok: false,
        status: 412,
        headers: makeHeaders({ etag: `"${serverVersion}"` }),
        json: async () => ({
          error: 'IDE state was modified by another session',
          code: 'IDE_STATE_PRECONDITION_FAILED',
          ideState: { state: { ui: { agentWidth: 111 } }, version: serverVersion },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-etag-412-persistent';

    await getProjectIdeMemory(projectId);

    /*
     * The key assertion: a persistent 412 must NOT surface as a thrown error that
     * breaks the IDE — it resolves, leaving the merged state durably pending.
     */
    await expect(saveProjectIdeMemory(projectId, { ui: { agentWidth: 800 } })).resolves.toBeUndefined();

    // It really did exhaust its retry budget on 412s (not a single lucky success).
    expect(putCount).toBeGreaterThan(1);

    // The local patch survives in the cache for the next flush to re-send.
    const restored = await getProjectIdeMemory(projectId);
    expect(restored.ui?.agentWidth).toBe(800);
  });

  it('carries the chat REPLACE flag onto the re-PUT after a 412 conflict', async () => {
    /*
     * Bug 2 regression — when an authoritative chat replace (clearMessages:
     * true) loses a version race, the 412 recovery re-merges against the
     * server state. `mergeProjectIdeMemory` strips clearMessages, so without
     * the fix the re-PUT body would union-merge and the rewound messages
     * would survive. Assert the second PUT still carries clearMessages.
     */
    const putBodies: Array<{ chat?: { clearMessages?: boolean; messages?: Array<{ id?: string }> } }> = [];

    const fetchMock = vi.fn(
      async (_url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
        if (!init || (init.method ?? 'GET').toUpperCase() === 'GET') {
          return {
            ok: true,
            status: 200,
            headers: makeHeaders({ etag: '"3"' }),
            json: async () => ({ ideState: { state: { chat: { messages: [] } }, version: 3 } }),
          };
        }

        putBodies.push((JSON.parse(init.body ?? '{}') as { state: (typeof putBodies)[number] }).state);

        if (putBodies.length === 1) {
          return {
            ok: false,
            status: 412,
            headers: makeHeaders({ etag: '"5"' }),
            json: async () => ({
              // Server has a STALE, longer message list from a concurrent session.
              ideState: { state: { chat: { messages: [{ id: 'stale1' }, { id: 'stale2' }] } }, version: 5 },
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: makeHeaders({ etag: '"6"' }),
          clone() {
            return this;
          },
          json: async () => ({ ideState: { state: { chat: { messages: [{ id: 'u1' }] } }, version: 6 } }),
        };
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const projectId = 'project-etag-412-clear';

    await getProjectIdeMemory(projectId);

    // Authoritative rewind: replace the list with a single message.
    await saveProjectIdeMemory(projectId, {
      chat: {
        id: `project:${projectId}`,
        messages: [{ id: 'u1', role: 'user', content: 'survivor' }],
        clearMessages: true,
      },
    });

    expect(putBodies).toHaveLength(2);
    expect(putBodies[0].chat?.clearMessages).toBe(true);

    // The re-PUT after the 412 must still REPLACE, not union-merge.
    expect(putBodies[1].chat?.clearMessages).toBe(true);
  });
});
