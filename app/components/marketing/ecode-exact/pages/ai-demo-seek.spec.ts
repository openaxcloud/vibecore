import { describe, expect, it, vi } from 'vitest';
import { playVideoAndSyncState, resolveSeekTime } from './ai-demo-seek';

describe('resolveSeekTime', () => {
  it('returns 0 when duration is not yet known (metadata not loaded)', () => {
    expect(resolveSeekTime(0.5, NaN)).toBe(0);
    expect(resolveSeekTime(0.5, 0)).toBe(0);
    expect(resolveSeekTime(0.5, Infinity)).toBe(0);
  });

  it('maps a fractional position onto the real duration', () => {
    // 72s clip (~1:12), like the shared platform-demo.mp4 asset.
    expect(resolveSeekTime(0, 72)).toBe(0);
    expect(resolveSeekTime(1 / 3, 72)).toBeCloseTo(24, 5);
    expect(resolveSeekTime(2 / 3, 72)).toBeCloseTo(48, 5);
  });

  it('never overshoots the clip — clamps strictly below the end', () => {
    /*
     * The old code used absolute cues (65s, 132s) that overshot a ~72s clip and
     * clamped to the tail. With fractional positions and end-margin clamping,
     * distinct cards resolve to distinct, in-bounds timestamps.
     */
    const duration = 72;
    const first = resolveSeekTime(1 / 3, duration);
    const second = resolveSeekTime(2 / 3, duration);

    expect(first).toBeLessThan(duration);
    expect(second).toBeLessThan(duration);
    expect(first).not.toBe(second);

    // A position of 1.0 must still stay below the absolute end.
    expect(resolveSeekTime(1, duration)).toBeLessThan(duration);
    expect(resolveSeekTime(1, duration)).toBe(duration - 0.5);
  });

  it('clamps out-of-range and non-finite positions into [0, 1]', () => {
    expect(resolveSeekTime(-5, 72)).toBe(0);
    expect(resolveSeekTime(2, 72)).toBe(72 - 0.5);
    expect(resolveSeekTime(NaN, 72)).toBe(0);
  });
});

describe('playVideoAndSyncState', () => {
  it('marks the video playing only after a resolved play() promise', async () => {
    const setIsVideoPlaying = vi.fn();
    const video = { play: vi.fn(() => Promise.resolve()) };

    const result = await playVideoAndSyncState(video, setIsVideoPlaying);

    expect(result).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(setIsVideoPlaying).toHaveBeenCalledTimes(1);
    expect(setIsVideoPlaying).toHaveBeenCalledWith(true);
  });

  it('reverts to not-playing when play() rejects (autoplay/decode/404)', async () => {
    const setIsVideoPlaying = vi.fn();
    const video = { play: vi.fn(() => Promise.reject(new DOMException('NotAllowedError'))) };

    const result = await playVideoAndSyncState(video, setIsVideoPlaying);

    /*
     * The original bug: state was set to true eagerly and the rejection was
     * swallowed, so the overlay stayed hidden with no way to restart.
     */
    expect(result).toBe(false);
    expect(setIsVideoPlaying).toHaveBeenCalledTimes(1);
    expect(setIsVideoPlaying).toHaveBeenCalledWith(false);
  });

  it('reverts to not-playing when play() throws synchronously', async () => {
    const setIsVideoPlaying = vi.fn();

    const video = {
      play: vi.fn(() => {
        throw new Error('boom');
      }),
    };

    const result = await playVideoAndSyncState(video, setIsVideoPlaying);

    expect(result).toBe(false);
    expect(setIsVideoPlaying).toHaveBeenCalledWith(false);
  });

  it('optimistically reports playing for legacy browsers returning undefined', async () => {
    const setIsVideoPlaying = vi.fn();
    const video = { play: vi.fn(() => undefined) };

    const result = await playVideoAndSyncState(video, setIsVideoPlaying);

    expect(result).toBe(true);
    expect(setIsVideoPlaying).toHaveBeenCalledWith(true);
  });
});
