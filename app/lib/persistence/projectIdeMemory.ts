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
  | 'debugger'
  | 'deployments'
  | 'security'
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

      /*
       * Sprint 6 — branching. Optional so existing flat conversations
       * stay valid. `parentId` points to another entry in the same
       * `conversations[]` list; `branchedFromMessageId` is the message
       * inside the parent's `messages[]` where the fork happened.
       */
      parentId?: string;
      branchedFromMessageId?: string;
      archivedFromMessageId?: string;
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
    editorMinimapEnabled?: boolean;
    lockedItems?: Array<{ path: string; type: 'file' | 'folder' }>;
    deletedPaths?: string[];

    /*
     * Sprint 3/4 polish — most-recently-used lists that the composer
     * palettes boost in their fuzzy ranking. Capped to RECENT_LIMIT to
     * keep the JSON payload reasonable; deduped MRU-first.
     */
    recentMentionedFilePaths?: string[];
    recentSlashCommandIds?: string[];
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

/*
 * Phase 0 #4 — last-known server `version` per project. The server returns
 * it via the `etag` response header on GET/PUT (and as `ideState.version`
 * in the body). We send it back as `If-Match` on the next PUT so a second
 * tab with a stale version is rejected with 412 instead of silently
 * clobbering the other tab's writes.
 */
const versionByProject = new Map<string, number>();

/**
 * Coalesce rapid-fire saves (one per chat-stream tick, drag-resize, scroll, …)
 * into a single network PUT. The cache + localStorage writes stay synchronous
 * so reads always see the latest state, but the `/api/projects/:id/ide-state`
 * PUT — and the `project.ide_state.save` audit event it emits — only fires
 * once per debounce window.
 */
interface DebouncedSaveEntry {
  timer: ReturnType<typeof setTimeout>;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

const pendingDebouncedSaves = new Map<string, DebouncedSaveEntry>();

/*
 * Phase 0 #4 — Debounce IDE-state network saves to 1.5 s so chat-stream
 * ticks, drag-resize, scroll and cursor moves don't each fire their own
 * PUT. flushProjectIdeMemorySaves() is wired below to fire on
 * visibilitychange === 'hidden' and beforeunload so we don't lose state
 * on a tab close or navigation that happens inside the debounce window.
 */
const DEFAULT_SAVE_DEBOUNCE_MS = 1_500;

let saveDebounceMs = DEFAULT_SAVE_DEBOUNCE_MS;

let storageListenerInstalled = false;
export const PROJECT_IDE_MEMORY_STORAGE_PREFIX = 'vibecore.projectIdeMemory';

const SAVE_RETRY_DELAYS_MS = [1_000, 4_000, 12_000];
const PROJECT_IDE_MEMORY_AUTH_STATUSES = new Set([401, 403]);

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
    versionByProject.delete(projectId);

    const debounced = pendingDebouncedSaves.get(projectId);

    if (debounced) {
      clearTimeout(debounced.timer);
      pendingDebouncedSaves.delete(projectId);
    }

    return;
  }

  memoryCache.clear();
  pendingSaves.clear();
  pendingDirty.clear();
  crossTabListeners.clear();
  versionByProject.clear();

  for (const entry of pendingDebouncedSaves.values()) {
    clearTimeout(entry.timer);
  }

  pendingDebouncedSaves.clear();
  saveDebounceMs = DEFAULT_SAVE_DEBOUNCE_MS;
}

/**
 * Override the network-save debounce window. Intended for tests so they can
 * collapse the debounce to zero (or assert on its value); production callers
 * should not use this.
 */
export function setProjectIdeMemorySaveDebounceMsForTest(ms: number) {
  saveDebounceMs = ms;
}

/**
 * Tests-only read of the last known server version (the ETag we'll send as
 * `If-Match` on the next PUT).
 */
export function getProjectIdeMemoryVersionForTest(projectId: string): number | undefined {
  return versionByProject.get(projectId);
}

function parseEtagHeader(header: string | null | undefined): number | undefined {
  if (!header) {
    return undefined;
  }

  const stripped = header.replace(/^W\//, '').replace(/"/g, '').trim();
  const parsed = Number.parseInt(stripped, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/*
 * The real `fetch` Response always has a `Headers` instance, but the unit
 * tests stub `fetch` with plain objects that omit `headers`. We tolerate
 * that here instead of forcing every existing mock to grow a headers shim.
 */
function readResponseHeader(response: Response, name: string): string | null {
  const headers = (response as { headers?: { get?: (name: string) => string | null } }).headers;

  if (!headers || typeof headers.get !== 'function') {
    return null;
  }

  return headers.get(name) ?? null;
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

let lifecycleListenersInstalled = false;

function installLifecycleFlushListenersOnce() {
  if (lifecycleListenersInstalled || typeof globalThis === 'undefined' || typeof globalThis.window === 'undefined') {
    return;
  }

  lifecycleListenersInstalled = true;

  /*
   * Phase 0 #4 — fire any pending debounced save when the tab goes
   * background or is being unloaded so we never drop state because the
   * 1.5 s debounce window outlived the page. visibilitychange covers the
   * "tab inactive / pwa minimised" case; pagehide covers iOS Safari
   * cleanly; beforeunload covers desktop browser close + nav.
   */
  const flushAll = () => {
    void flushProjectIdeMemorySaves();
  };

  const onVisibilityChange = () => {
    if (globalThis.document?.visibilityState === 'hidden') {
      flushAll();
    }
  };

  globalThis.window.addEventListener('visibilitychange', onVisibilityChange);
  globalThis.window.addEventListener('pagehide', flushAll);
  globalThis.window.addEventListener('beforeunload', flushAll);
}

function installStorageListenerOnce() {
  if (storageListenerInstalled || typeof globalThis === 'undefined' || typeof globalThis.window === 'undefined') {
    return;
  }

  storageListenerInstalled = true;
  installLifecycleFlushListenersOnce();
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

    if (PROJECT_IDE_MEMORY_AUTH_STATUSES.has(response.status)) {
      const memory = localMemory ?? {};
      memoryCache.set(projectId, memory);
      versionByProject.delete(projectId);

      return memory;
    }

    if (!response.ok) {
      throw new Error(`Failed to load project IDE memory (${response.status})`);
    }

    const payload = (await response.json()) as IdeStateEnvelope;
    const serverMemory = payload.ideState?.state ?? {};
    const memory = newerMemory(serverMemory, localMemory);

    const version = parseEtagHeader(readResponseHeader(response, 'etag')) ?? payload.ideState?.version;

    if (typeof version === 'number' && Number.isFinite(version)) {
      versionByProject.set(projectId, version);
    }

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

/**
 * Sprint 3/4 — composer palette MRU. We keep the lists short so they
 * stay snappy in the fuzzy boost and don't bloat the persisted JSON.
 */
export const PALETTE_RECENT_LIMIT = 20;

function pushMruEntry(list: string[] | undefined, entry: string): string[] {
  const cleaned = (list ?? []).filter((existing) => existing !== entry);
  cleaned.unshift(entry);

  return cleaned.slice(0, PALETTE_RECENT_LIMIT);
}

/**
 * Record a file the user selected in the @-mentions palette so the
 * next palette open prioritises it.
 */
export function recordMentionedFile(projectId: string, filePath: string): Promise<void> {
  const cached = memoryCache.get(projectId);
  const next = pushMruEntry(cached?.ui?.recentMentionedFilePaths, filePath);

  return saveProjectIdeMemory(projectId, { ui: { recentMentionedFilePaths: next } });
}

/**
 * Record a slash command id the user executed so the next palette
 * open prioritises it.
 */
export function recordSlashCommand(projectId: string, commandId: string): Promise<void> {
  const cached = memoryCache.get(projectId);
  const next = pushMruEntry(cached?.ui?.recentSlashCommandIds, commandId);

  return saveProjectIdeMemory(projectId, { ui: { recentSlashCommandIds: next } });
}

export function saveProjectIdeMemory(projectId: string, patch: ProjectIdeMemory): Promise<void> {
  installLifecycleFlushListenersOnce();

  const existing = memoryCache.get(projectId) ?? {};
  const next = mergeProjectIdeMemory(existing, patch);
  const dirty = memoryForServerSave(next, patch);
  memoryCache.set(projectId, next);
  writeLocalProjectIdeMemory(projectId, next);
  pendingDirty.set(projectId, dirty);

  /*
   * If the debounce window is 0 (tests / shutdown override), preserve the
   * original synchronous behaviour: chain the PUT immediately so callers
   * `await`-ing the save still observe the network result.
   */
  if (saveDebounceMs <= 0) {
    const previous = pendingSaves.get(projectId) ?? Promise.resolve();
    const save = previous.catch(() => undefined).then(() => persistWithRetry(projectId));
    pendingSaves.set(projectId, save);

    return save;
  }

  const existingEntry = pendingDebouncedSaves.get(projectId);

  if (existingEntry) {
    clearTimeout(existingEntry.timer);
    existingEntry.timer = setTimeout(() => runDebouncedSave(projectId), saveDebounceMs);

    return existingEntry.promise;
  }

  let resolveFn!: () => void;
  let rejectFn!: (error: unknown) => void;

  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const entry: DebouncedSaveEntry = {
    timer: setTimeout(() => runDebouncedSave(projectId), saveDebounceMs),
    promise,
    resolve: resolveFn,
    reject: rejectFn,
  };
  pendingDebouncedSaves.set(projectId, entry);

  return promise;
}

function runDebouncedSave(projectId: string) {
  const entry = pendingDebouncedSaves.get(projectId);

  if (!entry) {
    return;
  }

  pendingDebouncedSaves.delete(projectId);

  const previous = pendingSaves.get(projectId) ?? Promise.resolve();
  const save = previous.catch(() => undefined).then(() => persistWithRetry(projectId));
  pendingSaves.set(projectId, save);

  save.then(
    () => entry.resolve(),
    (error) => entry.reject(error),
  );
}

/**
 * Fire pending debounced saves immediately. Returns a promise that resolves
 * once every flushed PUT has settled. Use this from beforeunload handlers and
 * tests where the 5 s debounce window would otherwise discard data.
 */
export async function flushProjectIdeMemorySaves(projectId?: string): Promise<void> {
  const ids = projectId ? [projectId] : Array.from(pendingDebouncedSaves.keys());

  const promises: Promise<void>[] = [];

  for (const id of ids) {
    const entry = pendingDebouncedSaves.get(id);

    if (!entry) {
      continue;
    }

    clearTimeout(entry.timer);
    promises.push(entry.promise);
    runDebouncedSave(id);
  }

  await Promise.allSettled(promises);
}

async function persistWithRetry(projectId: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
    const dirty = pendingDirty.get(projectId) ?? memoryCache.get(projectId);

    if (!dirty) {
      return;
    }

    /*
     * Phase 0 #4 — send the last-known server version as `If-Match`.
     * A concurrent writer that bumped the version on the server will
     * trigger a 412; we handle that below by adopting the server's
     * current state and looping with the fresh version so our local
     * patch still lands instead of being silently dropped.
     */
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };

    const knownVersion = versionByProject.get(projectId);

    if (typeof knownVersion === 'number') {
      headers['if-match'] = `"${knownVersion}"`;
    }

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-state`, {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: JSON.stringify({ state: dirty }),
      });

      if (response.status === 412) {
        /*
         * Another tab/session moved the version forward. Adopt the
         * server's current state from the response body, capture the
         * new version, and immediately retry with `If-Match: <new>`.
         * The server's own merge logic combines our dirty patch with
         * the freshly-fetched state, so no edits are lost.
         */
        let serverEnvelope: IdeStateEnvelope = {};

        try {
          serverEnvelope = (await response.json()) as IdeStateEnvelope;
        } catch {
          serverEnvelope = {};
        }

        const serverVersion = parseEtagHeader(readResponseHeader(response, 'etag')) ?? serverEnvelope.ideState?.version;

        if (typeof serverVersion === 'number' && Number.isFinite(serverVersion)) {
          versionByProject.set(projectId, serverVersion);
        } else {
          versionByProject.delete(projectId);
        }

        const serverMemory = serverEnvelope.ideState?.state;

        if (serverMemory && typeof serverMemory === 'object') {
          /*
           * Re-merge: take the server's current state as the base and
           * layer our pending local patch back on top. This preserves
           * the user's in-flight edits instead of letting the server
           * silently overwrite them, while still keeping anything the
           * conflicting session added (so a second tab's terminal-open
           * toggle isn't lost when we save a panel resize, for example).
           */
          const merged = mergeProjectIdeMemory(serverMemory, dirty);
          memoryCache.set(projectId, merged);
          pendingDirty.set(projectId, merged);
          writeLocalProjectIdeMemory(projectId, merged);
          notifyCrossTabListeners(projectId, merged);
        }

        const conflictError = new Error('IDE state was modified by another session');
        (conflictError as { status?: number }).status = 412;
        lastError = conflictError;

        continue;
      }

      if (!response.ok) {
        const error = new Error(`Failed to save project IDE memory (${response.status})`);
        (error as { status?: number }).status = response.status;

        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          throw error;
        }

        lastError = error;
      } else {
        const newVersion = parseEtagHeader(readResponseHeader(response, 'etag'));

        if (typeof newVersion === 'number') {
          versionByProject.set(projectId, newVersion);
        } else {
          try {
            const payload = (await response.clone().json()) as IdeStateEnvelope;
            const payloadVersion = payload.ideState?.version;

            if (typeof payloadVersion === 'number' && Number.isFinite(payloadVersion)) {
              versionByProject.set(projectId, payloadVersion);
            }
          } catch {
            // ignore — version stays as-is; next GET will reseed it.
          }
        }

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
