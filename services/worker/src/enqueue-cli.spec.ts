import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We import a private function for parse-arg testing via the same module URL.
// The enqueue() side-effect (actually opening a Redis connection) is covered
// by integration tests that run with REDIS_URL set in CI.

const ORIGINAL_REDIS_URL = process.env.REDIS_URL;
const ORIGINAL_ARGV = process.argv;

describe('enqueue-cli arg parsing', () => {
  beforeEach(() => {
    delete (process.env as Record<string, string | undefined>).REDIS_URL;
    process.argv = ['node', '/path/to/enqueue-cli.js'];
  });

  afterEach(() => {
    if (ORIGINAL_REDIS_URL !== undefined) {
      process.env.REDIS_URL = ORIGINAL_REDIS_URL;
    }
    process.argv = ORIGINAL_ARGV;
    vi.restoreAllMocks();
  });

  it('rejects unknown queue names with a clear error', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const { enqueue } = await import('./enqueue-cli.js');

    await expect(
      enqueue({ queue: 'imaginary-queue', job: 'whatever', data: {} } as Parameters<typeof enqueue>[0]),
    ).rejects.toThrow();
  });

  it('throws when REDIS_URL is missing', async () => {
    const { enqueue } = await import('./enqueue-cli.js');
    await expect(enqueue({ queue: 'enterprise-jobs', job: 'siem.deliver', data: {} })).rejects.toThrowError(
      /REDIS_URL is required/,
    );
  });
});
