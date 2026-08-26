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
    teardown: vi.fn(async () => undefined),
  };
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
      tier: 'shared',
      nowMs: Date.parse('2026-08-26T10:00:01.000Z'),
      encryptConnectionUri: (value) => `encrypted:${value}`,
    });

    expect(result.transition).toBe('failed');
    expect(result.instance.status).toBe('FAILED');
    expect(result.instance.lastErrorCode).toBe(DATABASE_PROVISION_FAILURE.providerUnavailable);
  });

  it('commits the verified URI and ACTIVE status together', async () => {
    const store = new TestApiStore();
    const pending = instance({ provisioningDeadlineAt: '2026-08-26T10:10:00.000Z' });
    store.databaseInstances.set(pending.id, pending);

    const result = await reconcileDatabaseProvisioning({
      store,
      provisioner: provisioner('postgresql://tenant:secret@pooler/project'),
      instance: pending,
      tier: 'shared',
      nowMs: Date.parse('2026-08-26T10:01:00.000Z'),
      encryptConnectionUri: (value) => `encrypted:${value}`,
    });

    expect(result.transition).toBe('active');
    expect(result.instance.status).toBe('ACTIVE');
    expect(await store.getProjectSecret('project-1', 'DATABASE_URL')).toMatchObject({
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
      tier: 'isolated',
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
      tier: 'isolated',
      nowMs: Date.parse('2026-08-26T10:01:00.000Z'),
      encryptConnectionUri: (value) => value,
    });

    expect(result).toMatchObject({ transition: 'none', probeFailed: true });
    expect((await store.getDatabaseInstanceByProject(pending.projectId))?.status).toBe('PROVISIONING');
  });

  it('does not overwrite a concurrent terminal transition', async () => {
    const store = new TestApiStore();
    const pending = instance({ provisioningDeadlineAt: '2026-08-26T10:01:00.000Z' });
    store.databaseInstances.set(pending.id, pending);
    const provider = provisioner(undefined);
    (provider.getConnectionUri as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await store.completeDatabaseProvisioning(pending.id, {
        projectId: pending.projectId,
        key: 'DATABASE_URL',
        valueEncrypted: 'winner',
      });

      return undefined;
    });

    const result = await reconcileDatabaseProvisioning({
      store,
      provisioner: provider,
      instance: pending,
      tier: 'isolated',
      nowMs: Date.parse('2026-08-26T10:01:01.000Z'),
      encryptConnectionUri: (value) => value,
    });

    expect(result.transition).toBe('none');
    expect((await store.getDatabaseInstanceByProject(pending.projectId))?.status).toBe('ACTIVE');
  });

  it('grants exactly one retry claim for a FAILED singleton', async () => {
    const store = new TestApiStore();
    const failed = instance({
      status: 'FAILED',
      lastErrorCode: DATABASE_PROVISION_FAILURE.timedOut,
      lastErrorAt: '2026-08-26T10:01:00.000Z',
    });
    store.databaseInstances.set(failed.id, failed);

    const retry = {
      projectId: failed.projectId,
      organizationId: failed.organizationId,
      retentionDays: failed.retentionDays,
      environment: failed.environment,
      provisioningDeadlineAt: '2026-08-26T10:20:00.000Z',
    };
    const [first, second] = await Promise.all([
      store.acquireDatabaseProvisioning(retry),
      store.acquireDatabaseProvisioning(retry),
    ]);

    expect([first, second].filter((result) => result.acquired)).toHaveLength(1);
    expect(Array.from(store.databaseInstances.values())).toHaveLength(1);
    expect((await store.getDatabaseInstanceByProject(failed.projectId))?.status).toBe('PROVISIONING');
  });
});
