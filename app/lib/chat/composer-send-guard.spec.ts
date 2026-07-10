import { describe, expect, it } from 'vitest';
import { classifySend, countResponseCompletions, isStreamStalled, STREAM_STALL_MS } from './composer-send-guard';

const NOW = 1_000_000_000;

describe('isStreamStalled', () => {
  it('is false while deltas are recent (active stream)', () => {
    expect(isStreamStalled(NOW - 1_000, NOW)).toBe(false);
  });

  it('is true once no delta has arrived for the stall window (dropped stream)', () => {
    expect(isStreamStalled(NOW - STREAM_STALL_MS - 1, NOW)).toBe(true);
  });

  it('treats missing/zero activity as stalled (never a phantom active stream)', () => {
    expect(isStreamStalled(0, NOW)).toBe(true);
    expect(isStreamStalled(Number.NaN, NOW)).toBe(true);
  });
});

describe('classifySend', () => {
  it('sends normally when nothing is loading', () => {
    expect(classifySend(false, 0, NOW)).toBe('send');
  });

  it('resets-and-sends (does NOT swallow) when isLoading is stuck on a stalled stream', () => {
    expect(classifySend(true, NOW - STREAM_STALL_MS - 1, NOW)).toBe('reset-and-send');
  });

  it('stops the active stream (recoverable, never silent) when a real stream is running', () => {
    expect(classifySend(true, NOW - 500, NOW)).toBe('stop-active');
  });
});

describe('countResponseCompletions', () => {
  const complete = { type: 'progress', label: 'response', status: 'complete', message: 'Response Generated' };

  it('returns 0 for non-array / empty data', () => {
    expect(countResponseCompletions(undefined)).toBe(0);
    expect(countResponseCompletions(null)).toBe(0);
    expect(countResponseCompletions([])).toBe(0);
  });

  it('counts only terminal response-complete progress annotations', () => {
    const data = [
      { type: 'progress', label: 'response', status: 'in-progress' },
      { type: 'progress', label: 'context', status: 'complete' },
      complete,
      'some-string',
      { type: 'other' },
    ];
    expect(countResponseCompletions(data)).toBe(1);
  });

  it('rises by one per turn so a fresh completion is detectable across turns', () => {
    const turn1 = [complete];
    const turn2 = [complete, { type: 'progress', label: 'response', status: 'in-progress' }, complete];
    expect(countResponseCompletions(turn1)).toBe(1);
    expect(countResponseCompletions(turn2)).toBe(2);
  });
});
