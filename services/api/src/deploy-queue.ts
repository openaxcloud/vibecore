import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

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
  framework?: string;
  timeoutSeconds: number;
  artifactSizeLimitMb?: number;
  envVars: Record<string, string>;
  injectSecrets: string[];
  branch?: string;
  commitSha?: string;
  customDomain?: string;
  previewDeployment: boolean;
  workspaceId?: string;
  machineSize?: string;
  runtimeKind?: 'autoscale' | 'reserved-vm';
  reservedVmTier?: 'shared-0.5' | 'dedicated-1' | 'dedicated-2' | 'dedicated-4';
  /** Resolved server-authoritative publication choices, persisted for exact recovery/replay. */
  publishRegion?: string;
  removeBrandingBadge?: boolean;
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

  /**
   * Stable operation identity for an in-place rebuild of the same Deployment.
   * Omitted for the original CREATE path so its historical BullMQ id is kept
   * byte-for-byte; present for REDEPLOY so a retained completed CREATE job cannot
   * swallow the new build.
   */
  operationKey?: string;

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
 * Deterministic BullMQ job id for a deployment's build. Keyed on the deployment
 * id so a retried POST / duplicate enqueue coalesces onto the same job instead
 * of kicking off a second build for the same row.
 *
 * MUST NOT contain ':' — BullMQ uses ':' as its Redis key separator and rejects
 * a custom job id that contains one ("Custom Id cannot contain :"). The previous
 * `deploy.build:<id>` form threw on EVERY enqueue, so the api answered every
 * static deploy with "Could not queue the build". A '-' separator is safe (the
 * job name keeps its '.' and the deployment id is a cuid — both colon-free).
 */
export function deployBuildJobId(deploymentId: string, operationKey?: string): string {
  const base = `${DEPLOY_BUILD_JOB}-${deploymentId}`;

  if (!operationKey) {
    return base;
  }

  /*
   * Idempotency keys may contain ':' (valid at the API boundary, forbidden by
   * BullMQ custom ids). Hashing also avoids leaking the caller key into Redis
   * key names while retaining deterministic exactly-once enqueue semantics.
   */
  const operationDigest = createHash('sha256').update(operationKey).digest('hex').slice(0, 32);
  return `${base}-operation-${operationDigest}`;
}

/**
 * Enqueue a durable `deploy.build` job. jobId is keyed on the deployment id so a
 * retried POST or a duplicate enqueue coalesces onto the same job instead of
 * kicking off a second build for the same deployment row.
 */
export async function enqueueDeployBuildJob(data: DeployBuildJobData): Promise<string> {
  const queue = getQueue();

  const job = await queue.add(DEPLOY_BUILD_JOB, data, {
    jobId: deployBuildJobId(data.deploymentId, data.operationKey),
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });

  return job.id ?? '';
}
