import type { Prisma } from '@vibecore/database';
import { DatabaseRestoreError } from './database-restore-contract.js';

export async function lockRestoreAdmissionScope(tx: Prisma.TransactionClient, projectId: string, instanceId: string) {
  /*
   * Admission must not consume an interactive transaction waiting behind an
   * unrelated mutation. A busy scope is distinct from a persisted restore.
   */
  const projects = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE SKIP LOCKED`;

  if (projects.length !== 1) {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });

    throw new DatabaseRestoreError(project ? 'RESTORE_ADMISSION_BUSY' : 'RESTORE_INSTANCE_CHANGED');
  }

  const instances = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "DatabaseInstance" WHERE id = ${instanceId} FOR UPDATE SKIP LOCKED`;

  if (instances.length !== 1) {
    const instance = await tx.databaseInstance.findUnique({ where: { id: instanceId }, select: { id: true } });

    throw new DatabaseRestoreError(instance ? 'RESTORE_ADMISSION_BUSY' : 'RESTORE_INSTANCE_CHANGED');
  }
}
