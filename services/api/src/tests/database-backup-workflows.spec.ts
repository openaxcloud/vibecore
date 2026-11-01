/** Real PostgreSQL journal + real loopback manager HTTP; CNPG resources are controlled metadata only. */
import { createHash, randomUUID } from 'node:crypto';
import { createDatabaseClient, type DatabaseClient } from '@vibecore/database';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildWorkspaceManagerApp } from '../../../workspace-manager/src/app.js';
import { WorkspaceManager } from '../../../workspace-manager/src/manager.js';
import { PrismaWorkspaceStore } from '../../../workspace-manager/src/prisma-store.js';
import { PrismaDatabaseBackupProvenanceRepository } from '../database-backup-provenance.js';
import {
  buildClusterManifest,
  clusterName,
  onDemandBackupName,
  provenBackupName,
  resolveDefaultDatabaseProvisioner,
  type DatabaseEnvironment,
} from '../database-provisioner.js';
import { createPostgresMigrationApplier } from '../db-migration-applier.js';
import { runPublishMigration } from '../db-migration-execution.js';
import { PrismaApiStore } from '../prisma-store.js';

const url = process.env.RESTORE_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
run('current backup workflows with durable local provenance and controlled CNPG HTTP metadata', () => {
  let prisma: DatabaseClient;
  let store: PrismaApiStore;
  let app: ReturnType<typeof buildWorkspaceManagerApp>;
  let admin: Client;
  let origin: string;
  let created = 0;
  let createAttempts = 0;
  let loseNextAcknowledgement = false;

  const organizations: string[] = [];
  const schemas: string[] = [];
  const resources = new Map<string, K8sObject>();

  const denied = async (): Promise<never> => {
    throw new Error('UNEXPECTED_RESOURCE_OPERATION');
  };

  const key = (kind: string, name: string) => `${kind}:${name}`;

  const k8s: WorkspaceK8sClient = {
    apply: denied,
    delete: denied,
    scale: denied,
    annotate: denied,
    listByLabel: denied,
    getPod: denied,
    async *streamPodLogs() {
      throw new Error('UNEXPECTED_RESOURCE_OPERATION');
    },
    async get(kind, namespace, name) {
      expect(namespace).toBe('project-databases');
      expect(['Cluster', 'Backup']).toContain(kind);

      const resource = resources.get(key(kind, name));

      return resource ? structuredClone(resource) : undefined;
    },
    async createResource(object) {
      createAttempts += 1;
      expect(object.kind).toBe('Backup');

      const name = key(object.kind, object.metadata.name);

      if (resources.has(name)) {
        throw new Error('AlreadyExists');
      }

      const resource = {
        ...structuredClone(object),
        metadata: { ...object.metadata, uid: randomUUID() },
        status: { phase: 'completed' },
      };
      resources.set(name, resource);
      created += 1;

      if (loseNextAcknowledgement) {
        loseNextAcknowledgement = false;
        throw new Error('Synthetic acknowledgement loss after create');
      }

      return structuredClone(resource);
    },
  };
  beforeAll(async () => {
    const endpoint = new URL(url!);

    if (
      endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port ||
      endpoint.port === '55439' ||
      !(endpoint.pathname === '/backup_provenance_proof' || /^\/vibecore_restore_ci_[a-f0-9]+$/.test(endpoint.pathname))
    ) {
      throw new Error('Disposable loopback database required');
    }

    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('DB_ROLLBACK_ENABLED', 'true');
    vi.stubEnv('DB_BACKUP_BUCKET', 'local-metadata-fixture-not-a-cloud-bucket');
    vi.stubEnv('WORKSPACE_MANAGER_SHARED_SECRET', 'local-backup-http-fixture');
    vi.stubEnv('REDIS_URL', '');
    prisma = createDatabaseClient({ poolMax: 3 });
    store = new PrismaApiStore(prisma);
    admin = new Client({ connectionString: url });
    await admin.connect();
    app = buildWorkspaceManagerApp(
      new WorkspaceManager(new PrismaWorkspaceStore(prisma), k8s, { publish: async () => {} }, 'local-fixture'),
    );
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
    vi.stubEnv('WORKSPACE_MANAGER_URL', origin);

    const fetchOriginal = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
        const target = new URL(input instanceof Request ? input.url : String(input));

        if (target.origin !== origin) {
          throw new Error('EXTERNAL_HTTP_FORBIDDEN');
        }

        return fetchOriginal(input, init);
      },
    );
  });
  afterAll(async () => {
    try {
      await app?.close();

      for (const schema of schemas) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }

      if (prisma) {
        await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      }
    } finally {
      await admin?.end();
      await prisma?.$disconnect();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  async function seed() {
    const organization = await prisma.organization.create({
      data: { name: 'Local backup compatibility', slug: randomUUID() },
    });
    organizations.push(organization.id);

    const project = await prisma.project.create({
      data: { organizationId: organization.id, name: 'Backup compatibility', slug: randomUUID() },
    });

    for (const environment of ['development', 'production'] as const) {
      await prisma.databaseInstance.create({
        data: { projectId: project.id, organizationId: organization.id, environment, status: 'ACTIVE' },
      });

      const manifest = buildClusterManifest({
        projectId: project.id,
        organizationId: organization.id,
        environment,
        retentionDays: 7,
        backupBucket: 'local-fixture',
      });
      resources.set(key('Cluster', manifest.metadata.name), {
        ...manifest,
        metadata: { ...manifest.metadata, uid: randomUUID() },
      });
    }

    return { project, organization };
  }
  it.each(['development', 'production'] as const)(
    'accepts actual CUID manual/automatic and checkpoint identities in %s without legacy overwrite',
    async (environment) => {
      const { project } = await seed();

      const instance = await prisma.databaseInstance.findUniqueOrThrow({
        where: { projectId_environment: { projectId: project.id, environment } },
      });

      const provider = resolveDefaultDatabaseProvisioner(store.backupProvenance);
      expect(project.id).toHaveLength(25);

      for (const kind of ['manual', 'auto'] as const) {
        const snapshot = await store.createDatabaseSnapshot({ databaseInstanceId: instance.id, kind });
        expect(snapshot.id).toHaveLength(25);

        const legacyName = onDemandBackupName(project.id, snapshot.id, environment);
        expect(`${clusterName(project.id, environment)}-${snapshot.id}`.length).toBeGreaterThan(53);

        const legacy: K8sObject = {
          apiVersion: 'postgresql.cnpg.io/v1',
          kind: 'Backup',
          metadata: { name: legacyName, namespace: 'project-databases', uid: randomUUID() },
          status: { phase: 'completed' },
        };
        resources.set(key('Backup', legacyName), legacy);
        expect(await provider.takeSnapshot({ projectId: project.id, snapshotId: snapshot.id, environment })).toEqual({
          applied: true,
        });
        expect(
          await provider.backupStatus({ projectId: project.id, snapshotId: snapshot.id, environment }),
        ).toMatchObject({ found: true, completed: true });

        const record = await store.backupProvenance.get(project.id, environment, snapshot.id);
        expect(record?.backupName).toMatch(/^bkp-v2-[a-f0-9]{40}$/);
        expect(record?.backupUid).toBe(resources.get(key('Backup', record!.backupName))?.metadata.uid);
        expect(resources.get(key('Backup', legacyName))).toEqual(legacy);

        const fresh = createDatabaseClient({ poolMax: 1 });

        try {
          expect(
            await resolveDefaultDatabaseProvisioner(new PrismaDatabaseBackupProvenanceRepository(fresh)).backupStatus({
              projectId: project.id,
              snapshotId: snapshot.id,
              environment,
            }),
          ).toMatchObject({ completed: true });
        } finally {
          await fresh.$disconnect();
        }
      }

      const checkpoint = `ckdb_${randomUUID().slice(0, 12)}`;
      expect(onDemandBackupName(project.id, checkpoint, environment)).toContain('_');
      expect(await provider.takeSnapshot({ projectId: project.id, snapshotId: checkpoint, environment })).toEqual({
        applied: true,
      });
      expect(provenBackupName(project.id, checkpoint, environment)).not.toContain('_');
    },
  );
  it('passes the production migration guard with its production backup and performs real local transactional DDL', async () => {
    const { project, organization } = await seed();
    const schema = `backup_migration_${randomUUID().replaceAll('-', '')}`;
    schemas.push(schema);
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const connection = new URL(url!);
    connection.searchParams.set('options', `-c search_path=${schema}`);

    const provider = resolveDefaultDatabaseProvisioner(store.backupProvenance);

    const request = {
      store,
      provisioner: provider,
      projectId: project.id,
      organizationId: organization.id,
      environment: 'production',
      idempotencyKey: randomUUID(),
      migrations: [{ name: '001_current.sql', sql: 'CREATE TABLE migration_probe (value text)' }],
      connectionString: connection.toString(),
      applySql: createPostgresMigrationApplier({ sha256: (text) => createHash('sha256').update(text).digest('hex') }),
      sleep: async () => {},
      backupTimeoutMs: 1000,
    };

    const result = await runPublishMigration(request);
    expect(result).toMatchObject({ ok: true, state: 'COMMITTED' });

    const intents = await prisma.databaseBackupProvenance.findMany({ where: { projectId: project.id } });
    expect(intents).toHaveLength(1);
    expect(intents[0].environment).toBe('production');
    expect(intents[0].snapshotId).toMatch(/^mig_c/);
    expect(intents[0].sourceName).toBe(clusterName(project.id, 'production'));
    expect((await admin.query('SELECT to_regclass($1) AS name', [`${schema}.migration_probe`])).rows[0].name).toBe(
      `${schema}.migration_probe`,
    );

    const before = created;
    expect(await runPublishMigration(request)).toMatchObject({ ok: true, replayed: true });
    expect(created).toBe(before);
  });
  it('reconciles lost acknowledgement and concurrent creation, then rejects UID replacement and legacy adoption', async () => {
    const { project } = await seed();

    const request = {
      projectId: project.id,
      snapshotId: `ckdb_${randomUUID().slice(0, 12)}`,
      environment: 'development' as DatabaseEnvironment,
    };

    const before = created;
    loseNextAcknowledgement = true;

    const [a, b] = await Promise.all([
      resolveDefaultDatabaseProvisioner(store.backupProvenance).takeSnapshot(request),
      resolveDefaultDatabaseProvisioner(store.backupProvenance).takeSnapshot(request),
    ]);
    expect(a).toEqual({ applied: true });
    expect(b).toEqual({ applied: true });
    expect(created - before).toBe(1);

    const record = await store.backupProvenance.get(request.projectId, request.environment, request.snapshotId);
    const resource = resources.get(key('Backup', record!.backupName))!;
    resources.set(key('Backup', record!.backupName), {
      ...resource,
      metadata: { ...resource.metadata, uid: randomUUID() },
    });
    expect(await resolveDefaultDatabaseProvisioner(store.backupProvenance).backupStatus(request)).toMatchObject({
      completed: false,
    });
    resources.delete(key('Backup', record!.backupName));

    const attempts = createAttempts;
    await expect(resolveDefaultDatabaseProvisioner(store.backupProvenance).takeSnapshot(request)).rejects.toThrow();
    expect(createAttempts).toBe(attempts);
    expect(
      await resolveDefaultDatabaseProvisioner(store.backupProvenance).backupStatus({
        ...request,
        snapshotId: 'unlinked-legacy',
      }),
    ).toMatchObject({ found: false, completed: false });
  });
});
