import { randomUUID } from 'node:crypto';
import { DatabaseRestoreError } from './database-restore-contract.js';
import type { PrismaRestoreWorkAdmission } from './database-restore-work-admission.js';
import type { ApiStore } from './store.js';

export type DatabaseWriteAdmission = Pick<PrismaRestoreWorkAdmission, 'admitConnection'>;

/**
 * Optional dormant integration for SQL-pane/row-insert paths. No environment
 * switch enables it. Once injected, unsupported/unbound connections fail closed.
 * No automatic settlement: arbitrary SQL may create prepared transactions or
 * external effects even after COMMIT and connection closure.
 */
export async function admitDatabaseWrite(
  admission: DatabaseWriteAdmission | undefined,
  store: ApiStore,
  project: { id: string; organizationId: string },
  connection: { key: string; value: string; kind: string; source: string; ambiguous?: boolean },
  ownerIncarnation: string = randomUUID(),
): Promise<void> {
  if (!admission) {
    return;
  }

  // Copy both identities before any await; never retain a caller-owned secret object.
  const selected = { ...connection };
  const authorized = { ...project };

  if (
    selected.kind !== 'postgres' ||
    selected.source !== 'secret' ||
    selected.ambiguous ||
    !['DATABASE_URL', 'PROD_DATABASE_URL'].includes(selected.key)
  ) {
    throw new DatabaseRestoreError('RESTORE_WORK_CONNECTION_UNSUPPORTED', 503);
  }

  const environment = selected.key === 'PROD_DATABASE_URL' ? 'production' : 'development';
  const instance = await store.getDatabaseInstanceByProject(authorized.id, environment);

  if (!instance || instance.projectId !== authorized.id || instance.organizationId !== authorized.organizationId) {
    throw new DatabaseRestoreError('RESTORE_WORK_BINDING_CHANGED');
  }

  await admission.admitConnection(
    {
      instanceId: instance.id,
      projectId: authorized.id,
      organizationId: authorized.organizationId,
      environment,
      bindingVersion: instance.bindingVersion ?? 0,
      targetRef: instance.activeTargetRef ?? null,
      ownerIncarnation,
    },
    { key: selected.key, value: selected.value },
  );
}
