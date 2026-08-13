import { generateId, type JSONValue, type Message } from 'ai';
import { atom } from 'nanostores';
import { useState, useEffect, useCallback } from 'react';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import {
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  getSnapshot,
  setSnapshot,
  type IChatMetadata,
} from './db';
import { getProjectIdeMemory, saveProjectIdeMemory } from './projectIdeMemory';
import type { Snapshot } from './types';
import { runtimeAdapter } from '~/lib/runtime/RuntimeAdapterProvider';
import type { FileMap } from '~/lib/stores/files';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import { workbenchStore } from '~/lib/stores/workbench';
import type { ContextAnnotation } from '~/types/context';
import { detectProjectCommands, createCommandActionsString, escapeBoltActionAttribute } from '~/utils/projectCommands';

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

/*
 * `db` is browser-only. Guard the top-level await so this module can be
 * imported during SSR without touching indexedDB (which is undefined in Node).
 */
export const db = persistenceEnabled && typeof indexedDB !== 'undefined' ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);

function toRuntimePath(filePath: string) {
  if (filePath.startsWith(`${runtimeAdapter.workdir}/`)) {
    return filePath.slice(runtimeAdapter.workdir.length + 1);
  }

  return filePath.replace(/^\/+/, '');
}

const LOCAL_CHAT_WARNING_KEY = 'vibecore:local-chat-warning-ack';

/*
 * Standalone (non-project) chats are persisted only in this browser's
 * IndexedDB — unlike project chats, which sync to the API via
 * saveProjectIdeMemory. Server-side sync for standalone chats is not yet
 * built, so warn the user once per device that their history is device-local
 * and won't follow them to another browser/machine.
 */
function warnLocalChatPersistence() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (localStorage.getItem(LOCAL_CHAT_WARNING_KEY)) {
      return;
    }

    localStorage.setItem(LOCAL_CHAT_WARNING_KEY, '1');
  } catch {
    // localStorage may be unavailable (e.g. private mode); still show the toast once this session.
  }

  toast.info('Chat history is stored locally on this device and will not sync across devices.', {
    toastId: 'local-chat-persistence',
    autoClose: 8000,
  });
}

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId, projectId } = useLoaderData<{ id?: string; projectId?: string }>();
  const [searchParams] = useSearchParams();

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();

  useEffect(() => {
    if (!db && !projectId) {
      setReady(true);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (projectId) {
      getProjectIdeMemory(projectId)
        .then(async (memory) => {
          const projectChatId = memory.chat?.id ?? `project:${projectId}`;

          const storedMessages = memory.chat?.messages?.length
            ? ({
                id: projectChatId,
                urlId: memory.chat.urlId,
                description: memory.chat.description,
                messages: memory.chat.messages,
                timestamp: memory.updatedAt ?? new Date().toISOString(),
                metadata: memory.chat.metadata,
              } satisfies ChatHistoryItem)
            : db
              ? await getMessages(db, projectChatId).catch(() => undefined as unknown as ChatHistoryItem | undefined)
              : undefined;

          const messages = storedMessages?.messages ?? [];

          setArchivedMessages(memory.chat?.archivedMessages ?? []);
          setInitialMessages(messages);
          setUrlId(storedMessages?.urlId);
          description.set(storedMessages?.description ?? memory.chat?.description ?? 'Project assistant');
          chatId.set(projectChatId);
          chatMetadata.set(storedMessages?.metadata ?? memory.chat?.metadata);

          if (!storedMessages && db) {
            await setMessages(db, projectChatId, [], undefined, 'Project assistant', undefined, memory.chat?.metadata);
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);
          logStore.logError('Failed to load project IDE chat memory', error);
          toast.error('Failed to load project IDE memory: ' + error.message, {
            toastId: `project-ide-memory-load-${projectId}`,
          });
          chatId.set(`project:${projectId}`);
          description.set('Project assistant');
          setReady(true);
        });
    } else if (mixedId) {
      warnLocalChatPersistence();
      Promise.all([
        getMessages(db!, mixedId),
        getSnapshot(db!, mixedId), // Fetch snapshot from DB
      ])
        .then(async ([storedMessages, snapshot]) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            /*
             * const snapshotStr = localStorage.getItem(`snapshot:${mixedId}`); // Remove localStorage usage
             * const snapshot: Snapshot = snapshotStr ? JSON.parse(snapshotStr) : { chatIndex: 0, files: {} }; // Use snapshot from DB
             */
            const validSnapshot = snapshot || { chatIndex: '', files: {} }; // Ensure snapshot is not undefined
            const summary = validSnapshot.summary;

            const rewindId = searchParams.get('rewindTo');

            let startingIdx = -1;

            const endingIdx = rewindId
              ? storedMessages.messages.findIndex((m) => m.id === rewindId) + 1
              : storedMessages.messages.length;

            /*
             * Coerce both sides to string: chatIndex is a message id (string)
             * today, but snapshots persisted under the old numeric schema would
             * never match `m.id === <number>` and silently discard a valid
             * snapshot (losing the archived-message split).
             */
            const snapshotIndex = storedMessages.messages.findIndex(
              (m) => String(m.id) === String(validSnapshot.chatIndex),
            );

            if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
              startingIdx = snapshotIndex;
            }

            if (snapshotIndex > 0 && storedMessages.messages[snapshotIndex].id === rewindId) {
              startingIdx = -1;
            }

            let filteredMessages = storedMessages.messages.slice(startingIdx + 1, endingIdx);
            let archivedMessages: Message[] = [];

            if (startingIdx >= 0) {
              archivedMessages = storedMessages.messages.slice(0, startingIdx + 1);
            }

            setArchivedMessages(archivedMessages);

            if (startingIdx > 0) {
              const files = Object.entries(validSnapshot?.files || {})
                .map(([key, value]) => {
                  if (value?.type !== 'file') {
                    return null;
                  }

                  return {
                    content: value.content,
                    path: key,
                  };
                })
                .filter((x): x is { content: string; path: string } => !!x); // Type assertion

              const projectCommands = await detectProjectCommands(files);

              // Call the modified function to get only the command actions string
              const commandActionsString = createCommandActionsString(projectCommands);

              filteredMessages = [
                {
                  id: generateId(),
                  role: 'user',
                  content: `Restore project from snapshot`, // Removed newline
                  annotations: ['no-store', 'hidden'],
                },
                {
                  id: storedMessages.messages[snapshotIndex].id,
                  role: 'assistant',

                  // Combine followup message and the artifact with files and command actions
                  content: `Restored your chat from a snapshot. You can revert this message to load the full chat history.
                  <boltArtifact id="restored-project-setup" title="Restored Project & Setup" type="bundled">
                  ${Object.entries(snapshot?.files || {})
                    .map(([key, value]) => {
                      if (value?.type === 'file') {
                        return `
                      <boltAction type="file" filePath="${escapeBoltActionAttribute(key)}">
${value.content}
                      </boltAction>
                      `;
                      } else {
                        return ``;
                      }
                    })
                    .join('\n')}
                  ${commandActionsString} 
                  </boltArtifact>
                  `, // Added commandActionsString, followupMessage, updated id and title
                  annotations: [
                    'no-store',
                    ...(summary
                      ? [
                          {
                            chatId: storedMessages.messages[snapshotIndex].id,
                            type: 'chatSummary',
                            summary,
                          } satisfies ContextAnnotation,
                        ]
                      : []),
                  ],
                },

                // Remove the separate user and assistant messages for commands
                /*
                 *...(commands !== null // This block is no longer needed
                 *  ? [ ... ]
                 *  : []),
                 */
                ...filteredMessages,
              ];
              restoreSnapshot(mixedId, validSnapshot);
            }

            setInitialMessages(filteredMessages);

            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            chatMetadata.set(storedMessages.metadata);
          } else {
            navigate('/', { replace: true });
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);

          logStore.logError('Failed to load chat messages or snapshot', error); // Updated error message
          toast.error('Failed to load chat: ' + (error instanceof Error ? error.message : String(error))); // More specific error

          // Without this the UI stays stuck on the loading state forever after a load failure.
          setReady(true);
        });
    } else {
      // Handle case where there is no mixedId (e.g., new chat)
      warnLocalChatPersistence();
      setReady(true);
    }
  }, [mixedId, projectId, db, navigate, searchParams]); // Added db, navigate, searchParams dependencies

  const takeSnapshot = useCallback(
    async (chatIdx: string, files: FileMap, _chatId?: string | undefined, chatSummary?: string) => {
      const id = chatId.get();

      if (!id || !db) {
        return;
      }

      const snapshot: Snapshot = {
        chatIndex: chatIdx,
        files,
        summary: chatSummary,
      };

      // localStorage.setItem(`snapshot:${id}`, JSON.stringify(snapshot)); // Remove localStorage usage
      try {
        await setSnapshot(db, id, snapshot);
      } catch (error) {
        console.error('Failed to save snapshot:', error);
        toast.error('Failed to save chat snapshot.');
      }
    },
    [db],
  );

  const restoreSnapshot = useCallback(async (id: string, snapshot?: Snapshot) => {
    // const snapshotStr = localStorage.getItem(`snapshot:${id}`); // Remove localStorage usage
    const validSnapshot = snapshot || { chatIndex: '', files: {} };

    if (!validSnapshot?.files) {
      return;
    }

    /*
     * forEach(async …) fired every dir-create and file-write concurrently and
     * unordered: files could be written before their parent directory existed
     * and any rejection became an unhandled promise. Create all directories
     * first, then write files, sequentially, so parents exist and errors surface.
     */
    try {
      for (const [key, value] of Object.entries(validSnapshot.files)) {
        if (value?.type === 'folder') {
          await runtimeAdapter.createDirectory(toRuntimePath(key));
        }
      }

      for (const [key, value] of Object.entries(validSnapshot.files)) {
        if (value?.type === 'file') {
          await runtimeAdapter.writeFile(toRuntimePath(key), value.content);
        }
      }
    } catch (error) {
      console.error('Failed to restore snapshot files:', error);
      logStore.logError('Failed to restore snapshot files', error);
    }

    // workbenchStore.files.setKey(snapshot?.files)
  }, []);

  return {
    ready: projectId ? ready : !mixedId || ready,
    initialMessages,
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!db || !id) {
        return;
      }

      try {
        await setMessages(db, id, initialMessages, urlId, description.get(), undefined, metadata);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!db && !projectId) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      if (messages.length === 0) {
        if (projectId) {
          const finalChatId = chatId.get() ?? `project:${projectId}`;
          chatId.set(finalChatId);

          await saveProjectIdeMemory(projectId, {
            chat: {
              id: finalChatId,
              urlId,
              description: description.get() ?? 'Project assistant',
              metadata: chatMetadata.get(),
              messages: [],
              clearMessages: true,
              archivedMessages,
            },
          }).catch((error) => {
            logStore.logError('Failed to persist empty project chat memory', error);
            toast.error('Failed to persist project chat memory');
          });
        }

        return;
      }

      let _urlId = urlId;

      if (!projectId && !urlId && firstArtifact?.id) {
        const urlId = await getUrlId(db!, firstArtifact.id);
        _urlId = urlId;
        navigateChat(urlId);
        setUrlId(urlId);
      }

      let chatSummary: string | undefined = undefined;

      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];

        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      /*
       * Assign the chat id for a brand-new standalone chat BEFORE taking the
       * first snapshot. takeSnapshot keys on chatId.get() and returns early when
       * it's undefined, so taking the snapshot first silently dropped the very
       * first turn's workbench files (lost on reload).
       */
      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = projectId ? `project:${projectId}` : await getNextId(db!);

        chatId.set(nextId);

        if (!projectId && !urlId) {
          navigateChat(nextId);
        }
      }

      takeSnapshot(messages[messages.length - 1].id, workbenchStore.files.get(), _urlId, chatSummary);

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      // Ensure chatId.get() is used for the final setMessages call
      const finalChatId = chatId.get();

      if (!finalChatId) {
        console.error('Cannot save messages, chat ID is not set.');
        toast.error('Failed to save chat messages: Chat ID missing.');

        return;
      }

      if (db) {
        await setMessages(
          db,
          finalChatId, // Use the potentially updated chatId
          [...archivedMessages, ...messages],
          _urlId, // freshly-computed urlId; outer `urlId` state is still stale this render
          description.get(),
          undefined,
          chatMetadata.get(),
        );
      }

      if (projectId) {
        await saveProjectIdeMemory(projectId, {
          chat: {
            id: finalChatId,
            urlId: _urlId,
            description: description.get(),
            metadata: chatMetadata.get(),
            messages: [...archivedMessages, ...messages],

            /*
             * This is the authoritative full message list, so REPLACE rather than
             * union-merge. Without clearMessages the merge unions existing ∪
             * incoming, so a rewind / message-delete (a shorter list) never
             * removed anything and the deleted messages silently reappeared on
             * reload.
             */
            clearMessages: true,
            archivedMessages,
          },
        }).catch((error) => {
          logStore.logError('Failed to persist project chat memory', error);
          toast.error('Failed to persist project chat memory');
        });
      }
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!db || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(db, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata) => {
      if (!db) {
        return;
      }

      try {
        const newId = await createChatFromMessages(db, description, messages, metadata);
        window.location.href = `/chat/${newId}`;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!db || !id) {
        return;
      }

      const chat = await getMessages(db, id);

      // getMessages resolves undefined for an unknown id; guard before dereferencing.
      if (!chat) {
        toast.error('Failed to export chat: chat not found');
        return;
      }

      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /*
   * Update the address bar without going through the Remix router. We're
   * called mid-`storeMessageHistory` — Remix `navigate()` would treat the
   * new `/chat/:id` as a route transition, remount <Chat />, and lose the
   * in-flight save (snapshot + setMessages haven't completed yet). The
   * chat ID is also a server-generated alias for an already-loaded chat,
   * not a different route, so `history.replaceState` is the semantically
   * correct tool here: same view, freshened URL.
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
