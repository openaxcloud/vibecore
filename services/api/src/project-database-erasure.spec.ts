import { describe, expect, it, vi } from 'vitest';

import { DB_NAMESPACE, clusterName, restoreClusterName } from './database-provisioner.js';
import {
  GcsProjectDatabaseBackupPort,
  PgProjectDatabaseSharedSqlPort,
  ProjectDatabaseErasureError,
  ProjectDatabaseErasureService,
  buildProjectDatabaseErasurePlan,
  type ProjectDatabaseBackupPort,
  type ProjectDatabaseBackupVersion,
  type ProjectDatabaseErasureCatalog,
  type ProjectDatabaseErasureFence,
  type ProjectDatabaseErasureFenceContext,
  type ProjectDatabaseErasurePlan,
  type ProjectDatabaseKubernetesPort,
  type ProjectDatabaseKubernetesResource,
  type ProjectDatabaseSharedSqlPort,
  type ProjectDatabaseSharedTenant,
} from './project-database-erasure.js';

const PROJECT_ID = 'projectabc123';
const ORGANIZATION_ID = 'org-1';
const CAPTURED_AT = '2026-08-28T08:00:00.000Z';

function catalog(overrides: Partial<ProjectDatabaseErasureCatalog> = {}): ProjectDatabaseErasureCatalog {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    organizationId: ORGANIZATION_ID,
    capturedAt: CAPTURED_AT,
    tier: 'isolated',
    backupBucket: 'vibecore-db-backups',
    instances: [
      {
        id: 'instance-prod',
        projectId: PROJECT_ID,
        organizationId: ORGANIZATION_ID,
        environment: 'production',
        status: 'ACTIVE',
        engine: 'postgres',
        sizeBytes: 42,
        retentionDays: 28,
        pitrEnabled: true,
        snapshots: [
          {
            id: 'snapshot-prod',
            kind: 'manual',
            sizeBytes: 12,
            storageKey: 'db/projectabc123/base/prod',
            createdAt: '2026-08-27T08:00:00.000Z',
          },
        ],
        restores: [],
      },
      {
        id: 'instance-dev',
        projectId: PROJECT_ID,
        organizationId: ORGANIZATION_ID,
        environment: 'development',
        status: 'SUSPENDED',
        engine: 'postgres',
        region: 'me-west1',
        sizeBytes: 24,
        retentionDays: 7,
        pitrEnabled: true,
        snapshots: [
          {
            id: 'snapshot-dev',
            kind: 'auto',
            lsn: '0/16B6A18',
            sizeBytes: 8,
            createdAt: '2026-08-26T08:00:00.000Z',
            expiresAt: '2026-09-02T08:00:00.000Z',
          },
        ],
        restores: [
          {
            id: 'restore-dev',
            snapshotId: 'snapshot-dev',
            status: 'COMPLETED',
            targetTimestamp: '2026-08-26T08:01:00.000Z',
            createdAt: '2026-08-26T09:00:00.000Z',
            startedAt: '2026-08-26T09:01:00.000Z',
            completedAt: '2026-08-26T09:03:00.000Z',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function plan(overrides: Partial<ProjectDatabaseErasureCatalog> = {}): ProjectDatabaseErasurePlan {
  return buildProjectDatabaseErasurePlan({ ...catalog(overrides), operationId: 'erase-op-1' });
}

function resource(
  kind: ProjectDatabaseKubernetesResource['kind'],
  name: string,
  cluster?: string,
): ProjectDatabaseKubernetesResource {
  return {
    kind,
    namespace: DB_NAMESPACE,
    name,
    uid: `uid-${kind}-${name}`,
    resourceVersion: '7',
    ownership: {
      projectId: PROJECT_ID,
      source: cluster ? 'cnpg-cluster-label' : 'project-label',
      ...(cluster ? { clusterName: cluster } : {}),
    },
  };
}

class FakeKubernetes implements ProjectDatabaseKubernetesPort {
  readonly resources = new Map<string, ProjectDatabaseKubernetesResource>();
  readonly deleted: ProjectDatabaseKubernetesResource[] = [];

  constructor(seed: ProjectDatabaseKubernetesResource[] = []) {
    for (const item of seed) this.resources.set(`${item.kind}:${item.name}`, item);
  }

  async inventory(): Promise<ProjectDatabaseKubernetesResource[]> {
    return [...this.resources.values()];
  }

  async delete(input: {
    projectId: string;
    namespace: typeof DB_NAMESPACE;
    knownClusterNames: readonly string[];
    resource: ProjectDatabaseKubernetesResource;
  }): Promise<'deleted' | 'absent'> {
    const key = `${input.resource.kind}:${input.resource.name}`;
    const current = this.resources.get(key);

    if (!current) return 'absent';
    expect(current.resourceVersion).toBe(input.resource.resourceVersion);
    this.resources.delete(key);
    this.deleted.push(input.resource);

    return 'deleted';
  }
}

class FakeBackups implements ProjectDatabaseBackupPort {
  readonly versions = new Map<string, ProjectDatabaseBackupVersion>();
  readonly deleted: ProjectDatabaseBackupVersion[] = [];

  constructor(seed: ProjectDatabaseBackupVersion[] = []) {
    for (const item of seed) this.versions.set(`${item.key}:${item.generation}`, item);
  }

  async listFirstPage(input: {
    bucket: string;
    prefix: string;
    limit: number;
  }): Promise<ProjectDatabaseBackupVersion[]> {
    return [...this.versions.values()].filter((item) => item.key.startsWith(input.prefix)).slice(0, input.limit);
  }

  async deleteVersion(input: { bucket: string; key: string; generation: string }): Promise<'deleted' | 'absent'> {
    const key = `${input.key}:${input.generation}`;
    const version = this.versions.get(key);

    if (!version) return 'absent';
    this.versions.delete(key);
    this.deleted.push(version);

    return 'deleted';
  }
}

class FakeSharedSql implements ProjectDatabaseSharedSqlPort {
  readonly states = new Map<string, { databaseExists: boolean; roleExists: boolean }>();
  readonly erased: ProjectDatabaseSharedTenant[] = [];

  key(input: ProjectDatabaseSharedTenant): string {
    return `${input.sharedClusterName}:${input.database}:${input.role}`;
  }

  seed(input: ProjectDatabaseSharedTenant): void {
    this.states.set(this.key(input), { databaseExists: true, roleExists: true });
  }

  async eraseTenant(input: ProjectDatabaseSharedTenant, guard: (effect: string) => Promise<void>): Promise<void> {
    await guard('terminate-connections');
    await guard('drop-database');
    await guard('drop-role');
    this.states.set(this.key(input), { databaseExists: false, roleExists: false });
    this.erased.push(input);
  }

  async inspectTenant(input: ProjectDatabaseSharedTenant): Promise<{ databaseExists: boolean; roleExists: boolean }> {
    return this.states.get(this.key(input)) ?? { databaseExists: false, roleExists: false };
  }
}

class FakeFence implements ProjectDatabaseErasureFence {
  readonly assertions: ProjectDatabaseErasureFenceContext[] = [];
  readonly checkpoints: Array<ProjectDatabaseErasureFenceContext & { evidence: Readonly<Record<string, unknown>> }> =
    [];

  constructor(private readonly reject?: (context: ProjectDatabaseErasureFenceContext) => boolean) {}

  async assertActive(context: ProjectDatabaseErasureFenceContext): Promise<void> {
    this.assertions.push(context);

    if (this.reject?.(context)) throw new Error('lease lost');
  }

  async checkpoint(
    context: ProjectDatabaseErasureFenceContext & { evidence: Readonly<Record<string, unknown>> },
  ): Promise<void> {
    this.checkpoints.push(context);
  }
}

describe('buildProjectDatabaseErasurePlan', () => {
  it('binds a deterministic pre-cascade inventory for development and production', () => {
    const first = plan();
    const reversed = plan({ instances: [...catalog().instances].reverse() });

    expect(first.inventorySha256).toBe(reversed.inventorySha256);
    expect(first.instances.map((instance) => instance.environment)).toEqual(['development', 'production']);
    expect(first.targets.clusterNames).toEqual([
      clusterName(PROJECT_ID, 'development'),
      clusterName(PROJECT_ID, 'production'),
    ]);
    expect(first.targets.restoreClusterNames).toEqual([restoreClusterName(PROJECT_ID, 'restore-dev')]);
    expect(first.targets.backupNames).toHaveLength(2);
    expect(first.backupPrefix).toBe(`db/${PROJECT_ID}/`);
  });

  it('rejects ambiguous relational inventory and unsafe bucket coordinates', () => {
    const duplicate = catalog();
    duplicate.instances[1] = { ...duplicate.instances[1], environment: 'production' };

    expect(() => buildProjectDatabaseErasurePlan({ ...duplicate, operationId: 'op' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_INVENTORY' }),
    );
    expect(() => plan({ backupBucket: 'gs://bucket/path' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_INVENTORY' }),
    );
    const crossTenant = catalog();
    crossTenant.instances[0] = { ...crossTenant.instances[0], organizationId: 'another-org' };
    expect(() => buildProjectDatabaseErasurePlan({ ...crossTenant, operationId: 'op' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_INVENTORY' }),
    );
  });
});

describe('ProjectDatabaseErasureService', () => {
  it('deletes isolated CNPG CRs, descendants, and every backup generation before issuing a receipt', async () => {
    const erasurePlan = plan();
    const dev = clusterName(PROJECT_ID, 'development');
    const restore = restoreClusterName(PROJECT_ID, 'restore-dev');
    const kubernetes = new FakeKubernetes([
      resource('PersistentVolumeClaim', `${dev}-1`, dev),
      resource('Pod', `${dev}-1`, dev),
      resource('EndpointSlice', `${dev}-rw-abc`, dev),
      resource('Cluster', dev),
      resource('ScheduledBackup', `${dev}-daily`),
      resource('Backup', `${dev}-snapshot-dev`),
      resource('Cluster', restore),
    ]);
    const backups = new FakeBackups([
      { key: `db/${PROJECT_ID}/base/backup.tar`, generation: '1' },
      { key: `db/${PROJECT_ID}/base/backup.tar`, generation: '2' },
      { key: `db/${PROJECT_ID}/wals/0001`, generation: '9' },
      { key: 'db/another-project/wals/keep', generation: '1' },
    ]);
    const fence = new FakeFence();
    const service = new ProjectDatabaseErasureService(kubernetes, backups, undefined, {
      backupPageSize: 2,
      kubernetesSettleDelayMs: 0,
      now: () => new Date('2026-08-28T10:00:00.000Z'),
    });

    const receipt = await service.erase(erasurePlan, fence);

    expect(receipt.effects).toEqual({
      kubernetesResourcesDeleted: 7,
      sharedTenantsErased: 0,
      backupGenerationsDeleted: 3,
    });
    expect(receipt.proof).toMatchObject({
      kubernetesAbsent: true,
      backupGenerationsAbsent: true,
      backupPrefix: `db/${PROJECT_ID}/`,
    });
    expect(backups.versions.has('db/another-project/wals/keep:1')).toBe(true);
    expect(kubernetes.deleted.at(-1)?.kind).toBe('PersistentVolumeClaim');
    expect(fence.checkpoints.at(-1)?.stage).toBe('VERIFIED');
    expect(fence.assertions.some((event) => event.effect?.includes(':complete'))).toBe(true);
  });

  it('drops both shared logical databases and roles while never targeting the shared cluster or Pooler', async () => {
    const erasurePlan = plan({ tier: 'shared', sharedClusterName: 'shared-pg-0' });
    const kubernetes = new FakeKubernetes(
      erasurePlan.targets.databaseCrNames.map((name) => resource('Database', name)),
    );
    const backups = new FakeBackups();
    const sql = new FakeSharedSql();
    erasurePlan.targets.sharedTenants.forEach((tenant) => sql.seed(tenant));
    const service = new ProjectDatabaseErasureService(kubernetes, backups, sql, { kubernetesSettleDelayMs: 0 });

    const receipt = await service.erase(erasurePlan, new FakeFence());

    expect(sql.erased.map((tenant) => tenant.environment)).toEqual(['development', 'production']);
    expect(sql.erased.every((tenant) => tenant.sharedClusterName === 'shared-pg-0')).toBe(true);
    expect(kubernetes.deleted.map((item) => item.kind)).toEqual(['Database', 'Database']);
    expect(receipt.effects.sharedTenantsErased).toBe(2);
    expect(receipt.proof.sharedTenantsAbsent).toBe(true);
  });

  it('fails closed if the manager presents shared infrastructure as a project target', async () => {
    const erasurePlan = plan({ tier: 'shared', sharedClusterName: 'shared-pg-0' });
    const unsafe = resource('Cluster', 'shared-pg-0');
    const kubernetes = new FakeKubernetes([unsafe]);
    const fence = new FakeFence();

    await expect(
      new ProjectDatabaseErasureService(kubernetes, new FakeBackups(), new FakeSharedSql(), {
        kubernetesSettleDelayMs: 0,
      }).erase(erasurePlan, fence),
    ).rejects.toMatchObject({ code: 'UNSAFE_KUBERNETES_TARGET' });
    expect(kubernetes.deleted).toEqual([]);
    expect(fence.checkpoints.some((checkpoint) => checkpoint.stage === 'VERIFIED')).toBe(false);
  });

  it('is crash/replay safe and never returns a receipt after a lost fence', async () => {
    const erasurePlan = plan();
    const dev = clusterName(PROJECT_ID, 'development');
    const kubernetes = new FakeKubernetes([
      resource('Cluster', dev),
      resource('PersistentVolumeClaim', `${dev}-1`, dev),
    ]);
    const backups = new FakeBackups([{ key: `db/${PROJECT_ID}/base/a`, generation: '1' }]);
    let rejected = false;
    const losingFence = new FakeFence((context) => {
      if (!rejected && context.effect?.startsWith('delete:Cluster:') && context.effect.endsWith(':complete')) {
        rejected = true;
        return true;
      }

      return false;
    });
    const service = new ProjectDatabaseErasureService(kubernetes, backups, undefined, {
      kubernetesSettleDelayMs: 0,
    });

    await expect(service.erase(erasurePlan, losingFence)).rejects.toThrow('lease lost');
    expect(losingFence.checkpoints.some((checkpoint) => checkpoint.stage === 'VERIFIED')).toBe(false);

    const replayReceipt = await service.erase(erasurePlan, new FakeFence());
    expect(replayReceipt.proof.kubernetesAbsent).toBe(true);
    expect(replayReceipt.proof.backupGenerationsAbsent).toBe(true);
    expect(kubernetes.resources.size).toBe(0);
    expect(backups.versions.size).toBe(0);
  });

  it('rejects a mutated durable plan before any provider effect', async () => {
    const erasurePlan = plan();
    erasurePlan.backupPrefix = 'db/another-project/';
    const kubernetes = new FakeKubernetes();

    await expect(
      new ProjectDatabaseErasureService(kubernetes, new FakeBackups()).erase(erasurePlan, new FakeFence()),
    ).rejects.toMatchObject({ code: 'INVALID_PLAN' });
    expect(kubernetes.deleted).toEqual([]);
  });
});

describe('GcsProjectDatabaseBackupPort', () => {
  it('lists noncurrent generations and deletes the exact immutable generation with CAS', async () => {
    const deletes: Array<{ name: string; generation: string; match: string }> = [];
    const storage = {
      bucket: (bucket: string) => {
        expect(bucket).toBe('backups');

        return {
          getFiles: async (options: Record<string, unknown>) => {
            expect(options).toMatchObject({ versions: true, autoPaginate: false, prefix: `db/${PROJECT_ID}/` });

            return [
              [
                {
                  name: `db/${PROJECT_ID}/base/a`,
                  metadata: { generation: '1' },
                  delete: async () => undefined,
                },
                {
                  name: `db/${PROJECT_ID}/base/a`,
                  metadata: { generation: '2' },
                  delete: async () => undefined,
                },
              ],
            ] as [Array<{ name: string; metadata: { generation: string }; delete: () => Promise<void> }>];
          },
          file: (name: string, options: { generation: string }) => ({
            name,
            delete: async ({ ifGenerationMatch }: { ifGenerationMatch: string }) => {
              deletes.push({ name, generation: options.generation, match: ifGenerationMatch });
            },
          }),
        };
      },
    };
    const adapter = new GcsProjectDatabaseBackupPort('backups', storage);

    expect(await adapter.listFirstPage({ bucket: 'backups', prefix: `db/${PROJECT_ID}/`, limit: 500 })).toEqual([
      { key: `db/${PROJECT_ID}/base/a`, generation: '1' },
      { key: `db/${PROJECT_ID}/base/a`, generation: '2' },
    ]);
    await adapter.deleteVersion({ bucket: 'backups', key: `db/${PROJECT_ID}/base/a`, generation: '2' });
    expect(deletes).toEqual([{ name: `db/${PROJECT_ID}/base/a`, generation: '2', match: '2' }]);
  });

  it('fails closed when GCS omits a generation or the caller changes buckets', async () => {
    const storage = {
      bucket: () => ({
        getFiles: async () =>
          [[{ name: `db/${PROJECT_ID}/base/a`, metadata: {}, delete: async () => undefined }]] as [
            Array<{ name: string; metadata: {}; delete: () => Promise<void> }>,
          ],
        file: vi.fn(),
      }),
    };
    const adapter = new GcsProjectDatabaseBackupPort('backups', storage);

    await expect(
      adapter.listFirstPage({ bucket: 'backups', prefix: `db/${PROJECT_ID}/`, limit: 1 }),
    ).rejects.toMatchObject({ code: 'BACKUP_GENERATION_UNPINNABLE' });
    await expect(
      adapter.listFirstPage({ bucket: 'different', prefix: `db/${PROJECT_ID}/`, limit: 1 }),
    ).rejects.toMatchObject({ code: 'BACKUP_BUCKET_MISMATCH' });
  });
});

describe('PgProjectDatabaseSharedSqlPort', () => {
  it('terminates sessions, drops the database, removes owned grants, and drops the role with guards between effects', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      connect: vi.fn(async () => undefined),
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values });

        if (text.includes('FROM pg_roles WHERE rolname')) return { rowCount: 1, rows: [{ exists: true }] };

        return { rowCount: 0, rows: [] };
      }),
      end: vi.fn(async () => undefined),
    };
    const effects: string[] = [];
    const adapter = new PgProjectDatabaseSharedSqlPort(
      async (cluster) => {
        expect(cluster).toBe('shared-pg-0');
        return 'postgresql://admin:redacted@shared/app';
      },
      () => client,
    );
    const tenant: ProjectDatabaseSharedTenant = {
      sharedClusterName: 'shared-pg-0',
      environment: 'development',
      database: 'proj_projectabc123',
      role: 't_projectabc123',
    };

    await adapter.eraseTenant(tenant, async (effect) => {
      effects.push(effect);
    });

    expect(queries.map(({ text }) => text)).toEqual([
      expect.stringContaining('pg_terminate_backend'),
      'DROP DATABASE IF EXISTS "proj_projectabc123" WITH (FORCE)',
      expect.stringContaining('FROM pg_roles WHERE rolname'),
      'DROP OWNED BY "t_projectabc123"',
      'REVOKE "t_projectabc123" FROM CURRENT_USER',
      'DROP ROLE "t_projectabc123"',
    ]);
    expect(effects).toEqual([
      'resolve-admin',
      'terminate-connections',
      'drop-database',
      'inspect-role',
      'drop-owned',
      'revoke-admin-membership',
      'drop-role',
      'sql-effects-complete',
    ]);
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('requires a readable live absence proof', async () => {
    const adapter = new PgProjectDatabaseSharedSqlPort(
      async () => 'postgresql://admin:redacted@shared/app',
      () => ({
        connect: async () => undefined,
        query: async () => ({ rowCount: 1, rows: [{ databaseExists: false }] }),
        end: async () => undefined,
      }),
    );

    await expect(
      adapter.inspectTenant({
        sharedClusterName: 'shared-pg-0',
        environment: 'production',
        database: 'proj_projectabc123_prod',
        role: 't_projectabc123_prod',
      }),
    ).rejects.toBeInstanceOf(ProjectDatabaseErasureError);
  });
});
