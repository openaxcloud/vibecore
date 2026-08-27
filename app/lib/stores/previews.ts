import type { RuntimeAdapter, WorkspacePort } from '@vibecore/runtime-contract';
import { atom } from 'nanostores';

import { previewPortsToPrune } from './preview-recovery';

// Extend Window interface to include our custom property
declare global {
  interface Window {
    _tabId?: string;
  }
}

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;

  /*
   * Le port répond ET un processus vivant le détient — voir `WorkspacePort.serving`.
   * Distinct de `ready`, qui agrège en plus le statut manager et le beacon client.
   * Conservé ici pour que la décision de reattach puisse poser SA question
   * (« puis-je adopter ce pod ? ») sans hériter de vetos faits pour une autre.
   */
  serving?: boolean;
}

// Create a broadcast channel for preview updates
const PREVIEW_CHANNEL = 'preview-updates';

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #runtime: RuntimeAdapter;
  #broadcastChannel?: BroadcastChannel;
  #lastUpdate = new Map<string, number>();
  #watchedFiles = new Set<string>();
  #refreshTimeouts = new Map<string, NodeJS.Timeout>();
  #REFRESH_DELAY = 300;
  #storageChannel?: BroadcastChannel;
  #stopWatchingPorts?: () => void;
  #storageSyncInstalled = false;
  #originalSetItem?: typeof localStorage.setItem;
  #reconnectTimer?: number;
  #reconnectAttempts = 0;

  /*
   * Bumped on every setRuntime/#init start so an in-flight watchPorts that
   * resolves after a project switch can detect it is stale and tear itself down.
   */
  #initGeneration = 0;
  #disposed = false;
  #storageSyncTimer?: ReturnType<typeof setTimeout>;

  /*
   * Explicit ALLOWLIST of localStorage keys that are safe to mirror across tabs.
   * Previously this was a denylist that broadcast (and applied) the ENTIRE
   * localStorage minus two noise keys — which clobbered the receiving tab's
   * project/chat-scoped state (e.g. `netlify-site-<chatId>`, `snapshot:<id>`,
   * `bolt-deleted-paths`) with the sender's snapshot and force-reloaded unrelated
   * previews. Only these app-global, non-sensitive UI preferences are synced now;
   * everything else (scoped data, tokens, logs) is left untouched per tab.
   */
  #syncedStorageKeys = new Set([
    'vibecore:user-language',
    'ecode:sidebar-collapsed',
    'vibecore:agent-plan-first-default',
    'ecode-preferred-ai-model',
    'bolt_tab_configuration',
  ]);

  previews = atom<PreviewInfo[]>([]);

  constructor(runtime: RuntimeAdapter) {
    this.#runtime = runtime;
    this.#broadcastChannel = this.#maybeCreateChannel(PREVIEW_CHANNEL);
    this.#storageChannel = this.#maybeCreateChannel('storage-sync-channel');

    if (this.#broadcastChannel) {
      // Listen for preview updates from other tabs
      this.#broadcastChannel.onmessage = (event) => {
        const { type, previewId } = event.data;

        if (type === 'file-change') {
          const timestamp = event.data.timestamp;
          const lastUpdate = this.#lastUpdate.get(previewId) || 0;

          if (timestamp > lastUpdate) {
            this.#lastUpdate.set(previewId, timestamp);
            this.refreshPreview(previewId);
          }
        }
      };
    }

    if (this.#storageChannel) {
      // Listen for storage sync messages
      this.#storageChannel.onmessage = (event) => {
        const { storage, source } = event.data;

        if (storage && source !== this._getTabId()) {
          this._syncStorage(storage);
        }
      };
    }

    // Override localStorage setItem to catch all changes
    if (typeof window !== 'undefined' && !this.#storageSyncInstalled) {
      const originalSetItem = localStorage.setItem.bind(localStorage);
      this.#originalSetItem = originalSetItem;

      localStorage.setItem = (...args) => {
        originalSetItem(...args);

        /*
         * Only broadcast writes to allowlisted (global, non-scoped) keys, and
         * coalesce bursts into a single broadcast.
         */
        if (this.#syncedStorageKeys.has(String(args[0]))) {
          this.#scheduleStorageSync();
        }
      };
      this.#storageSyncInstalled = true;
    }

    this.#init();
  }

  #maybeCreateChannel(name: string): BroadcastChannel | undefined {
    if (typeof globalThis === 'undefined') {
      return undefined;
    }

    const globalBroadcastChannel = (
      globalThis as typeof globalThis & {
        BroadcastChannel?: typeof BroadcastChannel;
      }
    ).BroadcastChannel;

    if (typeof globalBroadcastChannel !== 'function') {
      return undefined;
    }

    try {
      return new globalBroadcastChannel(name);
    } catch (error) {
      console.warn('[Preview] BroadcastChannel unavailable:', error);
      return undefined;
    }
  }

  // Generate a unique ID for this tab
  private _getTabId(): string {
    if (typeof window !== 'undefined') {
      if (!window._tabId) {
        window._tabId = Math.random().toString(36).substring(2, 15);
      }

      return window._tabId;
    }

    return '';
  }

  // Sync storage data between tabs
  private _syncStorage(storage: Record<string, string>) {
    if (this.#disposed) {
      return;
    }

    if (typeof window !== 'undefined') {
      Object.entries(storage).forEach(([key, value]) => {
        /*
         * Defence in depth: never apply a key outside the allowlist even if a
         * stale/foreign message carries one, so scoped state is never clobbered.
         */
        if (!this.#syncedStorageKeys.has(key)) {
          return;
        }

        try {
          const originalSetItem = Object.getPrototypeOf(localStorage).setItem;
          originalSetItem.call(localStorage, key, value);
        } catch (error) {
          console.error('[Preview] Error syncing storage:', error);
        }
      });

      /*
       * Intentionally do NOT refresh/reload preview iframes here: the synced keys
       * are global UI preferences unrelated to preview content. Cross-tab preview
       * refresh is handled separately by the file-change BroadcastChannel. The old
       * blanket `iframe.src = iframe.src` reload churned every tab on any write.
       */
    }
  }

  // Debounce broadcasts so a burst of localStorage writes coalesces into one.
  #scheduleStorageSync() {
    /*
     * The patched localStorage.setItem keeps calling this after dispose(), which
     * would arm a timer that fires (and broadcasts) on an already-disposed store.
     * Mirror #scheduleReconnect's disposed guard.
     */
    if (this.#disposed) {
      return;
    }

    if (this.#storageSyncTimer) {
      clearTimeout(this.#storageSyncTimer);
    }

    this.#storageSyncTimer = setTimeout(() => {
      this.#storageSyncTimer = undefined;

      // re-check: dispose() may have run between arming and firing this timer
      if (this.#disposed) {
        return;
      }

      this._broadcastStorageSync();
    }, 250);
  }

  // Broadcast storage state to other tabs
  private _broadcastStorageSync() {
    if (typeof window !== 'undefined') {
      const storage: Record<string, string> = {};

      for (const key of this.#syncedStorageKeys) {
        const value = localStorage.getItem(key);

        if (value !== null) {
          storage[key] = value;
        }
      }

      this.#storageChannel?.postMessage({
        type: 'storage-sync',
        storage,
        source: this._getTabId(),
        timestamp: Date.now(),
      });
    }
  }

  async #init() {
    const generation = ++this.#initGeneration;

    /*
     * The WorkbenchStore constructs this store with the ID-less module-singleton
     * runtime adapter and calls #init() eagerly, BEFORE ProjectWorkspaceProvider
     * configures the project-scoped adapter. Watching that unconfigured adapter
     * throws "Remote workspace has not been started" and floods a misleading
     * reconnect loop on every page. Skip until a real workspace is bound;
     * setRuntime() re-runs #init() once configureRuntime() wires the project adapter.
     */
    if (this.#runtime.hasWorkspaceId?.() === false) {
      this.#stopWatchingPorts?.();
      this.#stopWatchingPorts = undefined;

      return;
    }

    try {
      this.#stopWatchingPorts?.();
      this.#stopWatchingPorts = undefined;

      const stop = await this.#runtime.watchPorts((port) => this.#applyPortEvent(port));

      /*
       * If a project switch (setRuntime) or another #init started while
       * watchPorts was connecting, this socket is bound to the OLD runtime -
       * tear it down instead of clobbering the current watcher (a leaked socket
       * that keeps firing port events for the abandoned workspace).
       */
      if (generation !== this.#initGeneration || this.#disposed) {
        stop();
        return;
      }

      this.#stopWatchingPorts = stop;
      this.#reconnectAttempts = 0;
    } catch (error) {
      if (generation !== this.#initGeneration || this.#disposed) {
        return;
      }

      console.warn('[Preview] Runtime port watch is not ready yet:', error);
      this.#scheduleReconnect();
    }
  }

  setRuntime(runtime: RuntimeAdapter) {
    this.#runtime = runtime;
    this.#stopWatchingPorts?.();
    this.#stopWatchingPorts = undefined;

    /*
     * Cancel a pending reconnect bound to the previous runtime so it can't fire
     * a stale #init after the switch.
     */
    if (this.#reconnectTimer) {
      window.clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }

    this.#reconnectAttempts = 0;
    this.#availablePreviews.clear();
    this.previews.set([]);
    void this.#init();
  }

  #scheduleReconnect() {
    if (this.#disposed || this.#reconnectTimer || typeof window === 'undefined') {
      return;
    }

    /*
     * Exponential backoff (cap 30s) so a persistently-down workspace pod isn't
     * hammered with a fresh connection attempt every 2s indefinitely.
     */
    const delay = Math.min(2000 * 2 ** this.#reconnectAttempts, 30_000);
    this.#reconnectAttempts += 1;
    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#init();
    }, delay);
  }

  async refreshPorts() {
    const ports = await this.#runtime.listPorts();
    ports.forEach((port) => this.#applyPortEvent(port));

    /*
     * Reconcile: the poll is AUTHORITATIVE (listPorts reads the pod's actual
     * /proc listening sockets). `#applyPortEvent` only ever prunes a port on an
     * explicit 'close' event from the watch stream — so when a dev server crashes
     * or exits and the watch missed the close (pod flap, reconnect), the dead port
     * lingered in `previews` as ready+baseUrl forever. The reopen path then read it
     * as a live server and "reattached" instead of relaunching → the preview stuck
     * on an endless reload with a blank app. Prune every preview whose port the
     * successful poll no longer reports listening. Guarded on a resolved poll only
     * (listPorts rejecting is handled by the caller's catch), so a transient agent
     * error never wipes a live preview; a resolved EMPTY set legitimately means
     * "nothing is listening" and must clear a dead port.
     */
    const livePorts = new Set(ports.map((port) => port.port));
    const previews = this.previews.get();

    for (const deadPort of previewPortsToPrune(previews, livePorts)) {
      const dead = previews.find((preview) => preview.port === deadPort);
      this.#applyPortEvent({ port: deadPort, type: 'close', url: dead?.baseUrl, ready: false });
    }
  }

  #applyPortEvent({ port, type, url, ready, serving }: WorkspacePort) {
    let previewInfo = this.#availablePreviews.get(port);

    if (type === 'close' && previewInfo) {
      this.#availablePreviews.delete(port);

      const closedPreviewId = this.getPreviewId(previewInfo.baseUrl);

      if (closedPreviewId) {
        this.#lastUpdate.delete(closedPreviewId);
      }

      this.previews.set(this.previews.get().filter((preview) => preview.port !== port));

      return;
    }

    if (!url) {
      return;
    }

    const previews = this.previews.get();
    const isNewPort = !previewInfo;
    const urlChanged = Boolean(previewInfo && previewInfo.baseUrl !== url);

    if (!previewInfo) {
      previewInfo = { port, ready: ready ?? type === 'open', serving, baseUrl: url };
      this.#availablePreviews.set(port, previewInfo);
      previews.push(previewInfo);
    }

    previewInfo.ready = ready ?? type === 'open';

    /*
     * `serving` only rides on the /ports POLL (the API's aggregate route); the
     * ports/watch stream never carries it. Overwriting with `undefined` on every
     * watch push (every 5s) erased the poll's "this port answers HTTP with a
     * live process" signal right after it arrived — which re-armed the boot
     * overlay against a serving app (BUG-UX-PREVIEW-OVERLAY-LAG). Keep the last
     * known value on events that don't state one; an explicit false still
     * applies, and a dead port leaves via its 'close' event / poll prune.
     */
    previewInfo.serving = serving ?? previewInfo.serving;
    previewInfo.baseUrl = url;

    this.previews.set([...previews]);

    /*
     * Only sync a cross-tab reload when the port genuinely APPEARED or changed URL.
     * This used to fire on EVERY idempotent port event — every ~2.5s boot-loop
     * refresh and every ports/watch push re-reports the same running port — so each
     * poll posted a 'file-change' → refreshPreview → the ready false→true flap → a
     * full iframe reload in OTHER tabs (a cross-tab echo of the same flicker). A
     * re-detection of an unchanged port must be a no-op; readiness changes never
     * warrant a reload (the same-tab ready edge has its own guard in Preview).
     */
    if (isNewPort || urlChanged) {
      console.log('[Preview] Runtime port event:', port, url);
      this.broadcastUpdate(url);
      this._broadcastStorageSync();
    }
  }

  /*
   * Helper to extract preview ID from URL. Matches both the WebContainer host
   * (`<id>.local-credentialless.webcontainer-api.io`) and the remote-kubernetes
   * prod host (`<workspaceId>-<port>.preview.e-code.ai`); hardcoding only the
   * former made cross-tab preview broadcasts a silent no-op in production.
   */
  getPreviewId(url: string): string | null {
    const match = url.match(/^https?:\/\/([^.]+)\.(?:local-credentialless\.webcontainer-api\.io|preview\.e-code\.ai)/);
    return match ? match[1] : null;
  }

  // Broadcast state change to all tabs
  broadcastStateChange(previewId: string) {
    const timestamp = Date.now();
    this.#lastUpdate.set(previewId, timestamp);

    this.#broadcastChannel?.postMessage({
      type: 'state-change',
      previewId,
      timestamp,
    });
  }

  // Broadcast file change to all tabs
  broadcastFileChange(previewId: string) {
    const timestamp = Date.now();
    this.#lastUpdate.set(previewId, timestamp);

    this.#broadcastChannel?.postMessage({
      type: 'file-change',
      previewId,
      timestamp,
    });
  }

  // Broadcast update to all tabs
  broadcastUpdate(url: string) {
    const previewId = this.getPreviewId(url);

    if (previewId) {
      const timestamp = Date.now();
      this.#lastUpdate.set(previewId, timestamp);

      this.#broadcastChannel?.postMessage({
        type: 'file-change',
        previewId,
        timestamp,
      });
    }
  }

  // Method to refresh a specific preview
  refreshPreview(previewId: string) {
    // Clear any pending refresh for this preview
    const existingTimeout = this.#refreshTimeouts.get(previewId);

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set a new timeout for this refresh
    const timeout = setTimeout(() => {
      if (this.#disposed) {
        this.#refreshTimeouts.delete(previewId);
        return;
      }

      const previews = this.previews.get();
      const preview = previews.find((p) => this.getPreviewId(p.baseUrl) === previewId);

      if (preview) {
        preview.ready = false;
        this.previews.set([...previews]);

        requestAnimationFrame(() => {
          if (this.#disposed) {
            return;
          }

          /*
           * Re-read live state at write time: the preview may have been closed or
           * replaced during the rAF delay, and re-setting the captured snapshot
           * would resurrect the closed preview. Locate it by id again.
           */
          const current = this.previews.get();
          const live = current.find((p) => this.getPreviewId(p.baseUrl) === previewId);

          if (live) {
            live.ready = true;
            this.previews.set([...current]);
          }
        });
      }

      this.#refreshTimeouts.delete(previewId);
    }, this.#REFRESH_DELAY);

    this.#refreshTimeouts.set(previewId, timeout);
  }

  refreshAllPreviews() {
    const previews = this.previews.get();

    for (const preview of previews) {
      const previewId = this.getPreviewId(preview.baseUrl);

      if (previewId) {
        this.broadcastFileChange(previewId);
      }
    }
  }

  dispose() {
    this.#disposed = true;
    this.#stopWatchingPorts?.();
    this.#stopWatchingPorts = undefined;
    this.#broadcastChannel?.close();
    this.#storageChannel?.close();

    for (const timeout of this.#refreshTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.#refreshTimeouts.clear();

    if (this.#reconnectTimer) {
      window.clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }

    if (this.#storageSyncTimer) {
      clearTimeout(this.#storageSyncTimer);
      this.#storageSyncTimer = undefined;
    }

    if (this.#storageSyncInstalled && this.#originalSetItem && typeof window !== 'undefined') {
      localStorage.setItem = this.#originalSetItem;
    }
  }
}

/*
 * NOTE: there is intentionally no standalone singleton here. The single source
 * of truth is WorkbenchStore's own #previewsStore (exposed via
 * workbenchStore.previews / refreshAllPreviews). A separate module singleton
 * double-patched localStorage.setItem and went stale on project switches.
 */
