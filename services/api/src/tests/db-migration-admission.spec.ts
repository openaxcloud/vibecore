import { describe, expect, it, vi } from 'vitest';
import type { DatabaseProvisioner } from '../database-provisioner.js';
import { runPublishMigration, type RunPublishMigrationInput } from '../db-migration-execution.js';

function fixture() {
  const store = {
    getMigrationExecutionByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    createMigrationExecution: vi.fn(async (entry) => ({ id: entry.id ?? 'migration', state: 'LOCK_ACQUIRED' })),
    updateMigrationExecution: vi.fn().mockResolvedValue(undefined),
  };

  const takeSnapshot = vi.fn().mockResolvedValue({ applied: true });
  const applySql = vi.fn().mockResolvedValue({ committed: true, applied: ['001.sql'] });

  const input: RunPublishMigrationInput = {
    store,
    provisioner: {
      takeSnapshot,
      backupStatus: async () => ({ found: true, completed: true, phase: 'completed' }),
    } as unknown as DatabaseProvisioner,
    projectId: 'project',
    organizationId: 'organization',
    environment: 'production',
    idempotencyKey: 'migration-key',
    connectionString: 'original-connection',
    migrations: [{ name: '001.sql', sql: 'CREATE TABLE probe(id int)' }],
    applySql,
  };

  return { input, store, takeSnapshot, applySql };
}
describe('migration admission precedes every new external effect', () => {
  it('has no journal, backup or SQL effect while admission is unconfirmed', async () => {
    const { input, store, takeSnapshot, applySql } = fixture();

    let confirm!: () => void;

    const barrier = new Promise<void>((resolve) => {
      confirm = resolve;
    });

    const admission = vi.fn(async () => barrier);
    input.beforeEffects = admission;

    const running = runPublishMigration(input);
    await vi.waitFor(() => expect(admission).toHaveBeenCalledOnce());
    expect(store.createMigrationExecution).not.toHaveBeenCalled();
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(applySql).not.toHaveBeenCalled();
    confirm();
    expect(await running).toMatchObject({ ok: true });
  });
  it('propagates failed admission without declaring a migration success or taking a snapshot', async () => {
    const { input, store, takeSnapshot, applySql } = fixture();

    input.beforeEffects = async () => {
      throw new Error('ADMISSION_UNCERTAIN');
    };
    await expect(runPublishMigration(input)).rejects.toThrow('ADMISSION_UNCERTAIN');
    expect(store.createMigrationExecution).not.toHaveBeenCalled();
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(applySql).not.toHaveBeenCalled();
  });
  it('uses the captured target and SQL even when the caller changes input across an await', async () => {
    const { input, store, takeSnapshot, applySql } = fixture();

    input.beforeEffects = async (target) => {
      expect(target).toEqual({
        projectId: 'project',
        organizationId: 'organization',
        environment: 'production',
        connectionString: 'original-connection',
        executionId: expect.any(String),
        snapshotId: expect.any(String),
      });
      input.projectId = 'changed';
      input.connectionString = 'changed';
      input.migrations[0].sql = 'DROP TABLE unexpected';
    };
    expect(await runPublishMigration(input)).toMatchObject({ ok: true });
    expect(store.createMigrationExecution).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project' }));
    expect(takeSnapshot).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project' }));
    expect(applySql).toHaveBeenCalledWith({
      connectionString: 'original-connection',
      migrations: [{ name: '001.sql', sql: 'CREATE TABLE probe(id int)' }],
    });
  });
  it('does not acquire another ticket for an already committed replay', async () => {
    const { input, store, takeSnapshot, applySql } = fixture();
    store.getMigrationExecutionByIdempotencyKey.mockResolvedValue({
      id: 'existing',
      state: 'COMMITTED',
      appliedStatements: 1,
    });
    input.beforeEffects = vi.fn();
    expect(await runPublishMigration(input)).toMatchObject({ ok: true, replayed: true });
    expect(input.beforeEffects).not.toHaveBeenCalled();
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(applySql).not.toHaveBeenCalled();
  });
  it('binds the reserved attempt to journal and snapshot identities', async () => {
    const { input, store, takeSnapshot } = fixture();
    input.beforeEffects = vi.fn();
    expect(await runPublishMigration(input)).toMatchObject({ ok: true });
    const target = vi.mocked(input.beforeEffects).mock.calls[0][0];
    expect(store.createMigrationExecution).toHaveBeenCalledWith(expect.objectContaining({ id: target.executionId }));
    expect(target.snapshotId).toBe(`mig_${target.executionId}`);
    expect(takeSnapshot).toHaveBeenCalledWith(expect.objectContaining({ snapshotId: target.snapshotId }));
  });
  it.each(['lost journal acknowledgement', 'lock conflict', 'wrong journal identity'])(
    'does not start provider effects after %s',
    async (mode) => {
      const { input, store, takeSnapshot, applySql } = fixture();
      input.beforeEffects = vi.fn();
      if (mode === 'wrong journal identity') {
        store.createMigrationExecution.mockResolvedValue({ id: 'wrong', state: 'LOCK_ACQUIRED' });
        await expect(runPublishMigration(input)).rejects.toThrow('MIGRATION_ADMISSION_ID_MISMATCH');
      } else {
        store.createMigrationExecution.mockRejectedValue(
          Object.assign(new Error('uncertain'), { code: mode === 'lock conflict' ? 'P2002' : undefined }),
        );
        if (mode === 'lock conflict') {
          expect(await runPublishMigration(input)).toMatchObject({ ok: false, code: 'MIGRATION_LOCK_HELD' });
        } else {
          await expect(runPublishMigration(input)).rejects.toThrow('uncertain');
        }
      }
      expect(input.beforeEffects).toHaveBeenCalledOnce();
      expect(takeSnapshot).not.toHaveBeenCalled();
      expect(applySql).not.toHaveBeenCalled();
    },
  );
  it('retains the reserved snapshot identity even if provider acknowledgement is lost', async () => {
    const { input, takeSnapshot, applySql } = fixture();
    input.beforeEffects = vi.fn();
    takeSnapshot.mockRejectedValue(new Error('ack lost'));
    expect(await runPublishMigration(input)).toMatchObject({ ok: false });
    const target = vi.mocked(input.beforeEffects).mock.calls[0][0];
    expect(takeSnapshot).toHaveBeenCalledWith(expect.objectContaining({ snapshotId: target.snapshotId }));
    expect(applySql).not.toHaveBeenCalled();
  });
});
