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
