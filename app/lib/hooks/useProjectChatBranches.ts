/**
 * React surface for the Sprint 6 branching helpers (`chat-branches.ts`).
 *
 * `useProjectChatBranches(projectId)` returns the persisted conversations
 * for a project plus stable callbacks for the four branch operations the
 * agent panel needs:
 *
 *   - `fork(sourceId, messageId, options)` — create a new branch at a
 *     message and persist it through `saveProjectIdeMemory`.
 *   - `switchTo(conversationId)` — promote a branch to the active thread
 *     by archiving the current `chat.messages` into a conversation and
 *     reading the target conversation's messages into `chat.messages`.
 *   - `rename(conversationId, title)` — update the title.
 *   - `remove(conversationId)` — prune the branch + its descendants.
 *
 * Pure presentational helper — backed entirely by the projectIdeMemory
 * subscription so the rest of the agent panel reactively sees changes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  branchConversationFromMessage,
  buildBranchTree,
  pruneBranch,
  type BranchedConversation,
  type BranchNode,
} from '~/lib/chat/chat-branches';
import {
  getProjectIdeMemory,
  saveProjectIdeMemory,
  subscribeProjectIdeMemory,
  type ProjectIdeMemory,
} from '~/lib/persistence/projectIdeMemory';

export interface UseProjectChatBranchesResult {
  conversations: BranchedConversation[];
  tree: BranchNode[];
  fork: (
    sourceId: string,
    messageId: string,
    options?: { newConversationId?: string; newTitle?: string },
  ) => Promise<string | undefined>;
  switchTo: (conversationId: string) => Promise<boolean>;
  rename: (conversationId: string, title: string) => Promise<void>;
  remove: (conversationId: string) => Promise<void>;
}

function readConversations(memory: ProjectIdeMemory | undefined): BranchedConversation[] {
  const raw = memory?.chat?.conversations;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw as BranchedConversation[];
}

function makeId(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `branch-${Date.now()}-${Math.floor(Math.random() * 100_000).toString(36)}`;
}

export function useProjectChatBranches(projectId: string | undefined): UseProjectChatBranchesResult {
  const [memory, setMemory] = useState<ProjectIdeMemory | undefined>(undefined);

  useEffect(() => {
    if (!projectId) {
      setMemory(undefined);

      return undefined;
    }

    let cancelled = false;

    getProjectIdeMemory(projectId)
      .then((value) => {
        if (!cancelled) {
          setMemory(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMemory(undefined);
        }
      });

    const unsubscribe = subscribeProjectIdeMemory(projectId, (next) => {
      if (!cancelled) {
        setMemory(next);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);

  const conversations = useMemo(() => readConversations(memory), [memory]);
  const tree = useMemo(() => buildBranchTree(conversations), [conversations]);

  const fork = useCallback<UseProjectChatBranchesResult['fork']>(
    async (sourceId, messageId, options) => {
      if (!projectId) {
        return undefined;
      }

      const current = readConversations(memory);
      const source = current.find((conversation) => conversation.id === sourceId);

      if (!source) {
        return undefined;
      }

      const forked = branchConversationFromMessage({
        source,
        branchPointMessageId: messageId,
        newConversationId: options?.newConversationId ?? makeId(),
        newTitle: options?.newTitle,
      });

      if (!forked) {
        return undefined;
      }

      await saveProjectIdeMemory(projectId, {
        chat: { conversations: [...current, forked] },
      });

      return forked.id;
    },
    [projectId, memory],
  );

  const switchTo = useCallback<UseProjectChatBranchesResult['switchTo']>(
    async (conversationId) => {
      if (!projectId) {
        return false;
      }

      const current = readConversations(memory);
      const target = current.find((conversation) => conversation.id === conversationId);

      if (!target) {
        return false;
      }

      /*
       * Archive the OUTGOING active thread as a conversation entry before we
       * overwrite chat.messages with the target's, so the user can switch back.
       * The previous code computed these locals but never actually appended the
       * active thread to conversations[] — so switching away DISCARDED the active
       * messages (data loss) whenever the active thread wasn't already archived.
       */
      const activeMessages = memory?.chat?.messages ?? [];
      const lastActiveId = activeMessages.length > 0 ? activeMessages[activeMessages.length - 1]?.id : undefined;
      const activeId = memory?.chat?.id;
      const activeAlreadyArchived = activeId ? current.some((conversation) => conversation.id === activeId) : false;

      const deriveTitle = (messages: typeof activeMessages): string | undefined => {
        const firstUser = messages.find((message) => message.role === 'user');
        const text = typeof firstUser?.content === 'string' ? firstUser.content.trim() : '';

        return text ? text.slice(0, 80) : undefined;
      };

      const archiveEntry: BranchedConversation | undefined =
        activeMessages.length > 0 && !activeAlreadyArchived
          ? {
              id: activeId ?? makeId(),
              title: deriveTitle(activeMessages),
              messages: activeMessages,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              ...(lastActiveId ? { archivedFromMessageId: lastActiveId } : {}),
            }
          : undefined;

      const baseConversations = archiveEntry ? [...current, archiveEntry] : current;

      const nextConversations: BranchedConversation[] = baseConversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        return { ...conversation, updatedAt: new Date().toISOString() };
      });

      await saveProjectIdeMemory(projectId, {
        chat: {
          id: target.id,
          messages: target.messages,
          clearMessages: true,
          conversations: nextConversations.map((conversation) => {
            if (conversation.id === target.id && lastActiveId) {
              return { ...conversation, archivedFromMessageId: lastActiveId };
            }

            return conversation;
          }),
        },
      });

      return true;
    },
    [projectId, memory],
  );

  const rename = useCallback<UseProjectChatBranchesResult['rename']>(
    async (conversationId, title) => {
      if (!projectId) {
        return;
      }

      const current = readConversations(memory);

      const next = current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, title, updatedAt: new Date().toISOString() }
          : conversation,
      );

      await saveProjectIdeMemory(projectId, { chat: { conversations: next } });
    },
    [projectId, memory],
  );

  const remove = useCallback<UseProjectChatBranchesResult['remove']>(
    async (conversationId) => {
      if (!projectId) {
        return;
      }

      const current = readConversations(memory);
      const next = pruneBranch(current, conversationId);

      await saveProjectIdeMemory(projectId, { chat: { conversations: next } });
    },
    [projectId, memory],
  );

  return { conversations, tree, fork, switchTo, rename, remove };
}
