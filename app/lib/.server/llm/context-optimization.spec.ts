import { describe, expect, it, beforeEach } from 'vitest';
import type { FileMap } from './constants';
import {
  __clearSelectionCache,
  computeSelectionCacheKey,
  estimateMessagesTokens,
  getMemoizedSelection,
  setMemoizedSelection,
  shouldGenerateSummary,
  SELECTION_CACHE_MAX,
  SUMMARY_TOKEN_THRESHOLD,
} from './context-optimization';

const RECENT_WINDOW = 12;

function makeMessages(count: number, filler = 'hi'): Array<{ id: string; role: string; content: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 ? 'assistant' : 'user',
    content: filler,
  }));
}

describe('A1 estimateMessagesTokens', () => {
  it('approximates chars/4 across string content and parts', () => {
    const tokens = estimateMessagesTokens([
      { content: 'a'.repeat(40) },
      { content: null, parts: [{ type: 'text', text: 'x' }] },
    ]);

    // 40 chars -> 10 tokens, plus the JSON of parts (small) rounded up.
    expect(tokens).toBeGreaterThanOrEqual(10);
  });
});

describe('A1 shouldGenerateSummary (threshold gate)', () => {
  it('SKIPS summary for a short history within the recent window and under the token threshold', () => {
    expect(shouldGenerateSummary({ messageCount: 4, recentWindow: RECENT_WINDOW, estimatedTokens: 100 })).toBe(false);
  });

  it('summarizes when the message count exceeds the recent window', () => {
    expect(
      shouldGenerateSummary({ messageCount: RECENT_WINDOW + 1, recentWindow: RECENT_WINDOW, estimatedTokens: 0 }),
    ).toBe(true);
  });

  it('summarizes when the estimated token count exceeds the threshold even with few messages', () => {
    expect(
      shouldGenerateSummary({
        messageCount: 2,
        recentWindow: RECENT_WINDOW,
        estimatedTokens: SUMMARY_TOKEN_THRESHOLD + 1,
      }),
    ).toBe(true);
  });
});

describe('A1 computeSelectionCacheKey', () => {
  it('is stable for identical inputs and order-insensitive for file paths', () => {
    const messages = makeMessages(3);
    const a = computeSelectionCacheKey({ filePaths: ['/a', '/b', '/c'], messages, summary: 's' });
    const b = computeSelectionCacheKey({ filePaths: ['/c', '/a', '/b'], messages, summary: 's' });
    expect(a).toBe(b);
  });

  it('changes when the summary changes', () => {
    const messages = makeMessages(3);
    const a = computeSelectionCacheKey({ filePaths: ['/a'], messages, summary: 's1' });
    const b = computeSelectionCacheKey({ filePaths: ['/a'], messages, summary: 's2' });
    expect(a).not.toBe(b);
  });

  it('changes when the messages change (new user turn)', () => {
    const a = computeSelectionCacheKey({ filePaths: ['/a'], messages: makeMessages(3), summary: 's' });
    const b = computeSelectionCacheKey({ filePaths: ['/a'], messages: makeMessages(4), summary: 's' });
    expect(a).not.toBe(b);
  });

  it('changes when the file-path set changes', () => {
    const messages = makeMessages(3);
    const a = computeSelectionCacheKey({ filePaths: ['/a'], messages, summary: 's' });
    const b = computeSelectionCacheKey({ filePaths: ['/a', '/b'], messages, summary: 's' });
    expect(a).not.toBe(b);
  });
});

describe('A1 selection memo', () => {
  beforeEach(() => __clearSelectionCache());

  const files: FileMap = { 'src/app.ts': { type: 'file', content: 'x', isBinary: false } };

  it('returns undefined on a cold miss', () => {
    expect(getMemoizedSelection('chat-1', 'k')).toBeUndefined();
  });

  it('returns the exact memoized FileMap when the key matches (2nd turn skips selection)', () => {
    setMemoizedSelection('chat-1', 'k', files);
    expect(getMemoizedSelection('chat-1', 'k')).toBe(files);
  });

  it('misses when the key differs (inputs changed -> recompute)', () => {
    setMemoizedSelection('chat-1', 'k1', files);
    expect(getMemoizedSelection('chat-1', 'k2')).toBeUndefined();
  });

  it('isolates entries per conversation id', () => {
    setMemoizedSelection('chat-1', 'k', files);
    expect(getMemoizedSelection('chat-2', 'k')).toBeUndefined();
  });

  it('evicts the least-recently-used entry beyond the cap', () => {
    for (let i = 0; i < SELECTION_CACHE_MAX + 5; i++) {
      setMemoizedSelection(`chat-${i}`, 'k', files);
    }

    // The earliest inserted keys were evicted.
    expect(getMemoizedSelection('chat-0', 'k')).toBeUndefined();
    expect(getMemoizedSelection(`chat-${SELECTION_CACHE_MAX + 4}`, 'k')).toBe(files);
  });
});
