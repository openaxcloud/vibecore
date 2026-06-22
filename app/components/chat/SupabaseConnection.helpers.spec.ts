import { describe, it, expect, vi } from 'vitest';
import { refreshSupabaseProjects } from './SupabaseConnection.helpers';

describe('refreshSupabaseProjects', () => {
  it('resolves and reports no error when the fetch succeeds', async () => {
    const onError = vi.fn();
    const logError = vi.fn();
    const fetchStats = vi.fn(async (_token: string) => ({ stats: {} }));

    await refreshSupabaseProjects(fetchStats, 'good-token', { onError, logError });

    expect(fetchStats).toHaveBeenCalledWith('good-token');
    expect(onError).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('swallows a rejection (expired/revoked token) instead of leaking it', async () => {
    const thrown = new Error('Failed to fetch projects');
    const onError = vi.fn();
    const logError = vi.fn();

    const fetchStats = vi.fn(async (_token: string) => {
      throw thrown;
    });

    // The returned promise must resolve, never reject — proving no unhandled rejection.
    await expect(refreshSupabaseProjects(fetchStats, 'expired', { onError, logError })).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(thrown);
    expect(onError).toHaveBeenCalledWith(thrown);
  });

  it('does not leak an unhandled rejection at the process level', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    try {
      const fetchStats = async () => {
        throw new Error('boom');
      };

      // Fire-and-forget exactly like the onClick handler does.
      refreshSupabaseProjects(fetchStats, 'expired', { logError: () => {} });

      // Give the microtask queue a chance to flush any unhandled rejection.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('works when no options are provided', async () => {
    const fetchStats = async () => {
      throw new Error('boom');
    };

    await expect(refreshSupabaseProjects(fetchStats, 'expired')).resolves.toBeUndefined();
  });
});
