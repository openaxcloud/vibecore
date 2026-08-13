import { describe, expect, it, vi } from 'vitest';
import { pollNetlifyDeploy } from './netlify-deploy-poll';

const noSleep = () => Promise.resolve();

describe('pollNetlifyDeploy', () => {
  it('returns ready when the deploy reaches a terminal ready state', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: 'ready', ssl_url: 'https://x.netlify.app' });

    const result = await pollNetlifyDeploy({ fetchStatus, maxAttempts: 5, sleep: noSleep });

    expect(result).toEqual({
      outcome: 'ready',
      status: { state: 'ready', ssl_url: 'https://x.netlify.app' },
      attempts: 1,
    });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('treats "uploaded" as a terminal ready state', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: 'uploaded' });

    const result = await pollNetlifyDeploy({ fetchStatus, maxAttempts: 5, sleep: noSleep });

    expect(result.outcome).toBe('ready');
  });

  it('returns error with the netlify error_message when the deploy errors', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: 'error', error_message: 'boom' });

    const result = await pollNetlifyDeploy({ fetchStatus, maxAttempts: 5, sleep: noSleep });

    expect(result).toEqual({ outcome: 'error', error: 'Deployment failed: boom', attempts: 1 });
  });

  it('polls through pending states until ready', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ state: 'building' })
      .mockResolvedValueOnce({ state: 'processing' })
      .mockResolvedValueOnce({ state: 'ready' });

    const result = await pollNetlifyDeploy({ fetchStatus, maxAttempts: 10, sleep: noSleep });

    expect(result.outcome).toBe('ready');
    expect(result.attempts).toBe(3);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  /*
   * This is the regression guard for the original bug: a persistently erroring
   * status endpoint must terminate as a timeout, not loop forever.
   */
  it('terminates as a timeout when the status fetch always throws', async () => {
    const fetchStatus = vi.fn().mockRejectedValue(new Error('HTTP 503'));
    const sleep = vi.fn(() => Promise.resolve());

    const result = await pollNetlifyDeploy({ fetchStatus, maxAttempts: 4, sleep });

    expect(result).toEqual({ outcome: 'timeout', attempts: 4 });

    // Every iteration advanced attempts: exactly maxAttempts fetches, no more.
    expect(fetchStatus).toHaveBeenCalledTimes(4);

    // No trailing sleep after the final, attempt-exhausting iteration.
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('terminates as a timeout when the deploy stays pending forever', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: 'building' });

    const result = await pollNetlifyDeploy({ fetchStatus, maxAttempts: 3, sleep: noSleep });

    expect(result).toEqual({ outcome: 'timeout', attempts: 3 });
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it('recovers when transient errors are followed by a ready state', async () => {
    const fetchStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ state: 'ready' });

    const result = await pollNetlifyDeploy({ fetchStatus, maxAttempts: 10, sleep: noSleep });

    expect(result.outcome).toBe('ready');
    expect(result.attempts).toBe(2);
  });

  it('uses the configured pending and error backoff delays', async () => {
    const sleep = vi.fn(() => Promise.resolve());

    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ state: 'building' })
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce({ state: 'ready' });

    await pollNetlifyDeploy({ fetchStatus, maxAttempts: 10, pendingDelayMs: 1000, errorDelayMs: 2000, sleep });

    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });
});
