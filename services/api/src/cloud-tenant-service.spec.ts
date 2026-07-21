import { describe, expect, it } from 'vitest';
import { createInMemoryCloudGovernanceStore, FakeGcpCloudClient } from './cloud-governance-fakes.js';
import type { CloudTenantTransfer } from './cloud-governance-store.js';
import {
  assertRegrantAllowed,
  assertTenantLifecycleTransition,
  bindProjectToTenant,
  CloudTenantError,
  createCloudTenant,
  mergeCloudTenants,
  splitCloudTenant,
  suspendCloudTenant,
  transferTenantOwnership,
} from './cloud-tenant-service.js';

const OWNER_A = 'user:alice@example.com';
const OWNER_B = 'user:bob@example.com';

async function makeTenant(store: ReturnType<typeof createInMemoryCloudGovernanceStore>, owner = OWNER_A) {
  return createCloudTenant(store, {
    customerBoundaryType: 'PERSON',
    ownerPrincipalId: owner,
    billingPrincipalId: owner,
  });
}

describe('I-TEN-1 — a GCP project is never shared between two tenants', () => {
  it('refuses binding a project already bound to ANOTHER tenant (409 TENANT_PROJECT_CONFLICT)', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const tenantA = await makeTenant(store, OWNER_A);
    const tenantB = await makeTenant(store, OWNER_B);

    await bindProjectToTenant(store, { cloudTenantId: tenantA.id, gcpProjectId: 'pj-shared', region: 'europe-west9' });

    await expect(
      bindProjectToTenant(store, { cloudTenantId: tenantB.id, gcpProjectId: 'pj-shared', region: 'europe-west9' }),
    ).rejects.toMatchObject({ code: 'TENANT_PROJECT_CONFLICT', statusCode: 409 });
  });

  it('translates a raced unique-constraint violation (P2002) into the same typed refusal', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const tenantA = await makeTenant(store, OWNER_A);
    const tenantB = await makeTenant(store, OWNER_B);

    // Simulate the race: the pre-check misses, the DB constraint holds.
    const original = store.findCloudProjectBindingByProject.bind(store);
    store.findCloudProjectBindingByProject = async () => null;
    await bindProjectToTenant(store, { cloudTenantId: tenantA.id, gcpProjectId: 'pj-race', region: 'europe-west9' });

    await expect(
      bindProjectToTenant(store, { cloudTenantId: tenantB.id, gcpProjectId: 'pj-race', region: 'europe-west9' }),
    ).rejects.toMatchObject({ code: 'TENANT_PROJECT_CONFLICT', statusCode: 409 });

    store.findCloudProjectBindingByProject = original;
  });

  it('refuses re-binding the same project to the SAME tenant (idempotence is explicit, not silent)', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const tenant = await makeTenant(store);

    await bindProjectToTenant(store, { cloudTenantId: tenant.id, gcpProjectId: 'pj-dup', region: 'europe-west9' });

    await expect(
      bindProjectToTenant(store, { cloudTenantId: tenant.id, gcpProjectId: 'pj-dup', region: 'europe-west9' }),
    ).rejects.toMatchObject({ code: 'PROJECT_ALREADY_BOUND' });
  });

  it('enforces one live PRIMARY per tenant by default', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const tenant = await makeTenant(store);

    await bindProjectToTenant(store, { cloudTenantId: tenant.id, gcpProjectId: 'pj-1', region: 'europe-west9' });

    await expect(
      bindProjectToTenant(store, { cloudTenantId: tenant.id, gcpProjectId: 'pj-2', region: 'europe-west9' }),
    ).rejects.toMatchObject({ code: 'TENANT_PRIMARY_EXISTS' });

    // Non-primary roles remain available.
    const shard = await bindProjectToTenant(store, {
      cloudTenantId: tenant.id,
      gcpProjectId: 'pj-2',
      role: 'REGION_SHARD',
      region: 'us-central1',
    });
    expect(shard.role).toBe('REGION_SHARD');
  });
});

describe('ownership transfer — revoke then re-grant, never rename', () => {
  it('REFUSES re-granting before a verified revocation (every pre-REVOKED state)', () => {
    const base: CloudTenantTransfer = {
      id: 't',
      cloudTenantId: 'x',
      fromPrincipalId: OWNER_A,
      toPrincipalId: OWNER_B,
      state: 'REQUESTED',
      revokeEvidence: null,
      revokeVerifiedAt: null,
      regrantEvidence: null,
      error: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    for (const state of ['REQUESTED', 'REVOKING', 'REGRANTING', 'FAILED'] as const) {
      expect(() => assertRegrantAllowed({ ...base, state })).toThrowError(/forbidden/);
    }

    // REVOKED without the live-policy verification stamp is STILL refused.
    expect(() => assertRegrantAllowed({ ...base, state: 'REVOKED', revokeVerifiedAt: null })).toThrowError(
      /revoked AND verified/,
    );

    expect(() => assertRegrantAllowed({ ...base, state: 'REVOKED', revokeVerifiedAt: new Date() })).not.toThrow();
  });

  it('fails the transfer (owner unchanged) when the live policy still lists the old owner after revocation', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const gcp = new FakeGcpCloudClient();
    const tenant = await makeTenant(store, OWNER_A);
    const binding = await bindProjectToTenant(store, {
      cloudTenantId: tenant.id,
      gcpProjectId: 'pj-sticky',
      region: 'europe-west9',
    });
    await store.updateCloudProjectBinding(binding.id, { state: 'ACTIVE' });

    const project = gcp.seedProject('pj-sticky');
    project.policy.bindings = [{ role: 'roles/owner', members: [OWNER_A] }];
    gcp.ignorePolicyWrites = true; // revocation write is silently dropped

    await expect(
      transferTenantOwnership(store, gcp, {
        cloudTenantId: tenant.id,
        toPrincipalId: OWNER_B,
        grantRoles: ['roles/viewer'],
      }),
    ).rejects.toMatchObject({ code: 'TRANSFER_REVOKE_UNVERIFIED' });

    const after = await store.getCloudTenant(tenant.id);
    expect(after?.ownerPrincipalId).toBe(OWNER_A);
    expect(after?.ownershipVersion).toBe(1);

    const transfer = [...store.transfers.values()][0];
    expect(transfer.state).toBe('FAILED');
  });

  it('completes end-to-end: old principal stripped everywhere, explicit roles granted, version bumped', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const gcp = new FakeGcpCloudClient();
    const tenant = await makeTenant(store, OWNER_A);
    const binding = await bindProjectToTenant(store, {
      cloudTenantId: tenant.id,
      gcpProjectId: 'pj-move',
      region: 'europe-west9',
    });
    await store.updateCloudProjectBinding(binding.id, { state: 'ACTIVE' });

    const project = gcp.seedProject('pj-move');
    project.policy.bindings = [
      { role: 'roles/owner', members: [OWNER_A, 'user:unrelated@example.com'] },
      { role: 'roles/storage.admin', members: [OWNER_A] },
    ];

    const { transfer, tenant: updated } = await transferTenantOwnership(store, gcp, {
      cloudTenantId: tenant.id,
      toPrincipalId: OWNER_B,
      grantRoles: ['roles/viewer'],
    });

    expect(transfer.state).toBe('COMPLETED');
    expect(updated.ownerPrincipalId).toBe(OWNER_B);
    expect(updated.ownershipVersion).toBe(2);

    const policy = await gcp.getProjectIamPolicy('pj-move');
    const membersByRole = Object.fromEntries((policy.bindings ?? []).map((b) => [b.role, b.members]));

    // Old owner is GONE from every role — not renamed, not carried over.
    for (const members of Object.values(membersByRole)) {
      expect(members).not.toContain(OWNER_A);
    }

    // New owner has EXACTLY the explicit grant set, not the old owner's roles.
    expect(membersByRole['roles/viewer']).toContain(OWNER_B);
    expect(membersByRole['roles/owner'] ?? []).not.toContain(OWNER_B);
    expect(membersByRole['roles/storage.admin'] ?? []).not.toContain(OWNER_B);

    // Unrelated principals are untouched.
    expect(membersByRole['roles/owner']).toContain('user:unrelated@example.com');

    // Evidence recorded on both legs.
    expect(transfer.revokeEvidence).toEqual([
      { gcpProjectId: 'pj-move', removedRoles: ['roles/owner', 'roles/storage.admin'] },
    ]);
    expect(transfer.regrantEvidence).toEqual([{ gcpProjectId: 'pj-move', grantedRoles: ['roles/viewer'] }]);
    expect(transfer.revokeVerifiedAt).toBeInstanceOf(Date);
  });

  it('refuses transferring to the current owner and empty grant lists', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const gcp = new FakeGcpCloudClient();
    const tenant = await makeTenant(store, OWNER_A);

    await expect(
      transferTenantOwnership(store, gcp, {
        cloudTenantId: tenant.id,
        toPrincipalId: OWNER_A,
        grantRoles: ['roles/viewer'],
      }),
    ).rejects.toMatchObject({ code: 'TRANSFER_NOOP' });

    await expect(
      transferTenantOwnership(store, gcp, { cloudTenantId: tenant.id, toPrincipalId: OWNER_B, grantRoles: [] }),
    ).rejects.toMatchObject({ code: 'TRANSFER_GRANT_ROLES_REQUIRED' });
  });
});

describe('tenant lifecycle / merge / split state machines', () => {
  it('rejects illegal lifecycle transitions', () => {
    expect(() => assertTenantLifecycleTransition('CLOSED', 'ACTIVE')).toThrowError(CloudTenantError);
    expect(() => assertTenantLifecycleTransition('MERGED', 'ACTIVE')).toThrowError(CloudTenantError);
    expect(() => assertTenantLifecycleTransition('ACTIVE', 'SUSPENDED')).not.toThrow();
  });

  it('suspend blocks new bindings until restore', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const tenant = await makeTenant(store);
    await suspendCloudTenant(store, tenant.id);

    await expect(
      bindProjectToTenant(store, { cloudTenantId: tenant.id, gcpProjectId: 'pj-x', region: 'europe-west9' }),
    ).rejects.toMatchObject({ code: 'TENANT_NOT_ACTIVE' });
  });

  it('merge moves bindings, closes the source with provenance, and never merges a tenant into itself', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const source = await makeTenant(store, OWNER_A);
    const target = await makeTenant(store, OWNER_B);
    await bindProjectToTenant(store, { cloudTenantId: source.id, gcpProjectId: 'pj-src', region: 'europe-west9' });
    await bindProjectToTenant(store, { cloudTenantId: target.id, gcpProjectId: 'pj-tgt', region: 'europe-west9' });

    await expect(
      mergeCloudTenants(store, { sourceTenantId: source.id, targetTenantId: source.id }),
    ).rejects.toMatchObject({ code: 'TENANT_MERGE_SELF' });

    const { source: merged, target: bumped } = await mergeCloudTenants(store, {
      sourceTenantId: source.id,
      targetTenantId: target.id,
    });

    expect(merged.lifecycle).toBe('MERGED');
    expect(merged.mergedIntoTenantId).toBe(target.id);
    expect(bumped.ownershipVersion).toBe(2);

    const targetAfter = await store.getCloudTenant(target.id);
    expect(targetAfter?.bindings).toHaveLength(2);

    // The source's PRIMARY was demoted — the target keeps a single primary.
    const primaries = targetAfter!.bindings.filter((b) => b.role === 'PRIMARY');
    expect(primaries).toHaveLength(1);
    expect(primaries[0].gcpProjectId).toBe('pj-tgt');
  });

  it('split refuses foreign bindings and moves the listed ones to a new tenant with provenance', async () => {
    const store = createInMemoryCloudGovernanceStore();
    const source = await makeTenant(store, OWNER_A);
    const other = await makeTenant(store, OWNER_B);
    await bindProjectToTenant(store, { cloudTenantId: source.id, gcpProjectId: 'pj-keep', region: 'europe-west9' });
    const toMove = await bindProjectToTenant(store, {
      cloudTenantId: source.id,
      gcpProjectId: 'pj-move-out',
      role: 'QUOTA_SHARD',
      region: 'europe-west9',
    });
    const foreign = await bindProjectToTenant(store, {
      cloudTenantId: other.id,
      gcpProjectId: 'pj-foreign',
      region: 'europe-west9',
    });

    await expect(
      splitCloudTenant(store, {
        sourceTenantId: source.id,
        bindingIds: [foreign.id],
        newTenant: { customerBoundaryType: 'LEGAL_ENTITY', ownerPrincipalId: OWNER_B, billingPrincipalId: OWNER_B },
      }),
    ).rejects.toMatchObject({ code: 'TENANT_SPLIT_FOREIGN_BINDING' });

    const { created } = await splitCloudTenant(store, {
      sourceTenantId: source.id,
      bindingIds: [toMove.id],
      newTenant: { customerBoundaryType: 'LEGAL_ENTITY', ownerPrincipalId: OWNER_B, billingPrincipalId: OWNER_B },
    });

    expect(created.splitFromTenantId).toBe(source.id);

    const createdFull = await store.getCloudTenant(created.id);
    expect(createdFull?.bindings.map((b) => b.gcpProjectId)).toEqual(['pj-move-out']);
  });
});
