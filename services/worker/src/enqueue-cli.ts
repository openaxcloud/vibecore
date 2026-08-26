#!/usr/bin/env node
/**
 * Tiny CLI that enqueues a single job into one of the worker's BullMQ queues
 * and exits. Used by the K8s CronJob templates so we don't ship a separate
 * scheduler service — the cluster's own kube-controller-manager owns the
 * cron schedule, this CLI is just the trigger.
 *
 * Usage:
 *   enqueue-cli --queue <name> --job <name> [--data '<json>']
 *
 * Exits non-zero on any failure (BullMQ refuses connection, queue name not
 * found, etc.) so the CronJob is marked Failed and the operator gets paged.
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const KNOWN_QUEUES = new Set(['workspace-jobs', 'enterprise-jobs', 'deploy-jobs']);

function assertKnownQueue(queue: string): void {
  if (!KNOWN_QUEUES.has(queue)) {
    throw new Error(`Unknown queue '${queue}'. Known queues: ${[...KNOWN_QUEUES].join(', ')}`);
  }
}

interface Parsed {
  queue: string;
  job: string;
  data: unknown;
}

function parseArgs(argv: string[]): Parsed {
  let queue = '';
  let job = '';
  let data: unknown = {};

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (flag === '--queue' && value) {
      queue = value;
      i += 1;
    } else if (flag === '--job' && value) {
      job = value;
      i += 1;
    } else if (flag === '--data' && value) {
      try {
        data = JSON.parse(value);
      } catch (error) {
        throw new Error(`--data must be valid JSON: ${(error as Error).message}`);
      }
      i += 1;
    } else if (flag === '-h' || flag === '--help') {
      process.stdout.write('Usage: enqueue-cli --queue <name> --job <name> [--data <json>]\n');
      process.exit(0);
    }
  }

  if (!queue) {
    throw new Error('--queue is required');
  }

  if (!job) {
    throw new Error('--job is required');
  }

  assertKnownQueue(queue);

  return { queue, job, data };
}

export async function enqueue(parsed: Parsed): Promise<string> {
  /*
   * Defense in depth: enqueue() is exported and can be called by tests, future
   * schedulers or operational code without going through parseArgs(). A typo
   * must fail before allocating Redis/BullMQ resources instead of silently
   * creating an orphan queue that no worker consumes.
   */
  assertKnownQueue(parsed.queue);

  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error('REDIS_URL is required to enqueue');
  }

  const connection = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });

  /*
   * An ioredis 'error' event with no listener is rethrown as an uncaught
   * exception (see startWorkers in index.ts). Swallow it so a Redis fault
   * surfaces as the queue.add() rejection handled below, not a process crash.
   */
  connection.on('error', () => {});

  const queue = new Queue(parsed.queue, { connection });

  try {
    /*
     * Real idempotency across CronJob retries. The K8s CronJob runs with
     * restartPolicy OnFailure + backoffLimit, so a process killed AFTER it
     * added the job but BEFORE it exited cleanly is retried — without a stable
     * jobId every retry minted a fresh auto-id and piled up duplicates (the old
     * "Idempotency" comment was aspirational, not real). ENQUEUE_DEDUP_KEY is
     * the K8s Job name (injected via the downward API in cronjobs.yaml): it is
     * identical across retries of the SAME scheduled run and distinct per
     * schedule, so BullMQ dedupes retries while still enqueuing each new tick.
     * When unset (manual CLI use) we keep the auto-id behaviour.
     *
     * The composed id must not contain ':' — BullMQ ≥5.76 rejects custom ids
     * with a colon ("Custom Id cannot contain :", it is the Redis key
     * separator). The previous `${job}:${dedupKey}` form made EVERY CronJob
     * enqueue fail from the 2026-07-09 bullmq bump until this fix; use '--'
     * and sanitize the key so a future label change can't re-break it.
     */
    const dedupKey = process.env.ENQUEUE_DEDUP_KEY?.trim().replaceAll(':', '-');

    const added = await queue.add(parsed.job, parsed.data, {
      ...(dedupKey ? { jobId: `${parsed.job.replaceAll(':', '-')}--${dedupKey}` } : {}),
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    });

    return added.id ?? '';
  } finally {
    await queue.close();
    await connection.quit();
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith('/enqueue-cli.js'));

if (invokedDirectly) {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const id = await enqueue(parsed);
    process.stdout.write(`${JSON.stringify({ event: 'enqueued', queue: parsed.queue, job: parsed.job, id })}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ event: 'enqueue.failed', error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    process.exit(1);
  }
}
