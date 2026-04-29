import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProjectIdeMemoryCacheForTest,
  getProjectIdeMemory,
  getProjectIdeMemoryStorageKey,
  saveProjectIdeMemory,
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
});
