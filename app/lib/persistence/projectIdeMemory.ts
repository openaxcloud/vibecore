import type { Message } from 'ai';
import type { IChatMetadata } from './db';
import { pruneToBudget, writeWithinBudget } from './ide-memory-budget';
import { formatPersistenceRuntimeCopy, getPersistenceRuntimeCopy } from '~/lib/i18n/catalogs/persistence-runtime';

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
export type ProjectMobilePanel = 'chat' | 'files' | 'editor' | 'search' | 'locks' | 'terminal' | 'preview' | 'deploy';

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

  /**
   * RPL-IDE-001.2: panes split horizontally AND vertically. Older persisted
   * layouts only stored `'horizontal'`; the field stays a superset so existing
   * JSON keeps loading (additive migration).
   */
  direction: 'horizontal' | 'vertical';

  /** Fraction occupied by `first`, clamped 0.1–0.9. Absent on legacy 50/50 splits. */
  ratio?: number;
  first: ProjectIdePaneNode;
  second: ProjectIdePaneNode;
};

export type ProjectIdePaneNode = ProjectIdePaneLeaf | ProjectIdePaneSplit;

/**
 * RPL-IDE-001.3: a pane that has been popped out of the docked tree into a
 * floating position within the window. `dockOrigin` lets it return to exactly
 * where it came from.
 */
export interface ProjectIdeFloatingPane {
  id: string;
  pane: ProjectIdePaneLeaf;
  bounds: { x: number; y: number; width: number; height: number };
  zIndex: number;
  dockOrigin?: unknown;
}

export interface ProjectIdeMemory {
  chat?: {
    id?: string;
    urlId?: string;
    description?: string;
    metadata?: IChatMetadata;
    messages?: Message[];
    archivedMessages?: Message[];
    clearMessages?: boolean;
    pendingPrompt?: {
      id: string;
      prompt: string;
      model?: string;
      provider?: string;
      createdAt: string;
      aiFallback?: boolean;
      aiFallbackReason?: string;
    } | null;
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

    /** RPL-IDE-001.3: floating panes of the primary (window-main) window. */
    floatingPanes?: ProjectIdeFloatingPane[];

    /**
     * RPL-IDE-001.1: per-window Project Editor layouts. Each browser tab/window
     * (keyed by its `peWindow` id) persists its own docked tree + floating panes
     * so multiple screens stay coherent and independent across reloads. The
     * legacy `paneTree`/`activePaneId`/`floatingPanes` above remain the source of
     * truth for `window-main` (back-compat); secondary windows live only here.
     */
    projectEditorWindows?: Record<
      string,
      {
        paneTree?: ProjectIdePaneNode;
        activePaneId?: string;
        floatingPanes?: ProjectIdeFloatingPane[];
        updatedAt?: string;
      }
    >;
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
 * Phase 0 #4 — last-known server `version` per scope. The server returns
 * it via the `etag` response header on GET/PUT (and as `ideState.version`
 * in the body). We send it back as `If-Match` on the next PUT so a second
 * tab with a stale version is rejected with 412 instead of silently
 * clobbering the other tab's writes.
 */
const versionByProject = new Map<string, number>();

/*
 * Workspace isolation — when a `workspaceId` is supplied the IDE state is
 * scoped to that workspace and routed through `/api/workspaces/:id/ide-state`
 * (which has the same If-Match/ETag contract as the project-level endpoint).
 * Without a workspaceId we fall back to the legacy project-scoped endpoint so
 * users on projects that haven't been migrated to workspaces still see their
 * persisted state.
 *
 * The scope key is used as the map key for every cache the file maintains
 * (memoryCache, pendingDirty, versionByProject, listeners, debounced saves)
 * and as the localStorage suffix. For the project-only case we keep the bare
 * projectId so existing localStorage entries (`vibecore.projectIdeMemory:<projectId>`)
 * stay valid.
 */
function scopeKey(projectId: string, workspaceId?: string): string {
  return workspaceId ? `workspace:${workspaceId}` : projectId;
}

function scopeEndpoint(projectId: string, workspaceId?: string): string {
  return workspaceId
    ? `/api/workspaces/${encodeURIComponent(workspaceId)}/ide-state`
    : `/api/projects/${encodeURIComponent(projectId)}/ide-state`;
}

/*
 * `persistWithRetry` and `runDebouncedSave` are invoked off the call stack
 * (debounce timers, lifecycle flush, retry loop) so they can't recompute the
 * endpoint URL from the caller's arguments. We record it here when a save is
 * enqueued and read it back later — workspace-scoped saves keep hitting the
 * workspace endpoint even when triggered by a `pagehide` event.
 */
const scopeEndpoints = new Map<string, string>();

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
export const PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS = 5_000;

const SAVE_RETRY_DELAYS_MS = [1_000, 4_000, 12_000];
const PROJECT_IDE_MEMORY_AUTH_STATUSES = new Set([401, 403]);

/*
 * Conservative cap for `fetch(..., { keepalive: true })` request bodies. The
 * Fetch spec / browsers limit the combined size of all in-flight keepalive
 * requests to ~64 KiB; over that the fetch rejects with a TypeError. We keep a
 * margin and only enable keepalive when the IDE-state body fits, so an
 * oversized state doesn't make the whole unload flush throw.
 */
const KEEPALIVE_MAX_BODY_BYTES = 60_000;

/*
 * Set once any unload-class lifecycle event fires (pagehide / beforeunload /
 * visibilitychange→hidden). While true, the flush PUT is sent with
 * `keepalive: true` so the browser does not abort the request when the document
 * is torn down — without it the just-flushed save is canceled in flight and the
 * most recent debounced IDE-state delta is lost, defeating the flush listeners.
 */
let documentUnloading = false;

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

        /*
         * Honor clearMessages for archived messages too. Without it archived is
         * union-merged forever and can never shrink, so messages removed by a
         * rewind resurface on the next reload.
         */
        archivedMessages: mergeMessages(existing.chat?.archivedMessages, patch.chat.archivedMessages, clearMessages),
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

/**
 * Build the to-PUT payload, re-attaching the chat REPLACE flag.
 *
 * `mergeProjectIdeMemory` strips `chat.clearMessages` from the cached `memory`
 * (the server only honours it on the wire), so we re-add it here when the
 * current patch carries it. Crucially we also OR-in any `clearMessages` already
 * sitting in a *pending* dirty payload for the same scope: rapid-fire saves are
 * coalesced into a single PUT inside the 1.5 s debounce window, and a later
 * ordinary chat-scope save (e.g. `{ chat: { pendingPrompt: null } }`) must not
 * silently drop the REPLACE semantics of an earlier authoritative chat replace
 * (rewind / message-delete). Without this stickiness the coalesced PUT omits
 * `clearMessages`, the server union-merges instead of replacing, and the
 * messages a rewind removed resurrect on the next reload.
 */
function memoryForServerSave(
  memory: ProjectIdeMemory,
  patch: ProjectIdeMemory,
  pendingClearMessages?: boolean,
): ProjectIdeMemory {
  const clearMessages = patch.chat?.clearMessages || pendingClearMessages;

  if (!clearMessages) {
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

export function getProjectIdeMemoryStorageKey(projectId: string, workspaceId?: string) {
  return `${PROJECT_IDE_MEMORY_STORAGE_PREFIX}:${scopeKey(projectId, workspaceId)}`;
}

/**
 * Synchronous read of the authoritative in-memory cache (the same map every
 * save/merge updates). Callers that mutate-then-save should read from here at
 * mutation time rather than closing over a lagging React state snapshot — the
 * latter causes lost updates when two mutations are dispatched before a re-render.
 */
export function getProjectIdeMemorySync(projectId: string, workspaceId?: string): ProjectIdeMemory | undefined {
  return memoryCache.get(scopeKey(projectId, workspaceId));
}

function storageKeyForScope(scope: string) {
  return `${PROJECT_IDE_MEMORY_STORAGE_PREFIX}:${scope}`;
}

function localStorageAvailable() {
  return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
}

function readLocalProjectIdeMemory(scope: string): ProjectIdeMemory | undefined {
  if (!localStorageAvailable()) {
    return undefined;
  }

  try {
    const raw = globalThis.localStorage.getItem(storageKeyForScope(scope));

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

function writeLocalProjectIdeMemory(scope: string, memory: ProjectIdeMemory) {
  if (!localStorageAvailable()) {
    return;
  }

  /*
   * Écriture SOUS BUDGET, et qui ne lève jamais.
   *
   * Un simple `try/catch` ne suffisait pas : il évitait la levée mais laissait le
   * stockage saturé, donc TOUTES les écritures suivantes échouaient en silence et
   * la mémoire IDE devenait inutile. `writeWithinBudget` fait de la place en
   * évinçant les autres projets, puis retente une fois.
   */
  try {
    const key = storageKeyForScope(scope);

    const outcome = writeWithinBudget(
      globalThis.localStorage,
      PROJECT_IDE_MEMORY_STORAGE_PREFIX,
      key,
      JSON.stringify(memory),
    );

    if (outcome !== 'written') {
      console.warn('Project IDE memory write degraded', { scope, outcome });
    }
  } catch (error) {
    /*
     * Filet de dernier recours. `writeWithinBudget` est écrit pour ne pas lever,
     * mais cette écriture est appelée depuis la boucle de génération : une
     * exception ici la casserait, et c'est précisément le défaut d'origine.
     */
    console.error('Failed to write local project IDE memory', error);
  }
}

/*
 * Purge déclenchée au CHARGEMENT DU MODULE, côté navigateur uniquement.
 *
 * Placée ici et pas dans un composant : ce module est importé par tout ce qui lit
 * la mémoire IDE, donc aucun appelant ne peut l'oublier. `localStorageAvailable()`
 * la rend inerte au rendu serveur, et le drapeau la rend idempotente — un second
 * import ne repurge pas.
 */
if (
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { localStorage?: unknown }).localStorage !== 'undefined'
) {
  queueMicrotask(() => {
    pruneProjectIdeMemoryOnBoot();
  });
}

/**
 * Purge au démarrage : sans elle, un navigateur DÉJÀ saturé reste cassé jusqu'à
 * une purge manuelle. C'est exactement ce qu'il a fallu faire à la main en
 * production, sur un stockage arrivé à 10 Mo pour 64 projets.
 *
 * Idempotente et silencieuse : sous le budget, elle ne fait rien.
 */
let purgeFaite = false;

export function pruneProjectIdeMemoryOnBoot(): string[] {
  if (purgeFaite) {
    return [];
  }

  purgeFaite = true;

  return prunerMaintenant();
}

function prunerMaintenant(): string[] {
  if (!localStorageAvailable()) {
    return [];
  }

  try {
    const evicted = pruneToBudget(globalThis.localStorage, PROJECT_IDE_MEMORY_STORAGE_PREFIX);

    if (evicted.length > 0) {
      console.warn(`Project IDE memory: evicted ${evicted.length} stale project entr(y|ies) to stay within budget`);
    }

    return evicted;
  } catch (error) {
    console.error('Project IDE memory prune skipped', error);

    return [];
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

export function clearProjectIdeMemoryCacheForTest(projectId?: string, workspaceId?: string) {
  if (projectId) {
    const id = scopeKey(projectId, workspaceId);
    memoryCache.delete(id);
    pendingSaves.delete(id);
    pendingDirty.delete(id);
    crossTabListeners.delete(id);
    versionByProject.delete(id);
    scopeEndpoints.delete(id);

    const debounced = pendingDebouncedSaves.get(id);

    if (debounced) {
      clearTimeout(debounced.timer);
      pendingDebouncedSaves.delete(id);
    }

    return;
  }

  memoryCache.clear();
  pendingSaves.clear();
  pendingDirty.clear();
  crossTabListeners.clear();
  versionByProject.clear();
  scopeEndpoints.clear();

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
 * Tests-only override of the document-unloading flag that toggles `keepalive`
 * on the save PUT. In production this is set by the pagehide / beforeunload /
 * visibilitychange→hidden listeners; exposed here so specs can exercise the
 * keepalive path without simulating a full DOM lifecycle teardown.
 */
export function setProjectIdeMemoryUnloadingForTest(value: boolean) {
  documentUnloading = value;
}

/**
 * Tests-only read of the last known server version (the ETag we'll send as
 * `If-Match` on the next PUT).
 */
export function getProjectIdeMemoryVersionForTest(projectId: string, workspaceId?: string): number | undefined {
  return versionByProject.get(scopeKey(projectId, workspaceId));
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
 * tests can provide plain response objects that omit `headers`. We tolerate
 * that here instead of forcing every existing test double to grow a headers shim.
 */
function readResponseHeader(response: Response, name: string): string | null {
  const headers = (response as { headers?: { get?: (name: string) => string | null } }).headers;

  if (!headers || typeof headers.get !== 'function') {
    return null;
  }

  return headers.get(name) ?? null;
}

async function fetchProjectIdeMemory(endpoint: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS);

  try {
    return await fetch(endpoint, {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function subscribeProjectIdeMemory(
  projectId: string,
  listener: (memory: ProjectIdeMemory) => void,
  workspaceId?: string,
) {
  installStorageListenerOnce();

  const id = scopeKey(projectId, workspaceId);

  let listeners = crossTabListeners.get(id);

  if (!listeners) {
    listeners = new Set();
    crossTabListeners.set(id, listeners);
  }

  listeners.add(listener);

  return () => {
    listeners?.delete(listener);

    if (listeners && listeners.size === 0) {
      crossTabListeners.delete(id);
    }
  };
}

function notifyCrossTabListeners(scope: string, memory: ProjectIdeMemory) {
  const listeners = crossTabListeners.get(scope);

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
    /*
     * Mark the document as unloading so persistWithRetry sends the PUT with
     * `keepalive: true` (or via sendBeacon for oversized bodies). Without this
     * the browser aborts the outstanding non-keepalive fetch during teardown
     * and the final debounced save is dropped — the exact data-loss these
     * listeners exist to prevent.
     */
    documentUnloading = true;
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

    /*
     * The slice yields the scope key — bare projectId for legacy entries,
     * `workspace:<workspaceId>` for the workspace-isolated variant. Both flow
     * through the same cache and listener registry so cross-tab updates land
     * regardless of which endpoint produced the write.
     */
    const scope = event.key.slice(PROJECT_IDE_MEMORY_STORAGE_PREFIX.length + 1);

    try {
      const parsed = JSON.parse(event.newValue) as ProjectIdeMemory;

      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const previous = memoryCache.get(scope);
      const next = newerMemory(previous, parsed);

      if (next === previous) {
        return;
      }

      memoryCache.set(scope, next);
      notifyCrossTabListeners(scope, next);
    } catch (error) {
      console.error('projectIdeMemory cross-tab parse failed', error);
    }
  });
}

export async function getProjectIdeMemory(projectId: string, workspaceId?: string): Promise<ProjectIdeMemory> {
  const id = scopeKey(projectId, workspaceId);
  const endpoint = scopeEndpoint(projectId, workspaceId);
  scopeEndpoints.set(id, endpoint);

  const cached = memoryCache.get(id);

  if (cached) {
    return cached;
  }

  const localMemory = readLocalProjectIdeMemory(id);

  try {
    const response = await fetchProjectIdeMemory(endpoint);

    if (PROJECT_IDE_MEMORY_AUTH_STATUSES.has(response.status)) {
      const memory = localMemory ?? {};
      memoryCache.set(id, memory);
      versionByProject.delete(id);

      return memory;
    }

    if (!response.ok) {
      throw Object.assign(new Error(), { code: 'PROJECT_IDE_MEMORY_LOAD_FAILED', status: response.status });
    }

    const payload = (await response.json()) as IdeStateEnvelope;
    const serverMemory = payload.ideState?.state ?? {};
    const memory = newerMemory(serverMemory, localMemory);

    const version = parseEtagHeader(readResponseHeader(response, 'etag')) ?? payload.ideState?.version;

    if (typeof version === 'number' && Number.isFinite(version)) {
      versionByProject.set(id, version);
    }

    memoryCache.set(id, memory);
    writeLocalProjectIdeMemory(id, memory);

    return memory;
  } catch (error) {
    if (localMemory) {
      memoryCache.set(id, localMemory);

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
export function recordMentionedFile(projectId: string, filePath: string, workspaceId?: string): Promise<void> {
  const cached = memoryCache.get(scopeKey(projectId, workspaceId));
  const next = pushMruEntry(cached?.ui?.recentMentionedFilePaths, filePath);

  return saveProjectIdeMemory(projectId, { ui: { recentMentionedFilePaths: next } }, workspaceId);
}

/**
 * Record a slash command id the user executed so the next palette
 * open prioritises it.
 */
export function recordSlashCommand(projectId: string, commandId: string, workspaceId?: string): Promise<void> {
  const cached = memoryCache.get(scopeKey(projectId, workspaceId));
  const next = pushMruEntry(cached?.ui?.recentSlashCommandIds, commandId);

  return saveProjectIdeMemory(projectId, { ui: { recentSlashCommandIds: next } }, workspaceId);
}

export function saveProjectIdeMemory(projectId: string, patch: ProjectIdeMemory, workspaceId?: string): Promise<void> {
  installLifecycleFlushListenersOnce();

  const id = scopeKey(projectId, workspaceId);
  scopeEndpoints.set(id, scopeEndpoint(projectId, workspaceId));

  const existing = memoryCache.get(id) ?? {};
  const next = mergeProjectIdeMemory(existing, patch);

  /*
   * Make the chat REPLACE flag sticky across the debounce window: if an earlier
   * coalesced save already queued `clearMessages` for this scope, carry it onto
   * the new dirty payload so a follow-up ordinary chat save can't downgrade the
   * pending PUT from a replace to a union-merge (data-loss on rewind/delete).
   */
  const pendingClearMessages = pendingDirty.get(id)?.chat?.clearMessages;
  const dirty = memoryForServerSave(next, patch, pendingClearMessages);
  memoryCache.set(id, next);
  writeLocalProjectIdeMemory(id, next);
  pendingDirty.set(id, dirty);

  /*
   * If the debounce window is 0 (tests / shutdown override), preserve the
   * original synchronous behaviour: chain the PUT immediately so callers
   * `await`-ing the save still observe the network result.
   */
  if (saveDebounceMs <= 0) {
    const previous = pendingSaves.get(id) ?? Promise.resolve();
    const save = previous.catch(() => undefined).then(() => persistWithRetry(id));
    pendingSaves.set(id, save);

    return save;
  }

  const existingEntry = pendingDebouncedSaves.get(id);

  if (existingEntry) {
    clearTimeout(existingEntry.timer);
    existingEntry.timer = setTimeout(() => runDebouncedSave(id), saveDebounceMs);

    return existingEntry.promise;
  }

  let resolveFn!: () => void;
  let rejectFn!: (error: unknown) => void;

  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const entry: DebouncedSaveEntry = {
    timer: setTimeout(() => runDebouncedSave(id), saveDebounceMs),
    promise,
    resolve: resolveFn,
    reject: rejectFn,
  };
  pendingDebouncedSaves.set(id, entry);

  return promise;
}

function runDebouncedSave(scope: string) {
  const entry = pendingDebouncedSaves.get(scope);

  if (!entry) {
    return;
  }

  pendingDebouncedSaves.delete(scope);

  const previous = pendingSaves.get(scope) ?? Promise.resolve();
  const save = previous.catch(() => undefined).then(() => persistWithRetry(scope));
  pendingSaves.set(scope, save);

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
export async function flushProjectIdeMemorySaves(projectId?: string, workspaceId?: string): Promise<void> {
  const ids = projectId ? [scopeKey(projectId, workspaceId)] : Array.from(pendingDebouncedSaves.keys());

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

/**
 * UTF-8 byte length of a string. Used to decide whether an unload-time PUT body
 * fits inside the keepalive size budget. Falls back to a char-count estimate
 * when TextEncoder is unavailable (it is in all browsers and Node ≥ 11).
 */
function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }

  // Conservative upper bound: assume worst-case multi-byte chars.
  return value.length * 3;
}

async function persistWithRetry(scope: string): Promise<void> {
  let lastError: unknown;

  /*
   * scopeEndpoints is populated by every save/get call before we end up here.
   * If a flush is somehow triggered for a scope we never registered we fall
   * back to the legacy project endpoint so we don't drop the write entirely.
   */
  const endpoint =
    scopeEndpoints.get(scope) ??
    (scope.startsWith('workspace:')
      ? `/api/workspaces/${encodeURIComponent(scope.slice('workspace:'.length))}/ide-state`
      : `/api/projects/${encodeURIComponent(scope)}/ide-state`);

  for (let attempt = 0; attempt <= SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
    const dirty = pendingDirty.get(scope) ?? memoryCache.get(scope);

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

    const knownVersion = versionByProject.get(scope);

    if (typeof knownVersion === 'number') {
      headers['if-match'] = `"${knownVersion}"`;
    }

    const body = JSON.stringify({ state: dirty });

    /*
     * During document unload (pagehide / beforeunload / tab hidden) a normal
     * fetch is aborted by the browser as soon as the page is torn down, which
     * would drop this final flush. `keepalive: true` lets the request outlive
     * the document so the last debounced IDE-state delta still reaches the
     * server.
     *
     * Keepalive bodies are size-capped (~64 KiB across all in-flight keepalive
     * requests); over that the fetch rejects with a TypeError. We only opt into
     * keepalive when the body fits the budget — for an oversized state we send a
     * plain fetch (same as before this fix), which may be aborted on a hard
     * close but at least still completes on the visibilitychange→hidden path
     * (tab backgrounded but document alive) and is retried/reseeded otherwise.
     * We can't fall back to sendBeacon here because the ide-state endpoints only
     * accept PUT and sendBeacon issues a POST.
     */
    const useKeepalive = documentUnloading && byteLength(body) <= KEEPALIVE_MAX_BODY_BYTES;

    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        credentials: 'include',
        headers,
        body,
        ...(useKeepalive ? { keepalive: true } : {}),
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
          versionByProject.set(scope, serverVersion);
        } else {
          versionByProject.delete(scope);
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
          memoryCache.set(scope, merged);
          writeLocalProjectIdeMemory(scope, merged);
          notifyCrossTabListeners(scope, merged);

          /*
           * `mergeProjectIdeMemory` strips `chat.clearMessages` (the server only
           * honours it on the wire). If the original `dirty` was an authoritative
           * chat replace (rewind / message-delete), re-attach the flag to the
           * re-PUT payload so the conflict retry still REPLACES the message list
           * instead of silently downgrading to a union-merge — otherwise losing a
           * version race to another tab resurrects the removed messages. The cache
           * keeps the flag-free `merged` so local reads aren't polluted.
           */
          pendingDirty.set(scope, memoryForServerSave(merged, dirty));
        }

        const conflictError = new Error(getPersistenceRuntimeCopy()['persistence.ide.concurrentChange']);
        (conflictError as { status?: number }).status = 412;
        lastError = conflictError;

        /*
         * Back off before re-PUTting the re-merged state. A `continue` here used to
         * skip the delay at the loop tail, so a sustained conflict (the agent and the
         * IDE both writing ide-state during generation) fired the whole retry budget
         * as back-to-back PUTs in a few ms — worsening the race and exhausting the
         * retries instantly. A short growing delay lets the other writer settle so the
         * next attempt lands with a fresh version.
         */
        const conflictDelay = SAVE_RETRY_DELAYS_MS[attempt] ?? SAVE_RETRY_DELAYS_MS[SAVE_RETRY_DELAYS_MS.length - 1];

        if (conflictDelay !== undefined) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(conflictDelay, 500)));
        }

        continue;
      }

      if (!response.ok) {
        const error = new Error(
          formatPersistenceRuntimeCopy(getPersistenceRuntimeCopy()['persistence.ide.saveFailed'], {
            status: String(response.status),
          }),
        );
        (error as { status?: number }).status = response.status;

        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          throw error;
        }

        lastError = error;
      } else {
        const newVersion = parseEtagHeader(readResponseHeader(response, 'etag'));

        if (typeof newVersion === 'number') {
          versionByProject.set(scope, newVersion);
        } else {
          try {
            const payload = (await response.clone().json()) as IdeStateEnvelope;
            const payloadVersion = payload.ideState?.version;

            if (typeof payloadVersion === 'number' && Number.isFinite(payloadVersion)) {
              versionByProject.set(scope, payloadVersion);
            }
          } catch {
            // ignore — version stays as-is; next GET will reseed it.
          }
        }

        if (pendingDirty.get(scope) === dirty) {
          pendingDirty.delete(scope);
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

  /*
   * Exhausted the retries on a persistent 412 conflict. The re-merged state is
   * already durably held in localStorage + `pendingDirty`, so the next debounced
   * flush (or the next reopen's reseed) will retry it against a fresh version. A
   * transient version race is NOT a save failure the user must see — throwing it
   * here surfaced as an IDE-breaking error toast / unhandled rejection. Return
   * gracefully instead; genuine non-conflict failures still throw below.
   */
  if (lastError instanceof Error && (lastError as { status?: number }).status === 412) {
    return;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(getPersistenceRuntimeCopy()['persistence.ide.saveFailedGeneric']);
}
