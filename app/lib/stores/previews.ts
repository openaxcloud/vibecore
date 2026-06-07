import type { RuntimeAdapter, WorkspacePort } from '@vibecore/runtime-contract';
import { atom } from 'nanostores';

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
  #disposed = false;
  #storageSyncTimer?: ReturnType<typeof setTimeout>;

  /*
   * Client-only keys that have nothing to do with preview state. Writes to these
   * must NOT trigger a cross-tab storage broadcast — otherwise every diagnostic
   * log entry (eventLogs) or read-marker write would rebroadcast the entire
   * localStorage and force-reload the preview iframe in every other tab.
   */
  #nonSyncedStorageKeys = new Set(['eventLogs', 'bolt_read_logs']);

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
         * Skip noise keys, and coalesce bursts of writes into a single broadcast
         * so a flurry of unrelated localStorage activity can't storm every tab's
         * preview iframe with reloads.
         */
        if (!this.#nonSyncedStorageKeys.has(String(args[0]))) {
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
        try {
          const originalSetItem = Object.getPrototypeOf(localStorage).setItem;
          originalSetItem.call(localStorage, key, value);
        } catch (error) {
          console.error('[Preview] Error syncing storage:', error);
        }
      });

      // Force a refresh after syncing storage
      const previews = this.previews.get();
      previews.forEach((preview) => {
        const previewId = this.getPreviewId(preview.baseUrl);

        if (previewId) {
          this.refreshPreview(previewId);
        }
      });

      // Reload the page content
      if (typeof window !== 'undefined' && window.location) {
        const iframe = document.querySelector('iframe');

        if (iframe) {
          iframe.src = iframe.src;
        }
      }
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
      this._broadcastStorageSync();
    }, 250);
  }

  // Broadcast storage state to other tabs
  private _broadcastStorageSync() {
    if (typeof window !== 'undefined') {
      const storage: Record<string, string> = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key && !this.#nonSyncedStorageKeys.has(key)) {
          storage[key] = localStorage.getItem(key) || '';
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
    try {
      this.#stopWatchingPorts?.();
      this.#stopWatchingPorts = await this.#runtime.watchPorts((port) => this.#applyPortEvent(port));
    } catch (error) {
      console.warn('[Preview] Runtime port watch is not ready yet:', error);
      this.#scheduleReconnect();
    }
  }

  setRuntime(runtime: RuntimeAdapter) {
    this.#runtime = runtime;
    this.#stopWatchingPorts?.();
    this.#stopWatchingPorts = undefined;
    this.#availablePreviews.clear();
    this.previews.set([]);
    void this.#init();
  }

  #scheduleReconnect() {
    if (this.#disposed || this.#reconnectTimer || typeof window === 'undefined') {
      return;
    }

    this.#reconnectTimer = window.setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#init();
    }, 2000);
  }

  async refreshPorts() {
    const ports = await this.#runtime.listPorts();
    ports.forEach((port) => this.#applyPortEvent(port));
  }

  #applyPortEvent({ port, type, url, ready }: WorkspacePort) {
    let previewInfo = this.#availablePreviews.get(port);

    if (type === 'close' && previewInfo) {
      this.#availablePreviews.delete(port);
      this.previews.set(this.previews.get().filter((preview) => preview.port !== port));

      return;
    }

    if (!url) {
      return;
    }

    console.log('[Preview] Runtime port event:', port, url);
    this.broadcastUpdate(url);
    this._broadcastStorageSync();

    const previews = this.previews.get();

    if (!previewInfo) {
      previewInfo = { port, ready: ready ?? type === 'open', baseUrl: url };
      this.#availablePreviews.set(port, previewInfo);
      previews.push(previewInfo);
    }

    previewInfo.ready = ready ?? type === 'open';
    previewInfo.baseUrl = url;

    this.previews.set([...previews]);
  }

  // Helper to extract preview ID from URL
  getPreviewId(url: string): string | null {
    const match = url.match(/^https?:\/\/([^.]+)\.local-credentialless\.webcontainer-api\.io/);
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

          preview.ready = true;
          this.previews.set([...previews]);
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
