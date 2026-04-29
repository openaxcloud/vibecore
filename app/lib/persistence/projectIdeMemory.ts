import type { Message } from 'ai';
import type { IChatMetadata } from './db';

export type ProjectIdePanel = 'files' | 'search' | 'locks';
export type ProjectIdeWorkspacePanel =
  | 'editor'
  | 'preview'
  | 'overview'
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
    workspaceTabs?: ProjectIdeWorkspacePanel[];
    activeWorkspacePanel?: ProjectIdeWorkspacePanel;
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

export async function getProjectIdeMemory(projectId: string): Promise<ProjectIdeMemory> {
  const cached = memoryCache.get(projectId);

  if (cached) {
    return cached;
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-state`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load project IDE memory (${response.status})`);
  }

  const payload = (await response.json()) as IdeStateEnvelope;
  const memory = payload.ideState?.state ?? {};
  memoryCache.set(projectId, memory);

  return memory;
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
