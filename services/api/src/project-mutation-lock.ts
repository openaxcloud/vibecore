import { Prisma } from '@vibecore/database';

/**
 * One global order for every mutation which can change a project's tenant,
 * checkpoint barrier, or release authority. Account purge takes the topology
 * lock while it inventories and freezes ownership, so topology must always be
 * first. The project checkpoint advisory lock serializes durable barriers and
 * manifest writers; the Project row is last and makes organization revalidation
 * linearizable with a transfer.
 */
export async function lockProjectAfterPurgeTopology(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`project-checkpoint:${projectId}`}, 0))
  `;
  await tx.$queryRawUnsafe('SELECT "id" FROM "Project" WHERE "id" = $1 FOR UPDATE', projectId);
}

/**
 * Take the complete project-mutation order when the caller does not already
 * own the account-purge topology lock. Callers that first fence a user through
 * `assertAccountPurgeMutationAllowed` hold a shared topology lock and must use
 * `lockProjectAfterPurgeTopology`: attempting to upgrade two concurrent shared
 * advisory locks to exclusive would deadlock.
 */
export async function lockProjectMutation(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', 'account-purge:topology');
  await lockProjectAfterPurgeTopology(tx, projectId);
}
