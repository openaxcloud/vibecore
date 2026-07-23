/**
 * Physical (out-of-database) erasure for account purge — the missing half of the
 * §16.12 deletion machine. PR #43 erases DB rows with a "0 rows remaining" proof;
 * this module does the same for a purged DATA SUBJECT's PHYSICAL storage:
 *   - the per-project GCS object-storage buckets (`vc-<projectId>`) they own, and
 *   - EVERY per-subject workspace volume (PVC), wherever it lives.
 *
 * It answers the four expert reserves on PR #47:
 *
 *  #1 WRITE BARRIER — writes are frozen BEFORE erasure (`WriteBarrierPort.freeze`)
 *     so nothing can be recreated between the erase/verify and the tombstone.
 *  #2 REAL DISAPPEARANCE — verification re-checks the LIVE backend (GCS list /
 *     Kubernetes PVC), never a DB `DELETED` flag, because k8s deletes can be
 *     partial (a PVC can survive a "deleted" row).
 *  #3 BY DATA SUBJECT — the inventory is per-subject: their sole-org buckets AND
 *     their workspace in every project they touched (incl. collaborator
 *     workspaces in shared orgs), not just the one main `workspaceId`.
 *  #4 REAL PROOF — the ports are the real GCS/Kubernetes adapters in the E2E; the
 *     list-BEFORE → delete → recount-AFTER evidence folds into the ErasureProof.
 *
 * FAIL-CLOSED: any bucket/PVC that does not re-count to 0 (or whose delete threw,
 * or whose freeze failed) leaves `remainingAfterPurge` > 0, which forbids
 * stamping the account `purged`. Idempotent, so the worker can safely retry.
 */
import type { PurgeClassReport } from './account-purge.js';

/** Object-storage operations the erasure needs (a subset of ObjectStorage). */
export interface ObjectStorageErasurePort {
  /**
   * True only for a REAL, wired backend. Reserve #2: an inert NoopObjectStorage
   * (feature flag off) must NEVER be allowed to certify "bucket absent" — a
   * no-op means "cannot prove", so a destructive purge with buckets to erase is
   * REFUSED unless a real backend is present.
   */
  readonly active: boolean;
  bucketExists(projectId: string): Promise<boolean>;
  listObjects(projectId: string): Promise<{ objects: Array<{ key: string }> }>;
  deleteBucket(projectId: string): Promise<{ deleted: boolean; bucket: string }>;
}

/**
 * Workspace-volume operations. `pvcExists` MUST reflect the REAL Kubernetes PVC
 * (reserve #2) — a live `kubectl get pvc`, not the workspace row's status — so a
 * PVC that survives a partial delete is caught as remaining.
 */
export interface WorkspaceVolumeErasurePort {
  pvcExists(workspaceId: string): Promise<boolean>;
  deleteWorkspace(workspaceId: string): Promise<void>;
}

/**
 * Freezes writes to the subject's storage BEFORE erasure (reserve #1): revoke
 * workspace tokens / stop pods / mark projects non-provisionable, so nothing can
 * be recreated in the window between erase-verify and the tombstone. Must throw
 * on failure (the erasure then fails closed).
 */
export interface WriteBarrierPort {
  freeze(inventory: StorageErasureInventory): Promise<void>;
}

export interface StorageErasureLogger {
  warn(obj: unknown, msg?: string): void;
}

/** The per-subject physical footprint to erase (reserve #3). */
export interface StorageErasureInventory {
  /** Projects whose per-project GCS bucket the subject owns (their sole orgs). */
  bucketProjectIds: string[];
  /** EVERY per-subject workspace id (sole-org + shared/collaborator workspaces). */
  workspaceIds: string[];
}

export interface StorageErasureDeps {
  /** Undefined => object storage not wired; that class reports nothing to erase. */
  objectStorage?: ObjectStorageErasurePort;
  /** Undefined => workspace volumes not wired; that class reports nothing to erase. */
  workspaceVolumes?: WorkspaceVolumeErasurePort;
  /** Undefined => no write barrier (unit tests of the erase math). */
  writeBarrier?: WriteBarrierPort;
  log?: StorageErasureLogger;
}

/** Per-bucket before/after evidence. */
export interface BucketErasureResult {
  projectId: string;
  objectsBefore: number;
  bucketDeleted: boolean;
  objectsRemaining: number;
}

/** Per-workspace before/after evidence. */
export interface WorkspaceErasureResult {
  workspaceId: string;
  pvcExistedBefore: boolean;
  pvcRemaining: number;
}

export interface StorageErasureOutcome {
  buckets: BucketErasureResult[];
  workspaces: WorkspaceErasureResult[];
  frozen: boolean;
  /** object_storage + workspace_volumes reports, ready to fold into the proof. */
  classes: PurgeClassReport[];
  /** True only when the barrier held AND every bucket + PVC re-counted to 0. */
  verified: boolean;
}

async function eraseBucket(
  projectId: string,
  port: ObjectStorageErasurePort,
  log?: StorageErasureLogger,
): Promise<BucketErasureResult> {
  try {
    if (!(await port.bucketExists(projectId))) {
      return { projectId, objectsBefore: 0, bucketDeleted: false, objectsRemaining: 0 };
    }

    const objectsBefore = (await port.listObjects(projectId)).objects.length;
    const del = await port.deleteBucket(projectId);

    // Reserve #2/#4: re-check the LIVE bucket, not any cached/DB state.
    const objectsRemaining = (await port.bucketExists(projectId)) ? (await port.listObjects(projectId)).objects.length : 0;

    return { projectId, objectsBefore, bucketDeleted: del.deleted, objectsRemaining };
  } catch (error) {
    log?.warn({ projectId, err: error }, 'object-storage erase failed');

    return { projectId, objectsBefore: 0, bucketDeleted: false, objectsRemaining: 1 };
  }
}

async function eraseWorkspace(
  workspaceId: string,
  port: WorkspaceVolumeErasurePort,
  log?: StorageErasureLogger,
): Promise<WorkspaceErasureResult> {
  try {
    const pvcExistedBefore = await port.pvcExists(workspaceId);

    if (!pvcExistedBefore) {
      return { workspaceId, pvcExistedBefore: false, pvcRemaining: 0 };
    }

    await port.deleteWorkspace(workspaceId);

    // Reserve #2: the PVC must be REALLY gone in Kubernetes, not just DELETED in DB.
    const pvcRemaining = (await port.pvcExists(workspaceId)) ? 1 : 0;

    return { workspaceId, pvcExistedBefore: true, pvcRemaining };
  } catch (error) {
    log?.warn({ workspaceId, err: error }, 'workspace-volume erase failed');

    return { workspaceId, pvcExistedBefore: true, pvcRemaining: 1 };
  }
}

/**
 * Erase every physical resource in `inventory` and assemble auditable evidence.
 * Freezes writes first (reserve #1); a freeze failure fails closed (nothing is
 * proven erased). Idempotent — a missing bucket/PVC is a verified no-op.
 */
export async function eraseSubjectStorage(
  inventory: StorageErasureInventory,
  deps: StorageErasureDeps,
): Promise<StorageErasureOutcome> {
  // ---- reserve #1: write barrier BEFORE any deletion ----
  let frozen = true;

  if (deps.writeBarrier) {
    try {
      await deps.writeBarrier.freeze(inventory);
    } catch (error) {
      deps.log?.warn({ err: error }, 'write barrier freeze failed');
      frozen = false;
    }
  }

  const buckets: BucketErasureResult[] = [];
  const workspaces: WorkspaceErasureResult[] = [];

  /*
   * Reserve #2: a destructive purge with buckets to erase REQUIRES a real,
   * active object-storage backend. An inert NoopObjectStorage (feature flag off)
   * cannot prove a bucket absent — so we do NOT erase and mark the whole class
   * unverified, which refuses the purge (fail-closed) rather than certifying
   * "nothing to erase".
   */
  const objectStorageReal = inventory.bucketProjectIds.length === 0 || Boolean(deps.objectStorage?.active);

  // Only proceed with erasure once writes are barred, so nothing is recreated
  // between delete and verify.
  if (frozen) {
    if (deps.objectStorage && objectStorageReal) {
      for (const projectId of inventory.bucketProjectIds) {
        buckets.push(await eraseBucket(projectId, deps.objectStorage, deps.log));
      }
    }

    if (deps.workspaceVolumes) {
      for (const workspaceId of inventory.workspaceIds) {
        workspaces.push(await eraseWorkspace(workspaceId, deps.workspaceVolumes, deps.log));
      }
    }
  }

  const objectsErased = buckets.reduce((sum, r) => sum + r.objectsBefore, 0);
  const bucketsDeleted = buckets.filter((r) => r.bucketDeleted).length;
  const objectsRemaining = buckets.reduce((sum, r) => sum + r.objectsRemaining, 0);
  const pvcsDeleted = workspaces.filter((r) => r.pvcExistedBefore && r.pvcRemaining === 0).length;
  const pvcsRemaining = workspaces.reduce((sum, r) => sum + r.pvcRemaining, 0);

  // Any unmet precondition (barrier didn't hold, or no real GCS backend) makes
  // the affected class fully "remaining" so the proof cannot verify.
  const objectStoragePenalty =
    (frozen ? 0 : inventory.bucketProjectIds.length) + (objectStorageReal ? 0 : inventory.bucketProjectIds.length);

  const classes: PurgeClassReport[] = [
    {
      dataClass: 'object_storage',
      action: 'deleted',
      models: {
        Buckets: inventory.bucketProjectIds.length,
        BucketsDeleted: bucketsDeleted,
        ObjectsErased: objectsErased,
        RealBackend: objectStorageReal ? 1 : 0,
      },
      remainingAfterPurge: objectsRemaining + objectStoragePenalty,
    },
    {
      dataClass: 'workspace_volumes',
      action: 'deleted',
      models: { Workspaces: inventory.workspaceIds.length, PvcsDeleted: pvcsDeleted, WriteBarrier: frozen ? 1 : 0 },
      remainingAfterPurge: pvcsRemaining + (frozen ? 0 : inventory.workspaceIds.length),
    },
  ];

  const verified =
    frozen && objectStorageReal && classes.every((entry) => (entry.remainingAfterPurge ?? 0) === 0);

  return { buckets, workspaces, frozen, classes, verified };
}
