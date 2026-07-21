import { describe, expect, it } from 'vitest';
import { createInMemoryCloudGovernanceStore, FakeGcpCloudClient } from './tests/cloud-governance-fakes.js';
import {
  advanceCloudProjectBinding,
  assertFactoryTransition,
  executeTeardown,
  markPurged,
  requestTeardown,
  resolveCustomerShardFolder,
  restoreFromRecoveryWindow,
  SHARD_CAPACITY,
  verifyTeardown,
} from './cloud-project-factory.js';
import { bindProjectToTenant, createCloudTenant } from './cloud-tenant-service.js';

const OPTS = { billingAccountId: '000000-AAAAAA-BBBBBB', parent: 'folders/999' };

async function seed(projectId = 'pj-factory') {
  const store = createInMemoryCloudGovernanceStore();
  const gcp = new FakeGcpCloudClient();
  const tenant = await createCloudTenant(store, {
    customerBoundaryType: 'WORKSPACE',
    ownerPrincipalId: 'user:owner@example.com',
    billingPrincipalId: 'user:owner@example.com',
  });
  const binding = await bindProjectToTenant(store, {
    cloudTenantId: tenant.id,
    gcpProjectId: projectId,
    region: 'europe-west9',
  });

  return { store, gcp, tenant, binding };
}

async function advanceToActive(ctx: Awaited<ReturnType<typeof seed>>) {
  // REQUESTED→CREATING→BILLING_LINKED→APIS_ENABLING→SERVICE_AGENTS_READY→IAM_BOUND→EDGE_READY→ACTIVE
  for (let i = 0; i < 7; i += 1) {
    await advanceCloudProjectBinding(ctx.store, ctx.gcp, ctx.binding.id, OPTS);
  }

  return (await ctx.store.getCloudProjectBinding(ctx.binding.id))!;
}

describe('factory state machine', () => {
  it('rejects transitions outside the contract', () => {
    expect(() => assertFactoryTransition('REQUESTED', 'ACTIVE')).toThrowError(/cannot go/);
    expect(() => assertFactoryTransition('ACTIVE', 'CREATING')).toThrowError(/cannot go/);
    expect(() => assertFactoryTransition('PURGED', 'ACTIVE')).toThrowError(/cannot go/);
    expect(() => assertFactoryTransition('RECOVERY_WINDOW', 'RESTORING')).not.toThrow();
  });

  it('walks REQUESTED→ACTIVE step by step against the (fake) control plane, with an audit event per transition', async () => {
    const ctx = await seed();
    const final = await advanceToActive(ctx);

    expect(final.state).toBe('ACTIVE');
    expect(final.gcpProjectNumber).toBeTruthy();

    const project = ctx.gcp.projects.get('pj-factory')!;
    expect(project.billingEnabled).toBe(true);
    expect(project.enabledServices.has('iam.googleapis.com')).toBe(true);

    // Tenant owner got read-only baseline, nothing more.
    const viewer = project.policy.bindings?.find((b) => b.role === 'roles/viewer');
    expect(viewer?.members).toContain('user:owner@example.com');

    const events = await ctx.store.listFactoryEvents(ctx.binding.id);
    expect(events.map((e) => e.toState)).toEqual([
      'CREATING',
      'BILLING_LINKED',
      'APIS_ENABLING',
      'SERVICE_AGENTS_READY',
      'IAM_BOUND',
      'EDGE_READY',
      'ACTIVE',
    ]);
  });

  it('refuses to advance a binding that is not in the forward pipeline', async () => {
    const ctx = await seed();
    await advanceToActive(ctx);

    await expect(advanceCloudProjectBinding(ctx.store, ctx.gcp, ctx.binding.id, OPTS)).rejects.toMatchObject({
      code: 'FACTORY_NOT_ADVANCEABLE',
    });
  });
});

describe('teardown — inventory, erasure proof, orphan detection', () => {
  it('captures the inventory BEFORE deleting, then proves erasure', async () => {
    const ctx = await seed('pj-teardown');
    await advanceToActive(ctx);
    ctx.gcp.projects.get('pj-teardown')!.buckets.add('vc-data-1');

    const { teardown } = await requestTeardown(ctx.store, ctx.gcp, ctx.binding.id);
    const inventory = teardown.resourceInventory as Array<{ kind: string; name: string }>;
    expect(inventory.some((i) => i.kind === 'bucket' && i.name === 'vc-data-1')).toBe(true);

    const binding = await executeTeardown(ctx.store, ctx.gcp, ctx.binding.id);
    expect(binding.state).toBe('RECOVERY_WINDOW');
    expect(binding.recoveryWindowEndsAt).toBeInstanceOf(Date);

    const { teardown: verified, orphans } = await verifyTeardown(ctx.store, ctx.gcp, teardown.id);
    expect(orphans).toEqual([]);
    expect(verified.status).toBe('COMPLETE');

    const proof = verified.erasureProof as { projectState: string; projectErased: boolean };
    expect(proof.projectErased).toBe(true);
    expect(proof.projectState).toBe('DELETE_REQUESTED');
  });

  it('flags a surviving resource as an ORPHAN instead of silently completing', async () => {
    const ctx = await seed('pj-orphan');
    await advanceToActive(ctx);
    ctx.gcp.projects.get('pj-orphan')!.buckets.add('vc-leak');

    const { teardown } = await requestTeardown(ctx.store, ctx.gcp, ctx.binding.id);

    // Verify BEFORE anything was deleted: the project is alive, the bucket too.
    const { teardown: verified, orphans } = await verifyTeardown(ctx.store, ctx.gcp, teardown.id);
    expect(orphans.map((o) => o.name)).toContain('vc-leak');
    expect(verified.status).toBe('ORPHANS_DETECTED');
    expect(verified.completedAt).toBeNull();
  });

  it('teardown of a non-DELETE_REQUESTED binding is refused', async () => {
    const ctx = await seed('pj-early');

    await expect(executeTeardown(ctx.store, ctx.gcp, ctx.binding.id)).rejects.toMatchObject({
      code: 'FACTORY_TEARDOWN_NOT_REQUESTED',
    });
  });

  it('respects the recovery window: purge refused while open, restore returns to ACTIVE', async () => {
    const ctx = await seed('pj-window');
    await advanceToActive(ctx);
    await requestTeardown(ctx.store, ctx.gcp, ctx.binding.id);
    await executeTeardown(ctx.store, ctx.gcp, ctx.binding.id);

    await expect(markPurged(ctx.store, ctx.binding.id)).rejects.toMatchObject({
      code: 'FACTORY_RECOVERY_WINDOW_OPEN',
    });

    const restored = await restoreFromRecoveryWindow(ctx.store, ctx.gcp, ctx.binding.id);
    expect(restored.state).toBe('ACTIVE');
    expect(restored.recoveryWindowEndsAt).toBeNull();
    expect(ctx.gcp.projects.get('pj-window')!.info.state).toBe('ACTIVE');
  });

  it('keeps the binding row after PURGED — project IDs are never reusable', async () => {
    const ctx = await seed('pj-purge');
    await advanceToActive(ctx);
    await requestTeardown(ctx.store, ctx.gcp, ctx.binding.id);
    await executeTeardown(ctx.store, ctx.gcp, ctx.binding.id);
    await ctx.store.updateCloudProjectBinding(ctx.binding.id, { recoveryWindowEndsAt: new Date(Date.now() - 1000) });

    const purged = await markPurged(ctx.store, ctx.binding.id);
    expect(purged.state).toBe('PURGED');

    // The name reservation holds: rebinding the same project id is refused.
    await expect(
      bindProjectToTenant(ctx.store, {
        cloudTenantId: ctx.tenant.id,
        gcpProjectId: 'pj-purge',
        role: 'QUOTA_SHARD',
        region: 'europe-west9',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('customer shard folders — shared, capped, never per-tenant', () => {
  it('reuses the first shard with capacity', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const gcp = new FakeGcpCloudClient();
    const shard0 = await gcp.createFolder('folders/customers', 'shard-0');

    const resolved = await resolveCustomerShardFolder(store, gcp, 'folders/customers');
    expect(resolved).toEqual({ folderId: shard0.name, created: false });
  });

  it('creates the next shard ONLY when every existing shard is at capacity', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const gcp = new FakeGcpCloudClient();
    const shard0 = await gcp.createFolder('folders/customers', 'shard-0');
    store.countCloudProjectBindingsInFolder = async (folder: string) => (folder === shard0.name ? SHARD_CAPACITY : 0);

    const resolved = await resolveCustomerShardFolder(store, gcp, 'folders/customers');
    expect(resolved.created).toBe(true);

    const folders = await gcp.listFolders('folders/customers');
    expect(folders.map((f) => f.displayName)).toContain('shard-1');
  });

  it('surfaces the measured GCP folder-creation rate limit as a typed 429', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const gcp = new FakeGcpCloudClient();
    gcp.folderRateLimited = true;

    await expect(resolveCustomerShardFolder(store, gcp, 'folders/customers')).rejects.toMatchObject({
      code: 'FOLDER_CREATE_RATE_LIMITED',
      statusCode: 429,
    });
  });
});
