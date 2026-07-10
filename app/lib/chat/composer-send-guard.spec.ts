import { describe, expect, it } from 'vitest';
import { classifySend, isStreamStalled, STREAM_STALL_MS } from './composer-send-guard';

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
