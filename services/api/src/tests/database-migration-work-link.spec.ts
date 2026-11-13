import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@vibecore/database';
import { inspectPublishMigrationWork, publishMigrationOwner } from '../database-migration-work-link.js';

const executionId = '11111111-1111-4111-8111-111111111111';
const scope = {
  ticketId: 'ticket',
  instanceId: 'instance',
  projectId: 'project',
  organizationId: 'org',
  environment: 'production' as const,
  bindingVersion: 3,
  targetRef: 'target',
};
function fixture() {
  const db = {
    databaseRestoreAdmittedWork: {
      findFirst: vi.fn().mockResolvedValue({ ownerIncarnation: publishMigrationOwner(executionId) }),
    },
    dBMigrationExecution: { findFirst: vi.fn().mockResolvedValue(null) },
    databaseBackupProvenance: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { db, inspect: () => inspectPublishMigrationWork(db as unknown as DatabaseClient, scope) };
}
describe('read-only publish work reconciliation', () => {
  it('reports orphan observation without implying no effect or permission to resume', async () => {
    const { db, inspect } = fixture();
    expect(await inspect()).toMatchObject({
      kind: 'JOURNAL_NOT_OBSERVED',
      executionId,
      snapshotId: `mig_${executionId}`,
      snapshotIntentObserved: false,
      canResume: false,
      canSettle: false,
      atomic: false,
    });
    expect(db.databaseRestoreAdmittedWork.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'ticket',
        instanceId: 'instance',
        projectId: 'project',
        organizationId: 'org',
        environment: 'production',
        bindingVersion: 3,
        targetRef: 'target',
      },
    });
    expect(db.dBMigrationExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: executionId, projectId: 'project', organizationId: 'org', environment: 'production' },
      }),
    );
    expect(db.databaseBackupProvenance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ instanceId: 'instance', bindingVersion: 3, snapshotId: `mig_${executionId}` }),
      }),
    );
  });
  it.each(['COMMITTED', 'FAILED_SAFE', 'MANUAL_RECOVERY'])(
    'never clears debt from journal %s or snapshot intent',
    async (state) => {
      const { db, inspect } = fixture();
      db.dBMigrationExecution.findFirst.mockResolvedValue({ id: executionId, state, backupId: `mig_${executionId}` });
      db.databaseBackupProvenance.findFirst.mockResolvedValue({ id: 'provenance' });
      expect(await inspect()).toMatchObject({
        kind: 'JOURNAL_OBSERVED',
        journalState: state,
        snapshotIntentObserved: true,
        journalSnapshotMatches: true,
        canSettle: false,
        canResume: false,
      });
    },
  );
  it('fails closed on missing scoped ticket', async () => {
    const { db, inspect } = fixture();
    db.databaseRestoreAdmittedWork.findFirst.mockResolvedValue(null);
    await expect(inspect()).rejects.toMatchObject({ code: 'RESTORE_WORK_TICKET_MISMATCH' });
    expect(db.dBMigrationExecution.findFirst).not.toHaveBeenCalled();
  });
  it('does not guess legacy or malformed owner identities', async () => {
    const { db, inspect } = fixture();
    db.databaseRestoreAdmittedWork.findFirst.mockResolvedValue({ ownerIncarnation: 'legacy-worker' });
    expect(await inspect()).toMatchObject({ kind: 'UNLINKED', canSettle: false });
    expect(db.dBMigrationExecution.findFirst).not.toHaveBeenCalled();
    expect(() => publishMigrationOwner('not-an-uuid')).toThrow();
  });
  it('propagates read uncertainty, never fabricates an absence observation', async () => {
    const { db, inspect } = fixture();
    db.dBMigrationExecution.findFirst.mockRejectedValue(new Error('read unavailable'));
    await expect(inspect()).rejects.toThrow('read unavailable');
  });
});
