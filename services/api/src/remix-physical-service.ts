import { createHash, randomUUID } from 'node:crypto';

import { decryptJson, encryptJson } from '@vibecore/security';

import { appPublicEnglish } from './app-public-copy.js';
import { databaseProvisionDeadline } from './database-provision-lifecycle.js';
import type { DatabaseProvisioner } from './database-provisioner.js';
import type { ObjectStorageCommandExecution, TenantObjectStorageCommand } from './object-storage-command.js';
import type { ObjectStorageInventory } from './object-storage.js';
import { ObjectStorageError, parseObjectStorageInventory } from './object-storage.js';
import type { ProjectFile, ProjectStorage } from './project-storage.js';
import { normalizeRemixIdeState, remixIdeStateDigest } from './remix-ide-state.js';
import {
  RemixInvariantError,
  assertRemixTransition,
  detachCredentials,
  maskPiiInFiles,
  scanClonedFilesForSecrets,
  scanFilesForPii,
  scrubCredentialAssignments,
  scrubSecretsFromFiles,
  type RemixLicenseSnapshot,
  type RemixState,
  type RemixStoragePolicy,
} from './remix-pipeline.js';
import type { ApiStore, ProjectRecord, RemixJobRecord } from './store.js';

const REMIX_LEASE_MS = 5 * 60_000;

export interface PreparedRemixSourceArtifact {
  files: ProjectFile[];
  piiFindings: ReturnType<typeof maskPiiInFiles>['masked'];
  piiMaskedCount: number;
  scrubbedCount: number;
}

export interface RemixPhysicalServiceDeps {
  store: ApiStore;
  projectStorage: ProjectStorage;
  readObjectStorageInventory(scope: { projectId: string; expectedOrganizationId: string }): Promise<{
    inventory: ObjectStorageInventory;
    authoritySourceProjectId: string;
    authoritySourceOrganizationId: string;
  }>;
  /** Enable and verify provider generation retention, then return the live source inventory. */
  prepareObjectStorageShareSource(scope: {
    projectId: string;
    expectedOrganizationId: string;
  }): Promise<ObjectStorageInventory>;
  executeObjectStorageCommand(input: {
    scopes: Array<{ projectId: string; expectedOrganizationId: string }>;
    command: TenantObjectStorageCommand;
    idempotencyKey: string;
  }): Promise<ObjectStorageCommandExecution>;
  databaseProvisioner: DatabaseProvisioner;
  ensureProjectQuota(organizationId: string): Promise<void>;
  createSourceSnapshot(input: {
    remixJobId: string;
    sourceProjectId: string;
    files: ProjectFile[];
    actorUserId?: string;
    guard: () => Promise<void>;
  }): Promise<{ snapshotId: string; snapshotHash: string }>;
  /**
   * Capture a live source tree and its ProjectManifest under one durable source
   * barrier. The callback is deliberately executed while the barrier is held:
   * only its scrubbed result may enter the immutable remix archive.
   */
  captureSourceSnapshot?(input: {
    remixJobId: string;
    sourceProjectId: string;
    sourceOrganizationId: string;
    actorUserId?: string;
    guard: () => Promise<void>;
    prepare: (files: ProjectFile[]) => PreparedRemixSourceArtifact;
  }): Promise<{
    snapshotId: string;
    snapshotHash: string;
    prepared: PreparedRemixSourceArtifact;
  }>;
  loadSourceSnapshot(snapshotId: string, sourceProjectId: string, sourceOrganizationId: string): Promise<ProjectFile[]>;
  /** Build the exact canonical IDE/file manifest that finalize will publish. */
  buildTargetIdeState(files: ProjectFile[]): unknown;
  recordCompleted(input: { job: RemixJobRecord; targetProject: ProjectRecord }): Promise<void>;
  warn?(context: Record<string, unknown>, message: string): void;
}

export interface RemixPhysicalInput {
  sourceProject: { id: string; organizationId: string };
  targetOrganizationId: string;
  actorUserId?: string;
  idempotencyKey: string;
  requestHash: string;
  storagePolicy: RemixStoragePolicy;
  storageConsentVersion?: string;
  name: string;
  slug?: string;
  sourceFiles?: ProjectFile[];
  sourceSnapshotId?: string;
  sourceListingId?: string;
  licenseSnapshot?: RemixLicenseSnapshot;
  consentVersion?: string;
  sanitizePii?: boolean;
  piiConsentVersion?: string;
  /** Ordinary duplicate keeps same-tenant bindings; secure remixes detach them. */
  manifestCloneMode?: 'COPY' | 'DETACH_EXTERNALS';
  /** Same-tenant duplicate preserves the pinned tree byte-for-byte. */
  sourceFilePolicy?: 'SECURE_DETACH' | 'COPY_EXACT';
}

export type RemixPhysicalResult =
  | { kind: 'completed'; job: RemixJobRecord; project: ProjectRecord; fresh: boolean }
  | { kind: 'pending' | 'busy'; job: RemixJobRecord }
  | { kind: 'failed'; job: RemixJobRecord; code: string; error: string };

/** Deterministic digest of exact path/encoding/content, independent of order. */
export function remixFileSnapshotHash(files: ProjectFile[]): string {
  const hash = createHash('sha256');

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.encoding ?? 'utf-8');
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }

  return hash.digest('hex');
}

function inventoryFrom(value: unknown): ObjectStorageInventory | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return parseObjectStorageInventory((value as { source?: unknown }).source);
}

function storageAuthorityFrom(
  value: unknown,
): { authoritySourceProjectId: string; authoritySourceOrganizationId: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.authoritySourceProjectId === 'string' && typeof record.authoritySourceOrganizationId === 'string'
    ? {
        authoritySourceProjectId: record.authoritySourceProjectId,
        authoritySourceOrganizationId: record.authoritySourceOrganizationId,
      }
    : undefined;
}

function inventoriesEqual(left: ObjectStorageInventory, right: ObjectStorageInventory): boolean {
  if (left.bucketExists !== right.bucketExists || left.objects.length !== right.objects.length) return false;

  return left.objects.every((entry, index) => {
    const candidate = right.objects[index];
    return (
      candidate?.key === entry.key &&
      candidate.size === entry.size &&
      candidate.generation === entry.generation &&
      candidate.contentHash === entry.contentHash
    );
  });
}

function safeFailure(error: unknown): { code: string; error: string } {
  if (error instanceof RemixInvariantError) {
    return { code: error.code, error: appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED') };
  }

  if (error instanceof ObjectStorageError) {
    return { code: `REMIX_STORAGE_${error.code}`, error: appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED') };
  }

  const code =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'REMIX_PHYSICAL_DATA_FAILED';

  return { code, error: appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED') };
}

function databasePin(
  value: unknown,
):
  | { mode: 'DETACH' }
  | { mode: 'CLONE'; instanceId: string; environment: 'development'; targetTime: string; retentionDays: number }
  | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const pin = value as Record<string, unknown>;
  if (pin.mode === 'DETACH') return { mode: 'DETACH' };
  if (
    pin.mode === 'CLONE' &&
    typeof pin.instanceId === 'string' &&
    pin.environment === 'development' &&
    typeof pin.targetTime === 'string' &&
    Number.isFinite(Date.parse(pin.targetTime)) &&
    typeof pin.retentionDays === 'number'
  ) {
    return {
      mode: 'CLONE',
      instanceId: pin.instanceId,
      environment: 'development',
      targetTime: pin.targetTime,
      retentionDays: pin.retentionDays,
    };
  }
  return undefined;
}

function detachedKeys(value: unknown): { secretKeys: string[]; envVarKeys: string[] } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as { secretKeys?: unknown; envVarKeys?: unknown };
  if (!Array.isArray(record.secretKeys) || !record.secretKeys.every((key) => typeof key === 'string')) return undefined;
  if (!Array.isArray(record.envVarKeys) || !record.envVarKeys.every((key) => typeof key === 'string')) return undefined;
  return { secretKeys: record.secretKeys, envVarKeys: record.envVarKeys };
}

async function compensate(
  deps: RemixPhysicalServiceDeps,
  job: RemixJobRecord,
  operationToken: string,
  failure: { code: string; error: string },
): Promise<RemixJobRecord> {
  const cleanup =
    job.state === 'CLEANUP_PENDING'
      ? job
      : await deps.store.beginRemixCleanup({
          remixJobId: job.id,
          organizationId: job.organizationId,
          operationToken,
          terminalState: 'FAILED',
          errorCode: failure.code,
          error: failure.error,
        });

  if (!cleanup) {
    throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), {
      statusCode: 409,
      code: 'REMIX_OWNERSHIP_LOST',
    });
  }
  let ownedCleanup: RemixJobRecord = cleanup;

  const cleanupGuard = async () => {
    const renewed = await deps.store.renewRemixJobLease({
      id: ownedCleanup.id,
      organizationId: ownedCleanup.organizationId,
      operationToken,
      expectedVersion: ownedCleanup.version,
      leaseDurationMs: REMIX_LEASE_MS,
    });
    if (!renewed || renewed.state !== 'CLEANUP_PENDING') {
      throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), {
        statusCode: 409,
        code: 'REMIX_OWNERSHIP_LOST',
      });
    }
    ownedCleanup = renewed;
  };

  const targetProjectId = ownedCleanup.targetProjectId;

  if (targetProjectId) {
    // Reverse order and target-only identifiers. None of these calls receives a
    // source deletion authority, so a partial-clone rollback cannot touch it.
    await cleanupGuard();
    await deps.store.deleteClaimedRemixStorageShare({
      remixJobId: ownedCleanup.id,
      organizationId: ownedCleanup.organizationId,
      operationToken,
      targetProjectId,
    });

    if (ownedCleanup.storagePolicy === 'CLONE') {
      await cleanupGuard();
      await deps.executeObjectStorageCommand({
        scopes: [{ projectId: targetProjectId, expectedOrganizationId: ownedCleanup.organizationId }],
        command: { type: 'DELETE_BUCKET', projectId: targetProjectId },
        idempotencyKey: `remix-cleanup-bucket:${ownedCleanup.id}:${targetProjectId}`,
      });
      await cleanupGuard();
    }

    if (ownedCleanup.targetDatabaseInstanceId) {
      if (!deps.databaseProvisioner.active) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_DATABASE_CLEANUP_UNAVAILABLE')), {
          code: 'REMIX_DATABASE_CLEANUP_UNAVAILABLE',
        });
      }
      await deps.databaseProvisioner.teardownFork({ targetProjectId, guard: cleanupGuard });
    }

    await deps.projectStorage.deleteProjectFiles(
      targetProjectId,
      { expectedOrganizationId: ownedCleanup.organizationId },
      cleanupGuard,
    );
    if (
      (
        await deps.projectStorage.listFiles(targetProjectId, {
          expectedOrganizationId: ownedCleanup.organizationId,
        })
      ).length !== 0
    ) {
      throw Object.assign(new Error(appPublicEnglish('REMIX_FILES_CLEANUP_INCOMPLETE')), {
        code: 'REMIX_FILES_CLEANUP_VERIFICATION_FAILED',
      });
    }

    await deps.store.deleteClaimedRemixProject({
      remixJobId: ownedCleanup.id,
      organizationId: ownedCleanup.organizationId,
      operationToken,
      targetProjectId,
    });
    ownedCleanup = (await deps.store.getRemixJob(ownedCleanup.id, ownedCleanup.organizationId)) ?? ownedCleanup;
  }

  const finished = await deps.store.finishRemixCleanup({
    remixJobId: ownedCleanup.id,
    organizationId: ownedCleanup.organizationId,
    operationToken,
  });

  if (!finished) {
    throw Object.assign(new Error(appPublicEnglish('REMIX_CLEANUP_INCOMPLETE')), {
      statusCode: 409,
      code: 'REMIX_CLEANUP_INCOMPLETE',
    });
  }

  return finished;
}

export async function executePhysicalRemix(
  deps: RemixPhysicalServiceDeps,
  input: RemixPhysicalInput,
): Promise<RemixPhysicalResult> {
  const created = await deps.store.createRemixJob({
    sourceProjectId: input.sourceProject.id,
    organizationId: input.targetOrganizationId,
    actorUserId: input.actorUserId,
    storagePolicy: input.storagePolicy,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    storageConsentVersion: input.storageConsentVersion,
    sourceSnapshotId: input.sourceSnapshotId,
    sourceListingId: input.sourceListingId,
    licenseSnapshot: input.licenseSnapshot,
    consentVersion: input.consentVersion,
  });
  let current = created.job;

  if (current.state === 'COMPLETED' && current.targetProjectId) {
    const project = await deps.store.getProject(current.targetProjectId);
    return project
      ? { kind: 'completed', job: current, project, fresh: false }
      : {
          kind: 'failed',
          job: current,
          code: 'REMIX_TARGET_MISSING',
          error: appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED'),
        };
  }

  if (current.state === 'FAILED') {
    return {
      kind: 'failed',
      job: current,
      code: current.errorCode ?? 'REMIX_PHYSICAL_DATA_FAILED',
      error: current.error ?? appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED'),
    };
  }

  const operationToken = randomUUID();
  const claimed = await deps.store.claimRemixJob({
    id: current.id,
    organizationId: current.organizationId,
    operationToken,
    leaseDurationMs: REMIX_LEASE_MS,
  });

  if (!claimed) {
    return { kind: 'busy', job: current };
  }
  current = claimed;

  const guard = async () => {
    const renewed = await deps.store.renewRemixJobLease({
      id: current.id,
      organizationId: current.organizationId,
      operationToken,
      expectedVersion: current.version,
      leaseDurationMs: REMIX_LEASE_MS,
    });

    if (!renewed) {
      throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), {
        statusCode: 409,
        code: 'REMIX_OWNERSHIP_LOST',
      });
    }
    current = renewed;
  };

  const advance = async (to: RemixState, patch: Parameters<ApiStore['transitionRemixJob']>[0]['patch'] = {}) => {
    assertRemixTransition(current.state as RemixState, to);
    const next = await deps.store.transitionRemixJob({
      id: current.id,
      organizationId: current.organizationId,
      operationToken,
      expectedVersion: current.version,
      expectedStates: [current.state],
      state: to,
      patch,
    });

    if (!next) {
      throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), {
        statusCode: 409,
        code: 'REMIX_OWNERSHIP_LOST',
      });
    }
    current = next;
  };

  try {
    if (current.state === 'CLEANUP_PENDING') {
      const failed = await compensate(deps, current, operationToken, {
        code: current.errorCode ?? 'REMIX_PHYSICAL_DATA_FAILED',
        error: current.error ?? appPublicEnglish('REMIX_PHYSICAL_DATA_FAILED'),
      });
      return { kind: 'failed', job: failed, code: failed.errorCode!, error: failed.error! };
    }

    let pinnedFiles: ProjectFile[] | undefined;
    const loadPinnedFiles = async () => {
      if (!pinnedFiles) {
        if (!current.sourceSnapshotId || !current.sourceSnapshotHash) {
          throw new RemixInvariantError('Pinned source snapshot metadata is incomplete', 'REMIX_SNAPSHOT_INCOMPLETE');
        }
        pinnedFiles = await deps.loadSourceSnapshot(
          current.sourceSnapshotId,
          current.sourceProjectId,
          input.sourceProject.organizationId,
        );
        if (remixFileSnapshotHash(pinnedFiles) !== current.sourceSnapshotHash) {
          throw new RemixInvariantError('Pinned source snapshot digest mismatch', 'REMIX_SNAPSHOT_DIGEST_MISMATCH');
        }
      }
      return pinnedFiles;
    };

    const copyExact = input.sourceFilePolicy === 'COPY_EXACT';
    if (copyExact && input.sanitizePii) {
      throw new RemixInvariantError('Exact file copy cannot also sanitize PII', 'REMIX_SOURCE_POLICY_CONFLICT');
    }
    const sourceSecrets = copyExact ? [] : await deps.store.listProjectSecrets(current.sourceProjectId);
    const sourceEnvVars = copyExact ? [] : await deps.store.listProjectEnvVars(current.sourceProjectId);
    const liveDetached = detachCredentials(sourceSecrets, sourceEnvVars);
    const persistedDetached = detachedKeys(current.detachedKeys);
    const detached = {
      secretKeys: [...new Set([...(persistedDetached?.secretKeys ?? []), ...liveDetached.secretKeys])].sort(),
      envVarKeys: [...new Set([...(persistedDetached?.envVarKeys ?? []), ...liveDetached.envVarKeys])].sort(),
    };
    const materializedValues: Array<{ key: string; value: string }> = [];

    for (const key of detached.secretKeys) {
      const secret = await deps.store.getProjectSecret(current.sourceProjectId, key);
      if (!secret?.valueEncrypted) continue;
      try {
        materializedValues.push({ key, value: decryptJson<{ value: string }>(secret.valueEncrypted).value });
      } catch {
        // An unreadable secret cannot be copied. Assignment-key scrubbing below
        // still strips its .env reference from the pinned files.
      }
    }
    for (const envVar of sourceEnvVars) {
      if (envVar.value) materializedValues.push({ key: envVar.key, value: envVar.value });
    }

    const prepareArtifact = (files: ProjectFile[]): PreparedRemixSourceArtifact => {
      if (copyExact) {
        return {
          files: files.map((file) => ({ ...file })),
          piiFindings: [],
          piiMaskedCount: 0,
          scrubbedCount: 0,
        };
      }

      let piiSafeFiles = files;
      let piiFindings: ReturnType<typeof maskPiiInFiles>['masked'] = [];

      if (input.sanitizePii && !input.piiConsentVersion) {
        const result = maskPiiInFiles(piiSafeFiles);
        const residual = scanFilesForPii(result.files);
        if (residual.length > 0) {
          throw new RemixInvariantError('PII remained after source sanitization', 'REMIX_PII_RESIDUAL');
        }
        piiSafeFiles = piiSafeFiles.map((file, index) => ({ ...file, content: result.files[index].content }));
        piiFindings = result.masked;
      }

      const assignmentScrubbed = scrubCredentialAssignments(piiSafeFiles, [
        ...detached.secretKeys,
        ...detached.envVarKeys,
      ]);
      const scrubbed = scrubSecretsFromFiles(assignmentScrubbed.files, materializedValues);
      const findings = scanClonedFilesForSecrets(scrubbed.files, materializedValues);
      if (findings.length > 0) {
        throw new RemixInvariantError('Materialized secret remained after scrub', 'REMIX_SECRET_LEAK');
      }

      return {
        piiFindings,
        piiMaskedCount: piiFindings.length,
        files: scrubbed.files.map((file, index) => ({ ...piiSafeFiles[index], content: file.content })),
        scrubbedCount: assignmentScrubbed.removed.length + scrubbed.removed.length,
      };
    };

    let captured:
      | {
          snapshotId: string;
          snapshotHash: string;
          prepared: PreparedRemixSourceArtifact;
        }
      | undefined;
    let sourceFilesForAttempt =
      current.state === 'PENDING'
        ? current.sourceSnapshotId
          ? await deps.loadSourceSnapshot(
              current.sourceSnapshotId,
              current.sourceProjectId,
              input.sourceProject.organizationId,
            )
          : input.sourceFiles
        : await loadPinnedFiles();

    if (
      current.state === 'PENDING' &&
      !current.sourceSnapshotId &&
      !sourceFilesForAttempt &&
      deps.captureSourceSnapshot
    ) {
      captured = await deps.captureSourceSnapshot({
        remixJobId: current.id,
        sourceProjectId: current.sourceProjectId,
        sourceOrganizationId: input.sourceProject.organizationId,
        actorUserId: input.actorUserId,
        guard,
        prepare: prepareArtifact,
      });
      sourceFilesForAttempt = captured.prepared.files;
      pinnedFiles = captured.prepared.files;
    }

    if (!sourceFilesForAttempt) {
      throw new RemixInvariantError('Source files are required to pin a new remix', 'REMIX_SOURCE_UNAVAILABLE');
    }

    const prepared = captured?.prepared ?? prepareArtifact(sourceFilesForAttempt);

    if (current.state === 'PENDING') {
      let snapshotId = current.sourceSnapshotId;
      let snapshotHash: string;

      if (!snapshotId && captured) {
        snapshotId = captured.snapshotId;
        snapshotHash = captured.snapshotHash;
      } else if (!snapshotId) {
        /*
         * I-RMX-1 applies to the pin itself, not only to the eventual target.
         * Archive the already scrubbed artifact so a committed .env value never
         * enters ProjectSnapshot/object storage even during a crash window.
         */
        const pinned = await deps.createSourceSnapshot({
          remixJobId: current.id,
          sourceProjectId: current.sourceProjectId,
          files: prepared.files,
          actorUserId: input.actorUserId,
          guard,
        });
        snapshotId = pinned.snapshotId;
        snapshotHash = pinned.snapshotHash;
        pinnedFiles = await deps.loadSourceSnapshot(
          snapshotId,
          current.sourceProjectId,
          input.sourceProject.organizationId,
        );

        if (remixFileSnapshotHash(pinnedFiles) !== snapshotHash) {
          throw new RemixInvariantError('Pinned source snapshot digest mismatch', 'REMIX_SNAPSHOT_DIGEST_MISMATCH');
        }

        // Mutation guard: a faulty adapter that persisted the raw input instead
        // of `prepared.files` cannot silently turn the snapshot into a secret
        // archive. Re-scrubbing must be a byte-for-byte no-op.
        const verified = prepareArtifact(pinnedFiles);
        if (remixFileSnapshotHash(verified.files) !== snapshotHash) {
          throw new RemixInvariantError('Pinned source snapshot contains detached data', 'REMIX_SNAPSHOT_UNSAFE');
        }
      } else {
        pinnedFiles = sourceFilesForAttempt;
        snapshotHash = remixFileSnapshotHash(pinnedFiles);

        /*
         * A gallery pin is an already-published, source-owned immutable input;
         * never rewrite it in place. `prepared.files` is the only artifact that
         * crosses into the target tenant, so legacy pins are scrubbed on read
         * while all newly-created remix pins above are clean at rest.
         */
      }

      await advance('SNAPSHOT_PINNED', {
        sourceSnapshotId: snapshotId,
        sourceSnapshotHash: snapshotHash,
        detachedKeys: detached,
        piiFindings: prepared.piiFindings,
        piiMaskedCount: prepared.piiMaskedCount,
        scrubbedCount: prepared.scrubbedCount,
      });
    }

    if (current.state === 'SNAPSHOT_PINNED') {
      await advance('CREDENTIALS_DETACHED', { detachedKeys: current.detachedKeys ?? detached });
    }

    if (current.state === 'CREDENTIALS_DETACHED') {
      await advance('SOURCE_SANITIZED', {
        piiFindings: current.piiFindings ?? prepared.piiFindings,
        piiMaskedCount: current.piiMaskedCount || prepared.piiMaskedCount,
      });
    }

    const sanitizedFiles = prepared.files;

    if (current.state === 'SOURCE_SANITIZED') {
      const target = await deps.store.withSerializedMutation(`projects:${current.organizationId}`, async () => {
        await deps.ensureProjectQuota(current.organizationId);
        return deps.store.createClaimedRemixProject({
          remixJobId: current.id,
          organizationId: current.organizationId,
          operationToken,
          name: input.name,
          slug: input.slug ?? input.name,
          manifestCloneMode: input.manifestCloneMode ?? 'DETACH_EXTERNALS',
        });
      });
      current = (await deps.store.getRemixJob(current.id, current.organizationId)) ?? current;
      await guard();
      await deps.projectStorage.writeFiles(
        target.id,
        sanitizedFiles,
        { expectedOrganizationId: target.organizationId },
        guard,
      );
      await guard();
      const verifiedFiles = await deps.projectStorage.listFiles(target.id, {
        expectedOrganizationId: target.organizationId,
      });
      if (remixFileSnapshotHash(verifiedFiles) !== remixFileSnapshotHash(sanitizedFiles)) {
        throw new RemixInvariantError('Target file digest mismatch after clone', 'REMIX_TARGET_DIGEST_MISMATCH');
      }
      const targetIdeState = normalizeRemixIdeState(deps.buildTargetIdeState(verifiedFiles));
      const targetIdeStateDigest = remixIdeStateDigest(targetIdeState);
      if (!targetIdeState || !targetIdeStateDigest) {
        throw new RemixInvariantError('Target IDE state is not canonical JSON', 'REMIX_TARGET_DIGEST_MISMATCH');
      }
      await advance('CLONING', {
        targetProjectId: target.id,
        targetIdeState,
        targetIdeStateDigest,
        // Preserve the first-pass count stored with the immutable pin. On a
        // crash/retry the archive is already clean, so a second scrub may find
        // fewer lines even though the original proof must remain auditable.
        scrubbedCount: Math.max(current.scrubbedCount, prepared.scrubbedCount),
      });
    }

    if (current.state === 'CLONING') {
      await advance('SCANNING', { scanFindings: [] });
    }

    if (current.state === 'SCANNING') {
      let sourceInventory: ObjectStorageInventory = { bucketExists: false, objects: [] };
      let authoritySourceProjectId = current.sourceProjectId;
      let authoritySourceOrganizationId = input.sourceProject.organizationId;
      if (current.storagePolicy !== 'DETACH') {
        const authority = await deps.readObjectStorageInventory({
          projectId: current.sourceProjectId,
          expectedOrganizationId: input.sourceProject.organizationId,
        });
        sourceInventory = authority.inventory;
        authoritySourceProjectId = authority.authoritySourceProjectId;
        authoritySourceOrganizationId = authority.authoritySourceOrganizationId;
      }
      await advance('STORAGE_PINNED', {
        storageInventory: {
          source: sourceInventory,
          authoritySourceProjectId,
          authoritySourceOrganizationId,
        },
      });
    }

    if (current.state === 'STORAGE_PINNED') {
      if (!current.targetProjectId) {
        throw new RemixInvariantError('Target project missing before storage policy', 'REMIX_TARGET_MISSING');
      }
      const sourceInventory = inventoryFrom(current.storageInventory);
      const storageAuthority = storageAuthorityFrom(current.storageInventory);
      if (!sourceInventory || !storageAuthority) {
        throw new RemixInvariantError('Pinned object inventory is invalid', 'REMIX_STORAGE_INVENTORY_INVALID');
      }

      if (current.storagePolicy === 'CLONE') {
        await guard();
        await deps.executeObjectStorageCommand({
          scopes: [
            {
              projectId: storageAuthority.authoritySourceProjectId,
              expectedOrganizationId: storageAuthority.authoritySourceOrganizationId,
            },
            { projectId: current.targetProjectId, expectedOrganizationId: current.organizationId },
          ],
          command: {
            type: 'CLONE_PROJECT',
            sourceProjectId: storageAuthority.authoritySourceProjectId,
            targetProjectId: current.targetProjectId,
            inventory: sourceInventory,
          },
          idempotencyKey: `remix-clone:${current.id}:${current.sourceSnapshotHash ?? 'unpinned'}`,
        });
        await guard();
      } else if (current.storagePolicy === 'SHARE_WITH_CONSENT') {
        if (!current.storageConsentVersion) {
          throw new RemixInvariantError('Storage share has no explicit consent', 'REMIX_STORAGE_CONSENT_REQUIRED');
        }
        if (sourceInventory.objects.some((object) => object.generation === null)) {
          throw new RemixInvariantError(
            'A shared object has no immutable provider generation',
            'REMIX_STORAGE_SNAPSHOT_UNPINNABLE',
          );
        }
        const live = await deps.readObjectStorageInventory({
          projectId: current.sourceProjectId,
          expectedOrganizationId: input.sourceProject.organizationId,
        });
        if (
          live.authoritySourceProjectId !== storageAuthority.authoritySourceProjectId ||
          live.authoritySourceOrganizationId !== storageAuthority.authoritySourceOrganizationId ||
          !inventoriesEqual(sourceInventory, live.inventory)
        ) {
          throw new ObjectStorageError('Source object generations changed after consent pin', 'SOURCE_CHANGED');
        }
        await guard();
        const share = await deps.store.createRemixStorageShare({
          sourceProjectId: storageAuthority.authoritySourceProjectId,
          targetProjectId: current.targetProjectId,
          sourceOrganizationId: storageAuthority.authoritySourceOrganizationId,
          targetOrganizationId: current.organizationId,
          consentVersion: current.storageConsentVersion,
          consentedByUserId: input.actorUserId,
          sourceInventory,
          prepareSourceRetention: () =>
            deps.prepareObjectStorageShareSource({
              projectId: storageAuthority.authoritySourceProjectId,
              expectedOrganizationId: storageAuthority.authoritySourceOrganizationId,
            }),
        });
        current = (await deps.store.getRemixJob(current.id, current.organizationId)) ?? current;
        await advance('STORAGE_POLICY_APPLIED', { storageShareId: share.id });
      }

      if (current.state === 'STORAGE_PINNED') {
        await advance('STORAGE_POLICY_APPLIED');
      }
    }

    if (current.state === 'STORAGE_POLICY_APPLIED') {
      const sourceDatabase = await deps.store.getDatabaseInstanceByProject(current.sourceProjectId, 'development');
      if (!sourceDatabase) {
        await advance('DATABASE_PINNED', { sourceDatabasePin: { mode: 'DETACH' } });
      } else {
        if (sourceDatabase.status !== 'ACTIVE' || !sourceDatabase.pitrEnabled) {
          throw new RemixInvariantError('Source database has no verified PITR stream', 'REMIX_DATABASE_NOT_FORKABLE');
        }
        const targetTime = await deps.store.getDatabaseTime();
        await advance('DATABASE_PINNED', {
          sourceDatabasePin: {
            mode: 'CLONE',
            instanceId: sourceDatabase.id,
            environment: 'development',
            targetTime,
            retentionDays: sourceDatabase.retentionDays,
          },
        });
      }
    }

    if (current.state === 'DATABASE_PINNED') {
      if (!current.targetProjectId) {
        throw new RemixInvariantError('Target project missing before database fork', 'REMIX_TARGET_MISSING');
      }
      const pin = databasePin(current.sourceDatabasePin);
      if (!pin) throw new RemixInvariantError('Database pin is invalid', 'REMIX_DATABASE_PIN_INVALID');

      if (pin.mode === 'DETACH') {
        await advance('DB_FORKING', { dbForked: false });
      } else {
        if (!deps.databaseProvisioner.active) {
          throw Object.assign(new Error(appPublicEnglish('REMIX_DATABASE_BACKEND_REQUIRED')), {
            code: 'REMIX_DATABASE_BACKEND_REQUIRED',
          });
        }
        const acquisition = await deps.store.acquireClaimedRemixDatabase({
          remixJobId: current.id,
          projectId: current.targetProjectId,
          organizationId: current.organizationId,
          operationToken,
          expectedVersion: current.version,
          requestHash: input.requestHash,
          retentionDays: pin.retentionDays,
          environment: 'development',
          // The source pin was stamped by PostgreSQL. Derive the target's
          // provisioning deadline from that same authoritative clock so a
          // skewed worker cannot create an effectively immortal/orphaned claim.
          provisioningDeadlineAt: databaseProvisionDeadline(Date.parse(pin.targetTime)),
        });
        // Persist target ownership BEFORE the external create. If the CNPG call
        // applies the target cluster and then the process dies, compensation (or
        // a retry) still has the exact target-only identifier to resume safely.
        await advance('DB_FORKING', {
          dbForked: false,
          targetDatabaseInstanceId: acquisition.instance.id,
        });
      }
    }

    if (current.state === 'DB_FORKING') {
      const pin = databasePin(current.sourceDatabasePin);
      if (pin?.mode === 'CLONE') {
        if (!current.targetProjectId || !current.targetDatabaseInstanceId) {
          throw new RemixInvariantError('Database fork target metadata missing', 'REMIX_DATABASE_TARGET_MISSING');
        }
        const sourceDatabase = await deps.store.getDatabaseInstanceByProject(current.sourceProjectId, 'development');
        if (
          !sourceDatabase ||
          sourceDatabase.id !== pin.instanceId ||
          sourceDatabase.status !== 'ACTIVE' ||
          !sourceDatabase.pitrEnabled
        ) {
          throw new RemixInvariantError('Pinned source database changed before fork', 'REMIX_DATABASE_SOURCE_CHANGED');
        }
        await guard();
        // forkInstance is an idempotent apply of the same pinned recovery
        // manifest. Re-running it covers a crash before/after the first apply
        // without ever redirecting cleanup authority to the source cluster.
        const fork = await deps.databaseProvisioner.forkInstance({
          sourceProjectId: current.sourceProjectId,
          targetProjectId: current.targetProjectId,
          targetOrganizationId: current.organizationId,
          targetTimeIso: pin.targetTime,
          retentionDays: pin.retentionDays,
          guard,
        });
        if (!fork.applied) {
          throw Object.assign(new Error(appPublicEnglish('REMIX_DATABASE_FORK_REJECTED')), {
            code: 'REMIX_DATABASE_FORK_REJECTED',
          });
        }
        const progress = await deps.databaseProvisioner.forkProgress({ targetProjectId: current.targetProjectId });
        if (!progress.ready || !progress.connectionUri) {
          const released = await deps.store.releaseRemixJobLease({
            id: current.id,
            organizationId: current.organizationId,
            operationToken,
          });
          return { kind: 'pending', job: released ?? current };
        }
        await guard();
        const completed = await deps.store.completeClaimedRemixDatabase({
          remixJobId: current.id,
          organizationId: current.organizationId,
          operationToken,
          expectedVersion: current.version,
          requestHash: input.requestHash,
          databaseInstanceId: current.targetDatabaseInstanceId,
          projectId: current.targetProjectId,
          valueEncrypted: encryptJson({ value: progress.connectionUri }),
        });
        if (!completed) {
          throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), { code: 'REMIX_OWNERSHIP_LOST' });
        }
        current = completed;
      } else {
        await advance('INDEXING');
      }
    }

    if (current.state === 'INDEXING') {
      if (!current.targetProjectId) throw new RemixInvariantError('Target missing at finalize', 'REMIX_TARGET_MISSING');
      await guard();
      const completed = await deps.store.finalizeClaimedRemix({
        remixJobId: current.id,
        organizationId: current.organizationId,
        operationToken,
        expectedVersion: current.version,
        requestHash: input.requestHash,
        targetProjectId: current.targetProjectId,
      });
      if (!completed) {
        throw Object.assign(new Error(appPublicEnglish('REMIX_OWNERSHIP_LOST')), { code: 'REMIX_OWNERSHIP_LOST' });
      }
      current = completed;
      const project = await deps.store.getProject(current.targetProjectId!);
      if (!project) throw new RemixInvariantError('Completed target missing', 'REMIX_TARGET_MISSING');
      await deps.recordCompleted({ job: current, targetProject: project }).catch(() => {
        deps.warn?.(
          { remixJobId: current.id, code: 'REMIX_AUDIT_WRITE_FAILED' },
          'remix completion audit write failed',
        );
      });
      return { kind: 'completed', job: current, project, fresh: true };
    }

    const released = await deps.store.releaseRemixJobLease({
      id: current.id,
      organizationId: current.organizationId,
      operationToken,
    });
    return { kind: 'pending', job: released ?? current };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
    if (code === 'REMIX_OWNERSHIP_LOST') throw error;
    const failure = safeFailure(error);
    deps.warn?.(
      { remixJobId: current.id, code: failure.code },
      'remix physical pipeline failed; target compensation started',
    );

    try {
      const failed = await compensate(deps, current, operationToken, failure);
      return { kind: 'failed', job: failed, code: failure.code, error: failure.error };
    } catch (cleanupError) {
      deps.warn?.(
        { remixJobId: current.id, code: safeFailure(cleanupError).code },
        'remix target compensation remains pending',
      );
      // This executor is done making effects. Relinquish its still-valid claim
      // so another replica can immediately resume CLEANUP_PENDING instead of
      // waiting for the full lease TTL. If ownership was already lost, the
      // token-scoped update is a harmless no-op.
      await deps.store
        .releaseRemixJobLease({
          id: current.id,
          organizationId: current.organizationId,
          operationToken,
        })
        .catch(() => undefined);
      const pending = (await deps.store.getRemixJob(current.id, current.organizationId)) ?? current;
      return { kind: 'pending', job: pending };
    }
  }
}
