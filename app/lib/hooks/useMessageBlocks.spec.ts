import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';

import { createMessageBlocksCache } from './useMessageBlocks';

function userMessage(id: string, content: string): Message {
  return { id, role: 'user', content };
}

function assistantMessage(id: string, content: string): Message {
  return { id, role: 'assistant', content };
}

describe('createMessageBlocksCache', () => {
  it('returns the same blocks array identity for an unchanged message', () => {
    const cache = createMessageBlocksCache();
    const message = assistantMessage('a1', 'hello there');

    const first = cache.get(message);
    const second = cache.get(message);

    expect(second).toBe(first);
    expect(first[0]).toMatchObject({ kind: 'text', text: 'hello there' });
  });

  it('recomputes blocks when the content string changes', () => {
    const cache = createMessageBlocksCache();
    const original = assistantMessage('a1', 'first chunk');
    const firstBlocks = cache.get(original);

    const streamed = assistantMessage('a1', 'first chunk and more');
    const secondBlocks = cache.get(streamed);

    expect(secondBlocks).not.toBe(firstBlocks);
    expect(secondBlocks[0]).toMatchObject({ kind: 'text', text: 'first chunk and more' });
  });

  it('reuses earlier messages when only the last one streams new content', () => {
    const cache = createMessageBlocksCache();
    const user = userMessage('u1', 'do the thing');
    const assistantTick1 = assistantMessage('a1', 'sure, working');
    const assistantTick2 = assistantMessage('a1', 'sure, working on it now');

    const initial = cache.getAll([user, assistantTick1]);
    const streamed = cache.getAll([user, assistantTick2]);

    // The user message blocks must be exactly the same reference.
    expect(streamed[0]).toBe(initial[0]);

    // The streaming assistant message must have been recomputed.
    expect(streamed[1]).not.toBe(initial[1]);
    expect(streamed[1][0]).toMatchObject({ kind: 'text', text: 'sure, working on it now' });
  });

  it('preserves identity across a reorder when each message has its own id', () => {
    const cache = createMessageBlocksCache();
    const a = userMessage('u-a', 'a');
    const b = userMessage('u-b', 'b');

    const first = cache.getAll([a, b]);
    const reordered = cache.getAll([b, a]);

    /*
     * Same snapshots, different positions: ids let us reuse the blocks
     * from the earlier call without recomputing. This is the streaming-
     * chat case where we keep the same Message references across renders.
     */
    expect(reordered[0]).toBe(first[1]);
    expect(reordered[1]).toBe(first[0]);
  });

  it('evicts cache entries for messages that disappear from the input list', () => {
    const cache = createMessageBlocksCache();

    const a = assistantMessage('a1', 'first');
    const b = assistantMessage('a2', 'second');
    cache.getAll([a, b]);

    // Drop a2 entirely.
    cache.getAll([a]);

    /*
     * Re-introducing a2 with the same id but different content must NOT
     * serve the stale blocks. (If eviction failed and identity matched
     * we'd silently return blocks for the old content.)
     */
    const aRevived = assistantMessage('a2', 'second revived');
    const next = cache.getAll([a, aRevived]);
    expect(next[1][0]).toMatchObject({ kind: 'text', text: 'second revived' });
  });

  it('recomputes when only experimental_attachments identity changes', () => {
    const cache = createMessageBlocksCache();

    const attachmentsA = [{ url: 'data:image/png;base64,A', contentType: 'image/png' }];
    const attachmentsB = [{ url: 'data:image/png;base64,A', contentType: 'image/png' }];

    const m1: Message = {
      id: 'u1',
      role: 'user',
      content: 'see image',
      experimental_attachments: attachmentsA,
    };
    const m2: Message = {
      id: 'u1',
      role: 'user',
      content: 'see image',
      experimental_attachments: attachmentsB,
    };

    const firstBlocks = cache.get(m1);
    const secondBlocks = cache.get(m2);

    /*
     * Different array reference => recompute. The content of the attachment
     * block is the same but the array identity must not be shared.
     */
    expect(secondBlocks).not.toBe(firstBlocks);
    expect(secondBlocks.some((block) => block.kind === 'attachment')).toBe(true);
  });

  it('honours parts identity over the legacy content fallback', () => {
    const cache = createMessageBlocksCache();

    const partsA = [{ type: 'text' as const, text: 'parts payload' }];
    const partsB = [{ type: 'text' as const, text: 'parts payload v2' }];

    const m1: Message = { id: 'a1', role: 'assistant', content: 'legacy', parts: partsA };
    const m2: Message = { id: 'a1', role: 'assistant', content: 'legacy', parts: partsB };

    const first = cache.get(m1);
    const second = cache.get(m2);

    expect(second).not.toBe(first);
    expect(second[0]).toMatchObject({ kind: 'text', text: 'parts payload v2' });
  });
});
