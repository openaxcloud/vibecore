import { Buffer } from 'node:buffer';
import type { FileChange, FileNode, RuntimeAdapter } from '@vibecore/runtime-contract';
import { map, type MapStore } from 'nanostores';
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
  #modifiedFiles: Map<string, string> = import.meta.hot?.data.modifiedFiles ?? new Map();

  /**
   * Keeps track of deleted files and folders to prevent them from reappearing on reload
   */
  #deletedPaths: Set<string> = import.meta.hot?.data.deletedPaths ?? new Set();

  /**
   * Map of files that matches the state of the active runtime.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.files ?? map({});
  #urlObserver?: MutationObserver;
  #lockRefreshInterval?: ReturnType<typeof setInterval>;
  #lockRefreshTimeout?: ReturnType<typeof setTimeout>;
  #stopWatchingFiles?: () => void;

  get filesCount() {
    return this.#size;
  }

  constructor(runtime: RuntimeAdapter) {
    this.#runtime = runtime;

    // Load deleted paths from localStorage if available
    try {
      if (typeof localStorage !== 'undefined') {
        const deletedPathsJson = localStorage.getItem('bolt-deleted-paths');

        if (deletedPathsJson) {
          const deletedPaths = JSON.parse(deletedPathsJson);

          if (Array.isArray(deletedPaths)) {
            deletedPaths.forEach((path) => this.#deletedPaths.add(path));
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load deleted paths from localStorage', error);
    }

    // Load locked files from localStorage
    this.#loadLockedFiles();

    if (import.meta.hot) {
      // Persist our state across hot reloads
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
      import.meta.hot.data.deletedPaths = this.#deletedPaths;
    }

    // Listen for URL changes to detect chat ID changes
    if (typeof window !== 'undefined') {
      let lastChatId = getCurrentChatId();

      // Use MutationObserver to detect URL changes (for SPA navigation)
      this.#urlObserver = new MutationObserver(() => {
        const currentChatId = getCurrentChatId();

        if (currentChatId !== lastChatId) {
          logger.info(`Chat ID changed from ${lastChatId} to ${currentChatId}, reloading locks`);
          lastChatId = currentChatId;
          this.#loadLockedFiles(currentChatId);
        }
      });

      this.#urlObserver.observe(document, { subtree: true, childList: true });
    }

    this.#init();
  }

  setRuntime(runtime: RuntimeAdapter) {
    this.#runtime = runtime;
    this.#stopWatchingFiles?.();
    this.#stopWatchingFiles = undefined;

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

    void this.#init();
  }

  async reloadFromRuntime(rootPath = '.') {
    const nodes = await this.#runtime.listFiles(rootPath);
    const nextFiles: FileMap = {};

    let fileCount = 0;

    const visit = (node: FileNode) => {
      const workbenchPath = this.#toWorkbenchPath(node.path).replace(/\/+$/g, '');

      if (node.type === 'directory') {
        nextFiles[workbenchPath] = { type: 'folder' };
        node.children?.forEach(visit);

        return;
      }

      nextFiles[workbenchPath] = {
        type: 'file',
        content: node.content ?? '',
        isBinary: node.encoding === 'base64' || node.encoding === 'binary',
      };
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

      if (lockedItems.length === 0) {
        logger.debug(`No locked items found for chat ID: ${currentChatId}`);
        return;
      }

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

  async saveFile(filePath: string, content: string) {
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

      this.files.setKey(filePath, {
        type: 'file',
        content,
        isBinary: false,
        isLocked: currentFile?.type === 'file' ? currentFile.isLocked : false,
      });

      if (this.#runtime.mode === 'remote-kubernetes') {
        const remoteContent = await this.#runtime.readFile(relativePath).catch(() => oldContent);

        if (remoteContent !== oldContent) {
          throw new Error(`Remote file changed since it was loaded: ${filePath}`);
        }
      }

      await this.#runtime.writeFile(relativePath, content);

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
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

    // Set up file watcher
    try {
      this.#stopWatchingFiles?.();
      this.#stopWatchingFiles = await this.#runtime.watchFiles([WORK_DIR], (change) => this.#processFileChange(change));
    } catch (error) {
      logger.warn('Runtime file watch is not ready yet', error);
    }

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

  dispose() {
    this.#urlObserver?.disconnect();
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

    if (change.type === 'delete') {
      const existing = this.files.get()[sanitizedPath];
      this.files.setKey(sanitizedPath, undefined);

      if (existing?.type === 'file') {
        this.#size--;
      }

      return;
    }

    if (change.type === 'create' && change.content === undefined) {
      this.files.setKey(sanitizedPath, { type: 'folder' });
      return;
    }

    const content = change.content ?? '';
    const isBinary = change.binary ?? false;
    const existing = this.files.get()[sanitizedPath];

    if (!existing && change.type === 'create') {
      this.#size++;
    }

    this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });
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

        this.files.setKey(filePath, {
          type: 'file',
          content: content as string,
          isBinary: false,
          isLocked: false,
        });

        this.#modifiedFiles.set(filePath, content as string);
      }

      this.#deletedPaths.delete(filePath);
      this.#persistDeletedPaths();

      logger.info(`File created: ${filePath}`);

      return true;
    } catch (error) {
      logger.error('Failed to create file\n\n', error);
      throw error;
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
      this.#deletedPaths.delete(folderPath);
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

      this.#deletedPaths.add(filePath);

      this.files.setKey(filePath, undefined);
      this.#size--;

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
  #persistDeletedPaths() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bolt-deleted-paths', JSON.stringify([...this.#deletedPaths]));
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
    if (filePath.startsWith(WORK_DIR)) {
      return filePath;
    }

    if (filePath.startsWith(this.#runtime.workdir)) {
      return filePath.replace(this.#runtime.workdir, WORK_DIR);
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
