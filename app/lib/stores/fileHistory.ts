import { atom, type WritableAtom } from 'nanostores';
import {
  getVersionsForFile,
  putVersion,
  trimVersionsForFile,
  type FileVersion,
  type FileVersionSource,
} from '~/lib/persistence/fileHistoryDb';
import { createScopedLogger } from '~/utils/logger';

export type { FileVersion, FileVersionSource } from '~/lib/persistence/fileHistoryDb';

const logger = createScopedLogger('FileHistoryStore');

export type FileHistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CaptureOptions {
  restoredFromSeq?: number;
  requirePersistence?: boolean;
}

/**
 * Per-file, append-only version history — independent of Git. Every real write
 * to a file (human save, agent write, restore) appends a new version; nothing is
 * ever mutated or removed except the oldest-beyond-cap trim. Versions persist in
 * a dedicated IndexedDB database ({@link openFileHistoryDb}) keyed by
 * project + path, so history survives reloads and project switches.
 *
 * The store also drives one "active file" the History panel binds to
 * ({@link activeFilePath}/{@link versions}/{@link status}) with explicit
 * loading/error state for retryable UI.
 */
export class FileHistoryStore {
  #projectId: string | undefined;

  /** In-memory cache per `${projectId} ${filePath}` so re-opening is instant. */
  #cache = new Map<string, FileVersion[]>();

  /**
   * IndexedDB assigns no application-level sequence number for us. Serialise
   * captures per project/file so rapid editor changes cannot reuse a sequence
   * or reorder a newer recovery buffer behind an older one.
   */
  #captureQueues = new Map<string, Promise<void>>();

  activeFilePath: WritableAtom<string | undefined> = atom(undefined);
  versions: WritableAtom<FileVersion[]> = atom<FileVersion[]>([]);
  status: WritableAtom<FileHistoryStatus> = atom<FileHistoryStatus>('idle');
  error: WritableAtom<string | undefined> = atom(undefined);

  get projectId(): string | undefined {
    return this.#projectId;
  }

  /** Bind the store to a project. Switching projects clears cached state. */
  configure(projectId: string | undefined): void {
    if (this.#projectId === projectId) {
      return;
    }

    this.#projectId = projectId;
    this.#cache.clear();
    this.versions.set([]);
    this.activeFilePath.set(undefined);
    this.status.set('idle');
    this.error.set(undefined);
  }

  #keyOf(filePath: string, projectId = this.#projectId): string {
    return `${projectId} ${filePath}`;
  }

  async #readVersions(filePath: string, projectId = this.#projectId): Promise<FileVersion[]> {
    const key = this.#keyOf(filePath, projectId);
    const cached = this.#cache.get(key);

    if (cached) {
      return cached;
    }

    const loaded = projectId ? await getVersionsForFile(projectId, filePath) : [];
    this.#cache.set(key, loaded);

    return loaded;
  }

  /**
   * Append a version if `content` differs from the newest one (identical saves
   * are deduped). Returns the created version, or undefined when deduped / no
   * project is configured.
   */
  async capture(
    filePath: string,
    content: string,
    source: FileVersionSource,
    options: CaptureOptions = {},
  ): Promise<FileVersion | undefined> {
    const projectId = this.#projectId;

    if (!projectId) {
      return undefined;
    }

    const key = this.#keyOf(filePath, projectId);
    const previous = this.#captureQueues.get(key) ?? Promise.resolve();

    const operation = previous
      .catch(() => undefined)
      .then(() => this.#captureForProject(projectId, filePath, content, source, options));
    const tail = operation.then(
      () => undefined,
      () => undefined,
    );
    this.#captureQueues.set(key, tail);

    try {
      return await operation;
    } finally {
      if (this.#captureQueues.get(key) === tail) {
        this.#captureQueues.delete(key);
      }
    }
  }

  async #captureForProject(
    projectId: string,
    filePath: string,
    content: string,
    source: FileVersionSource,
    options: CaptureOptions,
  ): Promise<FileVersion | undefined> {
    const key = this.#keyOf(filePath, projectId);

    const versions = await this.#readVersions(filePath, projectId);
    const last = versions[versions.length - 1];

    if (last && last.content === content) {
      if (options.requirePersistence) {
        const persisted = await putVersion(last);

        if (!persisted) {
          throw new Error('FILE_HISTORY_PERSISTENCE_UNAVAILABLE');
        }
      }

      return undefined;
    }

    const seq = (last?.seq ?? 0) + 1;

    const version: FileVersion = {
      id: `${projectId}:${filePath}:${seq}`,
      projectId,
      filePath,
      content,
      createdAt: Date.now(),
      seq,
      source,
      ...(options.restoredFromSeq !== undefined ? { restoredFromSeq: options.restoredFromSeq } : {}),
    };

    const next = [...versions, version];
    this.#cache.set(key, next);

    try {
      const persisted = await putVersion(version);

      if (options.requirePersistence && !persisted) {
        throw new Error('FILE_HISTORY_PERSISTENCE_UNAVAILABLE');
      }

      void trimVersionsForFile(projectId, filePath);
    } catch (persistError) {
      if (options.requirePersistence) {
        /*
         * A destructive conflict resolution may proceed only after the local
         * buffer is durable. Roll the optimistic cache append back and reject;
         * the Workbench will leave the editor and conflict notice untouched.
         */
        this.#cache.set(key, versions);
        throw persistError;
      }

      // Non-destructive captures remain useful in-memory; log for diagnosis.
      logger.warn('failed to persist version', persistError);
    }

    if (this.#projectId === projectId && this.activeFilePath.get() === filePath) {
      this.versions.set(next);
      this.status.set('ready');
    }

    return version;
  }

  /**
   * Capture a recovery revision and reject unless IndexedDB committed it. Use
   * before replacing an editor buffer; ordinary history captures remain
   * best-effort so an unavailable browser database never blocks normal saves.
   */
  async captureDurably(
    filePath: string,
    content: string,
    source: Extract<FileVersionSource, 'conflict' | 'recovery'>,
  ): Promise<FileVersion | undefined> {
    return this.capture(filePath, content, source, { requirePersistence: true });
  }

  /**
   * Make the History panel show `filePath`. Loads persisted versions and, when a
   * baseline `currentContent` is supplied, seeds/records it so the panel always
   * has at least the current on-disk state to compare against.
   */
  async open(filePath: string, currentContent?: string): Promise<void> {
    const projectId = this.#projectId;
    this.activeFilePath.set(filePath);
    this.status.set('loading');
    this.error.set(undefined);

    if (!projectId) {
      this.status.set('error');
      this.error.set('No project is open.');

      return;
    }

    try {
      let versions = await this.#readVersions(filePath, projectId);

      if (this.#projectId !== projectId) {
        return;
      }

      if (currentContent !== undefined) {
        const last = versions[versions.length - 1];

        if (!last) {
          await this.capture(filePath, currentContent, 'initial');
          versions = await this.#readVersions(filePath, projectId);
        } else if (last.content !== currentContent) {
          // Disk changed outside a tracked write (e.g. git) — keep history honest.
          await this.capture(filePath, currentContent, 'external');
          versions = await this.#readVersions(filePath, projectId);
        }
      }

      if (this.activeFilePath.get() === filePath) {
        this.versions.set(versions);
        this.status.set('ready');
      }
    } catch (loadError) {
      logger.error('failed to load history', loadError);

      if (this.activeFilePath.get() === filePath) {
        this.status.set('error');
        this.error.set('Could not load file history.');
      }
    }
  }

  /** Re-run {@link open} for the active file — used by the error-state retry. */
  async retry(currentContent?: string): Promise<void> {
    const filePath = this.activeFilePath.get();

    if (filePath) {
      this.#cache.delete(this.#keyOf(filePath));
      await this.open(filePath, currentContent);
    }
  }

  getVersions(filePath: string): FileVersion[] {
    return this.#cache.get(this.#keyOf(filePath)) ?? [];
  }
}

export const fileHistoryStore = new FileHistoryStore();
