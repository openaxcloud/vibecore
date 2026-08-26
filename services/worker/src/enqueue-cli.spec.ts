import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * We import a private function for parse-arg testing via the same module URL.
 * The enqueue() side-effect (actually opening a Redis connection) is covered
 * by integration tests that run with REDIS_URL set in CI.
 */

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
    ).rejects.toThrow("Unknown queue 'imaginary-queue'. Known queues: workspace-jobs, enterprise-jobs, deploy-jobs");
  });

  it('throws when REDIS_URL is missing', async () => {
    const { enqueue } = await import('./enqueue-cli.js');
    await expect(enqueue({ queue: 'enterprise-jobs', job: 'siem.deliver', data: {} })).rejects.toThrowError(
      /REDIS_URL is required/,
    );
  });
});

/*
 * BullMQ ≥5.76 throws "Custom Id cannot contain :" — the `${job}:${dedupKey}`
 * id form silently killed EVERY platform CronJob enqueue in prod (workspace.gc,
 * deploy.reap, siem.deliver…) from the 2026-07-09 bullmq bump. Lock the
 * composed id shape down with a real assertion on what reaches queue.add.
 */
describe('enqueue-cli dedup jobId', () => {
  const addCalls: Array<{ name: string; opts: Record<string, unknown> }> = [];

  beforeEach(() => {
    addCalls.length = 0;
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    vi.doMock('bullmq', () => ({
      Queue: class {
        async add(name: string, _data: unknown, opts: Record<string, unknown>) {
          addCalls.push({ name, opts });
          return { id: (opts.jobId as string) ?? 'auto' };
        }
        async close() {}
      },
    }));
    vi.doMock('ioredis', () => ({
      Redis: class {
        on() {}
        async quit() {}
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('bullmq');
    vi.doUnmock('ioredis');
    vi.resetModules();
    delete (process.env as Record<string, string | undefined>).ENQUEUE_DEDUP_KEY;

    if (ORIGINAL_REDIS_URL !== undefined) {
      process.env.REDIS_URL = ORIGINAL_REDIS_URL;
    } else {
      delete (process.env as Record<string, string | undefined>).REDIS_URL;
    }
  });

  it('never composes a jobId containing ":" (BullMQ rejects it)', async () => {
    process.env.ENQUEUE_DEDUP_KEY = 'vibecore-vibecore-platform-cron-workspace-gc-29736255';
    vi.resetModules();

    const { enqueue } = await import('./enqueue-cli.js');

    const id = await enqueue({ queue: 'workspace-jobs', job: 'workspace.gc', data: {} });

    expect(addCalls).toHaveLength(1);
    expect(addCalls[0].opts.jobId).toBe('workspace.gc--vibecore-vibecore-platform-cron-workspace-gc-29736255');
    expect(String(addCalls[0].opts.jobId)).not.toContain(':');
    expect(id).toBe('workspace.gc--vibecore-vibecore-platform-cron-workspace-gc-29736255');
  });

  it('sanitizes a dedup key that itself contains ":"', async () => {
    process.env.ENQUEUE_DEDUP_KEY = 'weird:label:value';
    vi.resetModules();

    const { enqueue } = await import('./enqueue-cli.js');

    await enqueue({ queue: 'workspace-jobs', job: 'workspace.gc', data: {} });

    expect(String(addCalls[0].opts.jobId)).not.toContain(':');
  });

  it('keeps the auto-id behaviour when ENQUEUE_DEDUP_KEY is unset', async () => {
    vi.resetModules();

    const { enqueue } = await import('./enqueue-cli.js');

    await enqueue({ queue: 'workspace-jobs', job: 'workspace.gc', data: {} });

    expect(addCalls[0].opts.jobId).toBeUndefined();
  });
});
