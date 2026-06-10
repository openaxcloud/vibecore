import { createScopedLogger } from './logger';
import {
  getLockedItems,
  isFileLocked as isFileLockedInternal,
  isFolderLocked as isFolderLockedInternal,
  isPathInLockedFolder,
} from '~/lib/persistence/lockedFiles';

const logger = createScopedLogger('FileLocks');

/**
 * Get the current chat ID from the URL
 * @returns The current chat ID or a default value if not found
 */
export function getCurrentChatId(): string {
  try {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;

      /*
       * Per-project scope for the canonical IDE route `/projects/<projectId>/ide`
       * (the production IDE) AND the legacy `/chat/<id>` route. Without the
       * /projects match every project collapsed to the shared 'default' scope, so
       * deleted-paths and file-locks leaked across ALL projects.
       */
      const projectMatch = pathname.match(/\/projects\/([^/]+)/);

      if (projectMatch && projectMatch[1]) {
        return `project:${projectMatch[1]}`;
      }

      const chatMatch = pathname.match(/\/chat\/([^/]+)/);

      if (chatMatch && chatMatch[1]) {
        return chatMatch[1];
      }
    }

    // Return a default chat ID if none is found
    return 'default';
  } catch (error) {
    logger.error('Failed to get current chat ID', error);
    return 'default';
  }
}

/**
 * Check if a file is locked directly from localStorage
 * This avoids circular dependencies between components and stores
 * @param filePath The path of the file to check
 * @param chatId Optional chat ID (will be extracted from URL if not provided)
 */
export function isFileLocked(filePath: string, chatId?: string): { locked: boolean; lockedBy?: string } {
  try {
    const currentChatId = chatId || getCurrentChatId();

    // Use the internal function from lockedFiles.ts
    const result = isFileLockedInternal(currentChatId, filePath);

    // If the file itself is not locked, check if it's in a locked folder
    if (!result.locked) {
      const folderLockResult = isPathInLockedFolder(currentChatId, filePath);

      if (folderLockResult.locked) {
        return folderLockResult;
      }
    }

    return result;
  } catch (error) {
    logger.error('Failed to check if file is locked', error);
    return { locked: false };
  }
}

/**
 * Check if a folder is locked directly from localStorage
 * This avoids circular dependencies between components and stores
 * @param folderPath The path of the folder to check
 * @param chatId Optional chat ID (will be extracted from URL if not provided)
 */
export function isFolderLocked(folderPath: string, chatId?: string): { locked: boolean; lockedBy?: string } {
  try {
    const currentChatId = chatId || getCurrentChatId();

    // Use the internal function from lockedFiles.ts
    return isFolderLockedInternal(currentChatId, folderPath);
  } catch (error) {
    logger.error('Failed to check if folder is locked', error);
    return { locked: false };
  }
}

/**
 * Check if any files are locked in the current chat
 * @param chatId Optional chat ID (will be extracted from URL if not provided)
 * @returns True if any files or folders are locked
 */
export function hasLockedItems(chatId?: string): boolean {
  try {
    const currentChatId = chatId || getCurrentChatId();
    const lockedItems = getLockedItems();

    return lockedItems.some((item) => item.chatId === currentChatId);
  } catch (error) {
    logger.error('Failed to check for locked items', error);
    return false;
  }
}
