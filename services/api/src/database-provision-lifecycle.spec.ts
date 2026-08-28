import { describe, expect, it, vi } from 'vitest';

import {
  DATABASE_PROVISION_FAILURE,
  databaseProvisionExpired,
  databaseProvisionTimeoutMs,
  reconcileDatabaseProvisioning,
} from './database-provision-lifecycle.js';
import { NoopProvisioner, type DatabaseProvisioner } from './database-provisioner.js';
import type { DatabaseInstanceRecord } from './store.js';
import { TestApiStore } from './tests/test-api-store.js';

function instance(overrides: Partial<DatabaseInstanceRecord> = {}): DatabaseInstanceRecord {
  return {
    id: 'db-1',
    projectId: 'project-1',
    organizationId: 'org-1',
    environment: 'development',
    status: 'PROVISIONING',
    engine: 'postgres',
    sizeBytes: 0,
    retentionDays: 7,
    pitrEnabled: true,
    physicalAuthority: {
      tier: 'isolated',
      clusterName: 'db-project-1',
      backupBucket: 'database-backups',
      backupPrefix: 'db/project-1/',
      retentionDays: 7,
      capturedAt: '2026-08-26T10:00:00.000Z',
    },
    createdAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
    ...overrides,
  };
}

function provisioner(uri?: string): DatabaseProvisioner {
  return {
    active: true,
    provisionInstance: vi.fn(async () => ({ clusterName: 'db-project-1', applied: true })),
    getConnectionUri: vi.fn(async () => uri),
    takeSnapshot: vi.fn(async () => ({ applied: true })),
    startRestore: vi.fn(async () => ({ applied: true, clusterName: 'restore' })),
    restoreProgress: vi.fn(async () => ({ ready: false, clusterName: 'restore' })),
    forkInstance: vi.fn(async () => ({ applied: true, clusterName: 'fork' })),
    forkProgress: vi.fn(async () => ({ ready: false, clusterName: 'fork' })),
    teardownFork: vi.fn(async () => undefined),
    teardown: vi.fn(async () => undefined),
  };
}

async function pendingFixture(overrides: Partial<DatabaseInstanceRecord> = {}) {
  const store = new TestApiStore();
  const owner = await store.createUser({
    email: `database-lifecycle-${Math.random().toString(36).slice(2)}@example.test`,
    name: 'Database lifecycle owner',
    passwordHash: 'test-password-hash',
  });
  const organization = await store.createOrganization({
    name: 'Database lifecycle organization',
    slug: `database-lifecycle-${Math.random().toString(36).slice(2)}`,
    ownerUserId: owner.id,
  });
  const project = await store.createProject({
    organizationId: organization.id,
    name: 'Database lifecycle project',
    slug: `database-lifecycle-${Math.random().toString(36).slice(2)}`,
  });
  const pending = instance({
    projectId: project.id,
    organizationId: organization.id,
    physicalAuthority: {
      tier: 'isolated',
      clusterName: `db-${project.id}`,
      backupBucket: 'database-backups',
      backupPrefix: `db/${project.id}/`,
      retentionDays: overrides.retentionDays ?? 7,
      capturedAt: '2026-08-26T10:00:00.000Z',
    },
    ...overrides,
  });
  store.databaseInstances.set(pending.id, pending);

  return { store, pending };
}

describe('managed database provisioning lifecycle', () => {
  it('bounds an invalid timeout and recognizes a historical row without an explicit deadline', () => {
    expect(databaseProvisionTimeoutMs('1')).toBe(30_000);
    expect(databaseProvisionTimeoutMs('999999999')).toBe(24 * 60 * 60 * 1000);
    expect(databaseProvisionTimeoutMs('not-a-number')).toBe(10 * 60 * 1000);
    expect(databaseProvisionExpired(instance(), Date.parse('2026-08-26T10:10:00.000Z'))).toBe(true);
  });

  it('fails immediately and durably when the configured provisioner is inert', async () => {
    const store = new TestApiStore();
    store.databaseInstances.set('db-1', instance());

    const result = await reconcileDatabaseProvisioning({
      store,
      provisioner: new NoopProvisioner(),
      instance: instance(),
      nowMs: Date.parse('2026-08-26T10:00:01.000Z'),
      encryptConnectionUri: (value) => `encrypted:${value}`,
    });

    expect(result.transition).toBe('failed');
    expect(result.instance.status).toBe('FAILED');
    expect(result.instance.lastErrorCode).toBe(DATABASE_PROVISION_FAILURE.providerUnavailable);
  });

  it('commits the verified URI and ACTIVE status together', async () => {
    const { store, pending } = await pendingFixture({
      provisioningDeadlineAt: '2026-08-26T10:10:00.000Z',
    });

    const result = await reconcileDatabaseProvisioning({
      store,
      provisioner: provisioner('postgresql://tenant:secret@pooler/project'),
      instance: pending,
      nowMs: Date.parse('2026-08-26T10:01:00.000Z'),
      encryptConnectionUri: (value) => `encrypted:${value}`,
    });

    expect(result.transition).toBe('active');
    expect(result.instance.status).toBe('ACTIVE');
    expect(await store.getProjectSecret(pending.projectId, 'DATABASE_URL')).toMatchObject({
      valueEncrypted: 'encrypted:postgresql://tenant:secret@pooler/project',
    });
  });

  it('moves a non-ready instance to retryable FAILED only after its deadline', async () => {
    const store = new TestApiStore();
    const pending = instance({ provisioningDeadlineAt: '2026-08-26T10:01:00.000Z' });
    store.databaseInstances.set(pending.id, pending);

    const result = await reconcileDatabaseProvisioning({
      store,
      provisioner: provisioner(undefined),
      instance: pending,
      nowMs: Date.parse('2026-08-26T10:01:01.000Z'),
      encryptConnectionUri: (value) => value,
    });

    expect(result.transition).toBe('failed');
    expect(result.instance.lastErrorCode).toBe(DATABASE_PROVISION_FAILURE.timedOut);
  });

  it('surfaces a transient SQL/manager probe error without inventing readiness', async () => {
    const store = new TestApiStore();
    const pending = instance({ provisioningDeadlineAt: '2026-08-26T10:10:00.000Z' });
    store.databaseInstances.set(pending.id, pending);
    const provider = provisioner();
    (provider.getConnectionUri as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('manager unavailable'));

    const result = await reconcileDatabaseProvisioning({
      store,
      provisioner: provider,
      instance: pending,
      nowMs: Date.parse('2026-08-26T10:01:00.000Z'),
      encryptConnectionUri: (value) => value,
    });

    expect(result).toMatchObject({ transition: 'none', probeFailed: true });
    expect((await store.getDatabaseInstanceByProject(pending.projectId))?.status).toBe('PROVISIONING');
  });

  it('does not overwrite a concurrent terminal transition', async () => {
    const { store, pending } = await pendingFixture({
      provisioningDeadlineAt: '2026-08-26T10:01:00.000Z',
    });
    const provider = provisioner(undefined);
    (provider.getConnectionUri as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await store.completeDatabaseProvisioning(pending.id, {
        projectId: pending.projectId,
        expectedOrganizationId: pending.organizationId,
        key: 'DATABASE_URL',
        valueEncrypted: 'winner',
      });

      return undefined;
    });

    const result = await reconcileDatabaseProvisioning({
      store,
      provisioner: provider,
      instance: pending,
      nowMs: Date.parse('2026-08-26T10:01:01.000Z'),
      encryptConnectionUri: (value) => value,
    });

    expect(result.transition).toBe('none');
    expect((await store.getDatabaseInstanceByProject(pending.projectId))?.status).toBe('ACTIVE');
  });

  it('grants exactly one retry claim for a FAILED singleton', async () => {
    const { store, pending: failed } = await pendingFixture({
      status: 'FAILED',
      lastErrorCode: DATABASE_PROVISION_FAILURE.timedOut,
      lastErrorAt: '2026-08-26T10:01:00.000Z',
    });

    const retry = {
      projectId: failed.projectId,
      expectedOrganizationId: failed.organizationId,
      organizationId: failed.organizationId,
      retentionDays: failed.retentionDays,
      environment: failed.environment,
      provisioningDeadlineAt: '2026-08-26T10:20:00.000Z',
      physicalAuthority: {
        tier: 'isolated' as const,
        clusterName: `db-${failed.projectId}`,
        backupBucket: 'database-backups',
        backupPrefix: `db/${failed.projectId}/`,
        retentionDays: failed.retentionDays,
      },
    };
    const [first, second] = await Promise.all([
      store.acquireDatabaseProvisioning(retry),
      store.acquireDatabaseProvisioning(retry),
    ]);

    expect([first, second].filter((result) => result.acquired)).toHaveLength(1);
    expect(Array.from(store.databaseInstances.values())).toHaveLength(1);
    expect((await store.getDatabaseInstanceByProject(failed.projectId))?.status).toBe('PROVISIONING');
  });

  it('never retargets a failed instance after backup configuration or plan topology drift', async () => {
    const { store, pending: failed } = await pendingFixture({
      status: 'FAILED',
      lastErrorCode: DATABASE_PROVISION_FAILURE.timedOut,
      lastErrorAt: '2026-08-26T10:01:00.000Z',
    });

    await expect(
      store.acquireDatabaseProvisioning({
        projectId: failed.projectId,
        expectedOrganizationId: failed.organizationId,
        organizationId: failed.organizationId,
        retentionDays: failed.retentionDays,
        environment: failed.environment,
        provisioningDeadlineAt: '2026-08-26T10:20:00.000Z',
        physicalAuthority: {
          tier: 'isolated',
          clusterName: `db-${failed.projectId}`,
          backupBucket: 'replacement-backup-bucket',
          backupPrefix: `db/${failed.projectId}/`,
          retentionDays: failed.retentionDays,
        },
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_PHYSICAL_AUTHORITY_MISMATCH', statusCode: 409 });
    expect((await store.getDatabaseInstanceByProject(failed.projectId))?.status).toBe('FAILED');
  });

  it('requires live-CNPG reconciliation for a nullable legacy authority before any retry', async () => {
    const { store, pending: legacy } = await pendingFixture({
      status: 'FAILED',
      physicalAuthority: undefined,
    });

    await expect(
      store.acquireDatabaseProvisioning({
        projectId: legacy.projectId,
        expectedOrganizationId: legacy.organizationId,
        organizationId: legacy.organizationId,
        retentionDays: legacy.retentionDays,
        environment: legacy.environment,
        provisioningDeadlineAt: '2026-08-26T10:20:00.000Z',
        physicalAuthority: {
          tier: 'isolated',
          clusterName: `db-${legacy.projectId}`,
          backupBucket: 'database-backups',
          backupPrefix: `db/${legacy.projectId}/`,
          retentionDays: legacy.retentionDays,
        },
      }),
    ).rejects.toMatchObject({
      code: 'DATABASE_PHYSICAL_AUTHORITY_RECONCILIATION_REQUIRED',
      statusCode: 409,
    });
  });
});
