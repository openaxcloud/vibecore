import { describe, expect, it } from 'vitest';

import {
  CLOUD_RUN_MAX_JOBS_PER_PROJECT_REGION,
  CLOUD_RUN_MAX_SERVICES_PER_PROJECT_REGION,
  CLOUD_RUN_MAX_WORKER_POOLS_PER_PROJECT_REGION,
  DEFAULT_CAPACITY_POLICY,
  DEFAULT_TENANT_CAPACITY_POLICY,
  GCP_FOLDER_CREATE_PER_SECOND,
  GCP_MAX_FOLDERS_PER_PARENT,
  admitServicePlacement,
  estimateProvisioning,
  fitsUnderParentCap,
  planProjectPool,
  requiredProjectShards,
  requiredShardCount,
  servicesPerShardProject,
  shardForTenant,
} from './capacity-policy.js';

describe('verified GCP limits', () => {
  it('encodes the 300-children cap and 0.1 req/s creation rate', () => {
    expect(GCP_MAX_FOLDERS_PER_PARENT).toBe(300);
    expect(GCP_FOLDER_CREATE_PER_SECOND).toBe(0.1); // 6/min
    expect(DEFAULT_CAPACITY_POLICY.folderPerTenant).toBe(false); // NOT the default
  });
});

describe('sharding sizes every partition under the 300 cap', () => {
  it('1000 tenants → shards each under 300 with headroom', () => {
    const shardCount = requiredShardCount(1000);
    // 270/shard (300 - 10% margin) → ceil(1000/270) = 4 shards.
    expect(shardCount).toBe(4);
    // Each shard's tenant load stays under the cap.
    const perShard = Math.ceil(1000 / shardCount);
    expect(fitsUnderParentCap(perShard)).toBe(true);
    expect(perShard).toBeLessThan(GCP_MAX_FOLDERS_PER_PARENT);
  });

  it('places tenants deterministically and spreads them across shards', () => {
    const shardCount = requiredShardCount(1000);
    const a = shardForTenant('tenant-abc', shardCount);
    expect(a).toBe(shardForTenant('tenant-abc', shardCount)); // stable
    const buckets = new Set(Array.from({ length: 200 }, (_, i) => shardForTenant(`t-${i}`, shardCount)));
    expect(buckets.size).toBeGreaterThan(1); // actually spread, not all in one
  });
});

describe('the throughput wall the audit missed', () => {
  it('folder-per-tenant at 1000 tenants costs ~2.8h of pure rate-limit and is INADMISSIBLE by default', () => {
    const { sharded, folderPerTenant } = estimateProvisioning(1000);

    // Sharded: only 4 folder-creates → ~40s.
    expect(sharded.folderCreates).toBe(4);
    expect(sharded.rateLimitedSeconds).toBeCloseTo(40, 0);
    expect(sharded.admissible).toBe(true);

    // Folder-per-tenant: 1000 creates / 0.1 per s = 10000s ≈ 2.78h.
    expect(folderPerTenant.folderCreates).toBe(1000);
    expect(folderPerTenant.rateLimitedSeconds).toBe(10000);
    expect(folderPerTenant.rateLimitedSeconds / 3600).toBeCloseTo(2.78, 1);
    // Disabled by policy default → inadmissible, with an explicit reason.
    expect(folderPerTenant.admissible).toBe(false);
    expect(folderPerTenant.reason).toMatch(/disabled by policy/);
  });

  it('even WITH folder-per-tenant enabled, 1000 tenants is refused on time (>15 min)', () => {
    const policy = { ...DEFAULT_CAPACITY_POLICY, folderPerTenant: true };
    const { folderPerTenant } = estimateProvisioning(1000, policy);
    expect(folderPerTenant.admissible).toBe(false);
    expect(folderPerTenant.reason).toMatch(/rate-limit/);
  });

  it('a SMALL contractual folder-per-tenant (e.g. 30) IS admissible when enabled', () => {
    const policy = { ...DEFAULT_CAPACITY_POLICY, folderPerTenant: true };
    const { folderPerTenant } = estimateProvisioning(30, policy);
    expect(folderPerTenant.rateLimitedSeconds).toBe(300); // 5 min
    expect(folderPerTenant.admissible).toBe(true);
  });
});

describe('Cloud Run tenant capacity (claim GCP-15)', () => {
  it('encodes the verified 1000-per-project-per-region quotas', () => {
    expect(CLOUD_RUN_MAX_SERVICES_PER_PROJECT_REGION).toBe(1000);
    expect(CLOUD_RUN_MAX_JOBS_PER_PROJECT_REGION).toBe(1000);
    expect(CLOUD_RUN_MAX_WORKER_POOLS_PER_PROJECT_REGION).toBe(1000);
  });

  it('never plans to run a project at 100% of its quota', () => {
    expect(DEFAULT_TENANT_CAPACITY_POLICY.serviceUtilisationCeiling).toBeLessThan(1);
    expect(servicesPerShardProject()).toBe(800); // 1000 * 0.8
    expect(servicesPerShardProject()).toBeLessThan(CLOUD_RUN_MAX_SERVICES_PER_PROJECT_REGION);
  });

  it('sizes shard projects from the service count', () => {
    expect(requiredProjectShards(0)).toBe(0);
    expect(requiredProjectShards(800)).toBe(1);
    expect(requiredProjectShards(801)).toBe(2); // the ceiling actually bites
    expect(requiredProjectShards(5000)).toBe(7); // ceil(5000/800)
  });

  it('NEGATIVE: a shard project at its utilisation ceiling refuses the next service', () => {
    const ceiling = servicesPerShardProject();

    expect(admitServicePlacement(ceiling - 1).admissible).toBe(true);

    const refused = admitServicePlacement(ceiling);
    expect(refused.admissible).toBe(false);
    expect(refused.reason).toMatch(/ceiling is 800 of 1000/);
  });
});

describe('pre-created project pool (claim GCP-14)', () => {
  it('refills once the pool hits the low-water mark', () => {
    const healthy = planProjectPool({ free: 8 });
    expect(healthy.belowLowWaterMark).toBe(false);
    expect(healthy.createNow).toBe(0);
    expect(healthy.canServeFromPool).toBe(true);

    const lowWater = DEFAULT_TENANT_CAPACITY_POLICY.projectPoolLowWaterMark;
    const low = planProjectPool({ free: lowWater });
    expect(low.belowLowWaterMark).toBe(true);
    // free=3, target=10 → create 7 to get back to target.
    expect(low.createNow).toBe(DEFAULT_TENANT_CAPACITY_POLICY.projectPoolTargetSize - lowWater);
  });

  it('NEGATIVE: an empty pool cannot serve a tenant without paying creation latency', () => {
    const empty = planProjectPool({ free: 0 });
    expect(empty.canServeFromPool).toBe(false);
    expect(empty.belowLowWaterMark).toBe(true);
    expect(empty.createNow).toBe(DEFAULT_TENANT_CAPACITY_POLICY.projectPoolTargetSize);
  });
});
