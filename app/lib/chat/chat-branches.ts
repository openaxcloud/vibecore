/**
 * Branching conversation history for the agent panel (Sprint 6).
 *
 * Today the project IDE memory persists a flat `conversations[]` list. To
 * support multi-chat with branches we add three optional fields on each
 * archived conversation:
 *
 *   - `parentId` — when the conversation was forked off another one.
 *   - `branchedFromMessageId` — the message in the parent at the point
 *     of the fork. The branch inherits all preceding messages.
 *   - `archivedFromMessageId` — when an archived conversation was the
 *     active thread at archive time, this is the last message id present
 *     in `messages`. Future replays can pick up from this point.
 *
 * This module is the source of truth for those operations; the chat UI
 * subscribes to the projectIdeMemory store and calls these helpers when
 * the user picks "fork from here" / "switch to branch" / "delete branch".
 */

import type { Message } from 'ai';

export interface BranchedConversation {
  id: string;
  title?: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
  parentId?: string;
  branchedFromMessageId?: string;
  archivedFromMessageId?: string;
}

export interface BranchNode {
  conversation: BranchedConversation;
  children: BranchNode[];
}

function findMessageIndex(messages: readonly Message[], messageId: string): number {
  return messages.findIndex((message) => message.id === messageId);
}

export interface BranchFromMessageInput {
  source: BranchedConversation;
  branchPointMessageId: string;
  newConversationId: string;
  newTitle?: string;
  now?: () => Date;
}

/**
 * Fork a new conversation off the source at the given message. The new
 * conversation inherits every message up to AND INCLUDING the branch
 * point so the user can keep talking from that turn. Returns undefined
 * when the branch-point id is not in the source's message list.
 */
export function branchConversationFromMessage(input: BranchFromMessageInput): BranchedConversation | undefined {
  const idx = findMessageIndex(input.source.messages, input.branchPointMessageId);

  if (idx === -1) {
    return undefined;
  }

  const now = input.now?.() ?? new Date();
  const timestamp = now.toISOString();

  return {
    id: input.newConversationId,
    title: input.newTitle ?? input.source.title,
    messages: input.source.messages.slice(0, idx + 1),
    createdAt: timestamp,
    updatedAt: timestamp,
    parentId: input.source.id,
    branchedFromMessageId: input.branchPointMessageId,
  };
}

/**
 * Build the parent → children tree of conversations. Conversations
 * with `parentId` missing or pointing nowhere are roots.
 */
export function buildBranchTree(conversations: readonly BranchedConversation[]): BranchNode[] {
  const byId = new Map<string, BranchedConversation>();

  for (const conversation of conversations) {
    byId.set(conversation.id, conversation);
  }

  const nodes = new Map<string, BranchNode>();

  for (const conversation of conversations) {
    nodes.set(conversation.id, { conversation, children: [] });
  }

  const roots: BranchNode[] = [];

  for (const conversation of conversations) {
    const node = nodes.get(conversation.id)!;
    const parentId = conversation.parentId;
    const parentNode = parentId ? nodes.get(parentId) : undefined;

    if (!parentId || !parentNode) {
      roots.push(node);
      continue;
    }

    parentNode.children.push(node);
  }

  /*
   * Sort children by creation time so the tree is stable: oldest first.
   * Unknown timestamps sort before known ones (we treat them as ancient
   * so they don't reorder existing branches when a new one lands).
   */
  function timestamp(node: BranchNode): number {
    const raw = node.conversation.createdAt;
    return raw ? Date.parse(raw) || 0 : 0;
  }

  function sortRecursive(list: BranchNode[]) {
    list.sort((a, b) => timestamp(a) - timestamp(b));

    for (const node of list) {
      sortRecursive(node.children);
    }
  }

  sortRecursive(roots);

  return roots;
}

/**
 * List direct children of a given conversation id. Convenience over
 * `buildBranchTree` for callers that only need one level.
 */
export function listBranchesOf(
  conversations: readonly BranchedConversation[],
  parentId: string,
): BranchedConversation[] {
  return conversations.filter((conversation) => conversation.parentId === parentId);
}

/**
 * Trace the ancestry of a conversation back to its root: oldest first,
 * the conversation itself last. Cycles are guarded against so a corrupt
 * `parentId` chain doesn't loop forever.
 */
export function getBranchPath(
  conversations: readonly BranchedConversation[],
  conversationId: string,
): BranchedConversation[] {
  const byId = new Map<string, BranchedConversation>();

  for (const conversation of conversations) {
    byId.set(conversation.id, conversation);
  }

  const path: BranchedConversation[] = [];
  const seen = new Set<string>();

  let current = byId.get(conversationId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}

/**
 * Remove a conversation and its descendants from the list. Returns the
 * pruned array; the caller saves it back to ProjectIdeMemory.
 */
export function pruneBranch(
  conversations: readonly BranchedConversation[],
  conversationId: string,
): BranchedConversation[] {
  const tree = buildBranchTree(conversations);
  const toRemove = new Set<string>();

  function visit(node: BranchNode, removeRoot: boolean) {
    if (removeRoot) {
      toRemove.add(node.conversation.id);

      for (const child of node.children) {
        visit(child, true);
      }
    } else {
      for (const child of node.children) {
        visit(child, child.conversation.id === conversationId);
      }
    }
  }

  for (const root of tree) {
    visit(root, root.conversation.id === conversationId);
  }

  if (toRemove.size === 0) {
    return [...conversations];
  }

  return conversations.filter((conversation) => !toRemove.has(conversation.id));
}
