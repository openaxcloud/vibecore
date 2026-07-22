/**
 * Physical (out-of-database) erasure for account purge — the missing half of the
 * §16.12 deletion machine. PR #43 erases DB rows with a "0 rows remaining" proof;
 * this module does the same for a purged account's PHYSICAL storage:
 *   - the per-project GCS object-storage buckets (`vc-<projectId>`), and
 *   - the per-project workspace volumes (PVCs), via workspace-manager.
 *
 * It follows the same evidence discipline as the DB purge — list BEFORE →
 * delete → re-count AFTER — and emits `PurgeClassReport`s (object_storage,
 * workspace_volumes) so the erasure folds straight into the existing
 * `ErasureProof.verifiedZeroRemaining`. FAIL-CLOSED: any bucket/volume that
 * does not re-count to 0 (or whose delete threw) leaves `remainingAfterPurge`
 * > 0, which forbids stamping the account `purged`.
 *
 * All I/O is behind injected ports so the orchestration is unit-testable with
 * in-memory fakes and replayable against a throwaway test bucket/volume — never
 * production user data.
 */
import type { PurgeClassReport } from './account-purge.js';

/** Object-storage operations the erasure needs (a subset of ObjectStorage). */
export interface ObjectStorageErasurePort {
  bucketExists(projectId: string): Promise<boolean>;
  listObjects(projectId: string): Promise<{ objects: Array<{ key: string }> }>;
  deleteBucket(projectId: string): Promise<{ deleted: boolean; bucket: string }>;
}

/** Workspace-volume operations, backed by workspace-manager over HTTP. */
export interface WorkspaceVolumeErasurePort {
  /** True while the workspace (hence its PVC) still exists. */
  workspaceExists(workspaceId: string): Promise<boolean>;
  /** Delete the workspace's Pod+PVC+Service+Secret. Idempotent. */
  deleteWorkspace(workspaceId: string): Promise<void>;
}

export interface StorageErasureLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface StorageErasureDeps {
  /** Undefined => object storage not wired; that class reports nothing to erase. */
  objectStorage?: ObjectStorageErasurePort;
  /** Undefined => workspace volumes not wired; that class reports nothing to erase. */
  workspaceVolumes?: WorkspaceVolumeErasurePort;
  /** projectId → deterministic runtime workspace id (runtimeWorkspaceId). */
  workspaceIdFor: (projectId: string) => string;
  log?: StorageErasureLogger;
}

/** Per-project before/after evidence for one project's physical storage. */
export interface ProjectErasureResult {
  projectId: string;
  objectsBefore: number;
  bucketDeleted: boolean;
  objectsRemaining: number;
  workspaceId: string;
  workspaceExistedBefore: boolean;
  workspaceRemaining: number;
}

export interface StorageErasureOutcome {
  results: ProjectErasureResult[];
  /** object_storage + workspace_volumes reports, ready to fold into the proof. */
  classes: PurgeClassReport[];
  /** True only when every bucket AND workspace re-counted to 0 remaining. */
  verified: boolean;
}

async function eraseObjectStorage(
  projectId: string,
  port: ObjectStorageErasurePort | undefined,
  log?: StorageErasureLogger,
): Promise<{ objectsBefore: number; bucketDeleted: boolean; objectsRemaining: number }> {
  if (!port) {
    return { objectsBefore: 0, bucketDeleted: false, objectsRemaining: 0 };
  }

  try {
    if (!(await port.bucketExists(projectId))) {
      // No bucket for this project — nothing physical to erase.
      return { objectsBefore: 0, bucketDeleted: false, objectsRemaining: 0 };
    }

    const objectsBefore = (await port.listObjects(projectId)).objects.length;
    const del = await port.deleteBucket(projectId);

    // Re-verify against the live backend: the bucket must be gone (or empty).
    const objectsRemaining = (await port.bucketExists(projectId)) ? (await port.listObjects(projectId)).objects.length : 0;

    return { objectsBefore, bucketDeleted: del.deleted, objectsRemaining };
  } catch (error) {
    log?.warn({ projectId, err: error }, 'object-storage erase failed');

    // Fail-closed: an errored delete cannot be proven erased.
    return { objectsBefore: 0, bucketDeleted: false, objectsRemaining: 1 };
  }
}

async function eraseWorkspaceVolume(
  workspaceId: string,
  port: WorkspaceVolumeErasurePort | undefined,
  log?: StorageErasureLogger,
): Promise<{ workspaceExistedBefore: boolean; workspaceRemaining: number }> {
  if (!port) {
    return { workspaceExistedBefore: false, workspaceRemaining: 0 };
  }

  try {
    const workspaceExistedBefore = await port.workspaceExists(workspaceId);

    if (!workspaceExistedBefore) {
      return { workspaceExistedBefore: false, workspaceRemaining: 0 };
    }

    await port.deleteWorkspace(workspaceId);
    const workspaceRemaining = (await port.workspaceExists(workspaceId)) ? 1 : 0;

    return { workspaceExistedBefore: true, workspaceRemaining };
  } catch (error) {
    log?.warn({ workspaceId, err: error }, 'workspace-volume erase failed');

    return { workspaceExistedBefore: true, workspaceRemaining: 1 };
  }
}

/**
 * Erase the physical storage of every given project and assemble the auditable
 * evidence. Idempotent (a missing bucket/workspace is a verified no-op), so the
 * purge worker can safely retry.
 */
export async function eraseProjectsStorage(
  projectIds: string[],
  deps: StorageErasureDeps,
): Promise<StorageErasureOutcome> {
  const results: ProjectErasureResult[] = [];

  for (const projectId of projectIds) {
    const workspaceId = deps.workspaceIdFor(projectId);
    const os = await eraseObjectStorage(projectId, deps.objectStorage, deps.log);
    const ws = await eraseWorkspaceVolume(workspaceId, deps.workspaceVolumes, deps.log);

    results.push({ projectId, workspaceId, ...os, ...ws });
  }

  const objectsErased = results.reduce((sum, r) => sum + r.objectsBefore, 0);
  const bucketsDeleted = results.filter((r) => r.bucketDeleted).length;
  const objectsRemaining = results.reduce((sum, r) => sum + r.objectsRemaining, 0);
  const workspacesDeleted = results.filter((r) => r.workspaceExistedBefore && r.workspaceRemaining === 0).length;
  const workspacesRemaining = results.reduce((sum, r) => sum + r.workspaceRemaining, 0);

  const classes: PurgeClassReport[] = [
    {
      dataClass: 'object_storage',
      action: 'deleted',
      models: { Projects: projectIds.length, BucketsDeleted: bucketsDeleted, ObjectsErased: objectsErased },
      remainingAfterPurge: objectsRemaining,
    },
    {
      dataClass: 'workspace_volumes',
      action: 'deleted',
      models: { Projects: projectIds.length, WorkspacesDeleted: workspacesDeleted },
      remainingAfterPurge: workspacesRemaining,
    },
  ];

  const verified = classes.every((entry) => entry.remainingAfterPurge === 0);

  return { results, classes, verified };
}
