/**
 * Memoized adapter from AI SDK `Message` values to the typed `MessageBlock[]`
 * render model. Sprint 2 plugs this into `Messages.client.tsx` /
 * `AssistantMessage.tsx` so the chat surface renders one component per block
 * kind instead of a single monolithic markdown blob.
 *
 * The converter `messageToBlocks` is pure and deterministic, but it walks
 * `message.parts` / `experimental_attachments` / parses every artifact-bearing
 * text payload — re-running it on every render of a long chat is wasteful.
 * The cache here keys per-message on the inputs the converter actually reads
 * (`parts`, `content`, `experimental_attachments` reference identity), so a
 * new token appended to the last assistant message does not invalidate the
 * blocks for earlier messages in the chat.
 */

import type { Message } from 'ai';
import { useMemo, useRef } from 'react';

import { messageToBlocks } from '~/lib/runtime/message-blocks';
import type { MessageBlock } from '~/types/message-blocks';

type MessageAttachments = NonNullable<Message['experimental_attachments']>;

interface CacheEntry {
  parts: Message['parts'];
  content: Message['content'];
  attachments: MessageAttachments | undefined;
  blocks: MessageBlock[];
}

export interface MessageBlocksCache {
  /**
   * Return the cached `MessageBlock[]` for a message; (re)compute and store
   * if the underlying snapshot identity has changed. Stable across calls
   * with the same message snapshot.
   */
  get(message: Message): MessageBlock[];

  /**
   * Convert an ordered list of messages, reusing per-message cache hits
   * where possible. Also evicts entries whose keys no longer appear in
   * the input list, so the cache cannot grow without bound.
   */
  getAll(messages: Message[]): MessageBlock[][];
}

function cacheKey(message: Message, fallbackIndex: number): string {
  return message.id ?? `${message.role}:${fallbackIndex}`;
}

/**
 * Create a per-chat-panel cache. Exposed for unit testing the cache
 * semantics directly (the React hook below is a thin wrapper).
 */
export function createMessageBlocksCache(): MessageBlocksCache {
  const entries = new Map<string, CacheEntry>();

  function compute(message: Message, key: string): MessageBlock[] {
    const attachments = message.experimental_attachments;
    const blocks = messageToBlocks(message);
    entries.set(key, { parts: message.parts, content: message.content, attachments, blocks });

    return blocks;
  }

  return {
    get(message) {
      const key = cacheKey(message, 0);
      const cached = entries.get(key);
      const attachments = message.experimental_attachments;

      if (
        cached &&
        cached.parts === message.parts &&
        cached.content === message.content &&
        cached.attachments === attachments
      ) {
        return cached.blocks;
      }

      return compute(message, key);
    },

    getAll(messages) {
      const result: MessageBlock[][] = [];
      const seen = new Set<string>();

      messages.forEach((message, index) => {
        const key = cacheKey(message, index);
        seen.add(key);

        const cached = entries.get(key);
        const attachments = message.experimental_attachments;

        if (
          cached &&
          cached.parts === message.parts &&
          cached.content === message.content &&
          cached.attachments === attachments
        ) {
          result.push(cached.blocks);

          return;
        }

        result.push(compute(message, key));
      });

      for (const key of Array.from(entries.keys())) {
        if (!seen.has(key)) {
          entries.delete(key);
        }
      }

      return result;
    },
  };
}

/**
 * Return the memoized `MessageBlock[]` for a single message snapshot.
 *
 * Recomputes only when `id`, `parts`, `content`, or `experimental_attachments`
 * change identity — matching what `messageToBlocks` actually reads — so
 * downstream `===` reference checks remain stable across renders.
 */
export function useMessageBlocks(message: Message): MessageBlock[] {
  const attachments = message.experimental_attachments;

  return useMemo(() => messageToBlocks(message), [message.id, message.parts, message.content, attachments]);
}

/**
 * Memoize a whole list of messages with per-message cache reuse. Adding
 * one new message at the tail or appending a streaming token to the
 * last message does not invalidate the earlier entries.
 */
export function useMessagesBlocks(messages: Message[]): MessageBlock[][] {
  const cacheRef = useRef<MessageBlocksCache | null>(null);

  if (cacheRef.current === null) {
    cacheRef.current = createMessageBlocksCache();
  }

  return useMemo(() => cacheRef.current!.getAll(messages), [messages]);
}
