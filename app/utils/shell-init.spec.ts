import { describe, expect, it, vi } from 'vitest';
import { runSettlingReady } from './shell-init';

describe('runSettlingReady', () => {
  it('settles readiness on success', async () => {
    const settle = vi.fn();
    await runSettlingReady(async () => {
      /* successful init */
    }, settle);

    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('settles readiness when init throws, then re-throws', async () => {
    const settle = vi.fn();
    const boom = new Error('WORKSPACE_NOT_STARTED');

    await expect(
      runSettlingReady(async () => {
        throw boom;
      }, settle),
    ).rejects.toBe(boom);

    /* the critical regression: ready() must be released even on a spawn failure */
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('settles readiness when init rejects synchronously at the first await', async () => {
    const settle = vi.fn();

    await expect(runSettlingReady(() => Promise.reject(new Error('502')), settle)).rejects.toThrow('502');
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('does not settle more than once', async () => {
    const settle = vi.fn();
    await runSettlingReady(async () => {
      /* no-op */
    }, settle);

    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('keeps ready() pending until init completes', async () => {
    const settle = vi.fn();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const run = runSettlingReady(() => gate, settle);

    await Promise.resolve();
    expect(settle).not.toHaveBeenCalled();

    release();
    await run;
    expect(settle).toHaveBeenCalledTimes(1);
  });
});
