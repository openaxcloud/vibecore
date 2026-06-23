import { describe, expect, it, vi } from 'vitest';
import { COARSE_POINTER_QUERY, resolveCoarsePointer } from './HistoryItem';

describe('resolveCoarsePointer', () => {
  it('returns false when no window is provided (SSR)', () => {
    expect(resolveCoarsePointer(undefined)).toBe(false);
  });

  it('returns false when matchMedia is unavailable', () => {
    expect(resolveCoarsePointer({} as unknown as typeof globalThis)).toBe(false);
  });

  it('queries the coarse-pointer media feature', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });

    const result = resolveCoarsePointer({ matchMedia } as unknown as typeof globalThis);

    expect(matchMedia).toHaveBeenCalledWith(COARSE_POINTER_QUERY);
    expect(result).toBe(true);
  });

  it('returns false for hover-capable (fine pointer) devices', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: false });

    expect(resolveCoarsePointer({ matchMedia } as unknown as typeof globalThis)).toBe(false);
  });

  it('does not throw if matchMedia throws', () => {
    const matchMedia = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });

    expect(resolveCoarsePointer({ matchMedia } as unknown as typeof globalThis)).toBe(false);
  });
});
