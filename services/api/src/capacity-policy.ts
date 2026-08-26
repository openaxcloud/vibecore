/**
 * GCP resource-hierarchy capacity policy (DOMAIN_MODEL §3, audit v4 P0-#3).
 *
 * Two verified GCP Resource Manager limits drive this:
 *  - STRUCTURAL: "A parent folder cannot contain more than 300 folders"
 *    (direct children); max hierarchy depth 10.
 *  - THROUGHPUT (the real wall the audit missed): folder CREATION is rate-limited
 *    to ~0.1 requests/second = 6 folders per minute, per the Resource Manager
 *    write quota. The 300-children cap is dodged by SHARDING; the creation RATE
 *    is NOT — it is a hard serial ceiling. At 1000 tenants a folder-per-tenant
 *    layout costs ~1000/6 ≈ 167 min ≈ 2.8 h of pure rate-limit, before any real
 *    work.
 *
 * Therefore the DEFAULT is NOT folder-per-tenant. Tenants map onto a small,
 * fixed set of `shard-<n>` partitions, each sized under 300 children. A folder
 * per tenant is created ONLY on a measured contractual/policy requirement. A
 * `CapacityPolicy` carries BOTH the child-count quota AND the creation rate
 * limit, so provisioning can pace itself instead of hitting a 429 storm.
 *
 * Pure module — no GCP SDK — so the arithmetic is unit-testable.
 */

/** Verified Resource Manager limits. Overridable for tests / future changes. */
export const GCP_MAX_FOLDERS_PER_PARENT = 300;
export const GCP_MAX_HIERARCHY_DEPTH = 10;
/** Folder-creation write quota: 0.1 req/s = 6/min. */
export const GCP_FOLDER_CREATE_PER_SECOND = 0.1;

export interface CapacityPolicy {
  /** Max direct child folders per parent (structural). */
  maxChildrenPerParent: number;

  /** Folder-creation throughput ceiling (requests/second). */
  createPerSecond: number;

  /** Max hierarchy depth. */
  maxDepth: number;

  /**
   * Whether a dedicated folder-per-tenant is allowed. Default false — only a
   * measured contractual/policy requirement flips this on.
   */
  folderPerTenant: boolean;
}

export const DEFAULT_CAPACITY_POLICY: CapacityPolicy = {
  maxChildrenPerParent: GCP_MAX_FOLDERS_PER_PARENT,
  createPerSecond: GCP_FOLDER_CREATE_PER_SECOND,
  maxDepth: GCP_MAX_HIERARCHY_DEPTH,
  folderPerTenant: false,
};

/**
 * How many `shard-<n>` partitions are needed for `tenantCount` tenants, each
 * shard staying under the child cap with `safetyMargin` headroom (default 10%).
 * Shards are a FIXED small set — tenants map onto them, they are not created
 * per-tenant.
 */
export function requiredShardCount(
  tenantCount: number,
  policy: CapacityPolicy = DEFAULT_CAPACITY_POLICY,
  safetyMargin = 0.1,
): number {
  if (tenantCount <= 0) {
    return 0;
  }

  const perShard = Math.max(1, Math.floor(policy.maxChildrenPerParent * (1 - safetyMargin)));

  return Math.ceil(tenantCount / perShard);
}

/** Deterministic shard placement for a tenant id (stable across runs). */
export function shardForTenant(tenantId: string, shardCount: number): string {
  if (shardCount <= 0) {
    throw new Error('shardCount must be positive');
  }

  // FNV-1a over the id → stable bucket. (No Math.random — deterministic.)
  let hash = 0x811c9dc5;
  for (let i = 0; i < tenantId.length; i++) {
    hash ^= tenantId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `shard-${hash % shardCount}`;
}

export interface ProvisioningEstimate {
  /** Number of NEW folders this layout requires. */
  folderCreates: number;

  /** Seconds of pure rate-limit at the policy's creation ceiling. */
  rateLimitedSeconds: number;

  /** Whether this layout is admissible (fits structural + is not absurd on time). */
  admissible: boolean;

  reason?: string;
}

/**
 * Estimate the folder-creation cost of a layout. `folderPerTenant` exposes the
 * disaster the audit missed; the sharded default exposes the tiny fixed cost.
 */
export function estimateProvisioning(
  tenantCount: number,
  policy: CapacityPolicy = DEFAULT_CAPACITY_POLICY,
): { sharded: ProvisioningEstimate; folderPerTenant: ProvisioningEstimate } {
  const shardCount = requiredShardCount(tenantCount, policy);

  const sharded: ProvisioningEstimate = {
    // Only the fixed shard set is created — NOT one folder per tenant.
    folderCreates: shardCount,
    rateLimitedSeconds: shardCount / policy.createPerSecond,
    admissible: true,
  };

  const fptSeconds = tenantCount / policy.createPerSecond;
  const folderPerTenant: ProvisioningEstimate = {
    folderCreates: tenantCount,
    rateLimitedSeconds: fptSeconds,
    // Over ~15 min of pure rate-limit is operationally unacceptable as a default.
    admissible: policy.folderPerTenant && fptSeconds <= 900,
    reason: policy.folderPerTenant
      ? fptSeconds > 900
        ? `folder-per-tenant needs ${Math.round(fptSeconds / 60)} min of pure folder-creation rate-limit`
        : undefined
      : 'folder-per-tenant disabled by policy (default); enable only on a measured contractual requirement',
  };

  return { sharded, folderPerTenant };
}

/** Structural guard: does a proposed child count fit under the parent cap? */
export function fitsUnderParentCap(childCount: number, policy: CapacityPolicy = DEFAULT_CAPACITY_POLICY): boolean {
  return childCount <= policy.maxChildrenPerParent;
}

/* -------------------------------------------------------------------------- */
/* Cloud Run tenant capacity (P0-A2-14)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Verified Cloud Run quotas, claim GCP-15 (PUBLIC_BASELINE_REPLIT_2026.yaml):
 * "maximum 1000 services par projet et par région (augmentable) ; 1000 jobs ;
 * 1000 worker pools ; 1000 job executions en cours".
 *
 * These are the numbers that actually size the sharding — the folder limits above
 * govern the RESOURCE HIERARCHY, these govern how many tenant workloads fit in one
 * project+region before a new shard project is required.
 */
export const CLOUD_RUN_MAX_SERVICES_PER_PROJECT_REGION = 1000;
export const CLOUD_RUN_MAX_JOBS_PER_PROJECT_REGION = 1000;
export const CLOUD_RUN_MAX_WORKER_POOLS_PER_PROJECT_REGION = 1000;
export const CLOUD_RUN_MAX_RUNNING_JOB_EXECUTIONS = 1000;

/**
 * GCP-14 recommends a pool of PRE-CREATED projects, because creating and
 * initialising a project on the request path costs unacceptable latency. The pool
 * is refilled ahead of demand; `projectPoolLowWaterMark` is when refill starts.
 */
export interface TenantCapacityPolicy {
  /** Cloud Run services one project+region can hold (GCP-15). */
  maxServicesPerProjectRegion: number;

  /** Cloud Run jobs one project+region can hold (GCP-15). */
  maxJobsPerProjectRegion: number;

  /**
   * Fraction of a project's service quota we are willing to fill before shipping
   * tenants to the next shard. Quota is "augmentable" but not instantly, so we
   * never plan to run at 100%.
   */
  serviceUtilisationCeiling: number;

  /** Pre-created projects kept warm (GCP-14 pool recommendation). */
  projectPoolTargetSize: number;

  /** Refill the pool once free projects drop to this. */
  projectPoolLowWaterMark: number;
}

export const DEFAULT_TENANT_CAPACITY_POLICY: TenantCapacityPolicy = {
  maxServicesPerProjectRegion: CLOUD_RUN_MAX_SERVICES_PER_PROJECT_REGION,
  maxJobsPerProjectRegion: CLOUD_RUN_MAX_JOBS_PER_PROJECT_REGION,
  serviceUtilisationCeiling: 0.8,
  projectPoolTargetSize: 10,
  projectPoolLowWaterMark: 3,
};

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertTenantCapacityPolicy(policy: TenantCapacityPolicy): void {
  assertNonNegativeInteger(policy.maxServicesPerProjectRegion, 'maxServicesPerProjectRegion');
  assertNonNegativeInteger(policy.maxJobsPerProjectRegion, 'maxJobsPerProjectRegion');
  assertNonNegativeInteger(policy.projectPoolTargetSize, 'projectPoolTargetSize');
  assertNonNegativeInteger(policy.projectPoolLowWaterMark, 'projectPoolLowWaterMark');

  if (policy.maxServicesPerProjectRegion === 0 || policy.maxJobsPerProjectRegion === 0) {
    throw new RangeError('Cloud Run project quotas must be positive');
  }

  if (
    !Number.isFinite(policy.serviceUtilisationCeiling) ||
    policy.serviceUtilisationCeiling <= 0 ||
    policy.serviceUtilisationCeiling >= 1
  ) {
    throw new RangeError('serviceUtilisationCeiling must be in the interval (0, 1)');
  }

  if (policy.projectPoolLowWaterMark >= policy.projectPoolTargetSize) {
    throw new RangeError('projectPoolLowWaterMark must be lower than projectPoolTargetSize');
  }
}

/** Effective services per shard project once the utilisation ceiling is applied. */
export function servicesPerShardProject(policy: TenantCapacityPolicy = DEFAULT_TENANT_CAPACITY_POLICY): number {
  assertTenantCapacityPolicy(policy);
  return Math.max(1, Math.floor(policy.maxServicesPerProjectRegion * policy.serviceUtilisationCeiling));
}

/**
 * How many shard PROJECTS are needed to host `serviceCount` tenant Cloud Run
 * services in one region, at the policy's utilisation ceiling.
 */
export function requiredProjectShards(
  serviceCount: number,
  policy: TenantCapacityPolicy = DEFAULT_TENANT_CAPACITY_POLICY,
): number {
  assertNonNegativeInteger(serviceCount, 'serviceCount');

  if (serviceCount <= 0) {
    return 0;
  }

  return Math.ceil(serviceCount / servicesPerShardProject(policy));
}

export interface ProjectPoolState {
  /** Projects pre-created and not yet assigned to a tenant. */
  free: number;
}

export interface ProjectPoolPlan {
  /** Projects to create now to get back to target. */
  createNow: number;

  /** Whether the pool is below its low-water mark. */
  belowLowWaterMark: boolean;

  /** Whether a tenant can be placed WITHOUT paying project-creation latency. */
  canServeFromPool: boolean;
}

/**
 * Decide what the pre-created project pool needs. Keeps tenant onboarding off the
 * project-creation critical path (GCP-14).
 */
export function planProjectPool(
  state: ProjectPoolState,
  policy: TenantCapacityPolicy = DEFAULT_TENANT_CAPACITY_POLICY,
): ProjectPoolPlan {
  assertTenantCapacityPolicy(policy);
  assertNonNegativeInteger(state.free, 'free project count');
  const free = state.free;
  const belowLowWaterMark = free <= policy.projectPoolLowWaterMark;

  return {
    createNow: belowLowWaterMark ? Math.max(0, policy.projectPoolTargetSize - free) : 0,
    belowLowWaterMark,
    canServeFromPool: free > 0,
  };
}

export interface ServicePlacement {
  admissible: boolean;
  reasonCode?: 'CAPACITY_INPUT_INVALID' | 'CAPACITY_CEILING_REACHED';

  /** Structured operator diagnostics; public surfaces must localize separately. */
  details?: Readonly<Record<string, number>>;

  /** Shard project index the workload should land in. */
  shardIndex?: number;
}

/**
 * Structural guard for a new tenant Cloud Run service: does it fit in the given
 * shard project at the utilisation ceiling? Refuses BEFORE the API would 429.
 */
export function admitServicePlacement(
  currentServicesInShard: number,
  policy: TenantCapacityPolicy = DEFAULT_TENANT_CAPACITY_POLICY,
): ServicePlacement {
  let ceiling: number;

  try {
    assertNonNegativeInteger(currentServicesInShard, 'currentServicesInShard');
    ceiling = servicesPerShardProject(policy);
  } catch {
    return {
      admissible: false,
      reasonCode: 'CAPACITY_INPUT_INVALID',
    };
  }

  if (currentServicesInShard + 1 > ceiling) {
    return {
      admissible: false,
      reasonCode: 'CAPACITY_CEILING_REACHED',
      details: {
        currentServicesInShard,
        ceiling,
        maxServicesPerProjectRegion: policy.maxServicesPerProjectRegion,
        serviceUtilisationCeiling: policy.serviceUtilisationCeiling,
      },
    };
  }

  return { admissible: true };
}
