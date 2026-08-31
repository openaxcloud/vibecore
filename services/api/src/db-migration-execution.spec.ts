import { describe, expect, it, vi } from 'vitest';

import type { DatabaseProvisioner } from './database-provisioner.js';
import { MigrationCommitAmbiguousError, MigrationRolledBackError } from './db-migration-applier.js';
import {
  hashStatements,
  migrationRequestHash,
  runPublishMigration,
  sha256,
  type DeclaredMigration,
  type MigrationTargetInspection,
  type SqlApplier,
} from './db-migration-execution.js';
import { TestApiStore } from './tests/test-api-store.js';

const migrations: DeclaredMigration[] = [
  { name: '001_users.sql', sql: 'CREATE TABLE users (id int)', sha256: sha256('CREATE TABLE users (id int)') },
  {
    name: '002_email.sql',
    sql: 'ALTER TABLE users ADD COLUMN email text',
    sha256: sha256('ALTER TABLE users ADD COLUMN email text'),
  },
];

function provisioner(completed = true): DatabaseProvisioner {
  return {
    active: true,
    async takeSnapshot() {
      return { applied: true };
    },
    async backupStatus() {
      return { found: true, completed, phase: completed ? 'completed' : 'failed' };
    },
  } as unknown as DatabaseProvisioner;
}

class MemoryApplier implements SqlApplier {
  readonly ledger = new Map<string, string>();
  applyCalls = 0;
  beforeCommitHook?: () => void | Promise<void>;
  inspectHook?: () => void | Promise<void>;

  async apply(input: Parameters<SqlApplier['apply']>[0]) {
    this.applyCalls += 1;
    const pending = new Map(input.migrations.map((migration) => [migration.name, migration.sha256]));

    try {
      await this.beforeCommitHook?.();
      await input.beforeCommit();
    } catch (error) {
      throw new MigrationRolledBackError(error);
    }

    for (const [name, digest] of pending) {
      this.ledger.set(name, digest);
    }

    return { applied: input.migrations.map(({ name }) => name) };
  }

  async inspect(input: Parameters<SqlApplier['inspect']>[0]): Promise<MigrationTargetInspection> {
    await this.inspectHook?.();
    const matching = input.plan.filter(({ name, sha256: digest }) => this.ledger.get(name) === digest);

    const mismatch = input.plan.some(({ name, sha256: digest }) => {
      const existing = this.ledger.get(name);
      return existing !== undefined && existing !== digest;
    });

    return {
      status: mismatch
        ? 'MISMATCH'
        : matching.length === 0
          ? 'EMPTY'
          : matching.length === input.plan.length
            ? 'COMPLETE'
            : 'PARTIAL',
      applied: matching.map(({ name }) => name),
    };
  }
}

function input(store = new TestApiStore(), applier = new MemoryApplier()) {
  const statementsSha256 = hashStatements(migrations);
  return {
    store,
    applier,
    provisioner: provisioner(),
    projectId: 'project-1',
    organizationId: 'org-1',
    environment: 'production' as const,
    idempotencyKey: `publish:deployment-1:${statementsSha256.slice(0, 20)}`,
    requestHash: migrationRequestHash({
      projectId: 'project-1',
      organizationId: 'org-1',
      environment: 'production',
      deploymentId: 'deployment-1',
      statementsSha256,
      backwardCompatible: true,
      forwardCompatible: false,
    }),
    migrations,
    connectionString: 'postgres://target',
    engine: 'postgres',
    physicalAuthority: {
      tier: 'isolated' as const,
      clusterName: 'db-project-1-prod',
      backupBucket: 'vibecore-test-db-backups',
      backupPrefix: 'db/project-1/production/',
      retentionDays: 28,
    },
    deploymentId: 'deployment-1',
    backwardCompatible: true,
    forwardCompatible: false,
    assertReleaseAuthority: async () => undefined,
    ttlMs: 5_000,
    renewIntervalMs: 1_000,
    backupPollIntervalMs: 0,
  };
}

describe('fenced publish migration', () => {
  it('backs up, applies, verifies and releases the singleton', async () => {
    const run = input();
    const result = await runPublishMigration(run);
    expect(result).toMatchObject({ ok: true, state: 'COMMITTED', appliedStatements: 2, replayed: false });

    const execution = [...run.store.migrationExecutions.values()][0]!;
    expect(execution).toMatchObject({ state: 'COMMITTED', activeLock: undefined });
    expect(execution.backupVerificationMethod).toBe('cnpg-backup-status-completed');
  });

  it('replays a committed request without applying twice', async () => {
    const run = input();
    await runPublishMigration(run);

    const replay = await runPublishMigration(run);
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(run.applier.applyCalls).toBe(1);
  });

  it('never reports an earlier failed attempt as success', async () => {
    const run = input();
    run.provisioner = provisioner(false);
    expect(await runPublishMigration(run)).toMatchObject({ ok: false, code: 'MIGRATION_BACKUP_UNVERIFIED' });
    expect(await runPublishMigration(run)).toMatchObject({
      ok: false,
      code: 'MIGRATION_PREVIOUS_ATTEMPT_FAILED',
    });
  });

  it('refuses a live concurrent execution', async () => {
    const run = input();
    await run.store.acquireDatabaseMigrationExecution({
      projectId: run.projectId,
      organizationId: run.organizationId,
      environment: run.environment,
      idempotencyKey: 'other-request',
      requestHash: 'other-hash',
      ownerToken: 'other-owner',
      ttlMs: 60_000,
      plan: [],
      statementsSha256: 'other',
      backwardCompatible: true,
      forwardCompatible: false,
    });
    expect(await runPublishMigration(run)).toMatchObject({ ok: false, code: 'MIGRATION_LOCK_HELD' });
    expect(run.applier.applyCalls).toBe(0);
  });

  it('detects an idempotency key reused for different content', async () => {
    const run = input();
    await run.store.acquireDatabaseMigrationExecution({
      projectId: run.projectId,
      organizationId: run.organizationId,
      environment: run.environment,
      idempotencyKey: run.idempotencyKey,
      requestHash: 'different',
      ownerToken: 'other-owner',
      ttlMs: 60_000,
      plan: [],
      statementsSha256: 'other',
      backwardCompatible: true,
      forwardCompatible: false,
    });
    expect(await runPublishMigration(run)).toMatchObject({
      ok: false,
      code: 'MIGRATION_IDEMPOTENCY_COLLISION',
    });
  });

  it('losing the control-plane lease before COMMIT blocks finalization', async () => {
    const run = input();

    run.applier.beforeCommitHook = () => {
      const execution = [...run.store.migrationExecutions.values()][0]!;
      run.store.migrationExecutions.set(execution.id, { ...execution, ownerToken: 'stolen' });
    };

    const result = await runPublishMigration(run);
    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_LEASE_LOST' });
    expect([...run.store.migrationExecutions.values()][0]!.state).not.toBe('COMMITTED');
    expect(run.applier.ledger.size).toBe(0);
  });

  it('rolls back every target write when release authority is lost immediately before COMMIT', async () => {
    const run = input();
    let releaseAuthorityHeld = true;
    run.assertReleaseAuthority = async () => {
      if (!releaseAuthorityHeld) {
        throw Object.assign(new Error('Project release barrier was lost.'), {
          code: 'PROJECT_RELEASE_BARRIER_LOST',
          statusCode: 409,
        });
      }
    };
    run.applier.beforeCommitHook = () => {
      releaseAuthorityHeld = false;
    };

    await expect(runPublishMigration(run)).rejects.toMatchObject({
      code: 'PROJECT_RELEASE_BARRIER_LOST',
      statusCode: 409,
    });

    expect(run.applier.ledger.size).toBe(0);
    expect([...run.store.migrationExecutions.values()][0]).toMatchObject({
      state: 'FAILED_SAFE',
      activeLock: undefined,
      errorCode: 'RELEASE_AUTHORITY_LOST_BEFORE_COMMIT',
    });
  });

  it('stops after snapshot submission when release authority is lost during backup', async () => {
    const run = input();
    let releaseAuthorityHeld = true;
    run.assertReleaseAuthority = async () => {
      if (!releaseAuthorityHeld) {
        throw Object.assign(new Error('Project release barrier was lost.'), {
          code: 'PROJECT_RELEASE_BARRIER_LOST',
          statusCode: 409,
        });
      }
    };
    run.provisioner.takeSnapshot = async () => {
      releaseAuthorityHeld = false;
      return { applied: true };
    };

    await expect(runPublishMigration(run)).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
    expect(run.applier.applyCalls).toBe(0);
    expect(run.applier.ledger.size).toBe(0);
    expect([...run.store.migrationExecutions.values()][0]!.state).toBe('LOCK_ACQUIRED');
  });

  it('revalidates release authority on both sides of every backup sleep', async () => {
    const run = input();
    let releaseAuthorityHeld = true;
    run.assertReleaseAuthority = async () => {
      if (!releaseAuthorityHeld) {
        throw Object.assign(new Error('Project release barrier was lost.'), {
          code: 'PROJECT_RELEASE_BARRIER_LOST',
          statusCode: 409,
        });
      }
    };
    run.provisioner.backupStatus = async () => ({ found: true, completed: false, phase: 'running' });
    run.backupTimeoutMs = 2;
    run.backupPollIntervalMs = 1;
    run.sleep = async () => {
      releaseAuthorityHeld = false;
    };

    await expect(runPublishMigration(run)).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
    expect(run.applier.applyCalls).toBe(0);
  });

  it('does not finalize recovery when release authority is lost across target inspection', async () => {
    const run = input();
    const acquired = await run.store.acquireDatabaseMigrationExecution({
      projectId: run.projectId,
      organizationId: run.organizationId,
      environment: run.environment,
      idempotencyKey: run.idempotencyKey,
      requestHash: run.requestHash,
      ownerToken: 'expired-owner',
      ttlMs: 1,
      plan: migrations.map(({ name, sha256: digest }) => ({ name, sha256: digest })),
      statementsSha256: hashStatements(migrations),
      backwardCompatible: true,
      forwardCompatible: false,
      deploymentId: run.deploymentId,
    });
    run.store.migrationExecutions.set(acquired.execution.id, {
      ...acquired.execution,
      state: 'APPLYING',
      leaseExpiresAt: new Date(Date.now() - 1).toISOString(),
    });
    for (const migration of migrations) {
      run.applier.ledger.set(migration.name, migration.sha256);
    }

    let releaseAuthorityHeld = true;
    run.assertReleaseAuthority = async () => {
      if (!releaseAuthorityHeld) {
        throw Object.assign(new Error('Project release barrier was lost.'), {
          code: 'PROJECT_RELEASE_BARRIER_LOST',
          statusCode: 409,
        });
      }
    };
    run.applier.inspectHook = () => {
      releaseAuthorityHeld = false;
    };

    await expect(runPublishMigration(run)).rejects.toMatchObject({ code: 'PROJECT_RELEASE_BARRIER_LOST' });
    expect([...run.store.migrationExecutions.values()][0]!.state).not.toBe('COMMITTED');
    expect(run.applier.applyCalls).toBe(0);
  });

  it('reconciles a lost COMMIT acknowledgement from the exact target ledger', async () => {
    const run = input();

    run.applier.apply = async (applyInput) => {
      for (const migration of applyInput.migrations) {
        run.applier.ledger.set(migration.name, migration.sha256);
      }
      await applyInput.beforeCommit();
      throw new MigrationCommitAmbiguousError('socket closed after COMMIT');
    };

    const result = await runPublishMigration(run);

    expect(result).toMatchObject({ ok: true, state: 'COMMITTED', replayed: true, appliedStatements: 2 });
    expect([...run.store.migrationExecutions.values()][0]).toMatchObject({
      state: 'COMMITTED',
      activeLock: undefined,
    });
  });

  it('classifies a confirmed transaction rollback as safe even with older ledger entries', async () => {
    const run = input();
    run.applier.ledger.set(migrations[0]!.name, migrations[0]!.sha256);

    run.applier.apply = async () => {
      throw new MigrationRolledBackError(new Error('statement rejected'));
    };

    const result = await runPublishMigration(run);

    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_FAILED_SAFE', state: 'FAILED_SAFE' });
    expect([...run.store.migrationExecutions.values()][0]).toMatchObject({
      state: 'FAILED_SAFE',
      activeLock: undefined,
      errorCode: 'TARGET_TRANSACTION_ROLLED_BACK',
    });
  });

  it('recovers an expired applying row from the target ledger', async () => {
    const run = input();

    const acquired = await run.store.acquireDatabaseMigrationExecution({
      projectId: run.projectId,
      organizationId: run.organizationId,
      environment: run.environment,
      idempotencyKey: run.idempotencyKey,
      requestHash: run.requestHash,
      ownerToken: 'dead-owner',
      ttlMs: 1,
      plan: migrations.map(({ name, sha256: digest }) => ({ name, sha256: digest })),
      statementsSha256: hashStatements(migrations),
      backwardCompatible: true,
      forwardCompatible: false,
      deploymentId: run.deploymentId,
    });

    const row = acquired.execution;
    run.store.migrationExecutions.set(row.id, {
      ...row,
      state: 'APPLYING',
      leaseExpiresAt: new Date(Date.now() - 1).toISOString(),
    });

    for (const migration of migrations) {
      run.applier.ledger.set(migration.name, migration.sha256);
    }

    const result = await runPublishMigration(run);
    expect(result).toMatchObject({ ok: true, replayed: true, state: 'COMMITTED' });
    expect(run.applier.applyCalls).toBe(0);
  });

  it('rechecks a manual-recovery execution and finalizes only an exact complete ledger', async () => {
    const run = input();

    const acquired = await run.store.acquireDatabaseMigrationExecution({
      projectId: run.projectId,
      organizationId: run.organizationId,
      environment: run.environment,
      idempotencyKey: run.idempotencyKey,
      requestHash: run.requestHash,
      ownerToken: 'operator-review',
      ttlMs: 5_000,
      plan: migrations.map(({ name, sha256: digest }) => ({ name, sha256: digest })),
      statementsSha256: hashStatements(migrations),
      backwardCompatible: true,
      forwardCompatible: false,
      deploymentId: run.deploymentId,
    });

    const row = acquired.execution;
    run.store.migrationExecutions.set(row.id, {
      ...row,
      state: 'MANUAL_RECOVERY',
      ownerToken: undefined,
      leaseExpiresAt: undefined,
      errorCode: 'TARGET_UNAVAILABLE',
    });

    for (const migration of migrations) {
      run.applier.ledger.set(migration.name, migration.sha256);
    }

    const result = await runPublishMigration(run);

    expect(result).toMatchObject({ ok: true, replayed: true, state: 'COMMITTED' });
    expect(run.applier.applyCalls).toBe(0);
  });

  it('retains the project lock while a partial target needs manual recovery', async () => {
    const run = input();
    run.applier.ledger.set(migrations[0]!.name, migrations[0]!.sha256);

    run.applier.apply = async () => {
      throw new Error('connection dropped with unknown outcome');
    };

    const first = await runPublishMigration(run);
    expect(first).toMatchObject({ ok: false, code: 'MIGRATION_MANUAL_RECOVERY', state: 'MANUAL_RECOVERY' });

    const row = [...run.store.migrationExecutions.values()][0]!;
    expect(row).toMatchObject({
      state: 'MANUAL_RECOVERY',
      activeLock: `${run.projectId}:${run.environment}`,
      ownerToken: undefined,
      leaseExpiresAt: undefined,
    });

    const competing = await runPublishMigration({
      ...run,
      idempotencyKey: 'publish:replacement',
      requestHash: 'replacement-request',
    });
    expect(competing).toMatchObject({
      ok: false,
      code: 'MIGRATION_MANUAL_RECOVERY',
      state: 'MANUAL_RECOVERY',
    });
    expect(run.applier.applyCalls).toBe(0);
  });

  it('refuses non-Postgres engines and compatibility not explicitly true', async () => {
    expect(await runPublishMigration({ ...input(), engine: 'mysql' })).toMatchObject({
      ok: false,
      code: 'MIGRATION_ENGINE_UNSUPPORTED',
    });
    expect(await runPublishMigration({ ...input(), backwardCompatible: false })).toMatchObject({
      ok: false,
      code: 'MIGRATION_UNSAFE_PLAN',
    });
  });

  it('hashes name and content pins deterministically', () => {
    expect(hashStatements(migrations)).toHaveLength(64);
    expect(hashStatements(migrations)).not.toBe(
      hashStatements([{ ...migrations[0]!, sha256: sha256('different') }, migrations[1]!]),
    );
    expect(vi.isMockFunction(vi.fn())).toBe(true);
  });
});
