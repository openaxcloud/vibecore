import type { Message } from 'ai';
import type { IChatMetadata } from './db';

export type ProjectIdePanel = 'webview' | 'console' | 'network' | 'files';
export type ProjectIdeWorkspacePanel =
  | 'editor'
  | 'preview'
  | 'files'
  | 'search'
  | 'locks'
  | 'overview'
  | 'database'
  | 'object-storage'
  | 'packages'
  | 'monitoring'
  | 'extensions'
  | 'integrations'
  | 'workflows'
  | 'deployments'
  | 'env'
  | 'secrets'
  | 'git'
  | 'activity'
  | 'terminal'
  | 'logs'
  | 'collaborators'
  | 'domains'
  | 'snapshots'
  | 'settings';
export type ProjectMobilePanel = 'chat' | 'files' | 'editor' | 'terminal' | 'preview' | 'deploy';

export interface ProjectIdePaneTab {
  id: string;
  panel: ProjectIdeWorkspacePanel;
  pinned?: boolean;
  filePath?: string;
  preview?: boolean;
}

export type ProjectIdePaneLeaf = {
  type: 'leaf';
  id: string;
  tabs: ProjectIdePaneTab[];
  activeTabId?: string;
};

export type ProjectIdePaneSplit = {
  type: 'split';
  id: string;
  direction: 'horizontal';
  first: ProjectIdePaneNode;
  second: ProjectIdePaneNode;
};

export type ProjectIdePaneNode = ProjectIdePaneLeaf | ProjectIdePaneSplit;

export interface ProjectIdeMemory {
  chat?: {
    id?: string;
    urlId?: string;
    description?: string;
    metadata?: IChatMetadata;
    messages?: Message[];
    archivedMessages?: Message[];
    clearMessages?: boolean;
    conversations?: Array<{
      id: string;
      title?: string;
      messages: Message[];
      createdAt?: string;
      updatedAt?: string;
    }>;
  };
  ui?: {
    selectedFile?: string;
    currentView?: string;
    rightPanel?: ProjectIdePanel;
    rightPanelOpen?: boolean;
    rightPanelMode?: 'files' | 'preview-logs';
    rightPanelWidth?: number;
    workspaceTabs?: ProjectIdeWorkspacePanel[];
    activeWorkspacePanel?: ProjectIdeWorkspacePanel;
    paneTree?: ProjectIdePaneNode;
    activePaneId?: string;
    agentWidth?: number;
    terminalBottomOpen?: boolean;
    terminalBottomHeight?: number;
    cursorPositions?: Record<string, { line: number; column: number; offset?: number }>;
    scrollPositions?: Record<string, number>;
    recentTabIds?: string[];
    closedTabs?: ProjectIdePaneTab[];
    mobilePanel?: ProjectMobilePanel;
    showWorkbench?: boolean;
    previewIndex?: number;
    previewPath?: string;
    lockedItems?: Array<{ path: string; type: 'file' | 'folder' }>;
    deletedPaths?: string[];
  };
  updatedAt?: string;
}

type IdeStateEnvelope = {
  ideState?: {
    state?: ProjectIdeMemory;
    version?: number;
    updatedAt?: string;
  } | null;
};

const memoryCache = new Map<string, ProjectIdeMemory>();
const pendingSaves = new Map<string, Promise<void>>();
const pendingDirty = new Map<string, ProjectIdeMemory>();
const crossTabListeners = new Map<string, Set<(memory: ProjectIdeMemory) => void>>();
let storageListenerInstalled = false;
export const PROJECT_IDE_MEMORY_STORAGE_PREFIX = 'vibecore.projectIdeMemory';

const SAVE_RETRY_DELAYS_MS = [1_000, 4_000, 12_000];

function messageKey(message: Message, index: number) {
  return message.id ?? `${message.role}:${index}:${String(message.content).slice(0, 80)}`;
}

function mergeMessages(existing: Message[] | undefined, incoming: Message[] | undefined, clearMessages?: boolean) {
  if (incoming === undefined) {
    return existing;
  }

  if (clearMessages) {
    return incoming;
  }

  if (!existing?.length || !incoming.length) {
    return existing?.length && !incoming.length ? existing : incoming;
  }

  const order: string[] = [];
  const byKey = new Map<string, Message>();

  existing.forEach((message, index) => {
    const key = messageKey(message, index);
    order.push(key);
    byKey.set(key, message);
  });

  incoming.forEach((message, index) => {
    const key = messageKey(message, index);

    if (!byKey.has(key)) {
      order.push(key);
    }

    byKey.set(key, message);
  });

  return order.map((key) => byKey.get(key)).filter((message): message is Message => Boolean(message));
}

function mergeProjectIdeMemory(existing: ProjectIdeMemory, patch: ProjectIdeMemory): ProjectIdeMemory {
  const clearMessages = patch.chat?.clearMessages;
  const mergedChat = patch.chat
    ? {
        ...existing.chat,
        ...patch.chat,
        messages: mergeMessages(existing.chat?.messages, patch.chat.messages, clearMessages),
        archivedMessages: mergeMessages(existing.chat?.archivedMessages, patch.chat.archivedMessages),
        conversations: patch.chat.conversations ?? existing.chat?.conversations,
      }
    : existing.chat;

  if (mergedChat) {
    delete mergedChat.clearMessages;
  }

  return {
    ...existing,
    ...patch,
    chat: mergedChat,
    ui: { ...existing.ui, ...patch.ui },
    updatedAt: new Date().toISOString(),
  };
}

function memoryForServerSave(memory: ProjectIdeMemory, patch: ProjectIdeMemory): ProjectIdeMemory {
  if (!patch.chat?.clearMessages) {
    return memory;
  }

  return {
    ...memory,
    chat: {
      ...memory.chat,
      clearMessages: true,
    },
  };
}

export function getProjectIdeMemoryStorageKey(projectId: string) {
  return `${PROJECT_IDE_MEMORY_STORAGE_PREFIX}:${projectId}`;
}

function localStorageAvailable() {
  return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
}

function readLocalProjectIdeMemory(projectId: string): ProjectIdeMemory | undefined {
  if (!localStorageAvailable()) {
    return undefined;
  }

  try {
    const raw = globalThis.localStorage.getItem(getProjectIdeMemoryStorageKey(projectId));

    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as ProjectIdeMemory;

    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch (error) {
    console.error('Failed to read local project IDE memory', error);

    return undefined;
  }
}

function writeLocalProjectIdeMemory(projectId: string, memory: ProjectIdeMemory) {
  if (!localStorageAvailable()) {
    return;
  }

  try {
    globalThis.localStorage.setItem(getProjectIdeMemoryStorageKey(projectId), JSON.stringify(memory));
  } catch (error) {
    console.error('Failed to write local project IDE memory', error);
  }
}

function newerMemory(first: ProjectIdeMemory | undefined, second: ProjectIdeMemory | undefined) {
  if (!first) {
    return second ?? {};
  }

  if (!second) {
    return first;
  }

  const firstUpdated = first.updatedAt ? Date.parse(first.updatedAt) : 0;
  const secondUpdated = second.updatedAt ? Date.parse(second.updatedAt) : 0;

  return secondUpdated > firstUpdated ? second : first;
}

export function clearProjectIdeMemoryCacheForTest(projectId?: string) {
  if (projectId) {
    memoryCache.delete(projectId);
    pendingSaves.delete(projectId);
    pendingDirty.delete(projectId);
    crossTabListeners.delete(projectId);

    return;
  }

  memoryCache.clear();
  pendingSaves.clear();
  pendingDirty.clear();
  crossTabListeners.clear();
}

export function subscribeProjectIdeMemory(projectId: string, listener: (memory: ProjectIdeMemory) => void) {
  installStorageListenerOnce();

  let listeners = crossTabListeners.get(projectId);

  if (!listeners) {
    listeners = new Set();
    crossTabListeners.set(projectId, listeners);
  }

  listeners.add(listener);

  return () => {
    listeners?.delete(listener);

    if (listeners && listeners.size === 0) {
      crossTabListeners.delete(projectId);
    }
  };
}

function notifyCrossTabListeners(projectId: string, memory: ProjectIdeMemory) {
  const listeners = crossTabListeners.get(projectId);

  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    try {
      listener(memory);
    } catch (error) {
      console.error('projectIdeMemory listener failed', error);
    }
  }
}

function installStorageListenerOnce() {
  if (storageListenerInstalled || typeof globalThis === 'undefined' || typeof globalThis.window === 'undefined') {
    return;
  }

  storageListenerInstalled = true;
  globalThis.window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.startsWith(`${PROJECT_IDE_MEMORY_STORAGE_PREFIX}:`) || !event.newValue) {
      return;
    }

    const projectId = event.key.slice(PROJECT_IDE_MEMORY_STORAGE_PREFIX.length + 1);

    try {
      const parsed = JSON.parse(event.newValue) as ProjectIdeMemory;

      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const previous = memoryCache.get(projectId);
      const next = newerMemory(previous, parsed);

      if (next === previous) {
        return;
      }

      memoryCache.set(projectId, next);
      notifyCrossTabListeners(projectId, next);
    } catch (error) {
      console.error('projectIdeMemory cross-tab parse failed', error);
    }
  });
}

export async function getProjectIdeMemory(projectId: string): Promise<ProjectIdeMemory> {
  const cached = memoryCache.get(projectId);

  if (cached) {
    return cached;
  }

  const localMemory = readLocalProjectIdeMemory(projectId);

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-state`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to load project IDE memory (${response.status})`);
    }

    const payload = (await response.json()) as IdeStateEnvelope;
    const serverMemory = payload.ideState?.state ?? {};
    const memory = newerMemory(serverMemory, localMemory);

    memoryCache.set(projectId, memory);
    writeLocalProjectIdeMemory(projectId, memory);

    return memory;
  } catch (error) {
    if (localMemory) {
      memoryCache.set(projectId, localMemory);

      return localMemory;
    }

    throw error;
  }
}

export async function saveProjectIdeMemory(projectId: string, patch: ProjectIdeMemory): Promise<void> {
  const existing = memoryCache.get(projectId) ?? {};
  const next = mergeProjectIdeMemory(existing, patch);
  const dirty = memoryForServerSave(next, patch);
  memoryCache.set(projectId, next);
  writeLocalProjectIdeMemory(projectId, next);
  pendingDirty.set(projectId, dirty);

  const previous = pendingSaves.get(projectId) ?? Promise.resolve();
  const save = previous.catch(() => undefined).then(() => persistWithRetry(projectId));

  pendingSaves.set(projectId, save);

  return save;
}

async function persistWithRetry(projectId: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
    const dirty = pendingDirty.get(projectId) ?? memoryCache.get(projectId);

    if (!dirty) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-state`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ state: dirty }),
      });

      if (!response.ok) {
        const error = new Error(`Failed to save project IDE memory (${response.status})`);
        (error as { status?: number }).status = response.status;

        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          throw error;
        }

        lastError = error;
      } else {
        if (pendingDirty.get(projectId) === dirty) {
          pendingDirty.delete(projectId);
        }

        return;
      }
    } catch (error) {
      lastError = error;
    }

    const delay = SAVE_RETRY_DELAYS_MS[attempt];

    if (delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to save project IDE memory');
}
