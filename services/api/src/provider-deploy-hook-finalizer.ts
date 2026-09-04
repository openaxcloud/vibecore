import { Prisma } from '@vibecore/database';

function terminalProof(row: {
  phase: string;
  outcomeStatus: string | null;
  providerTerminalStatus: string | null;
  providerBuildId: string | null;
  decommissionedAt: Date | null;
}): boolean {
  return (
    row.phase === 'TERMINAL' &&
    ((row.outcomeStatus === 'REJECTED' &&
      row.providerTerminalStatus === 'REJECTED' &&
      row.providerBuildId === null) ||
      (row.outcomeStatus === 'ACCEPTED' &&
        row.providerBuildId !== null &&
        ['READY', 'FAILED', 'CANCELED'].includes(row.providerTerminalStatus ?? '')) ||
      (row.outcomeStatus === 'CANCELED' &&
        row.providerTerminalStatus === 'CANCELED' &&
        row.decommissionedAt !== null))
  );
}

type LockedProviderDeployHook = {
  id: string;
  phase: string;
  outcomeStatus: string | null;
  providerTerminalStatus: string | null;
  providerBuildId: string | null;
  decommissionedAt: Date | null;
};

async function lockAndAssertProviderDeployHooksTerminal(
  tx: Prisma.TransactionClient,
  scope: { projectId: string; deploymentId?: string },
): Promise<LockedProviderDeployHook[]> {
  const rows = await tx.$queryRaw<LockedProviderDeployHook[]>(Prisma.sql`
    SELECT "id", "phase", "outcomeStatus", "providerTerminalStatus", "providerBuildId", "decommissionedAt"
    FROM "ProviderDeployHookOperation"
    WHERE "projectId" = ${scope.projectId}
      ${scope.deploymentId ? Prisma.sql`AND "deploymentId" = ${scope.deploymentId}` : Prisma.empty}
    ORDER BY "id"
    FOR UPDATE
  `);
  if (rows.some((row) => !terminalProof(row))) {
    throw Object.assign(new Error('Provider deployment outcome is not terminal.'), {
      code: 'PROVIDER_DEPLOY_HOOK_NOT_TERMINAL',
      statusCode: 409,
    });
  }
  return rows;
}

async function finalizeProviderDeployHooks(
  tx: Prisma.TransactionClient,
  scope: { projectId: string; deploymentId?: string },
): Promise<number> {
  const rows = await lockAndAssertProviderDeployHooksTerminal(tx, scope);
  if (rows.length === 0) return 0;
  const deleted = await tx.$executeRaw(Prisma.sql`
    DELETE FROM "ProviderDeployHookOperation"
    WHERE "projectId" = ${scope.projectId}
      ${scope.deploymentId ? Prisma.sql`AND "deploymentId" = ${scope.deploymentId}` : Prisma.empty}
  `);
  if (deleted !== rows.length) {
    throw Object.assign(new Error('Provider deployment ledger changed during finalization.'), {
      code: 'PROVIDER_DEPLOY_HOOK_FINALIZE_CONFLICT',
      statusCode: 409,
    });
  }
  await assertProviderDeployHookRowsAbsent(tx, scope);
  return deleted;
}

/** Finalizer proof: parent deletion may proceed only after the ledger is absent in this transaction. */
async function assertProviderDeployHookRowsAbsent(
  tx: Prisma.TransactionClient,
  scope: { projectId: string; deploymentId?: string },
): Promise<void> {
  const remaining = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ProviderDeployHookOperation"
    WHERE "projectId" = ${scope.projectId}
      ${scope.deploymentId ? Prisma.sql`AND "deploymentId" = ${scope.deploymentId}` : Prisma.empty}
    LIMIT 1
    FOR KEY SHARE
  `);
  if (remaining[0]) {
    throw Object.assign(new Error('Provider deployment ledger finalization was incomplete.'), {
      code: 'PROVIDER_DEPLOY_HOOK_ROWS_PRESENT',
      statusCode: 409,
    });
  }
}

/**
 * Preflight before any permanent-delete claim or provider/filesystem effect.
 * This does not remove recovery identity; the finalizer re-locks and rechecks
 * the same proof in the parent DELETE transaction.
 */
export async function assertProviderDeployHooksTerminalForProjectDeletion(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  await lockAndAssertProviderDeployHooksTerminal(tx, { projectId });
}

/** Re-lock and remove only terminal provider-hook ledgers in the parent DELETE transaction. */
export function finalizeProviderDeployHooksForProjectDeletion(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<number> {
  return finalizeProviderDeployHooks(tx, { projectId });
}

/** Deployment-scoped variant for current/future direct Deployment hard-delete paths. */
export function finalizeProviderDeployHookForDeploymentDeletion(
  tx: Prisma.TransactionClient,
  projectId: string,
  deploymentId: string,
): Promise<number> {
  return finalizeProviderDeployHooks(tx, { projectId, deploymentId });
}
