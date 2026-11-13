import { describe, expect, it, vi } from 'vitest';
import type { DatabaseProvisioner } from '../database-provisioner.js';
import { runPublishMigration, type RunPublishMigrationInput } from '../db-migration-execution.js';

function fixture() {
  const store = {
    getMigrationExecutionByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    createMigrationExecution: vi.fn().mockResolvedValue({ id: 'migration', state: 'LOCK_ACQUIRED' }),
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
});
