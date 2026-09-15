import { Buffer } from 'node:buffer';
import type { FileChange, FileNode, RuntimeAdapter } from '@vibecore/runtime-contract';
import { map, type MapStore } from 'nanostores';
import { resolveContentlessCreate } from './files.watch-create';
import { reconcileRemoteWrite } from './reconcile-remote-write';
import {
  addLockedFile,
  removeLockedFile,
  addLockedFolder,
  removeLockedFolder,
  getLockedItemsForChat,
  getLockedFilesForChat,
  getLockedFoldersForChat,
  isPathInLockedFolder,
  migrateLegacyLocks,
  clearCache,
} from '~/lib/persistence/lockedFiles';
import { WORK_DIR } from '~/utils/constants';
import { computeFileModifications } from '~/utils/diff';
import { getCurrentChatId } from '~/utils/fileLocks';
import { createScopedLogger } from '~/utils/logger';
import { path } from '~/utils/path';
import { unreachable } from '~/utils/unreachable';

const logger = createScopedLogger('FilesStore');

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

export interface SaveFileOptions {
  /*
   * How to handle a remote-kubernetes optimistic-concurrency conflict (the file
   * changed on disk since it was loaded). 'throw' (default) surfaces the
   * conflict — correct for human saves. 'reconcile' merges JSON / adopts the
   * fresh version for other files, so parallel agent-patch lanes don't fail.
   * 'overwrite' deliberately clobbers the remote version — only ever set from
   * an explicit user choice in the conflict dialog.
   */
  onRemoteConflict?: 'throw' | 'reconcile' | 'overwrite';
}

/*
 * Thrown when a human save loses the optimistic-concurrency race: the file on
 * disk changed after the editor loaded it (a parallel agent lane, a terminal
 * command, or the reseed/reconcile that realigns the pod with project storage).
 *
 * It carries all three versions so the UI can offer a real choice — reload the
 * remote version, overwrite it, or diff them — instead of a dead-end toast.
 * Previously this was a bare Error, so every caller could only string-match the
 * message and had nothing to show the user; the edit stayed dirty in the buffer
 * with no way to resolve it and was lost on close/reload (BUG-IDE-004).
 */
export class RemoteFileConflictError extends Error {
  readonly filePath: string;

  /** What is on disk now — what "Reload" would adopt. */
  readonly remoteContent: string;

  /** The unsaved editor buffer — what "Overwrite" would write. Never discarded. */
  readonly localContent: string;

  /** What the editor originally loaded, so a 3-way diff is possible. */
  readonly baselineContent: string;

  constructor(input: { filePath: string; remoteContent: string; localContent: string; baselineContent: string }) {
    // Message kept byte-identical: existing callers/specs match on this text.
    super(`Remote file changed since it was loaded: ${input.filePath}`);
    this.name = 'RemoteFileConflictError';
    this.filePath = input.filePath;
    this.remoteContent = input.remoteContent;
    this.localContent = input.localContent;
    this.baselineContent = input.baselineContent;
  }
}

export function isRemoteFileConflictError(error: unknown): error is RemoteFileConflictError {
  return error instanceof RemoteFileConflictError;
}

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
  isLocked?: boolean;
  lockedByFolder?: string; // Path of the folder that locked this file
}

export interface Folder {
  type: 'folder';
  isLocked?: boolean;
  lockedByFolder?: string; // Path of the folder that locked this folder (for nested folders)
}

export interface ProjectStorageFile {
  path: string;
  content: string;
  isBinary: boolean;
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export class FilesStore {
  #runtime: RuntimeAdapter;

  /**
   * Tracks the number of files without folders.
   */
  #size = 0;

  /**
   * @note Keeps track all modified files with their original content since the last user message.
   * Needs to be reset when the user sends another message and all changes have to be submitted
   * for the model to be aware of the changes.
   */
  #modifiedFiles: Map<string, string> = import.meta.hot?.data?.modifiedFiles ?? new Map();

  /**
   * Keeps track of deleted files and folders to prevent them from reappearing on reload
   */
  #deletedPaths: Set<string> = import.meta.hot?.data?.deletedPaths ?? new Set();

  /**
   * Per-path write queue. Serializes concurrent saveFile() calls on the same
   * file so a second writer reads its `oldContent` baseline only after the first
   * has committed — otherwise two concurrent saves both pass the optimistic
   * remote-content check and last-write-wins silently drops one writer's content.
   */
  #saveQueues: Map<string, Promise<unknown>> = new Map();

  /**
   * Map of files that matches the state of the active runtime.
   */
  files: MapStore<FileMap> = import.meta.hot?.data?.files ?? map({});
  #urlPollInterval?: ReturnType<typeof setInterval>;
  #lockRefreshInterval?: ReturnType<typeof setInterval>;
  #lockRefreshTimeout?: ReturnType<typeof setTimeout>;
  #stopWatchingFiles?: () => void;
  #fileWatchRetryTimer?: ReturnType<typeof setTimeout>;
  #fileWatchRetryAttempts = 0;
  #disposed = false;

  get filesCount() {
    return this.#size;
  }

  constructor(runtime: RuntimeAdapter) {
    this.#runtime = runtime;

    // Load deleted paths from localStorage if available
    this.#loadDeletedPaths();

    // Load locked files from localStorage
    this.#loadLockedFiles();

    if (import.meta.hot?.data) {
      // Persist our state across hot reloads
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
      import.meta.hot.data.deletedPaths = this.#deletedPaths;
    }

    /*
     * Detect chat-ID changes from SPA navigation to reload locks. This used to
     * be a document-wide MutationObserver({subtree, childList}), which fired its
     * callback on EVERY DOM mutation in the app — every CodeMirror keystroke and
     * every streamed chat token — turning a simple URL check into a per-frame CPU
     * storm. Lock reloading is not latency-critical, so poll the URL at a low,
     * fixed cadence instead (also catches popstate/pushState uniformly).
     */
    if (typeof window !== 'undefined') {
      let lastChatId = getCurrentChatId();

      this.#urlPollInterval = setInterval(() => {
        const currentChatId = getCurrentChatId();

        if (currentChatId !== lastChatId) {
          logger.info(`Chat ID changed from ${lastChatId} to ${currentChatId}, reloading locks`);
          lastChatId = currentChatId;
          this.#loadLockedFiles(currentChatId);

          /*
           * Deleted-paths are chat-scoped too; swap to the new chat's set so the
           * previous chat's deletions don't bleed into this one, then apply them
           * (without #cleanupDeletedFiles the newly-loaded chat's deletions
           * wouldn't take effect on the current file map until the next reload).
           */
          this.#deletedPaths = new Set();
          this.#loadDeletedPaths();
          this.#cleanupDeletedFiles();
        }
      }, 1000);
    }

    this.#init();
  }

  setRuntime(runtime: RuntimeAdapter) {
    this.#runtime = runtime;
    this.#stopWatchingFiles?.();
    this.#stopWatchingFiles = undefined;

    /*
     * Cancel a retry queued against the previous runtime so it can't re-attach a watch
     * to the old adapter after we've rebound; #init() below restarts the watch loop.
     */
    if (this.#fileWatchRetryTimer) {
      clearTimeout(this.#fileWatchRetryTimer);
      this.#fileWatchRetryTimer = undefined;
    }

    /*
     * Reset the file map when rebinding to a different runtime (project switch /
     * reconnect). #init only re-establishes the watcher; it does not clear the
     * map, so without this the previous project's files (and their contents)
     * stay rendered against the new runtime until an async reload happens to
     * overwrite them — a cross-tenant content-exposure window, plus a stale
     * dirty/size state. The caller (ProjectWorkspaceProvider) hydrates the new
     * project's files immediately after via loadProjectStorageFiles().
     */
    this.files.set({});
    this.#size = 0;
    this.#modifiedFiles.clear();

    /*
     * Reload deleted-paths for the new runtime/project scope. Without this the
     * PREVIOUS project's deleted paths persist and #cleanupDeletedFiles would
     * hide legitimately-present files in the newly-bound project.
     */
    this.#deletedPaths = new Set();
    this.#loadDeletedPaths();

    void this.#init().catch((error) => {
      logger.error('Failed to initialize FilesStore', error);
    });
  }

  async reloadFromRuntime(rootPath = '.') {
    const nodes = await this.#runtime.listFiles(rootPath);
    const nextFiles: FileMap = {};

    /*
     * Honor user deletions: a path the user deleted (or anything under a deleted
     * folder) must not be resurrected just because the runtime tree still lists
     * it (e.g. a reload that races the delete propagating). Mirrors
     * replaceWithProjectStorageFiles, which already skips #deletedPaths.
     */
    const deletedPrefixes = [...this.#deletedPaths].map((path) => `${path}/`);

    /*
     * In remote-kubernetes mode listFiles() returns the tree WITHOUT content (the
     * API's /files route + the agent's /files/tree strip content; content is read
     * lazily per file via readFile). So node.content is undefined here. Capture the
     * current map so we can PRESERVE content already hydrated from project storage
     * (ProjectWorkspaceProvider loads it before this reload) instead of hard-
     * replacing every file with an empty string — which blanked the editor for
     * every file in production.
     */
    const currentFiles = this.files.get();

    let fileCount = 0;

    const visit = (node: FileNode) => {
      const workbenchPath = this.#toWorkbenchPath(node.path).replace(/\/+$/g, '');

      if (this.#deletedPaths.has(workbenchPath) || deletedPrefixes.some((prefix) => workbenchPath.startsWith(prefix))) {
        return;
      }

      if (node.type === 'directory') {
        nextFiles[workbenchPath] = { type: 'folder' };
        node.children?.forEach(visit);

        return;
      }

      const existing = currentFiles[workbenchPath];

      if (node.content === undefined && existing?.type === 'file' && existing.content) {
        // Tree-only reload (remote): keep the already-hydrated content/flags.
        nextFiles[workbenchPath] = existing;
      } else {
        nextFiles[workbenchPath] = {
          type: 'file',
          content: node.content ?? '',
          isBinary: node.encoding === 'base64' || node.encoding === 'binary',
        };
      }

      fileCount++;
    };

    nodes.forEach(visit);
    this.#size = fileCount;
    this.files.set(nextFiles);
    this.#loadLockedFiles();
  }

  replaceWithProjectStorageFiles(files: ProjectStorageFile[]) {
    const nextFiles: FileMap = {};

    let fileCount = 0;

    for (const file of files) {
      const normalizedPath = this.#normalizeProjectStoragePath(file.path);

      if (!normalizedPath) {
        continue;
      }

      const workbenchPath = this.#toWorkbenchPath(normalizedPath).replace(/\/+$/g, '');

      if (!workbenchPath || this.#deletedPaths.has(workbenchPath)) {
        continue;
      }

      nextFiles[workbenchPath] = {
        type: 'file',
        content: file.content,
        isBinary: file.isBinary,
      };
      fileCount++;
    }

    this.#size = fileCount;
    this.files.set(nextFiles);
    this.#cleanupDeletedFiles();
    this.#loadLockedFiles();
  }

  getDeletedPaths() {
    return [...this.#deletedPaths];
  }

  setDeletedPaths(paths: string[]) {
    this.#deletedPaths = new Set(paths.filter((path) => typeof path === 'string' && path.trim()));
    this.#cleanupDeletedFiles();
    this.#persistDeletedPaths();
  }

  /**
   * Load locked files and folders from localStorage and update the file objects
   * @param chatId Optional chat ID to load locks for (defaults to current chat)
   */
  #loadLockedFiles(chatId?: string) {
    try {
      const currentChatId = chatId || getCurrentChatId();
      const startTime = performance.now();

      // Migrate any legacy locks to the current chat
      migrateLegacyLocks(currentChatId);

      // Get all locked items for this chat (uses optimized cache)
      const lockedItems = getLockedItemsForChat(currentChatId);

      // Split into files and folders
      const lockedFiles = lockedItems.filter((item) => !item.isFolder);
      const lockedFolders = lockedItems.filter((item) => item.isFolder);

      logger.info(
        `Found ${lockedFiles.length} locked files and ${lockedFolders.length} locked folders for chat ID: ${currentChatId}`,
      );

      const currentFiles = this.files.get();
      const updates: FileMap = {};

      // Process file locks
      for (const lockedFile of lockedFiles) {
        const file = currentFiles[lockedFile.path];

        if (file?.type === 'file') {
          updates[lockedFile.path] = {
            ...file,
            isLocked: true,
          };
        }
      }

      // Process folder locks
      for (const lockedFolder of lockedFolders) {
        const folder = currentFiles[lockedFolder.path];

        if (folder?.type === 'folder') {
          updates[lockedFolder.path] = {
            ...folder,
            isLocked: true,
          };

          // Also mark all files within the folder as locked
          this.#applyLockToFolderContents(currentFiles, updates, lockedFolder.path);
        }
      }

      /*
       * Reconcile, don't just add: clear isLocked on any dirent that is
       * currently flagged locked but is NOT in the freshly-loaded locked set
       * (the `updates` map now holds every path that should be locked). Without
       * this an unlock performed in another tab / by another collaborator —
       * surfaced here via the 30s refresh + cross-tab `storage` clearCache —
       * left a stale lock in the map, so the AI was told a file was locked when
       * it no longer is. This also covers the all-unlocked case (lockedItems
       * empty → every previously-locked dirent gets cleared).
       */
      for (const path in currentFiles) {
        const dirent = currentFiles[path];

        if ((dirent?.type === 'file' || dirent?.type === 'folder') && dirent.isLocked && !(path in updates)) {
          updates[path] = {
            ...dirent,
            isLocked: false,
            lockedByFolder: undefined,
          };
        }
      }

      if (Object.keys(updates).length > 0) {
        this.files.set({ ...currentFiles, ...updates });
      }

      const endTime = performance.now();
      logger.info(`Loaded locked items in ${Math.round(endTime - startTime)}ms`);
    } catch (error) {
      logger.error('Failed to load locked files from localStorage', error);
    }
  }

  /**
   * Apply a lock to all files within a folder
   * @param currentFiles Current file map
   * @param updates Updates to apply
   * @param folderPath Path of the folder to lock
   */
  #applyLockToFolderContents(currentFiles: FileMap, updates: FileMap, folderPath: string) {
    const folderPrefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;

    // Find all files that are within this folder
    Object.entries(currentFiles).forEach(([path, file]) => {
      if (path.startsWith(folderPrefix) && file) {
        if (file.type === 'file') {
          updates[path] = {
            ...file,
            isLocked: true,

            // Add a property to indicate this is locked by a parent folder
            lockedByFolder: folderPath,
          };
        } else if (file.type === 'folder') {
          updates[path] = {
            ...file,
            isLocked: true,

            // Add a property to indicate this is locked by a parent folder
            lockedByFolder: folderPath,
          };
        }
      }
    });
  }

  /**
   * Lock a file
   * @param filePath Path to the file to lock
   * @param chatId Optional chat ID (defaults to current chat)
   * @returns True if the file was successfully locked
   */
  lockFile(filePath: string, chatId?: string) {
    const file = this.getFile(filePath);
    const currentChatId = chatId || getCurrentChatId();

    if (!file) {
      logger.error(`Cannot lock non-existent file: ${filePath}`);
      return false;
    }

    // Update the file in the store
    this.files.setKey(filePath, {
      ...file,
      isLocked: true,
    });

    // Persist to localStorage with chat ID
    addLockedFile(currentChatId, filePath);

    logger.info(`File locked: ${filePath} for chat: ${currentChatId}`);

    return true;
  }

  /**
   * Lock a folder and all its contents
   * @param folderPath Path to the folder to lock
   * @param chatId Optional chat ID (defaults to current chat)
   * @returns True if the folder was successfully locked
   */
  lockFolder(folderPath: string, chatId?: string) {
    const folder = this.getFileOrFolder(folderPath);
    const currentFiles = this.files.get();
    const currentChatId = chatId || getCurrentChatId();

    if (!folder || folder.type !== 'folder') {
      logger.error(`Cannot lock non-existent folder: ${folderPath}`);
      return false;
    }

    const updates: FileMap = {};

    // Update the folder in the store
    updates[folderPath] = {
      type: folder.type,
      isLocked: true,
    };

    // Apply lock to all files within the folder
    this.#applyLockToFolderContents(currentFiles, updates, folderPath);

    // Update the store with all changes
    this.files.set({ ...currentFiles, ...updates });

    // Persist to localStorage with chat ID
    addLockedFolder(currentChatId, folderPath);

    logger.info(`Folder locked: ${folderPath} for chat: ${currentChatId}`);

    return true;
  }

  /**
   * Unlock a file
   * @param filePath Path to the file to unlock
   * @param chatId Optional chat ID (defaults to current chat)
   * @returns True if the file was successfully unlocked
   */
  unlockFile(filePath: string, chatId?: string) {
    const file = this.getFile(filePath);
    const currentChatId = chatId || getCurrentChatId();

    if (!file) {
      logger.error(`Cannot unlock non-existent file: ${filePath}`);
      return false;
    }

    // Update the file in the store
    this.files.setKey(filePath, {
      ...file,
      isLocked: false,
      lockedByFolder: undefined, // Clear the parent folder lock reference if it exists
    });

    // Remove from localStorage with chat ID
    removeLockedFile(currentChatId, filePath);

    logger.info(`File unlocked: ${filePath} for chat: ${currentChatId}`);

    return true;
  }

  /**
   * Unlock a folder and all its contents
   * @param folderPath Path to the folder to unlock
   * @param chatId Optional chat ID (defaults to current chat)
   * @returns True if the folder was successfully unlocked
   */
  unlockFolder(folderPath: string, chatId?: string) {
    const folder = this.getFileOrFolder(folderPath);
    const currentFiles = this.files.get();
    const currentChatId = chatId || getCurrentChatId();

    if (!folder || folder.type !== 'folder') {
      logger.error(`Cannot unlock non-existent folder: ${folderPath}`);
      return false;
    }

    const updates: FileMap = {};

    // Update the folder in the store
    updates[folderPath] = {
      type: folder.type,
      isLocked: false,
    };

    // Find all files that are within this folder and unlock them
    const folderPrefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;

    Object.entries(currentFiles).forEach(([path, file]) => {
      if (path.startsWith(folderPrefix) && file) {
        if (file.type === 'file' && file.lockedByFolder === folderPath) {
          updates[path] = {
            ...file,
            isLocked: false,
            lockedByFolder: undefined,
          };
        } else if (file.type === 'folder' && file.lockedByFolder === folderPath) {
          updates[path] = {
            type: file.type,
            isLocked: false,
            lockedByFolder: undefined,
          };
        }
      }
    });

    // Update the store with all changes
    this.files.set({ ...currentFiles, ...updates });

    // Remove from localStorage with chat ID
    removeLockedFolder(currentChatId, folderPath);

    logger.info(`Folder unlocked: ${folderPath} for chat: ${currentChatId}`);

    return true;
  }

  /**
   * Check if a file is locked
   * @param filePath Path to the file to check
   * @param chatId Optional chat ID (defaults to current chat)
   * @returns Object with locked status, lock mode, and what caused the lock
   */
  isFileLocked(filePath: string, chatId?: string): { locked: boolean; lockedBy?: string } {
    const file = this.getFile(filePath);
    const currentChatId = chatId || getCurrentChatId();

    if (!file) {
      return { locked: false };
    }

    // First check the in-memory state
    if (file.isLocked) {
      // If the file is locked by a folder, include that information
      if (file.lockedByFolder) {
        return {
          locked: true,
          lockedBy: file.lockedByFolder as string,
        };
      }

      return {
        locked: true,
        lockedBy: filePath,
      };
    }

    // Then check localStorage for direct file locks
    const lockedFiles = getLockedFilesForChat(currentChatId);
    const lockedFile = lockedFiles.find((item) => item.path === filePath);

    if (lockedFile) {
      // Update the in-memory state to match localStorage
      this.files.setKey(filePath, {
        ...file,
        isLocked: true,
      });

      return { locked: true, lockedBy: filePath };
    }

    // Finally, check if the file is in a locked folder
    const folderLockResult = this.isFileInLockedFolder(filePath, currentChatId);

    if (folderLockResult.locked) {
      // Update the in-memory state to reflect the folder lock
      this.files.setKey(filePath, {
        ...file,
        isLocked: true,
        lockedByFolder: folderLockResult.lockedBy,
      });

      return folderLockResult;
    }

    return { locked: false };
  }

  /**
   * Check if a file is within a locked folder
   * @param filePath Path to the file to check
   * @param chatId Optional chat ID (defaults to current chat)
   * @returns Object with locked status, lock mode, and the folder that caused the lock
   */
  isFileInLockedFolder(filePath: string, chatId?: string): { locked: boolean; lockedBy?: string } {
    const currentChatId = chatId || getCurrentChatId();

    // Use the optimized function from lockedFiles.ts
    return isPathInLockedFolder(currentChatId, filePath);
  }

  /**
   * Check if a folder is locked
   * @param folderPath Path to the folder to check
   * @param chatId Optional chat ID (defaults to current chat)
   * @returns Object with locked status and lock mode
   */
  isFolderLocked(folderPath: string, chatId?: string): { isLocked: boolean; lockedBy?: string } {
    const folder = this.getFileOrFolder(folderPath);
    const currentChatId = chatId || getCurrentChatId();

    if (!folder || folder.type !== 'folder') {
      return { isLocked: false };
    }

    // First check the in-memory state
    if (folder.isLocked) {
      return {
        isLocked: true,
        lockedBy: folderPath,
      };
    }

    // Then check localStorage for this specific chat
    const lockedFolders = getLockedFoldersForChat(currentChatId);
    const lockedFolder = lockedFolders.find((item) => item.path === folderPath);

    if (lockedFolder) {
      // Update the in-memory state to match localStorage
      this.files.setKey(folderPath, {
        type: folder.type,
        isLocked: true,
      });

      return { isLocked: true, lockedBy: folderPath };
    }

    return { isLocked: false };
  }

  getFile(filePath: string) {
    const dirent = this.files.get()[filePath];

    if (!dirent) {
      return undefined;
    }

    // For backward compatibility, only return file type dirents
    if (dirent.type !== 'file') {
      return undefined;
    }

    return dirent;
  }

  /**
   * Get any file or folder from the file system
   * @param path Path to the file or folder
   * @returns The file or folder, or undefined if it doesn't exist
   */
  getFileOrFolder(path: string) {
    return this.files.get()[path];
  }

  /**
   * Adopt the version currently on disk as this file's persisted content, with
   * no write back to the runtime — the disk already holds it.
   *
   * Used by the "Reload" resolution of a save conflict: it re-baselines the
   * store so the editor stops reporting the file as dirty. Locking and binary
   * flags are preserved, exactly as the save path does, so re-baselining never
   * silently relabels a binary file or severs a folder lock.
   */
  adoptRemoteContent(filePath: string, content: string) {
    const currentFile = this.files.get()[filePath];

    if (currentFile && currentFile.type !== 'file') {
      return;
    }

    this.files.setKey(filePath, {
      type: 'file',
      content,
      isBinary: currentFile?.type === 'file' ? currentFile.isBinary : false,
      isLocked: currentFile?.type === 'file' ? currentFile.isLocked : false,
      lockedByFolder: currentFile?.type === 'file' ? currentFile.lockedByFolder : undefined,
    });

    /*
     * Drop the modification baseline too: the buffer now matches disk, so this
     * path is no longer a pending modification for the agent diff pipeline.
     */
    this.#modifiedFiles.delete(filePath);
  }

  getFileModifications() {
    return computeFileModifications(this.files.get(), this.#modifiedFiles);
  }
  getModifiedFiles() {
    let modifiedFiles: { [path: string]: File } | undefined = undefined;

    for (const [filePath, originalContent] of this.#modifiedFiles) {
      const file = this.files.get()[filePath];

      if (file?.type !== 'file') {
        continue;
      }

      if (file.content === originalContent) {
        continue;
      }

      if (!modifiedFiles) {
        modifiedFiles = {};
      }

      modifiedFiles[filePath] = file;
    }

    return modifiedFiles;
  }

  resetFileModifications() {
    this.#modifiedFiles.clear();
  }

  async saveFile(filePath: string, content: string, options?: SaveFileOptions) {
    /*
     * Chain on any in-flight write for this path so same-file saves run strictly
     * one-at-a-time (the optimistic concurrency check is otherwise racy).
     */
    const previous = this.#saveQueues.get(filePath) ?? Promise.resolve();

    const run = previous.catch(() => undefined).then(() => this.#saveFileImpl(filePath, content, options));

    this.#saveQueues.set(filePath, run);

    try {
      await run;
    } finally {
      if (this.#saveQueues.get(filePath) === run) {
        this.#saveQueues.delete(filePath);
      }
    }
  }

  async #saveFileImpl(filePath: string, content: string, options?: SaveFileOptions) {
    const currentFile = this.files.get()[filePath];
    const optimisticPreviousFile = currentFile;

    try {
      const relativePath = this.#toRuntimePath(filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, write '${relativePath}'`);
      }

      const oldContent = this.getFile(filePath)?.content;

      if (!oldContent && oldContent !== '') {
        unreachable('Expected content to be defined');
      }

      /*
       * `effectiveContent` is what actually gets written + stored. It normally
       * equals `content`, but a reconciled remote-conflict (below) replaces it
       * with the merged/adopted result. `baselineContent` is the pre-write
       * on-disk state used for the modified-files bookkeeping.
       */
      let effectiveContent = content;
      let baselineContent = oldContent;

      this.files.setKey(filePath, {
        type: 'file',
        content: effectiveContent,

        /*
         * Preserve the file's existing binary classification rather than
         * unconditionally clearing it — a save must not silently relabel a
         * binary file as text (which would later export it as mangled text).
         */
        isBinary: currentFile?.type === 'file' ? currentFile.isBinary : false,
        isLocked: currentFile?.type === 'file' ? currentFile.isLocked : false,

        /*
         * Preserve the folder-lock association too. Dropping lockedByFolder on
         * save severs the file from its parent folder's lock, so a later folder
         * unlock no longer clears this file's lock (it stays stuck locked).
         */
        lockedByFolder: currentFile?.type === 'file' ? currentFile.lockedByFolder : undefined,
      });

      if (this.#runtime.mode === 'remote-kubernetes') {
        const remoteContent = await this.#runtime
          .readFile(relativePath)
          .then((result) => result.content)
          .catch(() => oldContent);

        if (remoteContent !== oldContent) {
          /*
           * The file changed under us — a parallel multi-agent lane wrote this
           * path. A human save (default) still surfaces the conflict so nothing
           * is clobbered silently; but the agent-patch pipeline opts into
           * `reconcile`, which merges (JSON) / adopts-fresh (other) instead of
           * failing with a stack of "Remote file changed since it was loaded".
           * 'overwrite' is the user answering the conflict dialog with "keep
           * mine": fall through to the write and clobber the remote version.
           */
          if (options?.onRemoteConflict === 'throw' || options?.onRemoteConflict === undefined) {
            /*
             * Throw the typed error so the caller can open the conflict dialog
             * with all three versions in hand. The editor buffer is untouched —
             * we bail out BEFORE writeFile — so the edit survives for whichever
             * resolution the user picks.
             */
            throw new RemoteFileConflictError({
              filePath,
              remoteContent,
              localContent: content,
              baselineContent: oldContent,
            });
          }

          if (options.onRemoteConflict === 'reconcile') {
            effectiveContent = reconcileRemoteWrite(filePath, remoteContent, content);
          }

          /*
           * Re-baseline against what is actually on disk in both branches, so a
           * follow-up save of the same buffer doesn't re-trigger the guard.
           */
          baselineContent = remoteContent;

          this.files.setKey(filePath, {
            type: 'file',
            content: effectiveContent,
            isBinary: currentFile?.type === 'file' ? currentFile.isBinary : false,
            isLocked: currentFile?.type === 'file' ? currentFile.isLocked : false,
            lockedByFolder: currentFile?.type === 'file' ? currentFile.lockedByFolder : undefined,
          });
        }
      }

      await this.#runtime.writeFile(relativePath, effectiveContent);

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, baselineContent);
      }

      logger.info('File updated');
    } catch (error) {
      this.files.setKey(filePath, optimisticPreviousFile);
      logger.error('Failed to update file content\n\n', error);

      throw error;
    }
  }

  async #init() {
    // Clean up any files that were previously deleted
    this.#cleanupDeletedFiles();

    // Set up file watcher (self-retrying until the runtime is attachable)
    await this.#startFileWatch();

    // Get the current chat ID
    const currentChatId = getCurrentChatId();

    // Migrate any legacy locks to the current chat
    migrateLegacyLocks(currentChatId);

    // Load locked files immediately for the current chat
    this.#loadLockedFiles(currentChatId);

    /**
     * Also set up a timer to load locked files again after a delay.
     * This ensures that locks are applied even if files are loaded asynchronously.
     */
    if (this.#lockRefreshTimeout) {
      clearTimeout(this.#lockRefreshTimeout);
    }

    this.#lockRefreshTimeout = setTimeout(() => {
      this.#loadLockedFiles(currentChatId);
    }, 2000);

    /**
     * Set up a less frequent periodic check to ensure locks remain applied.
     * This is now less critical since we have the storage event listener.
     */
    if (this.#lockRefreshInterval) {
      clearInterval(this.#lockRefreshInterval);
    }

    this.#lockRefreshInterval = setInterval(() => {
      // Clear the cache to force a fresh read from localStorage
      clearCache();

      const latestChatId = getCurrentChatId();
      this.#loadLockedFiles(latestChatId);
    }, 30000); // Reduced from 10s to 30s
  }

  async #startFileWatch() {
    if (this.#disposed) {
      return;
    }

    /*
     * The remote file watch only exists for an interactive browser session. On the
     * SSR/web server there is no per-user remote workspace to attach to, so
     * watchFiles() always throws "Remote workspace has not been started" and the
     * retry below would loop forever — a permanent 2s timer on the long-lived
     * server process (the single dominant prod log line, thousands of entries).
     * Skip the watch entirely off the client.
     */
    if (typeof window === 'undefined') {
      return;
    }

    /*
     * The WorkbenchStore constructs this store with the ID-less module-singleton
     * runtime adapter and starts the watch BEFORE ProjectWorkspaceProvider
     * configures the project-scoped adapter. watchFiles() on that unconfigured
     * adapter throws "Remote workspace has not been started" and the retry below
     * would flood for the whole session. Skip until a real workspace is bound;
     * setRuntime() re-runs #init() once configureRuntime() wires the project adapter.
     */
    if (this.#runtime.hasWorkspaceId?.() === false) {
      this.#stopWatchingFiles?.();
      this.#stopWatchingFiles = undefined;

      return;
    }

    try {
      this.#stopWatchingFiles?.();
      this.#stopWatchingFiles = await this.#runtime.watchFiles([WORK_DIR], (change) => this.#processFileChange(change));

      // Watch attached — cancel any retry queued by an earlier failed attempt.
      if (this.#fileWatchRetryTimer) {
        clearTimeout(this.#fileWatchRetryTimer);
        this.#fileWatchRetryTimer = undefined;
      }

      this.#fileWatchRetryAttempts = 0;
    } catch (error) {
      /*
       * A remote workspace that is still completing its start/attach handshake throws
       * "Remote workspace has not been started" here. configureRuntime() wires the watch
       * up synchronously, racing startWorkspace(); when reopening a project whose pod is
       * mid-attach the watch lost that race. Previously this failed once and never
       * retried (PreviewsStore self-heals, FilesStore did not), so the file map stayed
       * empty and the editor rendered blank forever — file content exists in storage but
       * never reaches the editor. Retry until the watch attaches.
       */
      if (this.#fileWatchRetryAttempts === 0) {
        logger.warn('Runtime file watch is not ready yet, will retry', error);
      }

      this.#scheduleFileWatchRetry();
    }
  }

  #scheduleFileWatchRetry() {
    if (this.#disposed || this.#fileWatchRetryTimer) {
      return;
    }

    /*
     * Cap retries with exponential backoff so a workspace that never attaches
     * (GC'd pod, crashed runtime, never-provisioned) stops looping forever
     * instead of re-issuing a failing watch RPC every 2s for the whole session.
     */
    const MAX_FILE_WATCH_RETRIES = 30;

    if (this.#fileWatchRetryAttempts >= MAX_FILE_WATCH_RETRIES) {
      logger.warn(`Runtime file watch did not attach after ${MAX_FILE_WATCH_RETRIES} retries; giving up`);
      return;
    }

    const delay = Math.min(2000 * 2 ** Math.min(this.#fileWatchRetryAttempts, 4), 30000);
    this.#fileWatchRetryAttempts++;

    this.#fileWatchRetryTimer = setTimeout(() => {
      this.#fileWatchRetryTimer = undefined;
      void this.#startFileWatch();
    }, delay);
  }

  dispose() {
    this.#disposed = true;

    if (this.#fileWatchRetryTimer) {
      clearTimeout(this.#fileWatchRetryTimer);
      this.#fileWatchRetryTimer = undefined;
    }

    if (this.#urlPollInterval) {
      clearInterval(this.#urlPollInterval);
    }

    this.#stopWatchingFiles?.();

    if (this.#lockRefreshTimeout) {
      clearTimeout(this.#lockRefreshTimeout);
    }

    if (this.#lockRefreshInterval) {
      clearInterval(this.#lockRefreshInterval);
    }
  }

  /**
   * Removes any deleted files/folders from the store
   */
  #cleanupDeletedFiles() {
    if (this.#deletedPaths.size === 0) {
      return;
    }

    const currentFiles = this.files.get();
    const pathsToDelete = new Set<string>();

    // Precompute prefixes for efficient checking
    const deletedPrefixes = [...this.#deletedPaths].map((p) => p + '/');

    // Iterate through all current files/folders once
    for (const [path, dirent] of Object.entries(currentFiles)) {
      // Skip if dirent is already undefined (shouldn't happen often but good practice)
      if (!dirent) {
        continue;
      }

      // Check for exact match in deleted paths
      if (this.#deletedPaths.has(path)) {
        pathsToDelete.add(path);
        continue; // No need to check prefixes if it's an exact match
      }

      // Check if the path starts with any of the deleted folder prefixes
      for (const prefix of deletedPrefixes) {
        if (path.startsWith(prefix)) {
          pathsToDelete.add(path);
          break; // Found a match, no need to check other prefixes for this path
        }
      }
    }

    // Perform the deletions and updates based on the collected paths
    if (pathsToDelete.size > 0) {
      const updates: FileMap = {};

      for (const pathToDelete of pathsToDelete) {
        const dirent = currentFiles[pathToDelete];
        updates[pathToDelete] = undefined; // Mark for deletion in the map update

        if (dirent?.type === 'file') {
          this.#size--;

          if (this.#modifiedFiles.has(pathToDelete)) {
            this.#modifiedFiles.delete(pathToDelete);
          }
        }
      }

      // Apply all deletions to the store at once for potential efficiency
      this.files.set({ ...currentFiles, ...updates });
    }
  }

  #processFileChange(change: FileChange) {
    const sanitizedPath = this.#toWorkbenchPath(change.path).replace(/\/+$/g, '');

    /*
     * The remote watch emits `emit('.', 'update')` on connect as a "refresh your
     * tree" signal (services/api/src/app.ts). #toWorkbenchPath('.') resolves to
     * WORK_DIR itself, so without this guard the 'update' case below would inject a
     * phantom empty file dirent at the project root. Treat the root signal as a
     * no-op mutation (the periodic create/delete diffs carry the real changes).
     */
    if (change.path === '.' || sanitizedPath === WORK_DIR) {
      return;
    }

    if (change.type === 'delete') {
      const existing = this.files.get()[sanitizedPath];
      this.files.setKey(sanitizedPath, undefined);

      if (existing?.type === 'file') {
        this.#size--;
      }

      return;
    }

    if (change.type === 'create' && change.content === undefined) {
      /*
       * The runtime re-created this path, so it genuinely exists again — clear it
       * (and any deleted-folder ancestor) from #deletedPaths now, BEFORE the early
       * return, so a previously-deleted path the runtime recreates isn't re-wiped
       * by the next reload/#cleanupDeletedFiles.
       */
      if (this.#deletedPaths.size > 0) {
        this.#clearDeletedPathForCreate(sanitizedPath);
        this.#persistDeletedPaths();
      }

      this.#registerContentlessCreate(sanitizedPath);

      return;
    }

    if (change.type === 'rename' && change.oldPath) {
      const oldSanitizedPath = this.#toWorkbenchPath(change.oldPath).replace(/\/+$/g, '');
      const oldExisting = this.files.get()[oldSanitizedPath];

      if (oldExisting) {
        this.files.setKey(oldSanitizedPath, undefined);

        if (oldExisting.type === 'file') {
          this.#size--;

          if (this.#modifiedFiles.has(oldSanitizedPath)) {
            this.#modifiedFiles.delete(oldSanitizedPath);
          }
        }
      }
    }

    const content = change.content ?? '';
    const isBinary = change.binary ?? false;
    const existing = this.files.get()[sanitizedPath];
    const existingFile = existing?.type === 'file' ? existing : undefined;

    if (!existing && (change.type === 'create' || change.type === 'rename')) {
      this.#size++;
    }

    /*
     * Preserve the lock state across a runtime file-change event. A modify/create
     * from the watcher must not silently clear isLocked/lockedByFolder — dropping
     * them disables AI lock-protection on a file the user explicitly locked.
     */
    this.files.setKey(sanitizedPath, {
      type: 'file',
      content,
      isBinary,
      ...(existingFile?.isLocked !== undefined ? { isLocked: existingFile.isLocked } : {}),
      ...(existingFile?.lockedByFolder !== undefined ? { lockedByFolder: existingFile.lockedByFolder } : {}),
    });

    /*
     * The runtime re-created this path (build output, external write, etc.), so it
     * genuinely exists again — clear it (and any deleted-folder ancestor) from
     * #deletedPaths. Otherwise the watch resurrects it in the UI but the stale
     * deleted-paths entry hides it again on the next reload/#cleanupDeletedFiles.
     */
    if ((change.type === 'create' || change.type === 'rename') && this.#deletedPaths.size > 0) {
      this.#clearDeletedPathForCreate(sanitizedPath);
      this.#persistDeletedPaths();
    }
  }

  /*
   * Resolve a content-less 'create' (remote watch can't tell us file vs folder) by
   * lazily reading the path: a successful read => real file (register with the
   * fetched content so it's openable and counted in #size); a failed read => the
   * path is a directory (register a folder). Skips paths already tracked so it
   * never clobbers an existing file's content/lock flags.
   */
  #registerContentlessCreate(sanitizedPath: string) {
    if (this.files.get()[sanitizedPath]) {
      return;
    }

    const relativePath = this.#toRuntimePath(sanitizedPath);

    void this.#runtime
      .readFile(relativePath)
      .then((read) => resolveContentlessCreate(read))
      .catch(() => resolveContentlessCreate(undefined))
      .then((resolved) => {
        // Re-check: a delete/rename may have landed while the read was in flight.
        if (this.files.get()[sanitizedPath]) {
          return;
        }

        if (resolved.type === 'folder') {
          this.files.setKey(sanitizedPath, { type: 'folder' });

          return;
        }

        this.files.setKey(sanitizedPath, {
          type: 'file',
          content: resolved.content,
          isBinary: resolved.isBinary,
        });
        this.#size++;
      });
  }

  #decodeFileContent(buffer?: Uint8Array) {
    if (!buffer || buffer.byteLength === 0) {
      return '';
    }

    try {
      return utf8TextDecoder.decode(buffer);
    } catch (error) {
      console.log(error);
      return '';
    }
  }

  async createFile(filePath: string, content: string | Uint8Array = '') {
    try {
      const relativePath = this.#toRuntimePath(filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, create '${relativePath}'`);
      }

      /*
       * Central lock chokepoint. createFile is the shared write path for new-file,
       * drag-drop upload, duplicate, rename-target, format, and chat createEntry —
       * none of which checked locks, so a path collision with a LOCKED file (or a
       * file inside a locked folder) silently overwrote protected content and reset
       * the lock flag. Mirror the AI-write guard: refuse to overwrite an existing
       * locked file. (Brand-new / unlocked paths are unaffected; isFileLocked also
       * covers locked-folder containment.) Returns false so callers surface a
       * "failed to create/upload" result instead of destroying protected content.
       */
      if (this.files.get()[filePath]?.type === 'file' && this.isFileLocked(filePath).locked) {
        logger.warn(`Refusing to overwrite locked file via createFile: ${filePath}`);
        return false;
      }

      /*
       * #size tracks file count (folders excluded, matching the loader). Increment
       * whenever the path wasn't ALREADY a file — i.e. brand-new, or a folder entry
       * being overwritten by a file. Keying on mere existence under-counted when a
       * folder previously occupied the path.
       */
      const wasFileBefore = this.files.get()[filePath]?.type === 'file';

      const isBinary = content instanceof Uint8Array;

      if (isBinary) {
        const base64Content = Buffer.from(content).toString('base64');
        await this.#runtime.writeFile(relativePath, base64Content);
        this.files.setKey(filePath, {
          type: 'file',
          content: base64Content,
          isBinary: true,
          isLocked: false,
        });

        this.#modifiedFiles.set(filePath, base64Content);
      } else {
        const contentToWrite = (content as string).length === 0 ? ' ' : content;
        await this.#runtime.createFile(relativePath, contentToWrite);

        /*
         * Store the SAME content we actually wrote to the runtime (the
         * whitespace placeholder when an empty file was substituted), not the
         * original empty string. In remote-kubernetes mode #saveFileImpl runs an
         * optimistic-concurrency check that compares the in-memory baseline
         * against runtime.readFile(); if the map held '' while disk held ' ', the
         * first legitimate save of a freshly-created empty file would falsely
         * fail with "Remote file changed since it was loaded".
         */
        this.files.setKey(filePath, {
          type: 'file',
          content: contentToWrite,
          isBinary: false,
          isLocked: false,
        });

        this.#modifiedFiles.set(filePath, contentToWrite);
      }

      if (!wasFileBefore) {
        this.#size++;
      }

      this.#clearDeletedPathForCreate(filePath);
      this.#persistDeletedPaths();

      logger.info(`File created: ${filePath}`);

      return true;
    } catch (error) {
      logger.error('Failed to create file\n\n', error);
      throw error;
    }
  }

  /*
   * Clear a (re)created path from the deleted-paths set — including any ANCESTOR
   * folder that is still marked deleted. #cleanupDeletedFiles re-deletes anything
   * under a deleted-folder prefix on reload, so deleting only the exact path left
   * a file recreated under a previously-deleted folder to be silently wiped again.
   */
  #clearDeletedPathForCreate(path: string) {
    this.#deletedPaths.delete(path);

    for (const deleted of [...this.#deletedPaths]) {
      if (path === deleted || path.startsWith(`${deleted}/`)) {
        this.#deletedPaths.delete(deleted);
      }
    }
  }

  async createFolder(folderPath: string) {
    try {
      const relativePath = this.#toRuntimePath(folderPath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid folder path, create '${relativePath}'`);
      }

      await this.#runtime.createDirectory(relativePath);

      this.files.setKey(folderPath, { type: 'folder' });
      this.#clearDeletedPathForCreate(folderPath);
      this.#persistDeletedPaths();

      logger.info(`Folder created: ${folderPath}`);

      return true;
    } catch (error) {
      logger.error('Failed to create folder\n\n', error);
      throw error;
    }
  }

  async deleteFile(filePath: string) {
    try {
      const relativePath = this.#toRuntimePath(filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, delete '${relativePath}'`);
      }

      await this.#runtime.deleteFile(relativePath);

      /*
       * #size counts FILES only (folders are excluded). Decrement only when the
       * removed entry was actually a tracked file — decrementing for a folder (or
       * a path not present in the map) corrupts filesCount.
       */
      const removed = this.files.get()[filePath];

      this.#deletedPaths.add(filePath);

      this.files.setKey(filePath, undefined);

      if (removed?.type === 'file') {
        this.#size--;
      }

      if (this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.delete(filePath);
      }

      this.#persistDeletedPaths();

      logger.info(`File deleted: ${filePath}`);

      return true;
    } catch (error) {
      logger.error('Failed to delete file\n\n', error);
      throw error;
    }
  }

  async deleteFolder(folderPath: string) {
    try {
      const relativePath = this.#toRuntimePath(folderPath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid folder path, delete '${relativePath}'`);
      }

      await this.#runtime.deleteFile(relativePath);

      this.#deletedPaths.add(folderPath);

      this.files.setKey(folderPath, undefined);

      const allFiles = this.files.get();

      for (const [path, dirent] of Object.entries(allFiles)) {
        if (path.startsWith(folderPath + '/')) {
          this.files.setKey(path, undefined);

          this.#deletedPaths.add(path);

          if (dirent?.type === 'file') {
            this.#size--;
          }

          if (dirent?.type === 'file' && this.#modifiedFiles.has(path)) {
            this.#modifiedFiles.delete(path);
          }
        }
      }

      this.#persistDeletedPaths();

      logger.info(`Folder deleted: ${folderPath}`);

      return true;
    } catch (error) {
      logger.error('Failed to delete folder\n\n', error);
      throw error;
    }
  }

  // method to persist deleted paths to localStorage
  /*
   * Scope the deleted-paths key per project. A single global `bolt-deleted-paths`
   * key meant files deleted in one project stayed hidden in EVERY other project
   * that happened to share the same relative path (e.g. src/index.ts) — silently
   * hiding legitimate files. Derive the scope from the current chat/project URL
   * segment so each project tracks its own deletions.
   */
  #loadDeletedPaths() {
    try {
      if (typeof localStorage !== 'undefined') {
        const deletedPathsJson = localStorage.getItem(this.#deletedPathsStorageKey());

        if (deletedPathsJson) {
          const deletedPaths = JSON.parse(deletedPathsJson);

          if (Array.isArray(deletedPaths)) {
            /*
             * Filter to strings — setDeletedPaths() persists only strings, but a
             * corrupted/tampered localStorage value could carry non-strings that
             * would pollute #deletedPaths and break path comparisons downstream.
             */
            deletedPaths
              .filter((path): path is string => typeof path === 'string')
              .forEach((path) => this.#deletedPaths.add(path));
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load deleted paths from localStorage', error);
    }
  }

  #deletedPathsStorageKey() {
    /*
     * Scope by the canonical chat ID (the /chat/<id> segment), exactly like the
     * file-lock store. The previous "last path segment" heuristic collided across
     * routes: any two non-/chat pages (or a /chat/<id>/sub route) sharing a final
     * segment would read/write the same deleted-paths set, leaking deletions
     * between unrelated projects. getCurrentChatId() falls back to 'default'.
     */
    const scope = getCurrentChatId();

    return `bolt-deleted-paths:${scope}`;
  }

  #persistDeletedPaths() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.#deletedPathsStorageKey(), JSON.stringify([...this.#deletedPaths]));
      }
    } catch (error) {
      logger.error('Failed to persist deleted paths to localStorage', error);
    }
  }

  #toRuntimePath(filePath: string) {
    if (filePath.startsWith(`${this.#runtime.workdir}/`)) {
      return filePath.slice(this.#runtime.workdir.length + 1);
    }

    if (filePath.startsWith(`${WORK_DIR}/`)) {
      return filePath.slice(WORK_DIR.length + 1);
    }

    return filePath.replace(/^\/+/, '');
  }

  #toWorkbenchPath(filePath: string) {
    if (filePath === WORK_DIR || filePath.startsWith(`${WORK_DIR}/`)) {
      return filePath;
    }

    const workdir = this.#runtime.workdir;

    if (filePath === workdir || filePath.startsWith(`${workdir}/`)) {
      return WORK_DIR + filePath.slice(workdir.length);
    }

    return path.join(WORK_DIR, filePath.replace(/^\/+/, ''));
  }

  #normalizeProjectStoragePath(filePath: string) {
    const segments = filePath
      .replaceAll('\\', '/')
      .split('/')
      .filter((segment) => segment && segment !== '.');

    if (!segments.length || segments.some((segment) => segment === '..')) {
      return undefined;
    }

    const workDirSegments = WORK_DIR.split('/').filter(Boolean);

    if (
      segments.length >= workDirSegments.length &&
      workDirSegments.every((segment, index) => segments[index] === segment)
    ) {
      return `/${segments.join('/')}`;
    }

    return segments.join('/');
  }
}
