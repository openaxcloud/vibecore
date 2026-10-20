import type { Prisma } from '@vibecore/database';
import { DatabaseRestoreError } from './database-restore-contract.js';

/** Caller holds the Project row lock, shared with restore admission/cutover. */
export async function guardProjectRestoreMutation(
  tx: Prisma.TransactionClient,
  projectId: string,
  requiresTargetLifecycle = false,
) {
  const active = await tx.databaseRestoreExecution.findFirst({
    where: { activeLock: { not: null }, restore: { databaseInstance: { projectId } } },
    select: { restoreId: true },
  });

  if (active) {
    throw new DatabaseRestoreError('RESTORE_PROJECT_LOCKED');
  }

  if (requiresTargetLifecycle) {
    const restored = await tx.databaseInstance.findFirst({
      where: { projectId, activeTargetRef: { not: null } },
      select: { id: true },
    });

    if (restored) {
      throw new DatabaseRestoreError('RESTORE_TARGET_LIFECYCLE_UNAVAILABLE', 503);
    }
  }
}

/** Same lock order as cutover: project, instance, then the mutation. */
export async function guardDatabaseBindingMutation(tx: Prisma.TransactionClient, projectId: string, key: string) {
  if (key !== 'DATABASE_URL' && key !== 'PROD_DATABASE_URL') {
    return;
  }

  const environment = key === 'PROD_DATABASE_URL' ? 'production' : 'development';
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "DatabaseInstance" WHERE "projectId" = ${projectId} AND environment = ${environment} FOR UPDATE`;

  const active = await tx.databaseRestoreExecution.findFirst({
    where: {
      activeLock: { not: null },
      restore: { databaseInstance: { projectId, environment } },
    },
    select: { restoreId: true },
  });

  if (active) {
    throw new DatabaseRestoreError('RESTORE_BINDING_LOCKED');
  }
}
