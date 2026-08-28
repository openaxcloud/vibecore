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
import type { PurgeClassReport, PurgeLeaseContext } from './account-purge.js';
import { appPublicEnglish } from './app-public-copy.js';

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
  /** The workspace-manager revalidates and holds this lease inside each K8s delete. */
  deleteWorkspace(workspaceId: string, lease: Pick<PurgeLeaseContext, 'planId' | 'ownerToken'>): Promise<void>;
}

/**
 * Freezes writes to the subject's storage BEFORE erasure (reserve #1): revoke
 * workspace tokens / stop pods / mark projects non-provisionable, so nothing can
 * be recreated in the window between erase-verify and the tombstone. Must throw
 * on failure (the erasure then fails closed).
 */
export interface WriteBarrierPort {
  freeze(inventory: StorageErasureInventory, lease: Pick<PurgeLeaseContext, 'planId' | 'ownerToken'>): Promise<void>;
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
  /** PostgreSQL-clock lease + durable prepare/effect/finalize executor. */
  lease: PurgeLeaseContext;
  /** Session PostgreSQL + NFS barrier held across every GCS effect and live verification. */
  withProjectPhysicalErasure?<T>(projectId: string, effect: () => Promise<T>): Promise<T>;
  log?: StorageErasureLogger;
}

/** Per-bucket before/after evidence. */
export interface BucketErasureResult {
  projectId: string;
  objectsBefore: number;
  bucketDeleted: boolean;
  objectsRemaining: number;
  /** RR-CODEX-14 (P8): does the CONTAINER itself still exist after the delete? */
  bucketStillExists: boolean;
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
  lease: PurgeLeaseContext,
  withProjectPhysicalErasure: <T>(projectId: string, effect: () => Promise<T>) => Promise<T>,
  log?: StorageErasureLogger,
): Promise<BucketErasureResult> {
  return withProjectPhysicalErasure(projectId, async () => {
    let objectsBefore = 0;

    try {
      if (await port.bucketExists(projectId)) {
        objectsBefore = (await port.listObjects(projectId)).objects.length;
      }
    } catch (error) {
      log?.warn({ projectId, err: error }, 'object-storage pre-delete check failed');

      return { projectId, objectsBefore: 0, bucketDeleted: false, objectsRemaining: 1, bucketStillExists: true };
    }

    try {
      /*
       * PurgeEffect intent and its receipt are committed in short transactions on
       * either side of provider I/O. The physical + NFS barrier drains a writer
       * that entered before the durable PurgeFreeze and stays held through the
       * final live absence proof.
       */
      const execution = await lease.executeEffect(
        { key: `gcs-bucket:${projectId}`, resourceType: 'gcs_bucket', resourceId: projectId },
        async () => {
          const deletion = await port.deleteBucket(projectId);
          const bucketStillExists = await port.bucketExists(projectId);
          const objectsRemaining = bucketStillExists ? (await port.listObjects(projectId)).objects.length : 0;
          if (bucketStillExists || objectsRemaining > 0) {
            throw Object.assign(new Error(appPublicEnglish('ACCOUNT_PURGE_GCS_VERIFICATION_FAILED')), {
              code: 'ACCOUNT_PURGE_GCS_VERIFICATION_FAILED',
            });
          }
          return { ...deletion, bucketStillExists, objectsRemaining, verifiedAbsent: true };
        },
      );
      const del = execution.receipt;

      // RR-CODEX-14 (P8): the proof is the absence of the CONTAINER itself, not just
      // its content — a bucket still present after a non-effective delete is remaining.
      const bucketStillExists = await port.bucketExists(projectId);
      const objectsRemaining = bucketStillExists ? (await port.listObjects(projectId)).objects.length : 0;

      return { projectId, objectsBefore, bucketDeleted: del.deleted, objectsRemaining, bucketStillExists };
    } catch (error) {
      log?.warn({ projectId, err: error }, 'object-storage erase failed');

      return { projectId, objectsBefore, bucketDeleted: false, objectsRemaining: 1, bucketStillExists: true };
    }
  });
}

async function eraseWorkspace(
  workspaceId: string,
  port: WorkspaceVolumeErasurePort,
  lease: PurgeLeaseContext,
  log?: StorageErasureLogger,
): Promise<WorkspaceErasureResult> {
  let pvcExistedBefore = false;

  try {
    pvcExistedBefore = await port.pvcExists(workspaceId);
  } catch (error) {
    log?.warn({ workspaceId, err: error }, 'workspace-volume pre-delete check failed');

    return { workspaceId, pvcExistedBefore: true, pvcRemaining: 1 };
  }

  try {
    // workspace-manager owns the inner K8s effect receipts and holds the plan
    // row lock through every Service/Pod/Secret/PVC delete.
    await port.deleteWorkspace(workspaceId, lease);

    // Reserve #2: the PVC must be REALLY gone in Kubernetes, not just DELETED in DB.
    const pvcRemaining = (await port.pvcExists(workspaceId)) ? 1 : 0;

    return { workspaceId, pvcExistedBefore, pvcRemaining };
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
  const hasBuckets = inventory.bucketProjectIds.length > 0;
  const hasWorkspaces = inventory.workspaceIds.length > 0;
  const hasInventory = hasBuckets || hasWorkspaces;

  /*
   * RR-CODEX-14 (P8) fail-closed — reserve #1: a NON-EMPTY inventory REQUIRES a
   * write barrier. With NO barrier, `frozen` starts FALSE (an absent barrier is NOT
   * a success), so a non-empty class cannot verify; an empty inventory is a verified
   * no-op. A present barrier that throws also fails closed.
   */
  let frozen = deps.writeBarrier ? true : !hasInventory;

  if (deps.writeBarrier) {
    try {
      await deps.lease.validate();
      await deps.writeBarrier.freeze(inventory, deps.lease);
    } catch (error) {
      deps.log?.warn({ err: error }, 'write barrier freeze failed');
      frozen = false;
    }
  }

  const buckets: BucketErasureResult[] = [];
  const workspaces: WorkspaceErasureResult[] = [];

  /*
   * Reserve #2 / P8: buckets REQUIRE a real ACTIVE object-storage backend and
   * workspaces REQUIRE a real workspace-volume port. A non-empty class without its
   * real port cannot prove absence → it is left fully "remaining" (fail-closed),
   * never certified as "nothing to erase".
   */
  const objectStorageReal = !hasBuckets || Boolean(deps.objectStorage?.active);
  const projectPhysicalErasureReal = !hasBuckets || Boolean(deps.withProjectPhysicalErasure);
  const workspaceVolumesReal = !hasWorkspaces || Boolean(deps.workspaceVolumes);

  // Only proceed with erasure once writes are barred, so nothing is recreated
  // between delete and verify. The per-delete lease guard lives at the
  // linearisation point INSIDE eraseBucket/eraseWorkspace (P4).
  if (frozen) {
    if (deps.objectStorage && objectStorageReal && deps.withProjectPhysicalErasure) {
      for (const projectId of inventory.bucketProjectIds) {
        buckets.push(
          await eraseBucket(projectId, deps.objectStorage, deps.lease, deps.withProjectPhysicalErasure, deps.log),
        );
      }
    }

    if (deps.workspaceVolumes) {
      for (const workspaceId of inventory.workspaceIds) {
        workspaces.push(await eraseWorkspace(workspaceId, deps.workspaceVolumes, deps.lease, deps.log));
      }
    }
  }

  const objectsErased = buckets.reduce((sum, r) => sum + r.objectsBefore, 0);
  const bucketsDeleted = buckets.filter((r) => r.bucketDeleted).length;
  // P8: a bucket still PRESENT after the delete counts as remaining — the proof is
  // the absence of the CONTAINER itself, not merely of its content.
  const containersRemaining = buckets.filter((r) => r.bucketStillExists).length;
  const objectsRemaining = buckets.reduce((sum, r) => sum + r.objectsRemaining, 0);
  const pvcsDeleted = workspaces.filter((r) => r.pvcExistedBefore && r.pvcRemaining === 0).length;
  const pvcsRemaining = workspaces.reduce((sum, r) => sum + r.pvcRemaining, 0);

  // Any unmet precondition (barrier didn't hold, or no real port) makes the whole
  // affected class "remaining" so the proof cannot verify.
  const objectStoragePenalty =
    (frozen ? 0 : inventory.bucketProjectIds.length) +
    (objectStorageReal ? 0 : inventory.bucketProjectIds.length) +
    (projectPhysicalErasureReal ? 0 : inventory.bucketProjectIds.length);
  const workspacePenalty =
    (frozen ? 0 : inventory.workspaceIds.length) + (workspaceVolumesReal ? 0 : inventory.workspaceIds.length);

  const classes: PurgeClassReport[] = [
    {
      dataClass: 'object_storage',
      action: 'deleted',
      models: {
        Buckets: inventory.bucketProjectIds.length,
        BucketsDeleted: bucketsDeleted,
        ObjectsErased: objectsErased,
        RealBackend: objectStorageReal ? 1 : 0,
        ContainersRemaining: containersRemaining,
      },
      remainingAfterPurge: objectsRemaining + containersRemaining + objectStoragePenalty,
    },
    {
      dataClass: 'workspace_volumes',
      action: 'deleted',
      models: {
        Workspaces: inventory.workspaceIds.length,
        PvcsDeleted: pvcsDeleted,
        WriteBarrier: frozen ? 1 : 0,
        RealPort: workspaceVolumesReal ? 1 : 0,
      },
      remainingAfterPurge: pvcsRemaining + workspacePenalty,
    },
  ];

  const verified =
    frozen &&
    objectStorageReal &&
    projectPhysicalErasureReal &&
    workspaceVolumesReal &&
    classes.every((entry) => (entry.remainingAfterPurge ?? 0) === 0);

  return { buckets, workspaces, frozen, classes, verified };
}
