import { describe, expect, it, beforeEach } from 'vitest';
import type { FileMap } from './constants';
import {
  __clearSelectionCache,
  __clearSummaryCache,
  anchoredHistoryDrop,
  computeSelectionCacheKey,
  computeSummaryCacheKey,
  estimateMessagesTokens,
  getMemoizedSelection,
  getMemoizedSummary,
  setMemoizedSelection,
  setMemoizedSummary,
  shouldGenerateSummary,
  HISTORY_WINDOW_STEP,
  SELECTION_CACHE_MAX,
  SUMMARY_CACHE_MAX,
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

describe('anchoredHistoryDrop (cache-max: append-only history window)', () => {
  const STEP = 5;
  const N = 2;

  it('drops nothing while the whole history fits the recent window', () => {
    expect(anchoredHistoryDrop(0, N, STEP)).toBe(0);
    expect(anchoredHistoryDrop(N, N, STEP)).toBe(0);
  });

  it('quantizes the surplus DOWN to a multiple of step (start pinned within a palier)', () => {
    // total 3..6 → rawDrop 1..4 (< step) → drop 0 (keep all, start unmoved).
    for (let total = N + 1; total < N + STEP; total++) {
      expect(anchoredHistoryDrop(total, N, STEP)).toBe(0);
    }

    // total 7..11 → rawDrop 5..9 → drop exactly one step (5).
    for (let total = N + STEP; total < N + 2 * STEP; total++) {
      expect(anchoredHistoryDrop(total, N, STEP)).toBe(STEP);
    }

    // total 12 → rawDrop 10 → two steps (10).
    expect(anchoredHistoryDrop(N + 2 * STEP, N, STEP)).toBe(2 * STEP);
  });

  it('is monotonic non-decreasing and advances by whole steps only', () => {
    let prev = 0;

    for (let total = 0; total <= 60; total++) {
      const drop = anchoredHistoryDrop(total, N, STEP);
      expect(drop % STEP).toBe(0);
      expect(drop).toBeGreaterThanOrEqual(prev);
      prev = drop;
    }
  });

  it('degenerates to a plain sliding window when step ≤ 1', () => {
    expect(anchoredHistoryDrop(10, N, 1)).toBe(10 - N);
    expect(anchoredHistoryDrop(10, N, 0)).toBe(10 - N);
  });

  it('defaults step to HISTORY_WINDOW_STEP', () => {
    expect(anchoredHistoryDrop(50, N)).toBe(anchoredHistoryDrop(50, N, HISTORY_WINDOW_STEP));
  });
});

describe('summary memo (frozen on the anchored palier)', () => {
  beforeEach(() => __clearSummaryCache());

  const dropped = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: `c${i}` }));

  it('key is stable for the same dropped prefix and changes when the prefix grows (palier jump)', () => {
    const k3 = computeSummaryCacheKey({ droppedMessages: dropped(3) });
    const k3b = computeSummaryCacheKey({ droppedMessages: dropped(3) });
    const k8 = computeSummaryCacheKey({ droppedMessages: dropped(8) });
    expect(k3).toBe(k3b);
    expect(k3).not.toBe(k8);
  });

  it('key changes when an older (dropped) message is edited (invalidates a stale summary)', () => {
    const original = dropped(4);
    const edited = dropped(4);
    edited[1] = { ...edited[1], content: 'EDITED' };
    expect(computeSummaryCacheKey({ droppedMessages: original })).not.toBe(
      computeSummaryCacheKey({ droppedMessages: edited }),
    );
  });

  it('reuses the summary within a palier and misses across a palier jump', () => {
    const key = computeSummaryCacheKey({ droppedMessages: dropped(5) });
    expect(getMemoizedSummary('chat-1', key)).toBeUndefined(); // cold miss
    setMemoizedSummary('chat-1', key, 'SUMMARY-A');
    expect(getMemoizedSummary('chat-1', key)).toBe('SUMMARY-A'); // palier hit

    const nextKey = computeSummaryCacheKey({ droppedMessages: dropped(10) });
    expect(getMemoizedSummary('chat-1', nextKey)).toBeUndefined(); // palier jumped → regenerate
  });

  it('isolates summaries per conversation and evicts LRU beyond the cap', () => {
    setMemoizedSummary('chat-a', 'k', 'S');
    expect(getMemoizedSummary('chat-b', 'k')).toBeUndefined();

    for (let i = 0; i < SUMMARY_CACHE_MAX + 5; i++) {
      setMemoizedSummary(`c-${i}`, 'k', 'S');
    }
    expect(getMemoizedSummary('c-0', 'k')).toBeUndefined();
    expect(getMemoizedSummary(`c-${SUMMARY_CACHE_MAX + 4}`, 'k')).toBe('S');
  });
});
