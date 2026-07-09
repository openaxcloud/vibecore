import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/*
 * Durable enqueue path for static deploy builds (#26). The deploy POST persists
 * the deployment row as QUEUED and enqueues ONE BullMQ job here, then returns 202
 * immediately — it never awaits the build in the request handler. The worker
 * consumes `deploy.build` and drives the build via the api's internal build
 * endpoint; the reaper fails anything that stalls. Redis (the BullMQ queue) is the
 * durable backing store, so a build survives an api-pod restart: the job is
 * retried by the worker rather than orphaned mid-request as it used to be.
 */
export const DEPLOY_QUEUE_NAME = 'deploy-jobs';
export const DEPLOY_BUILD_JOB = 'deploy.build';

export interface DeployBuildJobInput {
  provider: string;
  environment: string;
  buildCommand: string;
  outputDirectory: string;
  timeoutSeconds: number;
  artifactSizeLimitMb?: number;
  envVars: Record<string, string>;
  injectSecrets: string[];
  branch?: string;
  commitSha?: string;
  customDomain?: string;
  previewDeployment: boolean;
  workspaceId?: string;
  githubIntegration?: { repositoryUrl?: string; branch?: string };
  /**
   * The resolved secondary-workspace id (undefined for the primary workspace).
   * Carried on the job so the worker-triggered build reproduces the same build
   * CWD the request handler would have used.
   */
  secondaryWorkspaceId?: string;
}

export interface DeployBuildJobData {
  projectId: string;
  deploymentId: string;
  /** Owner/actor id so the worker-triggered build can reach the right workspace pod. */
  userId?: string;
  buildInput: DeployBuildJobInput;
}

let sharedConnection: Redis | undefined;
let sharedQueue: Queue | undefined;

function getQueue(): Queue {
  if (sharedQueue) {
    return sharedQueue;
  }

  const url = process.env.REDIS_URL;

  if (!url) {
    throw Object.assign(new Error('REDIS_URL is required to enqueue a deploy build'), {
      code: 'DEPLOY_QUEUE_UNAVAILABLE',
    });
  }

  sharedConnection = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });

  /*
   * An ioredis 'error' event with no listener is rethrown as an uncaught
   * exception (see the worker's startWorkers). Swallow it so a transient Redis
   * fault surfaces as the queue.add() rejection the caller handles, not a crash.
   */
  sharedConnection.on('error', () => {});

  sharedQueue = new Queue(DEPLOY_QUEUE_NAME, { connection: sharedConnection });

  return sharedQueue;
}

/**
 * Enqueue a durable `deploy.build` job. jobId is keyed on the deployment id so a
 * retried POST or a duplicate enqueue coalesces onto the same job instead of
 * kicking off a second build for the same deployment row.
 */
export async function enqueueDeployBuildJob(data: DeployBuildJobData): Promise<string> {
  const queue = getQueue();

  const job = await queue.add(DEPLOY_BUILD_JOB, data, {
    jobId: `${DEPLOY_BUILD_JOB}:${data.deploymentId}`,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });

  return job.id ?? '';
}
