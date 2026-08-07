import { describe, expect, it, vi } from 'vitest';
import { isStaleHandle, withStaleRetry } from '../project-storage.js';

/*
 * Prod 2026-08-03: project-file listing (walkFiles) 500'd in bursts during
 * rollouts, all `errno -116` = ESTALE (stale NFS/overlay handle) on read. The
 * handle clears on re-open, so a couple of quick retries lisse the redeploy
 * blip. These tests pin: (1) ESTALE is detected by BOTH the mapped code and the
 * raw errno -116 (Node did not always map it); (2) retry recovers a transient
 * stale; (3) ENOENT is NEVER retried (must fall through to the TOCTOU skip).
 */
function err(over: { code?: string; errno?: number }): NodeJS.ErrnoException {
  return Object.assign(new Error(over.code ?? 'err'), over);
}

describe('isStaleHandle', () => {
  it("matches the mapped code 'ESTALE'", () => {
    expect(isStaleHandle(err({ code: 'ESTALE' }))).toBe(true);
  });

  it('matches the RAW errno -116 even when Node left the code unmapped', () => {
    expect(isStaleHandle(err({ code: 'Unknown system error -116', errno: -116 }))).toBe(true);
  });

  it('does NOT match ENOENT or other errors', () => {
    expect(isStaleHandle(err({ code: 'ENOENT', errno: -2 }))).toBe(false);
    expect(isStaleHandle(err({ code: 'EACCES', errno: -13 }))).toBe(false);
    expect(isStaleHandle(undefined)).toBe(false);
  });
});

describe('withStaleRetry', () => {
  it('recovers a transient ESTALE (fails once, then succeeds)', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(err({ code: 'ESTALE', errno: -116 }))
      .mockResolvedValueOnce('ok');
    await expect(withStaleRetry(op)).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('recovers when only the raw errno -116 is present', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(err({ code: 'Unknown system error -116', errno: -116 }))
      .mockResolvedValueOnce('ok');
    await expect(withStaleRetry(op)).resolves.toBe('ok');
  });

  it('never retries ENOENT — rethrows immediately (TOCTOU skip stays)', async () => {
    const op = vi.fn().mockRejectedValue(err({ code: 'ENOENT', errno: -2 }));
    await expect(withStaleRetry(op)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('gives up after `attempts` on a persistent ESTALE and rethrows it', async () => {
    const op = vi.fn().mockRejectedValue(err({ code: 'ESTALE', errno: -116 }));
    await expect(withStaleRetry(op, 3)).rejects.toMatchObject({ errno: -116 });
    expect(op).toHaveBeenCalledTimes(3);
  });
});
