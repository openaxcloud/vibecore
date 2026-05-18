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

const KNOWN_QUEUES = new Set(['workspace-jobs', 'enterprise-jobs']);

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
  if (!KNOWN_QUEUES.has(queue)) {
    throw new Error(`Unknown queue '${queue}'. Known queues: ${[...KNOWN_QUEUES].join(', ')}`);
  }

  return { queue, job, data };
}

export async function enqueue(parsed: Parsed): Promise<string> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required to enqueue');
  }
  const connection = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  const queue = new Queue(parsed.queue, { connection });
  try {
    const added = await queue.add(parsed.job, parsed.data, {
      // Idempotency: a CronJob may retry; we don't want a flood of duplicate
      // jobs piling up if Redis briefly hiccups. removeOnComplete keeps the
      // queue lean; removeOnFail leaves failed jobs around for triage.
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
  typeof process.argv[1] === 'string' && (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith('/enqueue-cli.js'));

if (invokedDirectly) {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const id = await enqueue(parsed);
    process.stdout.write(`${JSON.stringify({ event: 'enqueued', queue: parsed.queue, job: parsed.job, id })}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: 'enqueue.failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exit(1);
  }
}
