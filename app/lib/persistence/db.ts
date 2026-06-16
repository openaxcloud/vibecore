import type { Message } from 'ai';
import type { Snapshot } from './types'; // Import Snapshot type
import type { ChatHistoryItem } from './useChatHistory';
import { createScopedLogger } from '~/utils/logger';

export interface IChatMetadata {
  gitUrl?: string;
  gitBranch?: string;
  netlifySiteId?: string;
  aiConversationId?: string;
  selectedModel?: string;
  selectedProvider?: string;
}

const logger = createScopedLogger('ChatHistory');

// this is used at the top level and never rejects
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') {
    // Browser-only persistence: silently skip during SSR / non-browser environments.
    return undefined;
  }

  return new Promise((resolve) => {
    const request = indexedDB.open('boltHistory', 2);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('chats')) {
          const store = db.createObjectStore('chats', { keyPath: 'id' });
          store.createIndex('id', 'id', { unique: true });
          store.createIndex('urlId', 'urlId', { unique: true });
        }
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'chatId' });
        }
      }
    };

    request.onsuccess = (event: Event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      resolve(database);

      /*
       * Best-effort, fire-and-forget reclaim of orphaned id-reservation
       * placeholders (urlId `__pending-N`, empty messages) left behind when a
       * new-chat flow aborted between getNextId and setMessages. They are
       * invisible in the sidebar (no description) so they'd otherwise accumulate.
       */
      sweepPendingPlaceholders(database);
    };

    request.onerror = (event: Event) => {
      resolve(undefined);
      logger.error((event.target as IDBOpenDBRequest).error);
    };

    /*
     * If another tab holds an older-version connection open, the upgrade is
     * blocked and neither onsuccess nor onerror fires — without this handler
     * the promise (awaited at module top level) would hang forever.
     */
    request.onblocked = () => {
      resolve(undefined);
      logger.error('Database upgrade blocked by another open connection');
    };
  });
}

/**
 * Delete orphaned id-reservation placeholders: rows whose urlId starts with
 * `__pending-` and whose messages array is empty. getNextId() durably commits
 * such a placeholder to avoid concurrent-allocation id collisions, expecting the
 * subsequent setMessages() to overwrite it; if that flow aborts (quota, stream
 * exception, navigate-away) the empty row persists invisibly forever. Best-effort.
 */
function sweepPendingPlaceholders(db: IDBDatabase) {
  try {
    if (!db.objectStoreNames.contains('chats')) {
      return;
    }

    const transaction = db.transaction('chats', 'readwrite');
    const cursorRequest = transaction.objectStore('chats').openCursor();

    cursorRequest.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;

      if (!cursor) {
        return;
      }

      const value = cursor.value as ChatHistoryItem | undefined;

      if (
        typeof value?.urlId === 'string' &&
        value.urlId.startsWith('__pending-') &&
        Array.isArray(value.messages) &&
        value.messages.length === 0
      ) {
        cursor.delete();
      }

      cursor.continue();
    };
  } catch (error) {
    logger.error('Failed to sweep pending chat placeholders', error);
  }
}

export async function getAll(db: IDBDatabase): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as ChatHistoryItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
  timestamp?: string,
  metadata?: IChatMetadata,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    if (timestamp && isNaN(Date.parse(timestamp))) {
      reject(new Error('Invalid timestamp'));
      return;
    }

    store.put({
      id,
      messages,
      urlId,
      description,
      timestamp: timestamp ?? new Date().toISOString(),
      metadata,
    });

    /*
     * Resolve on transaction.oncomplete, not request.onsuccess: the request
     * succeeds before the transaction commits, so resolving early would report
     * success for a write that may still abort during commit (e.g. quota
     * exceeded), silently losing data.
     */
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
}

export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return (await getMessagesById(db, id)) || (await getMessagesByUrlId(db, id));
}

export async function getMessagesByUrlId(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function getMessagesById(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chats', 'snapshots'], 'readwrite'); // Add snapshots store to transaction
    const chatStore = transaction.objectStore('chats');
    const snapshotStore = transaction.objectStore('snapshots');

    // delete() on a missing key is a no-op success in IndexedDB, so no NotFoundError handling is needed.
    chatStore.delete(id);
    snapshotStore.delete(id); // Also delete snapshot

    /*
     * Resolve on transaction.oncomplete so the deletes are durably committed
     * before we report success. onabort must also be handled — otherwise an
     * aborted transaction (e.g. during commit) leaves the promise hanging.
     */
    transaction.oncomplete = () => resolve(undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
}

export async function getNextId(db: IDBDatabase): Promise<string> {
  return new Promise((resolve, reject) => {
    /*
     * Allocate-and-reserve in a SINGLE readwrite transaction. The old version
     * read the max key in a readonly txn and returned max+1, then the caller
     * wrote in a SEPARATE txn — so two concurrent allocations both read the same
     * max and produced the same id, the second silently overwriting the first
     * (lost chat). IndexedDB serializes writes within an object store, so
     * reserving the id here (a placeholder the caller's setMessages overwrites)
     * means a concurrent getNextId sees the reserved key and picks the next id.
     */
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');
    const request = store.getAllKeys();

    let nextId = '';

    request.onsuccess = () => {
      const highestId = request.result.reduce<number>((highest, key) => {
        const numericKey = Number(key);
        return Number.isFinite(numericKey) ? Math.max(highest, numericKey) : highest;
      }, 0);
      nextId = String(highestId + 1);

      /*
       * Reserve the id with a placeholder (overwritten by the caller's
       * setMessages). The unique urlId index needs a non-colliding value.
       */
      store.put({
        id: nextId,
        urlId: `__pending-${nextId}`,
        messages: [],
        timestamp: new Date().toISOString(),
      });
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(nextId);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('getNextId transaction aborted'));
  });
}

export async function getUrlId(db: IDBDatabase, id: string): Promise<string> {
  const idList = await getUrlIds(db);

  if (!idList.includes(id)) {
    return id;
  } else {
    let i = 2;

    while (idList.includes(`${id}-${i}`)) {
      i++;
    }

    return `${id}-${i}`;
  }
}

async function getUrlIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function forkChat(db: IDBDatabase, chatId: string, messageId: string): Promise<string> {
  const chat = await getMessages(db, chatId);

  if (!chat) {
    throw new Error('Chat not found');
  }

  // Find the index of the message to fork at
  const messageIndex = chat.messages.findIndex((msg) => msg.id === messageId);

  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  // Get messages up to and including the selected message
  const messages = chat.messages.slice(0, messageIndex + 1);

  return createChatFromMessages(db, chat.description ? `${chat.description} (fork)` : 'Forked chat', messages);
}

export async function duplicateChat(db: IDBDatabase, id: string): Promise<string> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  return createChatFromMessages(db, `${chat.description || 'Chat'} (copy)`, chat.messages);
}

export async function createChatFromMessages(
  db: IDBDatabase,
  description: string,
  messages: Message[],
  metadata?: IChatMetadata,
): Promise<string> {
  const newId = await getNextId(db);
  const newUrlId = await getUrlId(db, newId); // Get a new urlId for the duplicated chat

  await setMessages(
    db,
    newId,
    messages,
    newUrlId, // Use the new urlId
    description,
    undefined, // Use the current timestamp
    metadata,
  );

  return newUrlId; // Return the urlId instead of id for navigation
}

export async function updateChatDescription(db: IDBDatabase, id: string, description: string): Promise<void> {
  if (!description.trim()) {
    throw new Error('Description cannot be empty');
  }

  const chat = await getMessages(db, id);

  if (!chat) {
    /*
     * Project chats (`project:<id>`) are server-synced and may have no local
     * IDB row (the empty seed row is only written when there were no stored
     * messages), so requiring an existing row threw a confusing "Chat not
     * found" for a valid, visible chat. Upsert an empty row instead.
     */
    if (id.startsWith('project:')) {
      await setMessages(db, id, [], undefined, description, undefined, undefined);
      return;
    }

    throw new Error('Chat not found');
  }

  await setMessages(db, id, chat.messages, chat.urlId, description, chat.timestamp, chat.metadata);
}

export async function updateChatMetadata(
  db: IDBDatabase,
  id: string,
  metadata: IChatMetadata | undefined,
): Promise<void> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  await setMessages(db, id, chat.messages, chat.urlId, chat.description, chat.timestamp, metadata);
}

export async function getSnapshot(db: IDBDatabase, chatId: string): Promise<Snapshot | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readonly');
    const store = transaction.objectStore('snapshots');
    const request = store.get(chatId);

    request.onsuccess = () => resolve(request.result?.snapshot as Snapshot | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSnapshots(db: IDBDatabase): Promise<{ chatId: string; snapshot: Snapshot }[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readonly');
    const store = transaction.objectStore('snapshots');
    const request = store.getAll();

    request.onsuccess = () => resolve((request.result ?? []) as { chatId: string; snapshot: Snapshot }[]);
    request.onerror = () => reject(request.error);
  });
}

export async function setSnapshot(db: IDBDatabase, chatId: string, snapshot: Snapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    const store = transaction.objectStore('snapshots');
    store.put({ chatId, snapshot });

    // Resolve on commit, not request success, so an aborted commit (e.g. quota) isn't reported as a saved snapshot.
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
}

export async function deleteSnapshot(db: IDBDatabase, chatId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    const store = transaction.objectStore('snapshots');
    const request = store.delete(chatId);

    request.onsuccess = () => resolve();

    request.onerror = (event) => {
      if ((event.target as IDBRequest).error?.name === 'NotFoundError') {
        resolve();
      } else {
        reject(request.error);
      }
    };
  });
}
