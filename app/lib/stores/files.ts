import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { getEncoding } from 'istextorbinary';
import { map, type MapStore } from 'nanostores';
import { Buffer } from 'node:buffer';
import { path } from '~/utils/path';
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const logger = createScopedLogger('FilesStore');

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export class FilesStore {
  #webcontainer: Promise<WebContainer>;

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
   * Map of files that matches the state of WebContainer.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.files ?? map({});

  get filesCount() {
    return this.#size;
  }

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

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

    if (import.meta.hot) {
      // Persist our state across hot reloads
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
      import.meta.hot.data.deletedPaths = this.#deletedPaths;
    }

    this.#init();
  }

  getFile(filePath: string) {
    const dirent = this.files.get()[filePath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent;
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
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = path.relative(webcontainer.workdir, filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, write '${relativePath}'`);
      }

      const oldContent = this.getFile(filePath)?.content;

      if (!oldContent && oldContent !== '') {
        unreachable('Expected content to be defined');
      }

      await webcontainer.fs.writeFile(relativePath, content);

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }

      // we immediately update the file and don't rely on the `change` event coming from the watcher
      this.files.setKey(filePath, { type: 'file', content, isBinary: false });

      logger.info('File updated');
    } catch (error) {
      logger.error('Failed to update file content\n\n', error);

      throw error;
    }
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    // Clean up any files that were previously deleted
    this.#cleanupDeletedFiles();

    webcontainer.internal.watchPaths(
      { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
      bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
    );
  }

  /**
   * Removes any deleted files/folders from the store
   */
  #cleanupDeletedFiles() {
    if (this.#deletedPaths.size === 0) {
      return;
    }

    const currentFiles = this.files.get();

    // Process each deleted path
    for (const deletedPath of this.#deletedPaths) {
      // Remove the path itself
      if (currentFiles[deletedPath]) {
        this.files.setKey(deletedPath, undefined);

        // Adjust file count if it was a file
        if (currentFiles[deletedPath]?.type === 'file') {
          this.#size--;
        }
      }

      // Also remove any files/folders inside deleted folders
      for (const [path, dirent] of Object.entries(currentFiles)) {
        if (path.startsWith(deletedPath + '/')) {
          this.files.setKey(path, undefined);

          // Adjust file count if it was a file
          if (dirent?.type === 'file') {
            this.#size--;
          }

          // Remove from modified files tracking if present
          if (dirent?.type === 'file' && this.#modifiedFiles.has(path)) {
            this.#modifiedFiles.delete(path);
          }
        }
      }
    }
  }

  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    for (const { type, path: eventPath, buffer } of watchEvents) {
      // remove any trailing slashes
      const sanitizedPath = eventPath.replace(/\/+$/g, '');

      // Skip processing if this file/folder was explicitly deleted
      if (this.#deletedPaths.has(sanitizedPath)) {
        continue;
      }

      // Also skip if this is a file/folder inside a deleted folder
      let isInDeletedFolder = false;

      for (const deletedPath of this.#deletedPaths) {
        if (sanitizedPath.startsWith(deletedPath + '/')) {
          isInDeletedFolder = true;
          break;
        }
      }

      if (isInDeletedFolder) {
        continue;
      }

      switch (type) {
        case 'add_dir': {
          // we intentionally add a trailing slash so we can distinguish files from folders in the file tree
          this.files.setKey(sanitizedPath, { type: 'folder' });
          break;
        }
        case 'remove_dir': {
          this.files.setKey(sanitizedPath, undefined);

          for (const [direntPath] of Object.entries(this.files)) {
            if (direntPath.startsWith(sanitizedPath)) {
              this.files.setKey(direntPath, undefined);
            }
          }

          break;
        }
        case 'add_file':
        case 'change': {
          if (type === 'add_file') {
            this.#size++;
          }

          let content = '';
          const isBinary = isBinaryFile(buffer);

          if (isBinary && buffer) {
            // For binary files, we need to preserve the content as base64
            content = Buffer.from(buffer).toString('base64');
          } else if (!isBinary) {
            content = this.#decodeFileContent(buffer);

            /*
             * If the content is a single space and this is from our empty file workaround,
             * convert it back to an actual empty string
             */
            if (content === ' ' && type === 'add_file') {
              content = '';
            }
          }

          // Check if we already have this file with content
          const existingFile = this.files.get()[sanitizedPath];

          if (existingFile?.type === 'file' && existingFile.isBinary && existingFile.content && !content) {
            // Keep existing binary content if new content is empty
            content = existingFile.content;
          }

          this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });
          break;
        }
        case 'remove_file': {
          this.#size--;
          this.files.setKey(sanitizedPath, undefined);
          break;
        }
        case 'update_directory': {
          // we don't care about these events
          break;
        }
      }
    }
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
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = path.relative(webcontainer.workdir, filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, create '${relativePath}'`);
      }

      // Create parent directories if they don't exist
      const dirPath = path.dirname(relativePath);

      if (dirPath !== '.') {
        await webcontainer.fs.mkdir(dirPath, { recursive: true });
      }

      // Detect binary content
      const isBinary = content instanceof Uint8Array;

      if (isBinary) {
        await webcontainer.fs.writeFile(relativePath, Buffer.from(content));

        // Store Base64 encoded data instead of an empty string
        const base64Content = Buffer.from(content).toString('base64');
        this.files.setKey(filePath, { type: 'file', content: base64Content, isBinary: true });

        // Store the base64 content as the original content for tracking modifications
        this.#modifiedFiles.set(filePath, base64Content);
      } else {
        // Ensure we write at least a space character for empty files to ensure they're tracked
        const contentToWrite = (content as string).length === 0 ? ' ' : content;
        await webcontainer.fs.writeFile(relativePath, contentToWrite);

        // But store the actual empty string in our file map if that's what was requested
        this.files.setKey(filePath, { type: 'file', content: content as string, isBinary: false });

        // Store the text content as the original content
        this.#modifiedFiles.set(filePath, content as string);
      }

      logger.info(`File created: ${filePath}`);

      return true;
    } catch (error) {
      logger.error('Failed to create file\n\n', error);
      throw error;
    }
  }

  async createFolder(folderPath: string) {
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = path.relative(webcontainer.workdir, folderPath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid folder path, create '${relativePath}'`);
      }

      await webcontainer.fs.mkdir(relativePath, { recursive: true });

      // Immediately update the folder in our store without waiting for the watcher
      this.files.setKey(folderPath, { type: 'folder' });

      logger.info(`Folder created: ${folderPath}`);

      return true;
    } catch (error) {
      logger.error('Failed to create folder\n\n', error);
      throw error;
    }
  }

  async deleteFile(filePath: string) {
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = path.relative(webcontainer.workdir, filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, delete '${relativePath}'`);
      }

      await webcontainer.fs.rm(relativePath);

      // Add to deleted paths set
      this.#deletedPaths.add(filePath);

      // Immediately update our store without waiting for the watcher
      this.files.setKey(filePath, undefined);
      this.#size--;

      // Remove from modified files tracking if present
      if (this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.delete(filePath);
      }

      // Persist the deleted paths to localStorage for extra durability
      this.#persistDeletedPaths();

      logger.info(`File deleted: ${filePath}`);

      return true;
    } catch (error) {
      logger.error('Failed to delete file\n\n', error);
      throw error;
    }
  }

  async deleteFolder(folderPath: string) {
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = path.relative(webcontainer.workdir, folderPath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid folder path, delete '${relativePath}'`);
      }

      await webcontainer.fs.rm(relativePath, { recursive: true });

      // Add to deleted paths set
      this.#deletedPaths.add(folderPath);

      // Immediately update our store without waiting for the watcher
      this.files.setKey(folderPath, undefined);

      // Also remove all files and subfolders from our store
      const allFiles = this.files.get();

      for (const [path, dirent] of Object.entries(allFiles)) {
        if (path.startsWith(folderPath + '/')) {
          this.files.setKey(path, undefined);

          // Also add these paths to the deleted paths set
          this.#deletedPaths.add(path);

          // Decrement file count for each file (not folder) removed
          if (dirent?.type === 'file') {
            this.#size--;
          }

          // Remove from modified files tracking if present
          if (dirent?.type === 'file' && this.#modifiedFiles.has(path)) {
            this.#modifiedFiles.delete(path);
          }
        }
      }

      // Persist the deleted paths to localStorage for extra durability
      this.#persistDeletedPaths();

      logger.info(`Folder deleted: ${folderPath}`);

      return true;
    } catch (error) {
      logger.error('Failed to delete folder\n\n', error);
      throw error;
    }
  }

  // Add a method to persist deleted paths to localStorage
  #persistDeletedPaths() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bolt-deleted-paths', JSON.stringify([...this.#deletedPaths]));
      }
    } catch (error) {
      logger.error('Failed to persist deleted paths to localStorage', error);
    }
  }
}

function isBinaryFile(buffer: Uint8Array | undefined) {
  if (buffer === undefined) {
    return false;
  }

  return getEncoding(convertToBuffer(buffer), { chunkLength: 100 }) === 'binary';
}

/**
 * Converts a `Uint8Array` into a Node.js `Buffer` by copying the prototype.
 * The goal is to  avoid expensive copies. It does create a new typed array
 * but that's generally cheap as long as it uses the same underlying
 * array buffer.
 */
function convertToBuffer(view: Uint8Array): Buffer {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}
