import type { DatabaseClient } from '@vibecore/database';
import { DatabaseRestoreError } from './database-restore-contract.js';
import type { RestoreWorkScope } from './database-restore-work-admission.js';

const prefix = 'publish-migration:';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Internal attempt identity, persisted in the ticket before any journal/provider effect. */
export function publishMigrationOwner(executionId: string): string {
  if (!uuid.test(executionId)) {
    throw new DatabaseRestoreError('RESTORE_WORK_SCOPE_INVALID');
  }

  return `${prefix}${executionId}`;
}

/**
 * Read-only reconciliation, NEVER a clearance to resume or settle work.
 * Reads are deliberately reported as non-atomic observations: missing journal or
 * provenance can race an in-flight commit. Provider provenance records intent,
 * not provider completion. Even COMMITTED does not settle arbitrary external effects.
 * Callers are internal trusted integrations and must authenticate the scope.
 */
export async function inspectPublishMigrationWork(
  prisma: DatabaseClient,
  input: Omit<RestoreWorkScope, 'ownerIncarnation'> & { ticketId: string },
) {
  const { ticketId, ...scope } = { ...input };
  const ticket = await prisma.databaseRestoreAdmittedWork.findFirst({ where: { id: ticketId, ...scope } });

  if (!ticket) {
    throw new DatabaseRestoreError('RESTORE_WORK_TICKET_MISMATCH');
  }

  const executionId = ticket.ownerIncarnation.startsWith(prefix) ? ticket.ownerIncarnation.slice(prefix.length) : '';
  const observation = { ticketId, canSettle: false as const, canResume: false as const, atomic: false as const };

  if (!uuid.test(executionId)) {
    return { ...observation, kind: 'UNLINKED' as const };
  }

  const snapshotId = `mig_${executionId}`;
  const journal = await prisma.dBMigrationExecution.findFirst({
    where: {
      id: executionId,
      projectId: scope.projectId,
      organizationId: scope.organizationId,
      environment: scope.environment,
    },
    select: { id: true, state: true, backupId: true },
  });
  const provenance = await prisma.databaseBackupProvenance.findFirst({
    where: {
      projectId: scope.projectId,
      organizationId: scope.organizationId,
      instanceId: scope.instanceId,
      environment: scope.environment,
      bindingVersion: scope.bindingVersion,
      snapshotId,
    },
    select: { id: true },
  });

  return {
    ...observation,
    kind: journal ? ('JOURNAL_OBSERVED' as const) : ('JOURNAL_NOT_OBSERVED' as const),
    executionId,
    snapshotId,
    journalState: journal?.state ?? null,
    journalSnapshotMatches: journal?.backupId ? journal.backupId === snapshotId : null,
    snapshotIntentObserved: Boolean(provenance),
  };
}
