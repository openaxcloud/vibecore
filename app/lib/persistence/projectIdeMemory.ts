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
  | 'deployments'
  | 'env'
  | 'secrets'
  | 'git'
  | 'activity'
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

export type ProjectIdePaneNode =
  | {
      type: 'leaf';
      id: string;
      tabs: ProjectIdePaneTab[];
      activeTabId?: string;
    }
  | {
      type: 'split';
      id: string;
      direction: 'horizontal' | 'vertical';
      ratio: number;
      first: ProjectIdePaneNode;
      second: ProjectIdePaneNode;
    };

export interface ProjectIdeMemory {
  chat?: {
    id?: string;
    urlId?: string;
    description?: string;
    metadata?: IChatMetadata;
    messages?: Message[];
    archivedMessages?: Message[];
  };
  ui?: {
    selectedFile?: string;
    currentView?: string;
    rightPanel?: ProjectIdePanel;
    rightPanelOpen?: boolean;
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
export const PROJECT_IDE_MEMORY_STORAGE_PREFIX = 'vibecore.projectIdeMemory';

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

    return;
  }

  memoryCache.clear();
  pendingSaves.clear();
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
  const next: ProjectIdeMemory = {
    ...existing,
    ...patch,
    chat: { ...existing.chat, ...patch.chat },
    ui: { ...existing.ui, ...patch.ui },
    updatedAt: new Date().toISOString(),
  };
  memoryCache.set(projectId, next);
  writeLocalProjectIdeMemory(projectId, next);

  const previous = pendingSaves.get(projectId) ?? Promise.resolve();
  const save = previous
    .catch(() => undefined)
    .then(async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-state`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ state: memoryCache.get(projectId) ?? next }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save project IDE memory (${response.status})`);
      }
    });

  pendingSaves.set(projectId, save);

  return save;
}
