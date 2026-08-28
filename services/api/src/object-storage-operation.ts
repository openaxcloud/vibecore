import { createHash, randomUUID } from 'node:crypto';

import { Prisma } from '@vibecore/database';
import type { AccountPurgeProjectDeletionAuthority } from './account-purge.js';

export const OBJECT_STORAGE_OPERATION_KINDS = [
  'TENANT_MUTATION',
  'SIGNED_UPLOAD_CAPABILITY',
  'SIGNED_DOWNLOAD_CAPABILITY',
  'PROJECT_TRANSFER',
  'PROJECT_PERMANENT_DELETE',
  'PROJECT_REMIX_CLONE',
  'PROJECT_VERSION_GC',
  'ACCOUNT_PURGE_ERASURE',
] as const;

export const OBJECT_STORAGE_OPERATION_STATUSES = [
  'PREPARED',
  'EFFECT_STARTED',
  'VERIFYING',
  'COMMITTED',
  'FAILED_SAFE',
  'MANUAL_RECOVERY',
] as const;

export type ObjectStorageOperationKind = (typeof OBJECT_STORAGE_OPERATION_KINDS)[number];
export type ObjectStorageOperationStatus = (typeof OBJECT_STORAGE_OPERATION_STATUSES)[number];
export type ObjectStorageJsonPrimitive = null | boolean | number | string;
export type ObjectStorageJsonValue =
  | ObjectStorageJsonPrimitive
  | ObjectStorageJsonValue[]
  | { [key: string]: ObjectStorageJsonValue };
export type ObjectStorageJsonObject = { [key: string]: ObjectStorageJsonValue };

export interface ObjectStorageStaticArtifactDisposition {
  digest: string;
  outcome: 'DELETED_UNREFERENCED' | 'RETAINED_BY_OTHER_MANIFEST';
  otherReferenceCount: number;
}

/**
 * Exact, compact commitment to the complete static-artifact disposition list.
 * The full list is intentionally never copied into the generic operation or
 * permanent-deletion receipt JSON: a legitimate project can own thousands of
 * content-addressed releases and both columns are capped at 256 KiB.
 */
export type ObjectStorageStaticArtifactSummary = ObjectStorageJsonObject & {
  count: number;
  deletedCount: number;
  retainedCount: number;
  digest: string;
};

/** Normalized pre-effect authority retained after the Project/manifest cascade. */
export interface ObjectStorageStaticArtifactPlanEntry {
  artifactRef: string;
  digest: string;
  projectReferenceCount: number;
  otherReferenceCount: number;
}

export interface ObjectStorageStaticErasurePlan {
  summary: ObjectStorageStaticArtifactSummary;
  artifacts: readonly ObjectStorageStaticArtifactPlanEntry[];
}

export interface ObjectStorageOperationScope {
  projectId: string;
  expectedOrganizationId: string;
  /** Null means the caller observed an active project. Omit only on replay helpers. */
  expectedDeletedAt?: string | null;
}

export interface CanonicalObjectStorageOperationScope {
  projectId: string;
  expectedOrganizationId: string;
  expectedDeletedAt: string | null;
}

export interface ObjectStorageOperationRequestShape {
  kind: ObjectStorageOperationKind;
  scopes: readonly ObjectStorageOperationScope[];
  payload: ObjectStorageJsonObject;
  preconditions: ObjectStorageJsonObject;
}

/**
 * Non-secret proof that a storage operation is owned by one exact live release
 * barrier. The owner token itself is never persisted; its SHA-256 digest is
 * compared with the token held by ProjectCheckpoint while the checkpoint lock
 * is held.
 */
export interface ObjectStorageCheckpointBarrierAuthority extends ObjectStorageJsonObject {
  kind: 'RELEASE_BARRIER';
  projectId: string;
  checkpointId: string;
  barrierId: string;
  ownerTokenHash: string;
  fence: number;
  expectedOrganizationId: string;
  expectedManifestDigest: string;
}

export interface ClaimObjectStorageOperationInput extends ObjectStorageOperationRequestShape {
  idempotencyKey: string;
  requestHash: string;
  ownerToken: string;
  leaseTtlSeconds: number;
  /** Required for PROJECT_REMIX_CLONE; normalized outside the bounded JSON payload. */
  pinnedInventory?: ObjectStoragePinnedInventory;
  /** Required for PROJECT_VERSION_GC; exact noncurrent generations, max 500 per operation. */
  pinnedGenerations?: readonly ObjectStoragePinnedGeneration[];
  /** Ephemeral authority used by signed-capability claims; never serialized automatically. */
  checkpointBarrierAuthority?: ObjectStorageCheckpointBarrierAuthority;
  /** Ephemeral parent account-purge authority; never serialized automatically. */
  accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
}

export interface ObjectStoragePinnedInventoryEntry {
  key: string;
  size: number;
  generation: string;
  contentHash: string;
}

export interface ObjectStoragePinnedInventory {
  bucketExists: boolean;
  objects: ObjectStoragePinnedInventoryEntry[];
}

export interface ObjectStoragePinnedGeneration {
  key: string;
  size: number;
  generation: string;
  contentHash: string | null;
}

export interface ObjectStorageOperationLease {
  operationId: string;
  ownerToken: string;
  fencingToken: bigint;
  requestHash: string;
  scopeHash: string;
  leaseExpiresAt: string;
}

export interface ProjectVolumeErasureBatchProgress extends ObjectStorageJsonObject {
  schemaVersion: 'workspace-project-erasure-progress-v1';
  complete: false;
  phase: 'kubernetes' | 'volume-inventory' | 'volume-erasure';
  processed: number;
  remaining: number;
}

export interface StoredObjectStorageOperationScope {
  ordinal: number;
  projectId: string;
  expectedOrganizationId: string;
  expectedDeletedAt: string | null;
  expectedPermanentDeletionStartedAt: string | null;
  deletionFenceDeletedAt: string | null;
  projectStillExists: boolean;
}

export interface ObjectStorageOperationRecord {
  id: string;
  kind: ObjectStorageOperationKind;
  status: ObjectStorageOperationStatus;
  scopeHash: string;
  idempotencyScopeHash: string;
  idempotencyKey: string;
  requestHash: string;
  payload: ObjectStorageJsonObject;
  preconditions: ObjectStorageJsonObject;
  evidence: ObjectStorageJsonValue | null;
  result: ObjectStorageJsonValue | null;
  reservedCapabilityExpiresAt: string | null;
  ownerToken: string | null;
  fencingToken: bigint;
  leaseExpiresAt: string | null;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  preparedAt: string;
  effectStartedAt: string | null;
  verificationStartedAt: string | null;
  committedAt: string | null;
  failedSafeAt: string | null;
  manualRecoveryAt: string | null;
  createdAt: string;
  updatedAt: string;
  scopes: StoredObjectStorageOperationScope[];
}

export type ClaimObjectStorageOperationResult =
  | { kind: 'ACQUIRED'; operation: ObjectStorageOperationRecord; lease: ObjectStorageOperationLease }
  | { kind: 'REPLAY'; operation: ObjectStorageOperationRecord; result: ObjectStorageJsonValue }
  | { kind: 'BUSY'; operation: ObjectStorageOperationRecord; retryAt: string }
  | { kind: 'VERIFY_FIRST'; operation: ObjectStorageOperationRecord }
  | { kind: 'MANUAL_RECOVERY'; operation: ObjectStorageOperationRecord };

export interface ObjectStorageVerification {
  outcome: 'VERIFIED' | 'VERIFIED_ABSENT';
  /** Written from clock_timestamp() by finalize; caller input is ignored. */
  verifiedAt?: string;
  verifier: string;
  evidence: ObjectStorageJsonObject;
  capabilityExpiresAt?: string;
}

export interface PermanentDeletionReplay {
  projectId: string;
  organizationId: string;
  projectSnapshot: ObjectStorageJsonObject;
  state: 'COMMITTED';
  completedAt: string;
  proof: ObjectStorageVerification & { verifiedAt: string };
  result: ObjectStorageJsonValue;
  operationId: string;
}

export interface FinalizeObjectStorageOperationInput {
  verification: ObjectStorageVerification;
  /** Ignored for permanent deletion, whose safe project receipt is generated in-transaction. */
  result?: ObjectStorageJsonValue;
}

export interface SignedCapabilityAuthorization {
  reservationId: string;
  operationId: string;
  attempt: number;
  fencingToken: bigint;
  method: 'GET' | 'PUT';
  objectKeyHash: string;
  reservedCapabilityExpiresAt: string;
  receipt: {
    requiresResign: true;
    objectKeyHash: string;
    method: 'GET' | 'PUT';
    reservedCapabilityExpiresAt: string;
    reservationAttempt: number;
  };
}

export type SignedCapabilityMethod = SignedCapabilityAuthorization['method'];

export interface ObjectStorageRecoveryCandidate {
  operationId: string;
  kind: ObjectStorageOperationKind;
  status: 'PREPARED' | 'EFFECT_STARTED' | 'VERIFYING';
  requestHash: string;
  scopeHash: string;
  fencingToken: bigint;
  leaseExpiresAt: string;
  action: 'FAIL_SAFE' | 'VERIFY_FIRST';
}

export interface ObjectStorageRecoveryMutationInput {
  operationId: string;
  requestHash: string;
  scopeHash: string;
  fencingToken: bigint;
  errorCode: string;
  error: unknown;
}

export type ObjectStorageRecoveryInspection =
  | { action: 'REPLAY'; operation: ObjectStorageOperationRecord; result: ObjectStorageJsonValue }
  | { action: 'BUSY'; operation: ObjectStorageOperationRecord; retryAt: string }
  | { action: 'RETRY_SAFE'; operation: ObjectStorageOperationRecord }
  | { action: 'VERIFY_FIRST'; operation: ObjectStorageOperationRecord }
  | { action: 'MANUAL_RECOVERY'; operation: ObjectStorageOperationRecord };

export type ObjectStorageVerificationClaimResult =
  | { kind: 'ACQUIRED'; operation: ObjectStorageOperationRecord; lease: ObjectStorageOperationLease }
  | { kind: 'BUSY'; operation: ObjectStorageOperationRecord; retryAt: string }
  | { kind: 'REPLAY'; operation: ObjectStorageOperationRecord; result: ObjectStorageJsonValue }
  | { kind: 'MANUAL_RECOVERY'; operation: ObjectStorageOperationRecord };

export class ObjectStorageOperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ObjectStorageOperationError';
  }
}

type Tx = Prisma.TransactionClient;

interface OperationRow {
  id: string;
  kind: ObjectStorageOperationKind;
  status: ObjectStorageOperationStatus;
  scopeHash: string;
  idempotencyScopeHash: string;
  idempotencyKey: string;
  requestHash: string;
  payload: unknown;
  preconditions: unknown;
  evidence: unknown | null;
  result: unknown | null;
  reservedCapabilityExpiresAt: Date | null;
  ownerToken: string | null;
  fencingToken: bigint | number | string;
  leaseExpiresAt: Date | null;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  preparedAt: Date;
  effectStartedAt: Date | null;
  verificationStartedAt: Date | null;
  committedAt: Date | null;
  failedSafeAt: Date | null;
  manualRecoveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ScopeRow {
  ordinal: number;
  projectIdSnapshot: string;
  projectId: string | null;
  expectedOrganizationId: string;
  expectedDeletedAt: Date | null;
  expectedPermanentDeletionStartedAt: Date | null;
  deletionFenceDeletedAt: Date | null;
}

interface LockedProjectRow {
  id: string;
  organizationId: string;
  deletedAt: Date | null;
  permanentDeletionStartedAt: Date | null;
  objectStorageCapabilityExpiresAt: Date | null;
  ownershipEpoch: number;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PROJECT_MANIFEST_DIGEST = /^sha256:[0-9a-f]{64}$/;
const RELEASE_BARRIER_ID = /^release:[A-Za-z0-9][A-Za-z0-9:._-]{0,190}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/;
const MAX_JSON_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 32;
const MIN_LEASE_TTL_SECONDS = 5;
const MAX_LEASE_TTL_SECONDS = 15 * 60;
const MAX_CAPABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SENSITIVE_JSON_KEY =
  /(?:authorization(?:header)?|credentials?|password|privatekey|signature|signedurl|accesstoken|refreshtoken|bearertoken|apitoken|apikey|clientsecret)$/i;
const SENSITIVE_JSON_VALUE =
  /(?:\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|credential|password|api[_-]?key)\s*[:=]\s*\S+|[?&](?:X-Goog-(?:Algorithm|Credential|Date|Expires|SignedHeaders|Signature)|X-Amz-(?:Algorithm|Credential|Signature|Security-Token)|Signature|AWSAccessKeyId|GoogleAccessId|access_token|token)=)/i;
const SIGNED_CAPABILITY_KINDS = new Set<ObjectStorageOperationKind>([
  'SIGNED_UPLOAD_CAPABILITY',
  'SIGNED_DOWNLOAD_CAPABILITY',
]);
const ACTIVE_OR_FROZEN_STATUSES = ['PREPARED', 'EFFECT_STARTED', 'VERIFYING', 'MANUAL_RECOVERY'] as const;

function operationError(code: string, message: string, statusCode: number, retryable = false) {
  return new ObjectStorageOperationError(code, message, statusCode, retryable);
}

function normalizeCheckpointBarrierAuthority(value: unknown): ObjectStorageCheckpointBarrierAuthority | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CHECKPOINT_AUTHORITY_INVALID',
      'Checkpoint barrier authority is invalid',
      400,
    );
  }
  const authority = value as Record<string, unknown>;
  if (
    authority.kind !== 'RELEASE_BARRIER' ||
    typeof authority.projectId !== 'string' ||
    !SAFE_ID.test(authority.projectId) ||
    typeof authority.checkpointId !== 'string' ||
    !SAFE_ID.test(authority.checkpointId) ||
    typeof authority.barrierId !== 'string' ||
    !RELEASE_BARRIER_ID.test(authority.barrierId) ||
    typeof authority.ownerTokenHash !== 'string' ||
    !SHA256.test(authority.ownerTokenHash) ||
    !Number.isSafeInteger(authority.fence) ||
    Number(authority.fence) < 1 ||
    typeof authority.expectedOrganizationId !== 'string' ||
    !SAFE_ID.test(authority.expectedOrganizationId) ||
    typeof authority.expectedManifestDigest !== 'string' ||
    !PROJECT_MANIFEST_DIGEST.test(authority.expectedManifestDigest)
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CHECKPOINT_AUTHORITY_INVALID',
      'Checkpoint barrier authority is invalid',
      400,
    );
  }
  return authority as unknown as ObjectStorageCheckpointBarrierAuthority;
}

/** Canonical advisory-lock identity shared by purge, transfer, and every saga. */
export function objectStorageMutationAdvisoryKey(projectId: string): string {
  assertSafeId(projectId, 'projectId');
  return `account-purge:object-storage:${projectId}`;
}

function assertSafeId(value: string, field: string): void {
  if (!SAFE_ID.test(value)) {
    throw operationError('OBJECT_STORAGE_OPERATION_INVALID_SCOPE', `${field} is invalid`, 400);
  }
}

function parseDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw operationError('OBJECT_STORAGE_OPERATION_INVALID_TIMESTAMP', `${field} must be an ISO timestamp`, 400);
  }
  return parsed;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function assertJson(value: unknown, path: string, depth = 0): asserts value is ObjectStorageJsonValue {
  if (depth > MAX_JSON_DEPTH) {
    throw operationError('OBJECT_STORAGE_OPERATION_JSON_TOO_DEEP', `${path} exceeds the JSON depth limit`, 400);
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (SENSITIVE_JSON_VALUE.test(value)) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_SENSITIVE_JSON',
        `${path} contains a URL, credential, signature, or secret material`,
        400,
      );
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw operationError('OBJECT_STORAGE_OPERATION_JSON_INVALID', `${path} contains a non-finite number`, 400);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJson(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw operationError('OBJECT_STORAGE_OPERATION_JSON_INVALID', `${path} must contain JSON values only`, 400);
  }
  for (const [key, item] of Object.entries(value)) {
    if (key.length === 0 || key.length > 256 || SENSITIVE_JSON_KEY.test(key.replace(/[-_]/g, ''))) {
      throw operationError('OBJECT_STORAGE_OPERATION_JSON_INVALID', `${path} contains an invalid key`, 400);
    }
    assertJson(item, `${path}.${key}`, depth + 1);
  }
}

function assertJsonObject(value: unknown, path: string): asserts value is ObjectStorageJsonObject {
  assertJson(value, path);
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw operationError('OBJECT_STORAGE_OPERATION_JSON_INVALID', `${path} must be a JSON object`, 400);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) {
    throw operationError('OBJECT_STORAGE_OPERATION_JSON_TOO_LARGE', `${path} exceeds 256 KiB`, 413);
  }
}

function canonicalJson(value: ObjectStorageJsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const PINNED_CONTENT_HASH = /^(?:sha256|md5|crc32c):\S{1,512}$/;

export function canonicalizeObjectStoragePinnedInventory(
  inventory: ObjectStoragePinnedInventory,
): ObjectStoragePinnedInventory {
  if (typeof inventory.bucketExists !== 'boolean' || !Array.isArray(inventory.objects)) {
    throw operationError('OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_INVALID', 'Pinned inventory is invalid', 400);
  }
  if (inventory.objects.length > 100_000 || (!inventory.bucketExists && inventory.objects.length > 0)) {
    throw operationError('OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_INVALID', 'Pinned inventory is invalid', 400);
  }
  const objects = inventory.objects
    .map((object) => {
      if (
        typeof object.key !== 'string' ||
        object.key.length < 1 ||
        object.key.length > 1024 ||
        !Number.isSafeInteger(object.size) ||
        object.size < 0 ||
        typeof object.generation !== 'string' ||
        object.generation.length < 1 ||
        object.generation.length > 255 ||
        typeof object.contentHash !== 'string' ||
        !PINNED_CONTENT_HASH.test(object.contentHash)
      ) {
        throw operationError('OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_INVALID', 'Pinned inventory is invalid', 400);
      }
      return { ...object };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  if (new Set(objects.map((object) => object.key)).size !== objects.length) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_INVALID',
      'Pinned inventory contains duplicate keys',
      400,
    );
  }
  return { bucketExists: inventory.bucketExists, objects };
}

export function objectStoragePinnedInventoryDigest(inventory: ObjectStoragePinnedInventory): string {
  const canonical = canonicalizeObjectStoragePinnedInventory(inventory);
  return sha256(canonicalJson(canonical as unknown as ObjectStorageJsonValue));
}

export function canonicalizeObjectStoragePinnedGenerations(
  generations: readonly ObjectStoragePinnedGeneration[],
): ObjectStoragePinnedGeneration[] {
  if (!Array.isArray(generations) || generations.length > 500) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_INVALID',
      'Pinned generation batch must contain at most 500 objects',
      400,
    );
  }
  const canonical = generations
    .map((generation) => {
      if (
        typeof generation.key !== 'string' ||
        generation.key.length < 1 ||
        generation.key.length > 1024 ||
        !Number.isSafeInteger(generation.size) ||
        generation.size < 0 ||
        typeof generation.generation !== 'string' ||
        generation.generation.length < 1 ||
        generation.generation.length > 255 ||
        !(generation.contentHash === null || PINNED_CONTENT_HASH.test(generation.contentHash))
      ) {
        throw operationError(
          'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_INVALID',
          'Pinned generation batch is invalid',
          400,
        );
      }
      return { ...generation };
    })
    .sort((left, right) => left.key.localeCompare(right.key) || left.generation.localeCompare(right.generation));
  if (
    new Set(canonical.map((generation) => `${generation.key}\u0000${generation.generation}`)).size !== canonical.length
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_INVALID',
      'Pinned generation batch contains duplicates',
      400,
    );
  }
  return canonical;
}

export function objectStoragePinnedGenerationDigest(generations: readonly ObjectStoragePinnedGeneration[]): string {
  return sha256(
    canonicalJson(canonicalizeObjectStoragePinnedGenerations(generations) as unknown as ObjectStorageJsonValue),
  );
}

export function objectStorageArtifactInventoryDigest(
  dispositions: readonly ObjectStorageStaticArtifactDisposition[],
): string {
  const sorted = dispositions
    .map((artifact) => {
      if (
        !SHA256.test(artifact.digest) ||
        (artifact.outcome !== 'DELETED_UNREFERENCED' && artifact.outcome !== 'RETAINED_BY_OTHER_MANIFEST') ||
        !Number.isSafeInteger(artifact.otherReferenceCount) ||
        artifact.otherReferenceCount < 0 ||
        (artifact.outcome === 'DELETED_UNREFERENCED' && artifact.otherReferenceCount !== 0) ||
        (artifact.outcome === 'RETAINED_BY_OTHER_MANIFEST' && artifact.otherReferenceCount < 1)
      ) {
        throw operationError(
          'OBJECT_STORAGE_OPERATION_ARTIFACT_INVENTORY_INVALID',
          'Static artifact disposition is invalid',
          400,
        );
      }
      return { ...artifact };
    })
    .sort((left, right) => left.digest.localeCompare(right.digest));
  if (new Set(sorted.map((artifact) => artifact.digest)).size !== sorted.length) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_INVENTORY_INVALID',
      'Static artifact inventory contains duplicate digests',
      400,
    );
  }
  const canonical: ObjectStorageJsonValue = sorted.map((artifact) => ({
    digest: artifact.digest,
    outcome: artifact.outcome,
    otherReferenceCount: artifact.otherReferenceCount,
  }));
  return sha256(canonicalJson(canonical));
}

export function objectStorageStaticArtifactSummary(
  dispositions: readonly ObjectStorageStaticArtifactDisposition[],
): ObjectStorageStaticArtifactSummary {
  const digest = objectStorageArtifactInventoryDigest(dispositions);
  const deletedCount = dispositions.filter((artifact) => artifact.outcome === 'DELETED_UNREFERENCED').length;
  return {
    count: dispositions.length,
    deletedCount,
    retainedCount: dispositions.length - deletedCount,
    digest,
  };
}

export function parseObjectStorageStaticArtifactSummary(value: unknown): ObjectStorageStaticArtifactSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_SUMMARY_INVALID',
      'Static artifact summary is invalid',
      400,
    );
  }
  const summary = value as Record<string, unknown>;
  if (
    Object.keys(summary).some((key) => !['count', 'deletedCount', 'retainedCount', 'digest'].includes(key)) ||
    !Number.isSafeInteger(summary.count) ||
    Number(summary.count) < 0 ||
    !Number.isSafeInteger(summary.deletedCount) ||
    Number(summary.deletedCount) < 0 ||
    !Number.isSafeInteger(summary.retainedCount) ||
    Number(summary.retainedCount) < 0 ||
    Number(summary.deletedCount) + Number(summary.retainedCount) !== Number(summary.count) ||
    typeof summary.digest !== 'string' ||
    !SHA256.test(summary.digest)
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_SUMMARY_INVALID',
      'Static artifact summary is invalid',
      400,
    );
  }
  return {
    count: Number(summary.count),
    deletedCount: Number(summary.deletedCount),
    retainedCount: Number(summary.retainedCount),
    digest: summary.digest,
  };
}

function normalizeObjectStorageStaticErasurePlan(value: ObjectStorageStaticErasurePlan): {
  summary: ObjectStorageStaticArtifactSummary;
  artifacts: ObjectStorageStaticArtifactPlanEntry[];
} {
  const summary = parseObjectStorageStaticArtifactSummary(value.summary);
  if (!Array.isArray(value.artifacts)) {
    throw operationError('OBJECT_STORAGE_OPERATION_ARTIFACT_PLAN_INVALID', 'Static artifact plan is invalid', 400);
  }
  const artifacts = value.artifacts
    .map((artifact) => {
      const matchedDigest = /^static-artifacts\/sha256\/([a-f0-9]{64})$/u.exec(artifact.artifactRef)?.[1];
      if (
        !matchedDigest ||
        artifact.digest !== matchedDigest ||
        !Number.isSafeInteger(artifact.projectReferenceCount) ||
        artifact.projectReferenceCount < 1 ||
        !Number.isSafeInteger(artifact.otherReferenceCount) ||
        artifact.otherReferenceCount < 0
      ) {
        throw operationError('OBJECT_STORAGE_OPERATION_ARTIFACT_PLAN_INVALID', 'Static artifact plan is invalid', 400);
      }
      return { ...artifact };
    })
    .sort((left, right) => left.artifactRef.localeCompare(right.artifactRef));
  if (new Set(artifacts.map((artifact) => artifact.artifactRef)).size !== artifacts.length) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_PLAN_INVALID',
      'Static artifact plan contains duplicate references',
      400,
    );
  }
  const derivedSummary = objectStorageStaticArtifactSummary(
    artifacts.map((artifact) => ({
      digest: artifact.digest,
      outcome: artifact.otherReferenceCount === 0 ? 'DELETED_UNREFERENCED' : 'RETAINED_BY_OTHER_MANIFEST',
      otherReferenceCount: artifact.otherReferenceCount,
    })),
  );
  if (!staticArtifactSummariesEqual(summary, derivedSummary)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_PLAN_INVALID',
      'Static artifact plan does not match its commitment',
      409,
    );
  }
  return { summary, artifacts };
}

export function canonicalizeObjectStorageScopes(
  scopes: readonly ObjectStorageOperationScope[],
): CanonicalObjectStorageOperationScope[] {
  if (scopes.length === 0 || scopes.length > 100) {
    throw operationError('OBJECT_STORAGE_OPERATION_INVALID_SCOPE', 'One to 100 project scopes are required', 400);
  }

  const canonical = scopes.map((scope) => {
    assertSafeId(scope.projectId, 'projectId');
    assertSafeId(scope.expectedOrganizationId, 'expectedOrganizationId');
    const expectedDeletedAt = scope.expectedDeletedAt ?? null;
    return {
      projectId: scope.projectId,
      expectedOrganizationId: scope.expectedOrganizationId,
      expectedDeletedAt:
        expectedDeletedAt === null ? null : parseDate(expectedDeletedAt, 'expectedDeletedAt').toISOString(),
    };
  });

  canonical.sort((left, right) => left.projectId.localeCompare(right.projectId));
  if (new Set(canonical.map((scope) => scope.projectId)).size !== canonical.length) {
    throw operationError('OBJECT_STORAGE_OPERATION_DUPLICATE_SCOPE', 'A project may appear only once', 400);
  }
  return canonical;
}

export function objectStorageScopeHash(scopes: readonly ObjectStorageOperationScope[]): string {
  const canonical: ObjectStorageJsonValue = canonicalizeObjectStorageScopes(scopes).map((scope) => ({
    projectId: scope.projectId,
    expectedOrganizationId: scope.expectedOrganizationId,
    expectedDeletedAt: scope.expectedDeletedAt,
  }));
  return sha256(canonicalJson(canonical));
}

export function objectStorageIdempotencyScopeHash(scopes: readonly ObjectStorageOperationScope[]): string {
  const canonical: ObjectStorageJsonValue = canonicalizeObjectStorageScopes(scopes).map((scope) => ({
    projectId: scope.projectId,
    expectedOrganizationId: scope.expectedOrganizationId,
  }));
  return sha256(canonicalJson(canonical));
}

export function objectStorageRequestHash(input: ObjectStorageOperationRequestShape): string {
  if (!OBJECT_STORAGE_OPERATION_KINDS.includes(input.kind)) {
    throw operationError('OBJECT_STORAGE_OPERATION_KIND_INVALID', 'Unknown object-storage operation kind', 400);
  }
  assertJsonObject(input.payload, 'payload');
  assertJsonObject(input.preconditions, 'preconditions');
  if (
    typeof input.payload.command !== 'string' ||
    input.payload.command.length < 1 ||
    input.payload.command.length > 128
  ) {
    throw operationError('OBJECT_STORAGE_OPERATION_COMMAND_INVALID', 'payload.command is required', 400);
  }

  const scopes: ObjectStorageJsonValue = canonicalizeObjectStorageScopes(input.scopes).map((scope) => ({
    projectId: scope.projectId,
    expectedOrganizationId: scope.expectedOrganizationId,
    /* Soft-deletion state is a live claim precondition, not part of the
     * irreversible intent identity. The exact value remains committed in the
     * scopeHash/normalized scope and is revalidated under the Project lock. */
    expectedDeletedAt: input.kind === 'PROJECT_PERMANENT_DELETE' ? null : scope.expectedDeletedAt,
  }));
  return sha256(
    canonicalJson({
      kind: input.kind,
      scopes,
      payload: input.payload,
      preconditions: input.preconditions,
    }),
  );
}

function validateClaimInput(input: ClaimObjectStorageOperationInput): CanonicalObjectStorageOperationScope[] {
  if (!input.idempotencyKey || input.idempotencyKey.length > 255) {
    throw operationError('OBJECT_STORAGE_OPERATION_IDEMPOTENCY_KEY_INVALID', 'Idempotency key is required', 400);
  }
  if (!SHA256.test(input.requestHash)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_REQUEST_HASH_INVALID',
      'Request hash must be lowercase SHA-256',
      400,
    );
  }
  if (input.requestHash !== objectStorageRequestHash(input)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_REQUEST_HASH_MISMATCH',
      'Request hash does not match the request',
      400,
    );
  }
  if (input.ownerToken.length < 16 || input.ownerToken.length > 255) {
    throw operationError('OBJECT_STORAGE_OPERATION_OWNER_INVALID', 'Owner token is invalid', 400);
  }
  if (
    !Number.isInteger(input.leaseTtlSeconds) ||
    input.leaseTtlSeconds < MIN_LEASE_TTL_SECONDS ||
    input.leaseTtlSeconds > MAX_LEASE_TTL_SECONDS
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_LEASE_TTL_INVALID',
      'Lease TTL must be between 5 and 900 seconds',
      400,
    );
  }

  const signedCapability = SIGNED_CAPABILITY_KINDS.has(input.kind);
  if (signedCapability) {
    if (!SHA256.test(String(input.payload.objectKeyHash ?? ''))) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_OBJECT_KEY_HASH_INVALID',
        'Signed capability payload requires a SHA-256 objectKeyHash',
        400,
      );
    }
    const expectedMethod = input.kind === 'SIGNED_UPLOAD_CAPABILITY' ? 'PUT' : 'GET';
    if (input.payload.method !== expectedMethod) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_METHOD_INVALID',
        `Signed capability method must be ${expectedMethod}`,
        400,
      );
    }
  }
  if (input.kind === 'PROJECT_PERMANENT_DELETE' && input.scopes.length !== 1) {
    throw operationError('OBJECT_STORAGE_OPERATION_INVALID_SCOPE', 'Permanent deletion requires one project', 400);
  }
  if (input.kind === 'PROJECT_TRANSFER' && input.scopes.length !== 1) {
    throw operationError('OBJECT_STORAGE_OPERATION_INVALID_SCOPE', 'Project transfer requires one project', 400);
  }
  if (input.kind === 'PROJECT_REMIX_CLONE') {
    if (!input.pinnedInventory || input.scopes.length !== 2) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_REQUIRED',
        'Project clone requires an exact normalized source inventory and two project scopes',
        400,
      );
    }
    const inventory = canonicalizeObjectStoragePinnedInventory(input.pinnedInventory);
    if (
      input.payload.inventoryDigest !== objectStoragePinnedInventoryDigest(inventory) ||
      input.payload.objectCount !== inventory.objects.length ||
      input.payload.sourceBucketExists !== inventory.bucketExists
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_MISMATCH',
        'Pinned inventory does not match the durable operation payload',
        409,
      );
    }
  } else if (input.pinnedInventory) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_UNEXPECTED',
      'Pinned inventory is only valid for project clone operations',
      400,
    );
  }
  if (input.kind === 'PROJECT_VERSION_GC') {
    if (!input.pinnedGenerations || input.scopes.length !== 1) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_REQUIRED',
        'Version history collection requires one project and a normalized generation batch',
        400,
      );
    }
    const generations = canonicalizeObjectStoragePinnedGenerations(input.pinnedGenerations);
    if (
      input.payload.command !== 'gc-object-generations' ||
      input.payload.candidateCount !== generations.length ||
      input.payload.candidateDigest !== objectStoragePinnedGenerationDigest(generations) ||
      typeof input.payload.disableVersioningWhenComplete !== 'boolean' ||
      !SHA256.test(String(input.payload.activeReferenceDigest ?? '')) ||
      !SHA256.test(String(input.payload.currentGenerationDigest ?? ''))
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_MISMATCH',
        'Pinned generation batch does not match the durable operation payload',
        409,
      );
    }
  } else if (input.pinnedGenerations) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_UNEXPECTED',
      'Pinned generations are only valid for version history collection',
      400,
    );
  }
  if (input.kind === 'ACCOUNT_PURGE_ERASURE' && typeof input.preconditions.purgePlanId !== 'string') {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PURGE_PLAN_REQUIRED',
      'Account purge erasure requires purgePlanId',
      400,
    );
  }

  return canonicalizeObjectStorageScopes(input.scopes);
}

function normalizeJsonObject(value: unknown, field: string): ObjectStorageJsonObject {
  assertJsonObject(value, field);
  return value;
}

function projectVolumeBatchProgress(value: unknown): ProjectVolumeErasureBatchProgress | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const progress = (value as Record<string, unknown>).volumeBatchProgress;
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return undefined;
  const candidate = progress as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 'workspace-project-erasure-progress-v1' ||
    candidate.complete !== false ||
    !['kubernetes', 'volume-inventory', 'volume-erasure'].includes(String(candidate.phase)) ||
    !Number.isSafeInteger(candidate.processed) ||
    Number(candidate.processed) < 0 ||
    !Number.isSafeInteger(candidate.remaining) ||
    Number(candidate.remaining) < 1
  ) {
    return undefined;
  }
  return candidate as unknown as ProjectVolumeErasureBatchProgress;
}

function normalizeJson(value: unknown, field: string): ObjectStorageJsonValue | null {
  if (value === null) return null;
  assertJson(value, field);
  return value;
}

function assertPersistableJson(value: unknown, field: string): asserts value is ObjectStorageJsonValue {
  assertJson(value, field);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) {
    throw operationError('OBJECT_STORAGE_OPERATION_JSON_TOO_LARGE', `${field} exceeds 256 KiB`, 413);
  }
}

function bigint(value: bigint | number | string): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function leaseFrom(operation: ObjectStorageOperationRecord): ObjectStorageOperationLease {
  if (!operation.ownerToken || !operation.leaseExpiresAt) {
    throw operationError('OBJECT_STORAGE_OPERATION_LEASE_CORRUPT', 'Operation has no active lease', 500);
  }
  return {
    operationId: operation.id,
    ownerToken: operation.ownerToken,
    fencingToken: operation.fencingToken,
    requestHash: operation.requestHash,
    scopeHash: operation.scopeHash,
    leaseExpiresAt: operation.leaseExpiresAt,
  };
}

function sameInstant(left: Date | null, right: string | null): boolean {
  if (left === null || right === null) return left === null && right === null;
  return left.getTime() === new Date(right).getTime();
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s]+|gs:\/\/[^\s]+/gi, '[URL_REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[KEY_REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/(password|secret|token|authorization|credential|signature)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/X-Goog-[A-Za-z-]+\s*[:=]\s*[^\s,;]+/gi, 'X-Goog-[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 1000);
}

async function databaseNow(tx: Tx): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
  const now = rows[0]?.now;
  if (!(now instanceof Date)) {
    throw operationError('OBJECT_STORAGE_OPERATION_DB_CLOCK_UNAVAILABLE', 'Database clock is unavailable', 503, true);
  }
  return now;
}

async function readScopeRows(tx: Tx, operationId: string): Promise<ScopeRow[]> {
  return tx.$queryRaw<ScopeRow[]>(Prisma.sql`
    SELECT
      "ordinal",
      "projectIdSnapshot",
      "projectId",
      "expectedOrganizationId",
      "expectedDeletedAt",
      "expectedPermanentDeletionStartedAt",
      "deletionFenceDeletedAt"
    FROM "ObjectStorageOperationProjectScope"
    WHERE "operationId" = ${operationId}
    ORDER BY "ordinal" ASC
  `);
}

export async function readObjectStorageOperationPinnedInventory(
  tx: Tx,
  operationId: string,
): Promise<ObjectStoragePinnedInventory> {
  assertSafeId(operationId, 'operationId');
  const [operation, rows] = await Promise.all([
    readOperationRow(tx, operationId),
    tx.$queryRaw<
      Array<{ ordinal: number; key: string; size: bigint | number | string; generation: string; contentHash: string }>
    >(Prisma.sql`
      SELECT "ordinal", "key", "size", "generation", "contentHash"
      FROM "ObjectStorageOperationPinnedObject"
      WHERE "operationId" = ${operationId}
      ORDER BY "ordinal" ASC
    `),
  ]);
  if (!operation || operation.kind !== 'PROJECT_REMIX_CLONE') {
    throw operationError('OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_NOT_FOUND', 'Pinned inventory was not found', 404);
  }
  const payload = normalizeJsonObject(operation.payload, 'stored payload');
  const objects = rows.map((row, ordinal) => {
    const size = Number(row.size);
    if (row.ordinal !== ordinal || !Number.isSafeInteger(size)) {
      throw operationError('OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_CORRUPT', 'Pinned inventory is corrupt', 500);
    }
    return { key: row.key, size, generation: row.generation, contentHash: row.contentHash };
  });
  const inventory = canonicalizeObjectStoragePinnedInventory({
    bucketExists: payload.sourceBucketExists === true,
    objects,
  });
  if (
    payload.inventoryDigest !== objectStoragePinnedInventoryDigest(inventory) ||
    payload.objectCount !== inventory.objects.length
  ) {
    throw operationError('OBJECT_STORAGE_OPERATION_PINNED_INVENTORY_CORRUPT', 'Pinned inventory is corrupt', 500);
  }
  return inventory;
}

export async function readObjectStorageOperationPinnedGenerations(
  tx: Tx,
  operationId: string,
): Promise<ObjectStoragePinnedGeneration[]> {
  assertSafeId(operationId, 'operationId');
  const [operation, rows] = await Promise.all([
    readOperationRow(tx, operationId),
    tx.$queryRaw<
      Array<{
        ordinal: number;
        key: string;
        size: bigint | number | string;
        generation: string;
        contentHash: string | null;
      }>
    >(Prisma.sql`
      SELECT "ordinal", "key", "size", "generation", "contentHash"
      FROM "ObjectStorageOperationPinnedGeneration"
      WHERE "operationId" = ${operationId}
      ORDER BY "ordinal" ASC
    `),
  ]);
  if (!operation || operation.kind !== 'PROJECT_VERSION_GC') {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_NOT_FOUND',
      'Pinned generation batch was not found',
      404,
    );
  }
  const generations = rows.map((row, ordinal) => {
    const size = Number(row.size);
    if (row.ordinal !== ordinal || !Number.isSafeInteger(size)) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_CORRUPT',
        'Pinned generation batch is corrupt',
        500,
      );
    }
    return { key: row.key, size, generation: row.generation, contentHash: row.contentHash };
  });
  const canonical = canonicalizeObjectStoragePinnedGenerations(generations);
  const payload = normalizeJsonObject(operation.payload, 'stored payload');
  if (
    payload.candidateCount !== canonical.length ||
    payload.candidateDigest !== objectStoragePinnedGenerationDigest(canonical)
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PINNED_GENERATIONS_CORRUPT',
      'Pinned generation batch is corrupt',
      500,
    );
  }
  return canonical;
}

async function readOperationRow(tx: Tx, operationId: string, forUpdate = false): Promise<OperationRow | null> {
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    SELECT * FROM "ObjectStorageOperation"
    WHERE "id" = ${operationId}
    ${forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
  return rows[0] ?? null;
}

async function readOperationByKey(
  tx: Tx,
  idempotencyScopeHash: string,
  idempotencyKey: string,
): Promise<OperationRow | null> {
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    SELECT * FROM "ObjectStorageOperation"
    WHERE "idempotencyScopeHash" = ${idempotencyScopeHash} AND "idempotencyKey" = ${idempotencyKey}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function hydrateOperation(tx: Tx, row: OperationRow): Promise<ObjectStorageOperationRecord> {
  const scopes = await readScopeRows(tx, row.id);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    scopeHash: row.scopeHash,
    idempotencyScopeHash: row.idempotencyScopeHash,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    payload: normalizeJsonObject(row.payload, 'stored payload'),
    preconditions: normalizeJsonObject(row.preconditions, 'stored preconditions'),
    evidence: normalizeJson(row.evidence, 'stored evidence'),
    result: normalizeJson(row.result, 'stored result'),
    reservedCapabilityExpiresAt: iso(row.reservedCapabilityExpiresAt),
    ownerToken: row.ownerToken,
    fencingToken: bigint(row.fencingToken),
    leaseExpiresAt: iso(row.leaseExpiresAt),
    attempts: row.attempts,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    preparedAt: row.preparedAt.toISOString(),
    effectStartedAt: iso(row.effectStartedAt),
    verificationStartedAt: iso(row.verificationStartedAt),
    committedAt: iso(row.committedAt),
    failedSafeAt: iso(row.failedSafeAt),
    manualRecoveryAt: iso(row.manualRecoveryAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    scopes: scopes.map((scope) => ({
      ordinal: scope.ordinal,
      projectId: scope.projectIdSnapshot,
      expectedOrganizationId: scope.expectedOrganizationId,
      expectedDeletedAt: iso(scope.expectedDeletedAt),
      expectedPermanentDeletionStartedAt: iso(scope.expectedPermanentDeletionStartedAt),
      deletionFenceDeletedAt: iso(scope.deletionFenceDeletedAt),
      projectStillExists: scope.projectId !== null,
    })),
  };
}

async function lockPhysicalDatabaseScope(
  tx: Tx,
  projectIds: readonly string[],
): Promise<Map<string, LockedProjectRow>> {
  const sorted = [...new Set(projectIds)].sort();
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock_shared(hashtext($1))', 'account-purge:topology');
  for (const projectId of sorted) {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      objectStorageMutationAdvisoryKey(projectId),
    );
  }
  for (const projectId of sorted) {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`project-checkpoint:${projectId}`}, 0))
    `;
  }

  const projects = new Map<string, LockedProjectRow>();
  for (const projectId of sorted) {
    const rows = await tx.$queryRaw<LockedProjectRow[]>(Prisma.sql`
      SELECT
        "id",
        "organizationId",
        "deletedAt",
        "permanentDeletionStartedAt",
        "objectStorageCapabilityExpiresAt",
        "ownershipEpoch"
      FROM "Project"
      WHERE "id" = ${projectId}
      FOR UPDATE
    `);
    if (rows[0]) projects.set(projectId, rows[0]);
  }
  return projects;
}

function storedScopesMatchRequest(
  stored: readonly ScopeRow[],
  requested: readonly CanonicalObjectStorageOperationScope[],
): boolean {
  return (
    stored.length === requested.length &&
    stored.every(
      (scope, index) =>
        scope.projectIdSnapshot === requested[index]?.projectId &&
        scope.expectedOrganizationId === requested[index]?.expectedOrganizationId &&
        iso(scope.expectedDeletedAt) === requested[index]?.expectedDeletedAt,
    )
  );
}

async function assertPurgeAllowed(
  tx: Tx,
  input: {
    kind: ObjectStorageOperationKind;
    projectIds: readonly string[];
    idempotencyKey?: string;
    requestHash?: string;
    payload?: ObjectStorageJsonObject;
    preconditions: ObjectStorageJsonObject;
    operationId?: string;
    existingOperation?: boolean;
    accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
  },
): Promise<void> {
  if (input.kind === 'ACCOUNT_PURGE_ERASURE') {
    const purgePlanId = input.preconditions.purgePlanId;
    if (typeof purgePlanId !== 'string' || !SAFE_ID.test(purgePlanId)) {
      throw operationError('OBJECT_STORAGE_OPERATION_PURGE_PLAN_REQUIRED', 'A valid purge plan is required', 400);
    }
    for (const projectId of input.projectIds) {
      const rows = await tx.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM "PurgeFreeze" pf
          JOIN "PurgePlan" plan ON plan."id" = pf."planId"
          WHERE plan."id" = ${purgePlanId}
            AND plan."status" = 'ACTIVE'
            AND pf."resourceType" = 'objectStorage'
            AND pf."resourceId" = ${projectId}
        ) AS "allowed"
      `);
      if (rows[0]?.allowed !== true) {
        throw operationError(
          'OBJECT_STORAGE_OPERATION_PURGE_FENCE_LOST',
          'Account purge storage fence is unavailable',
          409,
        );
      }
    }
    return;
  }

  /*
   * Once the permanent-deletion operation exists, its DB scope and installed
   * Project fence are the durable authority for safety-increasing transitions.
   * This is also what lets verification/quarantine complete if the parent plan
   * loses its lease after a provider response. A FAILED_SAFE retry deliberately
   * passes existingOperation=false and must re-prove its live parent authority.
   */
  if (
    input.kind === 'PROJECT_PERMANENT_DELETE' &&
    input.existingOperation &&
    input.operationId &&
    !input.accountPurgeDeletionAuthority
  ) {
    return;
  }

  if (input.kind === 'PROJECT_PERMANENT_DELETE' && input.accountPurgeDeletionAuthority) {
    const authority = input.accountPurgeDeletionAuthority;
    const projectId = input.projectIds[0];
    const expectedIdempotencyKey = `account-purge:${authority.planId}:${authority.projectId}`;
    const expectedActorHash = createHash('sha256').update(authority.userId).digest('hex');
    const expectedProjectNameHash = createHash('sha256').update(authority.expectedProjectName).digest('hex');
    if (
      input.projectIds.length !== 1 ||
      projectId !== authority.projectId ||
      input.idempotencyKey !== expectedIdempotencyKey ||
      input.idempotencyKey !== authority.idempotencyKey ||
      input.requestHash !== authority.requestHash ||
      !input.payload ||
      input.payload.command !== 'project-permanent-delete' ||
      input.payload.actorUserIdHash !== expectedActorHash ||
      input.payload.expectedProjectNameHash !== expectedProjectNameHash ||
      !Number.isSafeInteger(authority.expectedOwnershipEpoch) ||
      authority.expectedOwnershipEpoch < 0
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PURGE_FENCE_LOST',
        'Account purge project-deletion authority is invalid',
        409,
      );
    }
    const rows = await tx.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
      SELECT TRUE AS "allowed"
      FROM "PurgePlan" plan
      CROSS JOIN LATERAL jsonb_to_recordset(
        COALESCE(plan."inventory"->'ownedProjects', '[]'::jsonb)
      ) AS owned(
        "projectId" text,
        "organizationId" text,
        "projectName" text,
        "ownershipEpoch" integer
      )
      WHERE plan."id" = ${authority.planId}
        AND plan."userId" = ${authority.userId}
        AND plan."ownerToken" = ${authority.ownerToken}
        AND plan."status" = 'ACTIVE'
        AND plan."leaseExpiresAt" > date_trunc('milliseconds', clock_timestamp())
        AND owned."projectId" = ${authority.projectId}
        AND owned."organizationId" = ${authority.expectedOrganizationId}
        AND owned."projectName" = ${authority.expectedProjectName}
        AND owned."ownershipEpoch" = ${authority.expectedOwnershipEpoch}
      LIMIT 1
      FOR UPDATE OF plan
    `);
    if (rows[0]?.allowed !== true) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PURGE_FENCE_LOST',
        'Account purge project-deletion fence is unavailable',
        409,
      );
    }
    return;
  }

  const rows = await tx.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "PurgeFreeze" pf
      WHERE pf."resourceType" IN ('objectStorage', 'projectTopology')
        AND pf."resourceId" IN (${Prisma.join([...input.projectIds])})
    ) AS "blocked"
  `);
  if (rows[0]?.blocked === true) {
    throw operationError('OBJECT_STORAGE_OPERATION_PURGE_FROZEN', 'Project storage is fenced for account purge', 409);
  }
}

function accountPurgeDeletionAuthorityPredicate(
  authority: AccountPurgeProjectDeletionAuthority | undefined,
): Prisma.Sql {
  if (!authority) return Prisma.empty;
  return Prisma.sql`
    AND EXISTS (
      SELECT 1
      FROM "PurgePlan" parent_plan
      CROSS JOIN LATERAL jsonb_to_recordset(
        COALESCE(parent_plan."inventory"->'ownedProjects', '[]'::jsonb)
      ) AS owned(
        "projectId" text,
        "organizationId" text,
        "projectName" text,
        "ownershipEpoch" integer
      )
      WHERE parent_plan."id" = ${authority.planId}
        AND parent_plan."userId" = ${authority.userId}
        AND parent_plan."ownerToken" = ${authority.ownerToken}
        AND parent_plan."status" = 'ACTIVE'
        AND parent_plan."leaseExpiresAt" > date_trunc('milliseconds', clock_timestamp())
        AND owned."projectId" = ${authority.projectId}
        AND owned."organizationId" = ${authority.expectedOrganizationId}
        AND owned."projectName" = ${authority.expectedProjectName}
        AND owned."ownershipEpoch" = ${authority.expectedOwnershipEpoch}
    )
  `;
}

async function assertCheckpointBarriersClear(
  tx: Tx,
  scopes: readonly CanonicalObjectStorageOperationScope[] | readonly ScopeRow[],
  explicitAuthority?: ObjectStorageCheckpointBarrierAuthority,
  preconditions?: ObjectStorageJsonObject,
): Promise<void> {
  const projectIds = scopes.map((scope) => ('projectIdSnapshot' in scope ? scope.projectIdSnapshot : scope.projectId));
  const persistedAuthority = normalizeCheckpointBarrierAuthority(preconditions?.releaseBarrierAuthority);
  if (
    explicitAuthority &&
    persistedAuthority &&
    canonicalJson(explicitAuthority as unknown as ObjectStorageJsonObject) !==
      canonicalJson(persistedAuthority as unknown as ObjectStorageJsonObject)
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CHECKPOINT_AUTHORITY_INVALID',
      'Checkpoint barrier authorities do not match',
      409,
    );
  }
  const authority = normalizeCheckpointBarrierAuthority(explicitAuthority ?? persistedAuthority);
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      projectId: string;
      state: string;
      logicalBarrierId: string;
      barrierOwnerToken: string;
      barrierFence: number;
    }>
  >(Prisma.sql`
    SELECT "id", "projectId", "state", "logicalBarrierId", "barrierOwnerToken", "barrierFence"
    FROM "ProjectCheckpoint"
    WHERE "barrierProjectId" IN (${Prisma.join([...projectIds])})
      AND "barrierExpiresAt" > clock_timestamp()
    ORDER BY "projectId", "id"
  `);
  if (!authority) {
    if (!rows[0]) return;
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CHECKPOINT_BARRIER_ACTIVE',
      'Project checkpoint barrier is active',
      423,
    );
  }

  const authorityScope = scopes.find(
    (scope) => ('projectIdSnapshot' in scope ? scope.projectIdSnapshot : scope.projectId) === authority.projectId,
  );
  const matching = rows.find((row) => row.id === authority.checkpointId);
  if (
    rows.length !== 1 ||
    !matching ||
    !authorityScope ||
    authorityScope.expectedOrganizationId !== authority.expectedOrganizationId ||
    matching.projectId !== authority.projectId ||
    matching.state !== authority.kind ||
    matching.logicalBarrierId !== authority.barrierId ||
    matching.barrierFence !== authority.fence ||
    sha256(matching.barrierOwnerToken) !== authority.ownerTokenHash
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CHECKPOINT_AUTHORITY_LOST',
      'Release checkpoint authority is no longer valid',
      409,
    );
  }

  const manifests = await tx.$queryRaw<Array<{ digest: string }>>(Prisma.sql`
    SELECT "digest"
    FROM "ProjectManifestRevision"
    WHERE "projectId" = ${authority.projectId}
    ORDER BY "manifestVersion" DESC
    LIMIT 1
  `);
  if (manifests[0]?.digest !== authority.expectedManifestDigest) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CHECKPOINT_AUTHORITY_LOST',
      'Release manifest changed while the storage capability was used',
      409,
    );
  }
}

/**
 * Shared writer/transfer guard. Call only after topology/object/checkpoint locks;
 * it deliberately performs no provider I/O and uses the saga's single status set.
 */
export async function assertNoActiveObjectStorageOperation(
  tx: Tx,
  projectIds: readonly string[],
  exceptOperationId?: string,
): Promise<void> {
  const sortedProjectIds = [...new Set(projectIds)].sort();
  if (sortedProjectIds.length === 0) return;
  sortedProjectIds.forEach((projectId) => assertSafeId(projectId, 'projectId'));
  if (exceptOperationId) assertSafeId(exceptOperationId, 'operationId');
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT operation."id"
    FROM "ObjectStorageOperationProjectScope" scope
    JOIN "ObjectStorageOperation" operation ON operation."id" = scope."operationId"
    WHERE scope."projectIdSnapshot" IN (${Prisma.join(sortedProjectIds)})
      AND operation."status" IN (${Prisma.join([...ACTIVE_OR_FROZEN_STATUSES].map((status) => Prisma.sql`${status}::"ObjectStorageOperationStatus"`))})
      ${exceptOperationId ? Prisma.sql`AND operation."id" <> ${exceptOperationId}` : Prisma.empty}
    LIMIT 1
  `);
  if (rows[0]) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ACTIVE',
      'Another object-storage operation freezes this project',
      409,
    );
  }
}

async function validateLockedProjects(
  tx: Tx,
  input: {
    kind: ObjectStorageOperationKind;
    scopes: readonly CanonicalObjectStorageOperationScope[] | readonly ScopeRow[];
    projects: ReadonlyMap<string, LockedProjectRow>;
    idempotencyKey?: string;
    requestHash?: string;
    payload?: ObjectStorageJsonObject;
    preconditions: ObjectStorageJsonObject;
    operationId?: string;
    existingOperation?: boolean;
    checkpointBarrierAuthority?: ObjectStorageCheckpointBarrierAuthority;
    accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
  },
): Promise<void> {
  const projectIds = input.scopes.map((scope) =>
    'projectIdSnapshot' in scope ? scope.projectIdSnapshot : scope.projectId,
  );
  await assertPurgeAllowed(tx, {
    kind: input.kind,
    projectIds,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    payload: input.payload,
    preconditions: input.preconditions,
    operationId: input.operationId,
    existingOperation: input.existingOperation,
    accountPurgeDeletionAuthority: input.accountPurgeDeletionAuthority,
  });
  await assertCheckpointBarriersClear(tx, input.scopes, input.checkpointBarrierAuthority, input.preconditions);
  await assertNoActiveObjectStorageOperation(tx, projectIds, input.operationId);
  const now = await databaseNow(tx);

  for (const scope of input.scopes) {
    const projectId = 'projectIdSnapshot' in scope ? scope.projectIdSnapshot : scope.projectId;
    const expectedOrganizationId = scope.expectedOrganizationId;
    const expectedDeletedAt = 'projectIdSnapshot' in scope ? iso(scope.expectedDeletedAt) : scope.expectedDeletedAt;
    const expectedPermanentDeletionStartedAt =
      'projectIdSnapshot' in scope ? scope.expectedPermanentDeletionStartedAt : null;
    const deletionFenceDeletedAt = 'projectIdSnapshot' in scope ? scope.deletionFenceDeletedAt : null;
    const project = input.projects.get(projectId);
    if (!project) {
      throw operationError('OBJECT_STORAGE_OPERATION_PROJECT_NOT_FOUND', 'Project was not found', 404);
    }
    if (project.organizationId !== expectedOrganizationId) {
      throw operationError('OBJECT_STORAGE_OPERATION_TENANT_MISMATCH', 'Project organization changed', 409);
    }
    if (
      !(input.existingOperation && input.kind === 'PROJECT_PERMANENT_DELETE') &&
      !sameInstant(project.deletedAt, expectedDeletedAt)
    ) {
      throw operationError('OBJECT_STORAGE_OPERATION_DELETION_STATE_MISMATCH', 'Project deletion state changed', 409);
    }
    if (input.kind === 'PROJECT_TRANSFER' && project.deletedAt !== null) {
      throw operationError('OBJECT_STORAGE_OPERATION_PROJECT_DELETED', 'Deleted projects cannot be transferred', 409);
    }
    const capabilityDrainRequired =
      input.preconditions.capabilityDrainRequired === true ||
      input.kind === 'PROJECT_TRANSFER' ||
      input.kind === 'PROJECT_PERMANENT_DELETE' ||
      input.kind === 'PROJECT_VERSION_GC' ||
      input.kind === 'ACCOUNT_PURGE_ERASURE';
    if (
      capabilityDrainRequired &&
      project.objectStorageCapabilityExpiresAt &&
      project.objectStorageCapabilityExpiresAt > now
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_CAPABILITY_ACTIVE',
        'Project has an unexpired object-storage capability',
        409,
        true,
      );
    }
    if (input.kind === 'PROJECT_PERMANENT_DELETE' && input.existingOperation) {
      if (
        !expectedPermanentDeletionStartedAt ||
        !project.permanentDeletionStartedAt ||
        project.permanentDeletionStartedAt.getTime() !== expectedPermanentDeletionStartedAt.getTime() ||
        !deletionFenceDeletedAt ||
        !project.deletedAt ||
        project.deletedAt.getTime() !== deletionFenceDeletedAt.getTime()
      ) {
        throw operationError('OBJECT_STORAGE_OPERATION_DELETION_FENCE_LOST', 'Permanent deletion fence changed', 409);
      }
    } else if (project.permanentDeletionStartedAt !== null) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PERMANENT_DELETION_ACTIVE',
        'Permanent deletion is in progress',
        409,
      );
    }
  }
}

async function reserveCapabilityUpperBound(
  tx: Tx,
  projectIds: readonly string[],
  expiresAt: Date,
  now: Date,
): Promise<void> {
  if (expiresAt <= now || expiresAt.getTime() - now.getTime() > MAX_CAPABILITY_TTL_MS) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CAPABILITY_EXPIRY_INVALID',
      'Capability expiry must be in the future and no more than seven days away',
      400,
    );
  }
  for (const projectId of projectIds) {
    await tx.$executeRaw`
      UPDATE "Project"
      SET "objectStorageCapabilityExpiresAt" = GREATEST(
            COALESCE("objectStorageCapabilityExpiresAt", ${expiresAt}),
            ${expiresAt}
          ),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${projectId}
    `;
  }
}

/**
 * Claim or replay one operation under the complete DB lock order. This function
 * only mutates PostgreSQL; the caller must run provider I/O after the transaction
 * commits while retaining its outer physical/NFS fence.
 */
export async function claimObjectStorageOperation(
  tx: Tx,
  input: ClaimObjectStorageOperationInput,
): Promise<ClaimObjectStorageOperationResult> {
  const scopes = validateClaimInput(input);
  const projectIds = scopes.map((scope) => scope.projectId);
  const scopeHash = objectStorageScopeHash(scopes);
  const idempotencyScopeHash = objectStorageIdempotencyScopeHash(scopes);
  const projects = await lockPhysicalDatabaseScope(tx, projectIds);
  const existing = await readOperationByKey(tx, idempotencyScopeHash, input.idempotencyKey);

  if (existing) {
    if (existing.kind !== input.kind || existing.requestHash !== input.requestHash) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
        'Idempotency key was already used for a different request',
        409,
      );
    }
    const storedScopes = await readScopeRows(tx, existing.id);
    if (!storedScopesMatchRequest(storedScopes, scopes)) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
        'Idempotency scope does not match the stored request',
        409,
      );
    }
    if (existing.kind === 'PROJECT_REMIX_CLONE') {
      const storedInventory = await readObjectStorageOperationPinnedInventory(tx, existing.id);
      if (
        objectStoragePinnedInventoryDigest(storedInventory) !==
        objectStoragePinnedInventoryDigest(input.pinnedInventory!)
      ) {
        throw operationError(
          'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
          'Pinned inventory does not match the stored clone request',
          409,
        );
      }
    }
    if (existing.kind === 'PROJECT_VERSION_GC') {
      const storedGenerations = await readObjectStorageOperationPinnedGenerations(tx, existing.id);
      if (
        objectStoragePinnedGenerationDigest(storedGenerations) !==
        objectStoragePinnedGenerationDigest(input.pinnedGenerations!)
      ) {
        throw operationError(
          'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
          'Pinned generation batch does not match the stored collection request',
          409,
        );
      }
    }
    if (existing.status === 'COMMITTED') {
      const operation = await hydrateOperation(tx, existing);
      if (operation.result === null) {
        throw operationError('OBJECT_STORAGE_OPERATION_RESULT_CORRUPT', 'Committed operation has no receipt', 500);
      }
      return { kind: 'REPLAY', operation, result: operation.result };
    }
    if (existing.status === 'MANUAL_RECOVERY') {
      return { kind: 'MANUAL_RECOVERY', operation: await hydrateOperation(tx, existing) };
    }

    await validateLockedProjects(tx, {
      kind: existing.kind,
      scopes: storedScopes,
      projects,
      idempotencyKey: existing.idempotencyKey,
      requestHash: existing.requestHash,
      payload: normalizeJsonObject(existing.payload, 'stored payload'),
      preconditions: normalizeJsonObject(existing.preconditions, 'stored preconditions'),
      operationId: existing.id,
      /* FAILED_SAFE permanent deletion restored its Project fence and retries as a fresh pre-effect claim. */
      existingOperation: existing.status !== 'FAILED_SAFE',
      checkpointBarrierAuthority: input.checkpointBarrierAuthority,
      /* The parent plan is required until EFFECT_STARTED is committed. After
       * that boundary the immutable child scope and its own fencing token are
       * the recovery authority, including after parent-owner failover. */
      ...(existing.status !== 'EFFECT_STARTED' && existing.status !== 'VERIFYING' && input.accountPurgeDeletionAuthority
        ? { accountPurgeDeletionAuthority: input.accountPurgeDeletionAuthority }
        : {}),
    });
    const now = await databaseNow(tx);
    if (existing.leaseExpiresAt && existing.leaseExpiresAt > now) {
      const operation = await hydrateOperation(tx, existing);
      if (existing.ownerToken === input.ownerToken) {
        return { kind: 'ACQUIRED', operation, lease: leaseFrom(operation) };
      }
      return { kind: 'BUSY', operation, retryAt: existing.leaseExpiresAt.toISOString() };
    }
    const batchProgress = projectVolumeBatchProgress(existing.evidence);
    if (
      existing.kind === 'PROJECT_PERMANENT_DELETE' &&
      existing.status === 'EFFECT_STARTED' &&
      existing.verificationStartedAt === null &&
      existing.lastErrorCode === 'PROJECT_VOLUME_ERASURE_BATCH_REPLAY_REQUIRED' &&
      batchProgress
    ) {
      const volumeRoots = await tx.$queryRaw<Array<{ state: string; finalScanHash: string | null }>>(Prisma.sql`
        SELECT "state"::text AS "state", "finalScanHash"
        FROM "ProjectVolumeErasure"
        WHERE "operationId" = ${existing.id}
        FOR UPDATE
      `);
      const volumeRoot = volumeRoots[0];
      if (!volumeRoot || volumeRoot.state !== 'VERIFIED' || !volumeRoot.finalScanHash) {
        const resumed = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
          UPDATE "ObjectStorageOperation"
          SET "ownerToken" = ${input.ownerToken},
              "fencingToken" = "fencingToken" + 1,
              "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${input.leaseTtlSeconds}),
              "attempts" = "attempts" + 1,
              "lastErrorCode" = NULL,
              "lastErrorMessage" = NULL,
              "updatedAt" = clock_timestamp()
          WHERE "id" = ${existing.id}
            AND "requestHash" = ${input.requestHash}
            AND "status" = 'EFFECT_STARTED'::"ObjectStorageOperationStatus"
            AND "verificationStartedAt" IS NULL
            AND "lastErrorCode" = 'PROJECT_VOLUME_ERASURE_BATCH_REPLAY_REQUIRED'
            AND "leaseExpiresAt" <= clock_timestamp()
          RETURNING *
        `);
        if (!resumed[0]) {
          throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Volume batch could not be resumed', 409, true);
        }
        const operation = await hydrateOperation(tx, resumed[0]);
        return { kind: 'ACQUIRED', operation, lease: leaseFrom(operation) };
      }
    }
    if (existing.status === 'EFFECT_STARTED' || existing.status === 'VERIFYING') {
      return { kind: 'VERIFY_FIRST', operation: await hydrateOperation(tx, existing) };
    }

    const reclaimed = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
      UPDATE "ObjectStorageOperation"
      SET "status" = 'PREPARED'::"ObjectStorageOperationStatus",
          "ownerToken" = ${input.ownerToken},
          "fencingToken" = "fencingToken" + 1,
          "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${input.leaseTtlSeconds}),
          "attempts" = "attempts" + 1,
          "lastErrorCode" = NULL,
          "lastErrorMessage" = NULL,
          "failedSafeAt" = NULL,
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${existing.id}
        AND "requestHash" = ${input.requestHash}
        AND "status" IN ('PREPARED', 'FAILED_SAFE')
        AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp())
      RETURNING *
    `);
    if (!reclaimed[0]) {
      throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Operation could not be reclaimed', 409, true);
    }
    if (existing.kind === 'PROJECT_PERMANENT_DELETE' && existing.status === 'FAILED_SAFE') {
      const scope = storedScopes[0];
      if (!scope || storedScopes.length !== 1) {
        throw operationError('OBJECT_STORAGE_OPERATION_SCOPE_CORRUPT', 'Permanent deletion scope is invalid', 500);
      }
      const frozen = await tx.$queryRaw<Array<{ permanentDeletionStartedAt: Date; deletedAt: Date }>>(Prisma.sql`
        UPDATE "Project"
        SET "permanentDeletionStartedAt" = clock_timestamp(),
            "deletedAt" = COALESCE("deletedAt", clock_timestamp()),
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${scope.projectIdSnapshot}
          AND "organizationId" = ${scope.expectedOrganizationId}
          AND "permanentDeletionStartedAt" IS NULL
          AND "deletedAt" IS NOT DISTINCT FROM ${scope.expectedDeletedAt}
        RETURNING "permanentDeletionStartedAt", "deletedAt"
      `);
      if (!frozen[0]) {
        throw operationError(
          'OBJECT_STORAGE_OPERATION_DELETION_FENCE_LOST',
          'Permanent deletion fence could not be reinstalled',
          409,
        );
      }
      await tx.$executeRaw`
        UPDATE "ObjectStorageOperationProjectScope"
        SET "expectedPermanentDeletionStartedAt" = ${frozen[0].permanentDeletionStartedAt},
            "deletionFenceDeletedAt" = ${frozen[0].deletedAt}
        WHERE "operationId" = ${existing.id}
          AND "ordinal" = 0
      `;
    }
    const operation = await hydrateOperation(tx, reclaimed[0]);
    return { kind: 'ACQUIRED', operation, lease: leaseFrom(operation) };
  }

  await validateLockedProjects(tx, {
    kind: input.kind,
    scopes,
    projects,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    payload: input.payload,
    preconditions: input.preconditions,
    existingOperation: false,
    checkpointBarrierAuthority: input.checkpointBarrierAuthority,
    accountPurgeDeletionAuthority: input.accountPurgeDeletionAuthority,
  });
  const operationId = `objop_${randomUUID()}`;
  const inserted = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    INSERT INTO "ObjectStorageOperation" (
      "id", "kind", "status", "scopeHash", "idempotencyScopeHash", "idempotencyKey", "requestHash",
      "payload", "preconditions", "reservedCapabilityExpiresAt",
      "ownerToken", "fencingToken", "leaseExpiresAt", "attempts",
      "preparedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${operationId}, ${input.kind}::"ObjectStorageOperationKind",
      'PREPARED'::"ObjectStorageOperationStatus", ${scopeHash}, ${idempotencyScopeHash},
      ${input.idempotencyKey}, ${input.requestHash},
      ${JSON.stringify(input.payload)}::jsonb, ${JSON.stringify(input.preconditions)}::jsonb,
      NULL, ${input.ownerToken}, 1,
      clock_timestamp() + make_interval(secs => ${input.leaseTtlSeconds}), 1,
      clock_timestamp(), clock_timestamp(), clock_timestamp()
    )
    RETURNING *
  `);
  if (!inserted[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_CREATE_FAILED', 'Operation could not be persisted', 500);
  }

  let deletionFence: Date | null = null;
  let deletionState: Date | null = null;
  if (input.kind === 'PROJECT_PERMANENT_DELETE') {
    const projectId = projectIds[0]!;
    const frozen = await tx.$queryRaw<Array<{ permanentDeletionStartedAt: Date; deletedAt: Date }>>(Prisma.sql`
      UPDATE "Project"
      SET "permanentDeletionStartedAt" = COALESCE("permanentDeletionStartedAt", clock_timestamp()),
          "deletedAt" = COALESCE("deletedAt", clock_timestamp()),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${projectId} AND "permanentDeletionStartedAt" IS NULL
      RETURNING "permanentDeletionStartedAt", "deletedAt"
    `);
    if (!frozen[0]) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PERMANENT_DELETION_ACTIVE',
        'Permanent deletion is in progress',
        409,
      );
    }
    deletionFence = frozen[0].permanentDeletionStartedAt;
    deletionState = frozen[0].deletedAt;
  }

  for (const [ordinal, scope] of scopes.entries()) {
    await tx.$executeRaw`
      INSERT INTO "ObjectStorageOperationProjectScope" (
        "operationId", "ordinal", "projectIdSnapshot", "projectId",
        "expectedOrganizationId", "expectedDeletedAt",
        "expectedPermanentDeletionStartedAt", "deletionFenceDeletedAt", "createdAt"
      ) VALUES (
        ${operationId}, ${ordinal}, ${scope.projectId}, ${scope.projectId},
        ${scope.expectedOrganizationId},
        ${scope.expectedDeletedAt ? new Date(scope.expectedDeletedAt) : null},
        ${input.kind === 'PROJECT_PERMANENT_DELETE' ? deletionFence : null},
        ${input.kind === 'PROJECT_PERMANENT_DELETE' ? deletionState : null},
        clock_timestamp()
      )
    `;
  }

  if (input.kind === 'PROJECT_REMIX_CLONE') {
    const inventory = canonicalizeObjectStoragePinnedInventory(input.pinnedInventory!);
    for (let offset = 0; offset < inventory.objects.length; offset += 5_000) {
      const chunk = inventory.objects.slice(offset, offset + 5_000);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ObjectStorageOperationPinnedObject" (
          "operationId", "ordinal", "key", "size", "generation", "contentHash"
        ) VALUES ${Prisma.join(
          chunk.map(
            (object, index) =>
              Prisma.sql`(
              ${operationId}, ${offset + index}, ${object.key}, ${BigInt(object.size)},
              ${object.generation}, ${object.contentHash}
            )`,
          ),
        )}
      `);
    }
  }

  if (input.kind === 'PROJECT_VERSION_GC') {
    const generations = canonicalizeObjectStoragePinnedGenerations(input.pinnedGenerations!);
    if (generations.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ObjectStorageOperationPinnedGeneration" (
          "operationId", "ordinal", "key", "generation", "size", "contentHash"
        ) VALUES ${Prisma.join(
          generations.map(
            (generation, ordinal) =>
              Prisma.sql`(
              ${operationId}, ${ordinal}, ${generation.key}, ${generation.generation},
              ${BigInt(generation.size)}, ${generation.contentHash}
            )`,
          ),
        )}
      `);
    }
  }

  const operation = await hydrateOperation(tx, inserted[0]);
  return { kind: 'ACQUIRED', operation, lease: leaseFrom(operation) };
}

export async function assertObjectStorageOperationFence(
  tx: Tx,
  lease: ObjectStorageOperationLease,
): Promise<ObjectStorageOperationRecord> {
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    SELECT * FROM "ObjectStorageOperation"
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "scopeHash" = ${lease.scopeHash}
      AND "status" IN ('PREPARED', 'EFFECT_STARTED', 'VERIFYING')
      AND "leaseExpiresAt" > clock_timestamp()
    FOR UPDATE
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Object-storage operation lease was lost', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

export async function heartbeatObjectStorageOperation(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  leaseTtlSeconds: number,
): Promise<ObjectStorageOperationLease> {
  if (
    !Number.isInteger(leaseTtlSeconds) ||
    leaseTtlSeconds < MIN_LEASE_TTL_SECONDS ||
    leaseTtlSeconds > MAX_LEASE_TTL_SECONDS
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_LEASE_TTL_INVALID',
      'Lease TTL must be between 5 and 900 seconds',
      400,
    );
  }
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${leaseTtlSeconds}),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" IN ('PREPARED', 'EFFECT_STARTED', 'VERIFYING')
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Expired leases cannot be renewed', 409, true);
  }
  return leaseFrom(await hydrateOperation(tx, rows[0]));
}

async function lockLeasedOperationScope(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority,
): Promise<{ operation: ObjectStorageOperationRecord; row: OperationRow; scopes: ScopeRow[] }> {
  const initialScopes = await readScopeRows(tx, lease.operationId);
  if (initialScopes.length === 0) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  const projectIds = initialScopes.map((scope) => scope.projectIdSnapshot);
  const projects = await lockPhysicalDatabaseScope(tx, projectIds);
  const operation = await assertObjectStorageOperationFence(tx, lease);
  const row = await readOperationRow(tx, lease.operationId, true);
  if (!row) throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  const scopes = await readScopeRows(tx, lease.operationId);
  if (
    scopes.length !== initialScopes.length ||
    scopes.some((scope, index) => scope.projectIdSnapshot !== initialScopes[index]?.projectIdSnapshot)
  ) {
    throw operationError('OBJECT_STORAGE_OPERATION_SCOPE_CORRUPT', 'Operation scope changed unexpectedly', 500);
  }
  await validateLockedProjects(tx, {
    kind: row.kind,
    scopes,
    projects,
    preconditions: normalizeJsonObject(row.preconditions, 'stored preconditions'),
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    payload: normalizeJsonObject(row.payload, 'stored payload'),
    operationId: row.id,
    existingOperation: true,
    accountPurgeDeletionAuthority,
  });
  return { operation, row, scopes };
}

/**
 * Bind permanent deletion to the complete preflight artifact disposition
 * before any irreversible provider effect. Re-running preflight while the
 * operation is still PREPARED may refresh the plan (for example after a
 * provably pre-effect lease expiry); once EFFECT_STARTED it is immutable.
 */
export async function recordPermanentDeletionStaticArtifactPlan(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  plan: ObjectStorageStaticErasurePlan,
  accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority,
): Promise<ObjectStorageOperationRecord> {
  const normalized = normalizeObjectStorageStaticErasurePlan(plan);
  const locked = await lockLeasedOperationScope(tx, lease, accountPurgeDeletionAuthority);
  if (
    locked.row.kind !== 'PROJECT_PERMANENT_DELETE' ||
    locked.row.status !== 'PREPARED' ||
    locked.row.effectStartedAt !== null
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_PLAN_NOT_PREPARED',
      'Static artifact plan must be recorded before permanent-deletion effects start',
      409,
    );
  }
  const preconditions = {
    ...normalizeJsonObject(locked.row.preconditions, 'stored preconditions'),
    staticArtifactPlan: normalized.summary,
  };
  assertJsonObject(preconditions, 'permanent deletion preconditions');
  await tx.$executeRaw`
    DELETE FROM "ProjectPermanentDeletionArtifactPlan"
    WHERE "operationId" = ${lease.operationId}
  `;
  for (let offset = 0; offset < normalized.artifacts.length; offset += 500) {
    const batch = normalized.artifacts.slice(offset, offset + 500);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectPermanentDeletionArtifactPlan" (
        "operationId", "ordinal", "artifactRef", "artifactDigest",
        "projectReferenceCount", "plannedOtherReferenceCount", "state", "createdAt"
      ) VALUES ${Prisma.join(
        batch.map(
          (artifact, index) => Prisma.sql`(
            ${lease.operationId}, ${offset + index}, ${artifact.artifactRef}, ${artifact.digest},
            ${artifact.projectReferenceCount}, ${artifact.otherReferenceCount},
            'PLANNED'::"ProjectPermanentDeletionArtifactState", clock_timestamp()
          )`,
        ),
      )}
    `);
  }
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "preconditions" = ${JSON.stringify(preconditions)}::jsonb,
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" = 'PREPARED'
      AND "effectStartedAt" IS NULL
      ${accountPurgeDeletionAuthorityPredicate(accountPurgeDeletionAuthority)}
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Static artifact plan fence was lost', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

export async function markObjectStorageOperationEffectStarted(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  evidence: ObjectStorageJsonObject,
  accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority,
): Promise<ObjectStorageOperationRecord> {
  assertJsonObject(evidence, 'effect evidence');
  const locked = await lockLeasedOperationScope(tx, lease, accountPurgeDeletionAuthority);
  if (SIGNED_CAPABILITY_KINDS.has(locked.row.kind)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CAPABILITY_FLOW_INVALID',
      'Signed capabilities must use a committed non-secret reservation before signing',
      409,
    );
  }
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'EFFECT_STARTED'::"ObjectStorageOperationStatus",
        "effectStartedAt" = clock_timestamp(),
        "evidence" = jsonb_build_object('effect', ${JSON.stringify(evidence)}::jsonb),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" = 'PREPARED'
      AND "effectStartedAt" IS NULL
      ${accountPurgeDeletionAuthorityPredicate(accountPurgeDeletionAuthority)}
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Effect-start fence was lost', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

/**
 * Relinquishes a permanent-delete lease only after the workspace manager has
 * committed one bounded erasure batch. The operation remains EFFECT_STARTED;
 * claimObjectStorageOperation may resume effects (instead of verify-first) only
 * while the durable volume root is still incomplete. Once the final volume
 * scan exists, any later crash is ambiguous and returns to verify-first.
 */
export async function yieldProjectPermanentDeletionVolumeBatch(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  progress: ProjectVolumeErasureBatchProgress,
): Promise<ObjectStorageOperationRecord> {
  assertJsonObject(progress, 'project volume batch progress');
  if (
    progress.schemaVersion !== 'workspace-project-erasure-progress-v1' ||
    progress.complete !== false ||
    !['kubernetes', 'volume-inventory', 'volume-erasure'].includes(progress.phase) ||
    !Number.isSafeInteger(progress.processed) ||
    progress.processed < 0 ||
    !Number.isSafeInteger(progress.remaining) ||
    progress.remaining < 1
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_VOLUME_BATCH_PROGRESS_INVALID',
      'Project volume batch progress is invalid',
      400,
    );
  }
  const locked = await lockLeasedOperationScope(tx, lease);
  if (
    locked.row.kind !== 'PROJECT_PERMANENT_DELETE' ||
    locked.row.status !== 'EFFECT_STARTED' ||
    locked.row.verificationStartedAt !== null
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_VOLUME_BATCH_NOT_REPLAYABLE',
      'Only an unverified permanent-delete effect can yield a volume batch',
      409,
    );
  }
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "evidence" = COALESCE("evidence", '{}'::jsonb)
          || jsonb_build_object('volumeBatchProgress', ${JSON.stringify(progress)}::jsonb),
        "lastErrorCode" = 'PROJECT_VOLUME_ERASURE_BATCH_REPLAY_REQUIRED',
        "lastErrorMessage" = NULL,
        "leaseExpiresAt" = clock_timestamp() - INTERVAL '1 millisecond',
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "status" = 'EFFECT_STARTED'::"ObjectStorageOperationStatus"
      AND "verificationStartedAt" IS NULL
      AND "leaseExpiresAt" > clock_timestamp()
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Volume batch yield fence was lost', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

export async function beginObjectStorageOperationVerification(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  evidence: ObjectStorageJsonObject = {},
): Promise<ObjectStorageOperationRecord> {
  assertJsonObject(evidence, 'verification-start evidence');
  await lockLeasedOperationScope(tx, lease);
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'VERIFYING'::"ObjectStorageOperationStatus",
        "verificationStartedAt" = COALESCE("verificationStartedAt", clock_timestamp()),
        "evidence" = COALESCE("evidence", '{}'::jsonb)
          || jsonb_build_object('verificationStart', ${JSON.stringify(evidence)}::jsonb),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" IN ('EFFECT_STARTED', 'VERIFYING')
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Verification fence was lost', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

function validateVerification(
  value: ObjectStorageVerification,
  authoritativeNow?: Date,
): ObjectStorageVerification & { verifiedAt: string } {
  if (value.outcome !== 'VERIFIED' && value.outcome !== 'VERIFIED_ABSENT') {
    throw operationError('OBJECT_STORAGE_OPERATION_PROOF_INVALID', 'Verification outcome is invalid', 400);
  }
  const verifiedAt = authoritativeNow
    ? authoritativeNow.toISOString()
    : value.verifiedAt
      ? parseDate(value.verifiedAt, 'verification.verifiedAt').toISOString()
      : undefined;
  if (!verifiedAt) {
    throw operationError('OBJECT_STORAGE_OPERATION_PROOF_INVALID', 'Stored verification has no database time', 500);
  }
  if (!value.verifier || value.verifier.length > 128) {
    throw operationError('OBJECT_STORAGE_OPERATION_PROOF_INVALID', 'Verification identity is required', 400);
  }
  assertJsonObject(value.evidence, 'verification.evidence');
  if (value.capabilityExpiresAt) parseDate(value.capabilityExpiresAt, 'verification.capabilityExpiresAt');
  const verified = { ...value, verifiedAt };
  assertPersistableJson(verified, 'verification');
  return verified;
}

function staticArtifactSummariesEqual(
  left: ObjectStorageStaticArtifactSummary,
  right: ObjectStorageStaticArtifactSummary,
): boolean {
  return (
    left.count === right.count &&
    left.deletedCount === right.deletedCount &&
    left.retainedCount === right.retainedCount &&
    left.digest === right.digest
  );
}

function assertPermanentDeletionEvidence(
  evidence: ObjectStorageJsonObject,
  preconditions: ObjectStorageJsonObject,
): void {
  const filesystem = evidence.filesystem;
  const gcs = evidence.gcs;
  const cloudBuild = evidence.cloudBuild;
  const artifactRegistry = evidence.artifactRegistry;
  const workspaceManager = evidence.workspaceManager;
  const managedDatabase = evidence.managedDatabase;
  if (
    evidence.schemaVersion !== 'project-permanent-erasure-v3' ||
    !filesystem ||
    typeof filesystem !== 'object' ||
    Array.isArray(filesystem) ||
    filesystem.projectTreeAbsent !== true ||
    filesystem.workspaceTreesAbsent !== true ||
    filesystem.objectCacheAbsent !== true ||
    filesystem.staticSnapshotsAbsent !== true ||
    filesystem.staticAliasesAbsent !== true ||
    !filesystem.staticArtifactSummary ||
    typeof filesystem.staticArtifactSummary !== 'object' ||
    Array.isArray(filesystem.staticArtifactSummary) ||
    !gcs ||
    typeof gcs !== 'object' ||
    Array.isArray(gcs) ||
    gcs.bucketAbsent !== true ||
    gcs.objectCount !== 0 ||
    !managedDatabase ||
    typeof managedDatabase !== 'object' ||
    Array.isArray(managedDatabase) ||
    managedDatabase.schemaVersion !== 2 ||
    managedDatabase.proof === null ||
    typeof managedDatabase.proof !== 'object' ||
    Array.isArray(managedDatabase.proof) ||
    managedDatabase.proof.kubernetesAbsent !== true ||
    managedDatabase.proof.sharedTenantsAbsent !== true ||
    managedDatabase.proof.backupGenerationsAbsent !== true ||
    !cloudBuild ||
    typeof cloudBuild !== 'object' ||
    Array.isArray(cloudBuild) ||
    typeof cloudBuild.producerCount !== 'number' ||
    !Number.isSafeInteger(cloudBuild.producerCount) ||
    cloudBuild.producerCount < 0 ||
    typeof cloudBuild.terminalProofCount !== 'number' ||
    cloudBuild.terminalProofCount !== cloudBuild.producerCount ||
    typeof cloudBuild.lateSuccessCount !== 'number' ||
    !Number.isSafeInteger(cloudBuild.lateSuccessCount) ||
    cloudBuild.lateSuccessCount < 0 ||
    cloudBuild.lateSuccessCount > cloudBuild.producerCount ||
    !artifactRegistry ||
    typeof artifactRegistry !== 'object' ||
    Array.isArray(artifactRegistry) ||
    artifactRegistry.schemaVersion !== 1 ||
    typeof artifactRegistry.inventoryHash !== 'string' ||
    typeof artifactRegistry.dispositionDigest !== 'string' ||
    typeof artifactRegistry.packageCount !== 'number' ||
    !Number.isSafeInteger(artifactRegistry.packageCount) ||
    artifactRegistry.packageCount < 0 ||
    !workspaceManager ||
    typeof workspaceManager !== 'object' ||
    Array.isArray(workspaceManager) ||
    workspaceManager.schemaVersion !== 'workspace-project-erasure-v3' ||
    typeof workspaceManager.projectId !== 'string' ||
    typeof workspaceManager.organizationId !== 'string' ||
    workspaceManager.databaseInventoryRetained !== true ||
    workspaceManager.runtimeEffectsDrained !== true ||
    !workspaceManager.kubernetes ||
    typeof workspaceManager.kubernetes !== 'object' ||
    Array.isArray(workspaceManager.kubernetes) ||
    workspaceManager.kubernetes.deploymentsAbsent !== true ||
    workspaceManager.kubernetes.replicaSetsAbsent !== true ||
    workspaceManager.kubernetes.podsAbsent !== true ||
    workspaceManager.kubernetes.servicesAbsent !== true ||
    workspaceManager.kubernetes.endpointsAbsent !== true ||
    workspaceManager.kubernetes.endpointSlicesAbsent !== true ||
    workspaceManager.kubernetes.ingressesAbsent !== true ||
    workspaceManager.kubernetes.ownedRuntimeSecretsAbsent !== true ||
    workspaceManager.kubernetes.persistentVolumeClaimsAbsent !== true ||
    !workspaceManager.volumes ||
    typeof workspaceManager.volumes !== 'object' ||
    Array.isArray(workspaceManager.volumes) ||
    workspaceManager.volumes.schemaVersion !== 'project-volume-erasure-receipt-v1' ||
    typeof workspaceManager.volumes.operationId !== 'string' ||
    typeof workspaceManager.volumes.projectId !== 'string' ||
    typeof workspaceManager.volumes.organizationId !== 'string' ||
    typeof workspaceManager.volumes.inventoryHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(workspaceManager.volumes.inventoryHash) ||
    typeof workspaceManager.volumes.verificationHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(workspaceManager.volumes.verificationHash) ||
    typeof workspaceManager.volumes.finalScanHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(workspaceManager.volumes.finalScanHash) ||
    typeof workspaceManager.volumes.quiescenceHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(workspaceManager.volumes.quiescenceHash) ||
    typeof workspaceManager.volumes.entryCount !== 'number' ||
    !Number.isSafeInteger(workspaceManager.volumes.entryCount) ||
    workspaceManager.volumes.entryCount < 0 ||
    typeof workspaceManager.volumes.erasedEntryCount !== 'number' ||
    !Number.isSafeInteger(workspaceManager.volumes.erasedEntryCount) ||
    workspaceManager.volumes.erasedEntryCount < 0 ||
    typeof workspaceManager.volumes.alreadyAbsentEntryCount !== 'number' ||
    !Number.isSafeInteger(workspaceManager.volumes.alreadyAbsentEntryCount) ||
    workspaceManager.volumes.alreadyAbsentEntryCount < 0 ||
    workspaceManager.volumes.erasedEntryCount + workspaceManager.volumes.alreadyAbsentEntryCount !==
      workspaceManager.volumes.entryCount ||
    workspaceManager.volumes.persistentVolumeClaimsAbsent !== true ||
    workspaceManager.volumes.persistentVolumesAbsent !== true ||
    workspaceManager.volumes.providerVolumesAbsent !== true
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE',
      'Permanent deletion requires exhaustive producer, registry, filesystem and GCS absence proof',
      409,
    );
  }
  let verifiedSummary: ObjectStorageStaticArtifactSummary;
  let plannedSummary: ObjectStorageStaticArtifactSummary;
  try {
    verifiedSummary = parseObjectStorageStaticArtifactSummary(filesystem.staticArtifactSummary);
    plannedSummary = parseObjectStorageStaticArtifactSummary(preconditions.staticArtifactPlan);
  } catch {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE',
      'Permanent deletion has no valid pre-effect static artifact commitment',
      409,
    );
  }
  if (!staticArtifactSummariesEqual(verifiedSummary, plannedSummary)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE',
      'Static artifact verification does not match the pre-effect commitment',
      409,
    );
  }
}

async function finalizePermanentDeletionStaticArtifactPlan(
  tx: Tx,
  operationId: string,
  preconditions: ObjectStorageJsonObject,
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{
      artifactRef: string;
      digest: string;
      projectReferenceCount: number;
      otherReferenceCount: number;
      state: string;
    }>
  >(Prisma.sql`
    SELECT
      "artifactRef", "artifactDigest" AS "digest", "projectReferenceCount",
      "plannedOtherReferenceCount" AS "otherReferenceCount", "state"::text AS "state"
    FROM "ProjectPermanentDeletionArtifactPlan"
    WHERE "operationId" = ${operationId}
    ORDER BY "ordinal" ASC
  `);
  if (rows.some((row) => row.state !== 'PLANNED')) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_PLAN_INVALID',
      'Static artifact plan was already mutated before finalization',
      409,
    );
  }
  normalizeObjectStorageStaticErasurePlan({
    summary: parseObjectStorageStaticArtifactSummary(preconditions.staticArtifactPlan),
    artifacts: rows.map(({ state: _state, ...row }) => row),
  });
  const finalized = await tx.$executeRaw`
    UPDATE "ProjectPermanentDeletionArtifactPlan"
    SET "state" = CASE
          WHEN "plannedOtherReferenceCount" = 0
            THEN 'DELETED'::"ProjectPermanentDeletionArtifactState"
          ELSE 'RETAINED'::"ProjectPermanentDeletionArtifactState"
        END,
        "finalOtherReferenceCount" = "plannedOtherReferenceCount",
        "processedAt" = clock_timestamp()
    WHERE "operationId" = ${operationId}
      AND "state" = 'PLANNED'::"ProjectPermanentDeletionArtifactState"
  `;
  if (finalized !== rows.length) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ARTIFACT_PLAN_INVALID',
      'Static artifact plan changed during finalization',
      409,
    );
  }
}

async function restorePermanentDeletionBeforeEffect(
  tx: Tx,
  row: OperationRow,
  scopes: readonly ScopeRow[],
): Promise<boolean> {
  if (row.kind !== 'PROJECT_PERMANENT_DELETE') return true;
  const scope = scopes[0];
  if (!scope || scopes.length !== 1 || !scope.expectedPermanentDeletionStartedAt || !scope.deletionFenceDeletedAt) {
    return false;
  }
  const restored = await tx.$executeRaw`
    UPDATE "Project"
    SET "deletedAt" = ${scope.expectedDeletedAt},
        "permanentDeletionStartedAt" = NULL,
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${scope.projectIdSnapshot}
      AND "organizationId" = ${scope.expectedOrganizationId}
      AND "permanentDeletionStartedAt" IS NOT DISTINCT FROM ${scope.expectedPermanentDeletionStartedAt}
      AND "deletedAt" IS NOT DISTINCT FROM ${scope.deletionFenceDeletedAt}
  `;
  return restored === 1;
}

export async function markObjectStorageOperationFailedSafe(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: { errorCode: string; error: unknown },
): Promise<ObjectStorageOperationRecord> {
  if (!ERROR_CODE.test(input.errorCode)) {
    throw operationError('OBJECT_STORAGE_OPERATION_ERROR_CODE_INVALID', 'Error code is invalid', 400);
  }
  const locked = await lockLeasedOperationScope(tx, lease);
  if (locked.row.status !== 'PREPARED' || locked.row.effectStartedAt !== null) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_NOT_FAILED_SAFE',
      'Operation is not provably before its effect',
      409,
    );
  }
  if (!(await restorePermanentDeletionBeforeEffect(tx, locked.row, locked.scopes))) {
    const manual = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
      UPDATE "ObjectStorageOperation"
      SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageOperationStatus",
          "ownerToken" = NULL,
          "leaseExpiresAt" = NULL,
          "lastErrorCode" = 'OBJECT_STORAGE_OPERATION_DELETION_FENCE_LOST',
          "lastErrorMessage" = 'Permanent deletion pre-effect fence could not be restored',
          "manualRecoveryAt" = clock_timestamp(),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${lease.operationId}
        AND "ownerToken" = ${lease.ownerToken}
        AND "fencingToken" = ${lease.fencingToken}
        AND "leaseExpiresAt" > clock_timestamp()
        AND "status" = 'PREPARED'
      RETURNING *
    `);
    if (!manual[0]) {
      throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Pre-effect recovery fence changed', 409, true);
    }
    return hydrateOperation(tx, manual[0]);
  }
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'FAILED_SAFE'::"ObjectStorageOperationStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode},
        "lastErrorMessage" = ${safeErrorMessage(input.error)},
        "failedSafeAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" = 'PREPARED'
      AND "effectStartedAt" IS NULL
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_NOT_FAILED_SAFE',
      'Operation is not provably before its effect',
      409,
    );
  }
  return hydrateOperation(tx, rows[0]);
}

/**
 * Quarantine a permanent delete before its own provider effect when an older
 * project-runtime request is still externally ambiguous. Unlike FAILED_SAFE,
 * this deliberately preserves Project.permanentDeletionStartedAt: unfreezing
 * would allow new writes while the lost request may still reach Kubernetes.
 */
export async function markPermanentDeletionRuntimeEffectAmbiguous(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: { effectIds?: readonly string[]; error: unknown; errorCode?: string },
): Promise<ObjectStorageOperationRecord> {
  const effectIds = input.effectIds ?? [];
  const errorCode = input.errorCode ?? 'PROJECT_RUNTIME_EFFECT_IN_FLIGHT';
  if (!ERROR_CODE.test(errorCode) || effectIds.some((id) => !SAFE_ID.test(id))) {
    throw operationError('OBJECT_STORAGE_OPERATION_PROOF_INVALID', 'Runtime effect identity is invalid', 400);
  }
  const locked = await lockLeasedOperationScope(tx, lease);
  if (
    locked.row.kind !== 'PROJECT_PERMANENT_DELETE' ||
    locked.row.status !== 'PREPARED' ||
    locked.row.effectStartedAt !== null
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_NOT_FAILED_SAFE',
      'Runtime ambiguity can only quarantine a pre-effect permanent deletion',
      409,
    );
  }
  const evidence = { runtimeEffectIds: [...effectIds].sort(), authorityVerified: false };
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageOperationStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${errorCode},
        "lastErrorMessage" = ${safeErrorMessage(input.error)},
        "evidence" = COALESCE("evidence", '{}'::jsonb)
          || jsonb_build_object('manualRecovery', ${JSON.stringify(evidence)}::jsonb),
        "manualRecoveryAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" = 'PREPARED'
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Runtime ambiguity fence was lost', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

export async function markObjectStorageOperationManualRecovery(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: { errorCode: string; error: unknown; evidence: ObjectStorageJsonObject },
): Promise<ObjectStorageOperationRecord> {
  if (!ERROR_CODE.test(input.errorCode)) {
    throw operationError('OBJECT_STORAGE_OPERATION_ERROR_CODE_INVALID', 'Error code is invalid', 400);
  }
  assertJsonObject(input.evidence, 'manual recovery evidence');
  const initialScopes = await readScopeRows(tx, lease.operationId);
  if (initialScopes.length === 0) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  await lockPhysicalDatabaseScope(
    tx,
    initialScopes.map((scope) => scope.projectIdSnapshot),
  );
  await assertObjectStorageOperationFence(tx, lease);
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageOperationStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode},
        "lastErrorMessage" = ${safeErrorMessage(input.error)},
        "evidence" = COALESCE("evidence", '{}'::jsonb)
          || jsonb_build_object('manualRecovery', ${JSON.stringify(input.evidence)}::jsonb),
        "manualRecoveryAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" IN ('EFFECT_STARTED', 'VERIFYING')
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Manual-recovery fence was lost', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

function validateOperationIdentity(input: { operationId: string; requestHash: string; scopeHash: string }): void {
  assertSafeId(input.operationId, 'operationId');
  if (!SHA256.test(input.requestHash) || !SHA256.test(input.scopeHash)) {
    throw operationError('OBJECT_STORAGE_OPERATION_IDENTITY_INVALID', 'Operation identity is invalid', 400);
  }
}

export async function inspectObjectStorageOperationRecovery(
  tx: Tx,
  input: { operationId: string; requestHash: string; scopeHash: string },
): Promise<ObjectStorageRecoveryInspection> {
  validateOperationIdentity(input);
  const row = await readOperationRow(tx, input.operationId);
  if (!row || row.requestHash !== input.requestHash || row.scopeHash !== input.scopeHash) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  const operation = await hydrateOperation(tx, row);
  if (row.status === 'COMMITTED') {
    if (operation.result === null) {
      throw operationError('OBJECT_STORAGE_OPERATION_RESULT_CORRUPT', 'Committed operation has no receipt', 500);
    }
    return { action: 'REPLAY', operation, result: operation.result };
  }
  if (row.status === 'MANUAL_RECOVERY') return { action: 'MANUAL_RECOVERY', operation };
  const now = await databaseNow(tx);
  if (row.leaseExpiresAt && row.leaseExpiresAt > now) {
    return { action: 'BUSY', operation, retryAt: row.leaseExpiresAt.toISOString() };
  }
  if (row.status === 'EFFECT_STARTED' || row.status === 'VERIFYING') {
    return { action: 'VERIFY_FIRST', operation };
  }
  return { action: 'RETRY_SAFE', operation };
}

export async function reclaimObjectStorageOperationForVerification(
  tx: Tx,
  input: {
    operationId: string;
    requestHash: string;
    scopeHash: string;
    ownerToken: string;
    leaseTtlSeconds: number;
    accountPurgeDeletionAuthority?: AccountPurgeProjectDeletionAuthority;
  },
): Promise<ObjectStorageVerificationClaimResult> {
  validateOperationIdentity(input);
  if (input.ownerToken.length < 16 || input.ownerToken.length > 255) {
    throw operationError('OBJECT_STORAGE_OPERATION_OWNER_INVALID', 'Owner token is invalid', 400);
  }
  if (
    !Number.isInteger(input.leaseTtlSeconds) ||
    input.leaseTtlSeconds < MIN_LEASE_TTL_SECONDS ||
    input.leaseTtlSeconds > MAX_LEASE_TTL_SECONDS
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_LEASE_TTL_INVALID',
      'Lease TTL must be between 5 and 900 seconds',
      400,
    );
  }

  const initialScopes = await readScopeRows(tx, input.operationId);
  if (initialScopes.length === 0) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  const projectIds = initialScopes.map((scope) => scope.projectIdSnapshot);
  const projects = await lockPhysicalDatabaseScope(tx, projectIds);
  const row = await readOperationRow(tx, input.operationId, true);
  if (!row || row.requestHash !== input.requestHash || row.scopeHash !== input.scopeHash) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  const operation = await hydrateOperation(tx, row);
  if (row.status === 'COMMITTED') {
    if (operation.result === null) {
      throw operationError('OBJECT_STORAGE_OPERATION_RESULT_CORRUPT', 'Committed operation has no receipt', 500);
    }
    return { kind: 'REPLAY', operation, result: operation.result };
  }
  if (row.status === 'MANUAL_RECOVERY') return { kind: 'MANUAL_RECOVERY', operation };
  if (row.status !== 'EFFECT_STARTED' && row.status !== 'VERIFYING') {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_VERIFY_FIRST_NOT_REQUIRED',
      'Operation is safe to retry before effect',
      409,
    );
  }
  const now = await databaseNow(tx);
  if (row.leaseExpiresAt && row.leaseExpiresAt > now) {
    if (row.ownerToken === input.ownerToken) {
      return { kind: 'ACQUIRED', operation, lease: leaseFrom(operation) };
    }
    return { kind: 'BUSY', operation, retryAt: row.leaseExpiresAt.toISOString() };
  }

  try {
    await validateLockedProjects(tx, {
      kind: row.kind,
      scopes: initialScopes,
      projects,
      preconditions: normalizeJsonObject(row.preconditions, 'stored preconditions'),
      idempotencyKey: row.idempotencyKey,
      requestHash: row.requestHash,
      payload: normalizeJsonObject(row.payload, 'stored payload'),
      operationId: row.id,
      existingOperation: true,
      accountPurgeDeletionAuthority: input.accountPurgeDeletionAuthority,
    });
  } catch (error) {
    const code = error instanceof ObjectStorageOperationError ? error.code : 'OBJECT_STORAGE_OPERATION_SCOPE_INVALID';
    const mustFreeze = new Set([
      'OBJECT_STORAGE_OPERATION_PROJECT_NOT_FOUND',
      'OBJECT_STORAGE_OPERATION_TENANT_MISMATCH',
      'OBJECT_STORAGE_OPERATION_DELETION_STATE_MISMATCH',
      'OBJECT_STORAGE_OPERATION_DELETION_FENCE_LOST',
      'OBJECT_STORAGE_OPERATION_PERMANENT_DELETION_ACTIVE',
    ]).has(code);
    if (!mustFreeze) throw error;
    const frozen = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
      UPDATE "ObjectStorageOperation"
      SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageOperationStatus",
          "ownerToken" = NULL,
          "leaseExpiresAt" = NULL,
          "lastErrorCode" = ${code},
          "lastErrorMessage" = ${safeErrorMessage(error)},
          "manualRecoveryAt" = clock_timestamp(),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${row.id}
        AND "fencingToken" = ${bigint(row.fencingToken)}
        AND "leaseExpiresAt" <= clock_timestamp()
        AND "status" IN ('EFFECT_STARTED', 'VERIFYING')
      RETURNING *
    `);
    if (!frozen[0]) {
      throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
    }
    return { kind: 'MANUAL_RECOVERY', operation: await hydrateOperation(tx, frozen[0]) };
  }

  const reclaimed = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'VERIFYING'::"ObjectStorageOperationStatus",
        "ownerToken" = ${input.ownerToken},
        "fencingToken" = "fencingToken" + 1,
        "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${input.leaseTtlSeconds}),
        "attempts" = "attempts" + 1,
        "verificationStartedAt" = COALESCE("verificationStartedAt", clock_timestamp()),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${row.id}
      AND "requestHash" = ${input.requestHash}
      AND "fencingToken" = ${bigint(row.fencingToken)}
      AND "leaseExpiresAt" <= clock_timestamp()
      AND "status" IN ('EFFECT_STARTED', 'VERIFYING')
      ${accountPurgeDeletionAuthorityPredicate(input.accountPurgeDeletionAuthority)}
    RETURNING *
  `);
  if (!reclaimed[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
  }
  const reclaimedOperation = await hydrateOperation(tx, reclaimed[0]);
  return { kind: 'ACQUIRED', operation: reclaimedOperation, lease: leaseFrom(reclaimedOperation) };
}

/** Bounded, due-only keyset scan for the cross-replica recovery worker. */
export async function listObjectStorageRecoveryCandidates(
  tx: Tx,
  input: { limit: number; after?: { leaseExpiresAt: string; operationId: string } },
): Promise<ObjectStorageRecoveryCandidate[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw operationError('OBJECT_STORAGE_OPERATION_RECOVERY_LIMIT_INVALID', 'Recovery limit must be 1 to 500', 400);
  }
  const after = input.after
    ? {
        leaseExpiresAt: parseDate(input.after.leaseExpiresAt, 'after.leaseExpiresAt'),
        operationId: input.after.operationId,
      }
    : undefined;
  if (after) assertSafeId(after.operationId, 'after.operationId');
  const rows = await tx.$queryRaw<
    Array<{
      operationId: string;
      kind: ObjectStorageOperationKind;
      status: 'PREPARED' | 'EFFECT_STARTED' | 'VERIFYING';
      requestHash: string;
      scopeHash: string;
      fencingToken: bigint | number | string;
      leaseExpiresAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      "id" AS "operationId", "kind", "status", "requestHash", "scopeHash",
      "fencingToken", "leaseExpiresAt"
    FROM "ObjectStorageOperation"
    WHERE (
        (
          "status" = 'PREPARED'
          AND "kind" <> 'PROJECT_VERSION_GC'::"ObjectStorageOperationKind"
        )
        OR (
          "status" IN ('EFFECT_STARTED', 'VERIFYING')
          AND "kind" IN (
            'TENANT_MUTATION'::"ObjectStorageOperationKind",
            'PROJECT_REMIX_CLONE'::"ObjectStorageOperationKind"
          )
        )
      )
      AND "leaseExpiresAt" <= clock_timestamp()
      ${
        after
          ? Prisma.sql`AND ("leaseExpiresAt", "id") > (${after.leaseExpiresAt}, ${after.operationId})`
          : Prisma.empty
      }
    ORDER BY "leaseExpiresAt" ASC, "id" ASC
    LIMIT ${input.limit}
  `);
  return rows.map((row) => ({
    operationId: row.operationId,
    kind: row.kind,
    status: row.status,
    requestHash: row.requestHash,
    scopeHash: row.scopeHash,
    fencingToken: bigint(row.fencingToken),
    leaseExpiresAt: row.leaseExpiresAt.toISOString(),
    action: row.status === 'PREPARED' ? 'FAIL_SAFE' : 'VERIFY_FIRST',
  }));
}

async function lockDueObjectStorageRecoveryOperation(
  tx: Tx,
  input: ObjectStorageRecoveryMutationInput,
): Promise<OperationRow> {
  validateOperationIdentity(input);
  if (input.fencingToken < 1n || !ERROR_CODE.test(input.errorCode)) {
    throw operationError('OBJECT_STORAGE_OPERATION_RECOVERY_INPUT_INVALID', 'Recovery input is invalid', 400);
  }
  const scopes = await readScopeRows(tx, input.operationId);
  if (scopes.length > 0) {
    await lockPhysicalDatabaseScope(
      tx,
      scopes.map((scope) => scope.projectIdSnapshot),
    );
  }
  const row = await readOperationRow(tx, input.operationId, true);
  if (
    !row ||
    row.requestHash !== input.requestHash ||
    row.scopeHash !== input.scopeHash ||
    bigint(row.fencingToken) !== input.fencingToken ||
    (row.status !== 'PREPARED' && row.status !== 'EFFECT_STARTED' && row.status !== 'VERIFYING') ||
    !row.leaseExpiresAt ||
    row.leaseExpiresAt > (await databaseNow(tx))
  ) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
  }
  return row;
}

/**
 * Move a transiently failing due candidate out of the current recovery window.
 * The fresh owner/fence prevents the crashed worker from resurrecting while the
 * bounded DB-clock backoff prevents a poison head from starving keyset scans.
 */
export async function deferObjectStorageOperationRecovery(
  tx: Tx,
  input: ObjectStorageRecoveryMutationInput & { retryAfterSeconds: number },
): Promise<ObjectStorageOperationRecord> {
  if (!Number.isSafeInteger(input.retryAfterSeconds)) {
    throw operationError('OBJECT_STORAGE_OPERATION_RECOVERY_INPUT_INVALID', 'Recovery input is invalid', 400);
  }
  const retryAfterSeconds = Math.max(5, Math.min(input.retryAfterSeconds, 60 * 60));
  const row = await lockDueObjectStorageRecoveryOperation(tx, input);
  const deferredOwner = `recovery-deferred-${randomUUID()}`;
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "ownerToken" = ${deferredOwner},
        "fencingToken" = "fencingToken" + 1,
        "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${retryAfterSeconds}),
        "attempts" = "attempts" + 1,
        "lastErrorCode" = ${input.errorCode},
        "lastErrorMessage" = ${safeErrorMessage(input.error)},
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${row.id}
      AND "requestHash" = ${input.requestHash}
      AND "scopeHash" = ${input.scopeHash}
      AND "fencingToken" = ${input.fencingToken}
      AND "status" = ${row.status}::"ObjectStorageOperationStatus"
      AND "leaseExpiresAt" <= clock_timestamp()
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

/**
 * Persist backoff after a verify-first worker has already reclaimed the lease.
 * This is deliberately separate from the due-candidate CAS above: the current
 * worker owns a future lease, so waiting for it to expire just to record the
 * provider failure would keep a poison candidate at the head of every sweep.
 */
export async function deferLeasedObjectStorageOperationRecovery(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: { errorCode: string; error: unknown; retryAfterSeconds: number },
): Promise<ObjectStorageOperationRecord> {
  if (!ERROR_CODE.test(input.errorCode) || !Number.isSafeInteger(input.retryAfterSeconds)) {
    throw operationError('OBJECT_STORAGE_OPERATION_RECOVERY_INPUT_INVALID', 'Recovery input is invalid', 400);
  }
  const retryAfterSeconds = Math.max(5, Math.min(input.retryAfterSeconds, 60 * 60));
  const locked = await lockLeasedOperationScope(tx, lease);
  if (locked.row.status !== 'EFFECT_STARTED' && locked.row.status !== 'VERIFYING') {
    throw operationError('OBJECT_STORAGE_OPERATION_VERIFY_FIRST_NOT_REQUIRED', 'Operation is not ambiguous', 409);
  }
  const deferredOwner = `recovery-deferred-${randomUUID()}`;
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "ownerToken" = ${deferredOwner},
        "fencingToken" = "fencingToken" + 1,
        "leaseExpiresAt" = clock_timestamp() + make_interval(secs => ${retryAfterSeconds}),
        "attempts" = "attempts" + 1,
        "lastErrorCode" = ${input.errorCode},
        "lastErrorMessage" = ${safeErrorMessage(input.error)},
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" IN ('EFFECT_STARTED', 'VERIFYING')
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

/** Deterministic corruption is quarantined without clearing any Project freeze. */
export async function quarantineObjectStorageOperationRecovery(
  tx: Tx,
  input: ObjectStorageRecoveryMutationInput,
): Promise<ObjectStorageOperationRecord> {
  const row = await lockDueObjectStorageRecoveryOperation(tx, input);
  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageOperationStatus",
        "ownerToken" = NULL,
        "fencingToken" = "fencingToken" + 1,
        "leaseExpiresAt" = NULL,
        "attempts" = "attempts" + 1,
        "lastErrorCode" = ${input.errorCode},
        "lastErrorMessage" = ${safeErrorMessage(input.error)},
        "manualRecoveryAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${row.id}
      AND "requestHash" = ${input.requestHash}
      AND "scopeHash" = ${input.scopeHash}
      AND "fencingToken" = ${input.fencingToken}
      AND "status" = ${row.status}::"ObjectStorageOperationStatus"
      AND "leaseExpiresAt" <= clock_timestamp()
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
  }
  return hydrateOperation(tx, rows[0]);
}

/**
 * Crash recovery for a lease that expired before any provider effect. Permanent
 * deletion restores its exact pre-claim soft-delete state under the same locks;
 * any fence drift becomes MANUAL_RECOVERY instead of an unsafe auto-unfreeze.
 */
export async function expirePreparedObjectStorageOperationFailedSafe(
  tx: Tx,
  input: {
    operationId: string;
    requestHash: string;
    scopeHash: string;
    fencingToken: bigint;
    errorCode?: string;
  },
): Promise<ObjectStorageOperationRecord> {
  validateOperationIdentity(input);
  if (input.fencingToken < 1n || (input.errorCode && !ERROR_CODE.test(input.errorCode))) {
    throw operationError('OBJECT_STORAGE_OPERATION_RECOVERY_INPUT_INVALID', 'Recovery input is invalid', 400);
  }
  const scopes = await readScopeRows(tx, input.operationId);
  if (scopes.length === 0) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  const projects = await lockPhysicalDatabaseScope(
    tx,
    scopes.map((scope) => scope.projectIdSnapshot),
  );
  const row = await readOperationRow(tx, input.operationId, true);
  if (
    !row ||
    row.requestHash !== input.requestHash ||
    row.scopeHash !== input.scopeHash ||
    bigint(row.fencingToken) !== input.fencingToken ||
    row.status !== 'PREPARED' ||
    row.effectStartedAt !== null ||
    !row.leaseExpiresAt ||
    row.leaseExpiresAt > (await databaseNow(tx))
  ) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Prepared recovery fence changed', 409, true);
  }

  if (row.kind === 'PROJECT_PERMANENT_DELETE') {
    const scope = scopes[0];
    const project = scope ? projects.get(scope.projectIdSnapshot) : undefined;
    const runtimeEffects = scope
      ? await tx.$queryRaw<Array<{ id: string; ownershipEpoch: number; state: string }>>`
          SELECT "id", "ownershipEpoch", "state"::text AS "state"
          FROM "ProjectRuntimeEffect"
          WHERE "projectId" = ${scope.projectIdSnapshot}
          ORDER BY "id"
          FOR UPDATE
        `
      : [];
    if (scope) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProjectRuntimeEffect"
        SET "state" = 'ABORTED'::"ProjectRuntimeEffectState",
            "ownerToken" = NULL,
            "leaseExpiresAt" = NULL,
            "lastErrorCode" = 'PROJECT_RUNTIME_EFFECT_NOT_DISPATCHED',
            "abortedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "projectId" = ${scope.projectIdSnapshot}
          AND "state" = 'PREPARED'::"ProjectRuntimeEffectState"
      `);
    }
    const ambiguousEffectIds = runtimeEffects
      .filter(
        ({ ownershipEpoch, state }) => state === 'IN_FLIGHT' || !project || ownershipEpoch > project.ownershipEpoch,
      )
      .map(({ id }) => id)
      .sort();
    if (ambiguousEffectIds.length > 0) {
      const manual = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
        UPDATE "ObjectStorageOperation"
        SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageOperationStatus",
            "ownerToken" = NULL,
            "leaseExpiresAt" = NULL,
            "lastErrorCode" = 'PROJECT_RUNTIME_EFFECT_IN_FLIGHT',
            "lastErrorMessage" = 'A project runtime request may still reach the provider',
            "evidence" = COALESCE("evidence", '{}'::jsonb)
              || jsonb_build_object(
                   'manualRecovery',
                   ${JSON.stringify({ runtimeEffectIds: ambiguousEffectIds })}::jsonb
                 ),
            "manualRecoveryAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        WHERE "id" = ${row.id}
          AND "fencingToken" = ${input.fencingToken}
          AND "status" = 'PREPARED'
          AND "leaseExpiresAt" <= clock_timestamp()
        RETURNING *
      `);
      if (!manual[0]) {
        throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
      }
      return hydrateOperation(tx, manual[0]);
    }
  }

  if (!(await restorePermanentDeletionBeforeEffect(tx, row, scopes))) {
    const manual = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
      UPDATE "ObjectStorageOperation"
      SET "status" = 'MANUAL_RECOVERY'::"ObjectStorageOperationStatus",
          "ownerToken" = NULL,
          "leaseExpiresAt" = NULL,
          "lastErrorCode" = 'OBJECT_STORAGE_OPERATION_DELETION_FENCE_LOST',
          "lastErrorMessage" = 'Expired permanent deletion fence could not be restored',
          "manualRecoveryAt" = clock_timestamp(),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${row.id}
        AND "fencingToken" = ${input.fencingToken}
        AND "status" = 'PREPARED'
        AND "leaseExpiresAt" <= clock_timestamp()
      RETURNING *
    `);
    if (!manual[0]) throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
    return hydrateOperation(tx, manual[0]);
  }

  const failed = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'FAILED_SAFE'::"ObjectStorageOperationStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastErrorCode" = ${input.errorCode ?? 'OBJECT_STORAGE_OPERATION_PREPARED_LEASE_EXPIRED'},
        "lastErrorMessage" = 'Prepared lease expired before provider effect',
        "failedSafeAt" = clock_timestamp(),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${row.id}
      AND "fencingToken" = ${input.fencingToken}
      AND "requestHash" = ${input.requestHash}
      AND "status" = 'PREPARED'
      AND "effectStartedAt" IS NULL
      AND "leaseExpiresAt" <= clock_timestamp()
    RETURNING *
  `);
  if (!failed[0]) throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Recovery fence changed', 409, true);
  return hydrateOperation(tx, failed[0]);
}

export async function finalizeObjectStorageOperation(
  tx: Tx,
  lease: ObjectStorageOperationLease,
  input: FinalizeObjectStorageOperationInput,
): Promise<ObjectStorageOperationRecord> {
  const verification = validateVerification(input.verification, await databaseNow(tx));
  const before = await readOperationRow(tx, lease.operationId);
  if (!before || before.requestHash !== lease.requestHash || before.scopeHash !== lease.scopeHash) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  if (before.status === 'COMMITTED') return hydrateOperation(tx, before);
  if (SIGNED_CAPABILITY_KINDS.has(before.kind)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CAPABILITY_FLOW_INVALID',
      'Signed capabilities must commit a non-secret reservation before provider signing',
      409,
    );
  }

  const locked = await lockLeasedOperationScope(tx, lease);
  if (locked.row.status !== 'VERIFYING') {
    throw operationError('OBJECT_STORAGE_OPERATION_VERIFICATION_REQUIRED', 'Operation must verify before commit', 409);
  }
  if (
    ['PROJECT_TRANSFER', 'PROJECT_PERMANENT_DELETE', 'ACCOUNT_PURGE_ERASURE'].includes(locked.row.kind) &&
    verification.outcome !== 'VERIFIED_ABSENT'
  ) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_ABSENCE_PROOF_REQUIRED',
      'This operation requires verified provider absence',
      409,
    );
  }

  let result: ObjectStorageJsonValue;
  let permanentReceipt:
    | {
        scope: ScopeRow;
        projectSnapshot: ObjectStorageJsonObject;
        capabilityUpperBoundAt: Date | null;
        ownershipEpoch: number;
      }
    | undefined;
  if (locked.row.kind === 'PROJECT_PERMANENT_DELETE') {
    const permanentDeletionPreconditions = normalizeJsonObject(locked.row.preconditions, 'stored preconditions');
    assertPermanentDeletionEvidence(verification.evidence, permanentDeletionPreconditions);
    await finalizePermanentDeletionStaticArtifactPlan(tx, locked.row.id, permanentDeletionPreconditions);
    const scope = locked.scopes[0];
    if (!scope || locked.scopes.length !== 1) {
      throw operationError('OBJECT_STORAGE_OPERATION_SCOPE_CORRUPT', 'Permanent deletion scope is invalid', 500);
    }
    const workspaceManager = verification.evidence.workspaceManager as ObjectStorageJsonObject;
    if (
      workspaceManager.projectId !== scope.projectIdSnapshot ||
      workspaceManager.organizationId !== scope.expectedOrganizationId
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PERMANENT_ERASURE_PROOF_INCOMPLETE',
        'Workspace erasure proof does not match the permanent deletion scope',
        409,
      );
    }
    const volumeProof = workspaceManager.volumes as ObjectStorageJsonObject;
    if (
      volumeProof.operationId !== locked.row.id ||
      volumeProof.projectId !== scope.projectIdSnapshot ||
      volumeProof.organizationId !== scope.expectedOrganizationId
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_VOLUME_ERASURE_UNVERIFIED',
        'Volume erasure receipt does not match the operation scope',
        409,
      );
    }
    const snapshotRows = await tx.$queryRaw<
      Array<{
        id: string;
        organizationId: string;
        name: string;
        slug: string;
        description: string | null;
        sourceType: string;
        templateName: string | null;
        gitRepositoryUrl: string | null;
        gitDefaultBranch: string | null;
        persistentVolumeClaim: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        objectStorageCapabilityExpiresAt: Date | null;
        ownershipEpoch: number;
      }>
    >(Prisma.sql`
      SELECT
        "id", "organizationId", "name", "slug", "description", "sourceType",
        "templateName", "gitRepositoryUrl", "gitDefaultBranch", "persistentVolumeClaim", "createdAt",
        "updatedAt", "deletedAt", "objectStorageCapabilityExpiresAt", "ownershipEpoch"
      FROM "Project"
      WHERE "id" = ${scope.projectIdSnapshot}
      FOR UPDATE
    `);
    const project = snapshotRows[0];
    if (!project || project.organizationId !== scope.expectedOrganizationId) {
      throw operationError('OBJECT_STORAGE_OPERATION_DELETION_FENCE_LOST', 'Permanent deletion project changed', 409);
    }
    const volumePlans = await tx.$queryRaw<
      Array<{
        projectIdSnapshot: string;
        organizationId: string;
        ownershipEpoch: number;
        state: string;
        inventoryHash: string | null;
        verificationHash: string | null;
        verificationFencingToken: bigint | null;
        quiescenceSnapshot: unknown | null;
        quiescenceHash: string | null;
        finalScanEvidence: unknown | null;
        finalScanHash: string | null;
        finalScanFencingToken: bigint | null;
        inventory: unknown | null;
        evidence: unknown | null;
      }>
    >(Prisma.sql`
      SELECT "projectIdSnapshot", "organizationId", "ownershipEpoch", "state"::text AS "state",
             "inventoryHash", "verificationHash", "verificationFencingToken", "inventory", "evidence",
             "quiescenceSnapshot", "quiescenceHash", "finalScanEvidence", "finalScanHash",
             "finalScanFencingToken"
      FROM "ProjectVolumeErasure"
      WHERE "operationId" = ${locked.row.id}
      FOR UPDATE
    `);
    const volumePlan = volumePlans[0];
    const volumeTargets = await tx.$queryRaw<
      Array<{
        ordinal: number;
        inventoryEntry: unknown | null;
        evidenceEntry: unknown | null;
        verifiedFencingToken: bigint | null;
        disposition: string | null;
      }>
    >(Prisma.sql`
      SELECT "ordinal", "inventoryEntry", "evidenceEntry", "verifiedFencingToken",
             "inventoryEntry"->>'disposition' AS "disposition"
      FROM "ProjectVolumeErasureTarget"
      WHERE "operationId" = ${locked.row.id}
      ORDER BY "ordinal"
      FOR UPDATE
    `);
    const storedInventory =
      volumePlan?.inventory && typeof volumePlan.inventory === 'object' && !Array.isArray(volumePlan.inventory)
        ? (volumePlan.inventory as ObjectStorageJsonObject)
        : undefined;
    const storedEvidence =
      volumePlan?.evidence && typeof volumePlan.evidence === 'object' && !Array.isArray(volumePlan.evidence)
        ? (volumePlan.evidence as ObjectStorageJsonObject)
        : undefined;
    const storedQuiescence =
      volumePlan?.quiescenceSnapshot &&
      typeof volumePlan.quiescenceSnapshot === 'object' &&
      !Array.isArray(volumePlan.quiescenceSnapshot)
        ? (volumePlan.quiescenceSnapshot as ObjectStorageJsonObject)
        : undefined;
    const storedFinalScan =
      volumePlan?.finalScanEvidence &&
      typeof volumePlan.finalScanEvidence === 'object' &&
      !Array.isArray(volumePlan.finalScanEvidence)
        ? (volumePlan.finalScanEvidence as ObjectStorageJsonObject)
        : undefined;
    const inventoryEntries = Array.isArray(storedInventory?.entries) ? storedInventory.entries : undefined;
    const evidenceEntries = Array.isArray(storedEvidence?.entries) ? storedEvidence.entries : undefined;
    const { inventoryHash: embeddedInventoryHash, ...unsignedInventory } = storedInventory ?? {};
    const { verificationHash: embeddedVerificationHash, ...unsignedEvidence } = storedEvidence ?? {};
    const recomputedInventoryHash = storedInventory ? sha256(canonicalJson(unsignedInventory)) : undefined;
    const recomputedVerificationHash = storedEvidence ? sha256(canonicalJson(unsignedEvidence)) : undefined;
    const recomputedQuiescenceHash = storedQuiescence
      ? sha256(canonicalJson(storedQuiescence as ObjectStorageJsonValue))
      : undefined;
    const { finalScanHash: embeddedFinalScanHash, ...unsignedFinalScan } = storedFinalScan ?? {};
    const recomputedFinalScanHash = storedFinalScan ? sha256(canonicalJson(unsignedFinalScan)) : undefined;
    const erasedEntryCount = (inventoryEntries ?? []).filter(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        (entry.disposition === 'erase' || entry.disposition === 'erase-orphan'),
    ).length;
    const alreadyAbsentEntryCount = (inventoryEntries ?? []).filter(
      (entry) =>
        entry !== null && typeof entry === 'object' && !Array.isArray(entry) && entry.disposition === 'already-absent',
    ).length;
    if (
      !volumePlan ||
      volumePlan.projectIdSnapshot !== scope.projectIdSnapshot ||
      volumePlan.organizationId !== scope.expectedOrganizationId ||
      volumePlan.ownershipEpoch !== project.ownershipEpoch ||
      volumePlan.state !== 'VERIFIED' ||
      volumePlan.verificationFencingToken !== lease.fencingToken ||
      volumePlan.finalScanFencingToken !== lease.fencingToken ||
      volumePlan.inventoryHash !== volumeProof.inventoryHash ||
      volumePlan.verificationHash !== volumeProof.verificationHash ||
      volumePlan.quiescenceHash !== volumeProof.quiescenceHash ||
      volumePlan.finalScanHash !== volumeProof.finalScanHash ||
      embeddedInventoryHash !== volumePlan.inventoryHash ||
      embeddedVerificationHash !== volumePlan.verificationHash ||
      recomputedInventoryHash !== volumePlan.inventoryHash ||
      recomputedVerificationHash !== volumePlan.verificationHash ||
      recomputedQuiescenceHash !== volumePlan.quiescenceHash ||
      embeddedFinalScanHash !== volumePlan.finalScanHash ||
      recomputedFinalScanHash !== volumePlan.finalScanHash ||
      storedFinalScan?.inventoryHash !== volumePlan.inventoryHash ||
      storedFinalScan?.quiescenceHash !== volumePlan.quiescenceHash ||
      storedFinalScan?.persistentVolumeListingComplete !== true ||
      storedFinalScan?.verified !== true ||
      !inventoryEntries ||
      !evidenceEntries ||
      inventoryEntries.length !== volumeProof.entryCount ||
      evidenceEntries.length !== volumeProof.entryCount ||
      erasedEntryCount !== volumeProof.erasedEntryCount ||
      alreadyAbsentEntryCount !== volumeProof.alreadyAbsentEntryCount ||
      erasedEntryCount + alreadyAbsentEntryCount !== volumeProof.entryCount ||
      volumeTargets.length !== volumeProof.entryCount ||
      volumeTargets.some((target, ordinal) => {
        const inventoryEntry = target.inventoryEntry;
        const evidenceEntry = target.evidenceEntry;
        return (
          target.ordinal !== ordinal ||
          target.verifiedFencingToken !== lease.fencingToken ||
          target.disposition === 'excluded-shared' ||
          !inventoryEntry ||
          typeof inventoryEntry !== 'object' ||
          Array.isArray(inventoryEntry) ||
          canonicalJson(inventoryEntry as ObjectStorageJsonObject) !==
            canonicalJson(inventoryEntries[ordinal] as ObjectStorageJsonValue) ||
          !evidenceEntry ||
          typeof evidenceEntry !== 'object' ||
          Array.isArray(evidenceEntry) ||
          canonicalJson(evidenceEntry as ObjectStorageJsonObject) !==
            canonicalJson(evidenceEntries[ordinal] as ObjectStorageJsonValue) ||
          (evidenceEntry as ObjectStorageJsonObject).pvcAbsent !== true ||
          (evidenceEntry as ObjectStorageJsonObject).pvAbsent !== true ||
          (evidenceEntry as ObjectStorageJsonObject).providerAbsent !== true
        );
      })
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_VOLUME_ERASURE_UNVERIFIED',
        'Project volume erasure ledger does not match the final proof and fence',
        409,
      );
    }
    const csiProducerRows = await tx.$queryRaw<
      Array<{
        effectId: string;
        state: string;
        ownershipEpoch: number;
        targetOrdinal: number;
        namespace: string;
        pvcName: string;
        evidenceHash: string | null;
      }>
    >(Prisma.sql`
      SELECT effect."id" AS "effectId", effect."state"::text AS "state", effect."ownershipEpoch",
             target."ordinal" AS "targetOrdinal", target."namespace", target."name" AS "pvcName",
             evidence."evidenceHash"
      FROM "ProjectRuntimeEffect" effect
      JOIN "ProjectRuntimeEffectTarget" target ON target."effectId" = effect."id"
      LEFT JOIN "ProjectRuntimeEffectVolumeEvidence" evidence
        ON evidence."effectId" = target."effectId" AND evidence."targetOrdinal" = target."ordinal"
      WHERE effect."projectId" = ${scope.projectIdSnapshot}
        AND target."kind" = 'PersistentVolumeClaim'
        AND effect."state" <> 'ABORTED'::"ProjectRuntimeEffectState"
      ORDER BY effect."id", target."ordinal"
      FOR SHARE OF effect, target
    `);
    const liveQuiescence: ObjectStorageJsonObject = {
      schemaVersion: 1,
      projectId: scope.projectIdSnapshot,
      organizationId: scope.expectedOrganizationId,
      ownershipEpoch: project.ownershipEpoch,
      effects: csiProducerRows.map((row) => ({
        effectId: row.effectId,
        targetOrdinal: row.targetOrdinal,
        namespace: row.namespace,
        pvcName: row.pvcName,
        evidenceHash: row.evidenceHash ?? '',
      })),
    };
    if (
      csiProducerRows.some(
        (row) => row.state !== 'DRAINED' || row.ownershipEpoch !== project.ownershipEpoch || !row.evidenceHash,
      ) ||
      !storedQuiescence ||
      canonicalJson(liveQuiescence) !== canonicalJson(storedQuiescence)
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_VOLUME_QUIESCENCE_UNVERIFIED',
        'CSI creation quiescence no longer matches the durable receipt',
        409,
      );
    }
    const projectRecordHash = sha256(
      canonicalJson({
        id: project.id,
        organizationId: project.organizationId,
        ownershipEpoch: project.ownershipEpoch,
        name: project.name,
        slug: project.slug,
        description: project.description,
        sourceType: project.sourceType,
        templateName: project.templateName,
        gitRepositoryUrl: project.gitRepositoryUrl,
        gitDefaultBranch: project.gitDefaultBranch,
        persistentVolumeClaim: project.persistentVolumeClaim,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        deletedAt: project.deletedAt?.toISOString() ?? null,
      }),
    );
    const projectSnapshot: ObjectStorageJsonObject = {
      id: project.id,
      organizationId: project.organizationId,
      ownershipEpoch: project.ownershipEpoch,
      projectRecordHash,
      state: 'PERMANENTLY_DELETED',
      permanentDeletionStartedAt: scope.expectedPermanentDeletionStartedAt?.toISOString() ?? null,
      deletedAt: project.deletedAt?.toISOString() ?? null,
    };
    assertPersistableJson(projectSnapshot, 'project deletion snapshot');
    result = { project: projectSnapshot };
    permanentReceipt = {
      scope,
      projectSnapshot,
      capabilityUpperBoundAt: project.objectStorageCapabilityExpiresAt,
      ownershipEpoch: project.ownershipEpoch,
    };
  } else {
    if (input.result === undefined || input.result === null) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_RESULT_REQUIRED',
        'A non-secret operation receipt is required',
        400,
      );
    }
    assertPersistableJson(input.result, 'operation result');
    result = input.result;
  }

  let durableVerification = verification;
  if (permanentReceipt) {
    const databasePlans = await tx.$queryRaw<
      Array<{
        projectId: string;
        organizationId: string;
        ownershipEpoch: number;
        inventorySha256: string;
        stage: string;
        receipt: unknown;
      }>
    >(Prisma.sql`
      SELECT
        "projectId", "organizationId", "ownershipEpoch", "inventorySha256",
        "stage"::text AS "stage", "receipt"
      FROM "ProjectDatabaseErasurePlan"
      WHERE "operationId" = ${locked.row.id}
      FOR UPDATE
    `);
    const databasePlan = databasePlans[0];
    const suppliedDatabaseReceipt = verification.evidence.managedDatabase;
    const durableDatabaseReceipt = databasePlan?.receipt
      ? normalizeJsonObject(databasePlan.receipt, 'database erasure receipt')
      : undefined;
    if (
      !databasePlan ||
      databasePlan.projectId !== permanentReceipt.scope.projectIdSnapshot ||
      databasePlan.organizationId !== permanentReceipt.scope.expectedOrganizationId ||
      databasePlan.ownershipEpoch !== permanentReceipt.ownershipEpoch ||
      databasePlan.stage !== 'VERIFIED' ||
      !durableDatabaseReceipt ||
      durableDatabaseReceipt.schemaVersion !== 2 ||
      durableDatabaseReceipt.operationId !== locked.row.id ||
      durableDatabaseReceipt.projectId !== permanentReceipt.scope.projectIdSnapshot ||
      durableDatabaseReceipt.organizationId !== permanentReceipt.scope.expectedOrganizationId ||
      durableDatabaseReceipt.inventorySha256 !== databasePlan.inventorySha256 ||
      typeof durableDatabaseReceipt.verifiedAt !== 'string' ||
      !Number.isFinite(new Date(durableDatabaseReceipt.verifiedAt).getTime()) ||
      !suppliedDatabaseReceipt ||
      typeof suppliedDatabaseReceipt !== 'object' ||
      Array.isArray(suppliedDatabaseReceipt) ||
      canonicalJson(durableDatabaseReceipt) !== canonicalJson(suppliedDatabaseReceipt)
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_DATABASE_ERASURE_UNVERIFIED',
        'Managed database erasure is not durably verified for this operation',
        409,
      );
    }

    const registryRows = await tx.$queryRaw<
      Array<{ inventoryHash: string; state: string; receipt: ObjectStorageJsonValue | null }>
    >`
      SELECT "inventoryHash", "state"::text AS "state", "receipt"
      FROM "ProjectRegistryErasure"
      WHERE "operationId" = ${locked.row.id}
        AND "projectIdSnapshot" = ${permanentReceipt.scope.projectIdSnapshot}
      FOR UPDATE
    `;
    const registry = registryRows[0];
    const registryProof = verification.evidence.artifactRegistry as ObjectStorageJsonObject;
    if (
      !registry ||
      registry.state !== 'VERIFIED' ||
      !registry.receipt ||
      registry.inventoryHash !== registryProof.inventoryHash ||
      canonicalJson(registry.receipt) !== canonicalJson(registryProof)
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_REGISTRY_ERASURE_INCOMPLETE',
        'Project registry erasure does not have a matching durable verified receipt',
        409,
      );
    }
    const imageBuilds = await tx.$queryRaw<
      Array<{
        id: string;
        phase: string;
        providerBuildId: string | null;
        providerStatus: string | null;
        cancellationProof: unknown;
      }>
    >`
      SELECT "id", "phase"::text AS "phase", "providerBuildId", "providerStatus", "cancellationProof"
      FROM "AppImageBuildOperation"
      WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
      ORDER BY "id"
      FOR UPDATE
    `;
    const terminalBuildStatuses = new Set(['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);
    const invalidBuildProof = imageBuilds.some(({ phase, providerBuildId, providerStatus, cancellationProof }) => {
      if (
        phase !== 'CANCELLED' ||
        !cancellationProof ||
        typeof cancellationProof !== 'object' ||
        Array.isArray(cancellationProof)
      ) {
        return true;
      }
      const proof = cancellationProof as Record<string, unknown>;
      if (proof.terminal !== true) return true;
      if (proof.providerSubmissionAbsent === true) return providerBuildId !== null || providerStatus !== null;
      return (
        !providerBuildId ||
        !providerStatus ||
        !terminalBuildStatuses.has(providerStatus) ||
        proof.buildId !== providerBuildId ||
        proof.providerStatus !== providerStatus ||
        proof.requiresRegistrySweep !== true ||
        proof.lateSuccess !== (providerStatus === 'SUCCESS') ||
        typeof proof.verifiedAt !== 'string' ||
        !Number.isFinite(Date.parse(proof.verifiedAt))
      );
    });
    if (invalidBuildProof) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_IMAGE_BUILD_ACTIVE',
        'Project Cloud Build producers do not have terminal cancellation proofs',
        409,
      );
    }
    const runtimeEffects = await tx.$queryRaw<Array<{ id: string; ownershipEpoch: number; state: string }>>`
      SELECT "id", "ownershipEpoch", "state"::text AS "state"
      FROM "ProjectRuntimeEffect"
      WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
      ORDER BY "id"
      FOR UPDATE
    `;
    if (
      runtimeEffects.some(
        ({ ownershipEpoch, state }) =>
          ownershipEpoch > permanentReceipt.ownershipEpoch || (state !== 'DRAINED' && state !== 'ABORTED'),
      )
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_RUNTIME_EFFECT_ACTIVE',
        'Project runtime effects are not terminally drained',
        409,
      );
    }
    /* These rows are deliberately retained as crash-recovery identities until
     * the physical proof is accepted. Remove them only in this same transaction
     * as Project + receipt so a failed finalize never loses recovery authority. */
    await tx.$executeRaw`DELETE FROM "WorkspaceRuntime" WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}`;
    await tx.$executeRaw`DELETE FROM "ScheduledTask" WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}`;
    await tx.$executeRaw`DELETE FROM "ProjectRuntimeEffect" WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}`;
    await tx.$executeRaw`DELETE FROM "AppImageBuildOperation" WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}`;
    await tx.$executeRaw`DELETE FROM "Project" WHERE "id" = ${permanentReceipt.scope.projectIdSnapshot}`;
    const cascade = await tx.$queryRaw<
      Array<{
        projectReleaseReferencesAbsent: boolean;
        liveScopeDetached: boolean;
        workspaceRuntimeRowsAbsent: boolean;
        scheduledTaskRowsAbsent: boolean;
        scheduledRunRowsAbsent: boolean;
        runtimeEffectRowsAbsent: boolean;
        volumeErasurePlanRetained: boolean;
        databaseInstanceRowsAbsent: boolean;
        databaseSnapshotRowsAbsent: boolean;
        databaseRestoreRowsAbsent: boolean;
        databaseErasurePlanRetained: boolean;
        appImageBuildRowsAbsent: boolean;
      }>
    >(Prisma.sql`
      SELECT
        NOT EXISTS (
          SELECT 1 FROM "ReleaseManifest"
          WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "projectReleaseReferencesAbsent",
        NOT EXISTS (
          SELECT 1 FROM "ObjectStorageOperationProjectScope"
          WHERE "operationId" = ${locked.row.id} AND "projectId" IS NOT NULL
        ) AS "liveScopeDetached",
        NOT EXISTS (
          SELECT 1 FROM "WorkspaceRuntime"
          WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "workspaceRuntimeRowsAbsent",
        NOT EXISTS (
          SELECT 1 FROM "ScheduledTask"
          WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "scheduledTaskRowsAbsent",
        NOT EXISTS (
          SELECT 1 FROM "ScheduledTaskRun"
          WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "scheduledRunRowsAbsent",
        NOT EXISTS (
          SELECT 1 FROM "ProjectRuntimeEffect"
          WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "runtimeEffectRowsAbsent",
        EXISTS (
          SELECT 1 FROM "ProjectVolumeErasure"
          WHERE "operationId" = ${locked.row.id}
            AND "projectIdSnapshot" = ${permanentReceipt.scope.projectIdSnapshot}
            AND "state" = 'VERIFIED'::"ProjectVolumeErasureState"
        ) AS "volumeErasurePlanRetained",
        NOT EXISTS (
          SELECT 1 FROM "DatabaseInstance"
          WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "databaseInstanceRowsAbsent",
        NOT EXISTS (
          SELECT 1 FROM "DatabaseSnapshot" snapshot
          JOIN "DatabaseInstance" instance ON instance."id" = snapshot."databaseInstanceId"
          WHERE instance."projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "databaseSnapshotRowsAbsent",
        NOT EXISTS (
          SELECT 1 FROM "DatabaseRestore" restore
          JOIN "DatabaseInstance" instance ON instance."id" = restore."databaseInstanceId"
          WHERE instance."projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "databaseRestoreRowsAbsent",
        EXISTS (
          SELECT 1 FROM "ProjectDatabaseErasurePlan"
          WHERE "operationId" = ${locked.row.id}
            AND "stage" = 'VERIFIED'::"ProjectDatabaseErasureStage"
            AND "receipt" IS NOT NULL
        ) AS "databaseErasurePlanRetained",
        NOT EXISTS (
          SELECT 1 FROM "AppImageBuildOperation"
          WHERE "projectId" = ${permanentReceipt.scope.projectIdSnapshot}
        ) AS "appImageBuildRowsAbsent"
    `);
    if (
      cascade[0]?.projectReleaseReferencesAbsent !== true ||
      cascade[0]?.liveScopeDetached !== true ||
      cascade[0]?.workspaceRuntimeRowsAbsent !== true ||
      cascade[0]?.scheduledTaskRowsAbsent !== true ||
      cascade[0]?.scheduledRunRowsAbsent !== true ||
      cascade[0]?.runtimeEffectRowsAbsent !== true ||
      cascade[0]?.volumeErasurePlanRetained !== true ||
      cascade[0]?.databaseInstanceRowsAbsent !== true ||
      cascade[0]?.databaseSnapshotRowsAbsent !== true ||
      cascade[0]?.databaseRestoreRowsAbsent !== true ||
      cascade[0]?.databaseErasurePlanRetained !== true ||
      cascade[0]?.appImageBuildRowsAbsent !== true
    ) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_PROJECT_CASCADE_INCOMPLETE',
        'Project database cascade did not detach every release and operation reference',
        500,
      );
    }
    durableVerification = validateVerification(
      {
        ...verification,
        evidence: {
          ...verification.evidence,
          databaseCascade: {
            projectReleaseReferencesAbsent: true,
            liveScopeDetached: true,
            workspaceRuntimeRowsAbsent: true,
            scheduledTaskRowsAbsent: true,
            scheduledRunRowsAbsent: true,
            runtimeEffectRowsAbsent: true,
            volumeErasurePlanRetained: true,
            databaseInstanceRowsAbsent: true,
            databaseSnapshotRowsAbsent: true,
            databaseRestoreRowsAbsent: true,
            databaseErasurePlanRetained: true,
            appImageBuildRowsAbsent: true,
          },
        },
      },
      await databaseNow(tx),
    );
  }

  const rows = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'COMMITTED'::"ObjectStorageOperationStatus",
        "ownerToken" = NULL,
        "leaseExpiresAt" = NULL,
        "evidence" = COALESCE("evidence", '{}'::jsonb)
          || jsonb_build_object('verification', ${JSON.stringify(durableVerification)}::jsonb),
        "result" = ${JSON.stringify(result)}::jsonb,
        "committedAt" = clock_timestamp(),
        "lastErrorCode" = NULL,
        "lastErrorMessage" = NULL,
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${lease.operationId}
      AND "ownerToken" = ${lease.ownerToken}
      AND "fencingToken" = ${lease.fencingToken}
      AND "requestHash" = ${lease.requestHash}
      AND "leaseExpiresAt" > clock_timestamp()
      AND "status" = 'VERIFYING'
    RETURNING *
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Finalize fence was lost', 409, true);
  }
  if (permanentReceipt) {
    await tx.$executeRaw`
      INSERT INTO "ProjectPermanentDeletionReceipt" (
        "projectId", "operationId", "organizationId", "scopeHash", "idempotencyScopeHash", "idempotencyKey",
        "requestHash", "capabilityUpperBoundAt", "projectSnapshot", "state", "proof",
        "result", "deletedAt", "completedAt", "createdAt"
      ) VALUES (
        ${permanentReceipt.scope.projectIdSnapshot}, ${locked.row.id},
        ${permanentReceipt.scope.expectedOrganizationId}, ${locked.row.scopeHash},
        ${locked.row.idempotencyScopeHash}, ${locked.row.idempotencyKey}, ${locked.row.requestHash},
        ${permanentReceipt.capabilityUpperBoundAt}, ${JSON.stringify(permanentReceipt.projectSnapshot)}::jsonb,
        'COMMITTED'::"ObjectStorageOperationStatus", ${JSON.stringify(durableVerification)}::jsonb,
        ${JSON.stringify(result)}::jsonb, clock_timestamp(), clock_timestamp(), clock_timestamp()
      )
    `;
  }
  return hydrateOperation(tx, rows[0]);
}

export async function getPermanentDeletionReplay(
  tx: Tx,
  input: {
    projectId: string;
    expectedOrganizationId: string;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<PermanentDeletionReplay | null> {
  assertSafeId(input.projectId, 'projectId');
  assertSafeId(input.expectedOrganizationId, 'expectedOrganizationId');
  if (!input.idempotencyKey || input.idempotencyKey.length > 255 || !SHA256.test(input.requestHash)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_IDENTITY_INVALID',
      'Permanent deletion replay identity is invalid',
      400,
    );
  }
  const rows = await tx.$queryRaw<
    Array<{
      projectId: string;
      operationId: string;
      organizationId: string;
      idempotencyKey: string;
      requestHash: string;
      projectSnapshot: unknown;
      state: ObjectStorageOperationStatus;
      proof: unknown;
      result: unknown;
      completedAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      "projectId", "operationId", "organizationId", "idempotencyKey", "requestHash",
      "projectSnapshot", "state", "proof", "result", "completedAt"
    FROM "ProjectPermanentDeletionReceipt"
    WHERE "projectId" = ${input.projectId}
  `);
  const row = rows[0];
  if (!row) return null;
  if (row.organizationId !== input.expectedOrganizationId) {
    throw operationError('OBJECT_STORAGE_OPERATION_RECEIPT_NOT_FOUND', 'Permanent deletion receipt was not found', 404);
  }
  if (row.idempotencyKey !== input.idempotencyKey || row.requestHash !== input.requestHash) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_IDEMPOTENCY_CONFLICT',
      'Idempotency key was already used for a different permanent deletion request',
      409,
    );
  }
  if (row.state !== 'COMMITTED') {
    throw operationError('OBJECT_STORAGE_OPERATION_RECEIPT_CORRUPT', 'Permanent deletion receipt is invalid', 500);
  }
  const projectSnapshot = normalizeJsonObject(row.projectSnapshot, 'stored project snapshot');
  const proof = validateVerification(
    normalizeJsonObject(row.proof, 'stored deletion proof') as unknown as ObjectStorageVerification,
  );
  const result = normalizeJson(row.result, 'stored deletion result');
  if (result === null) {
    throw operationError('OBJECT_STORAGE_OPERATION_RECEIPT_CORRUPT', 'Permanent deletion receipt has no result', 500);
  }
  return {
    projectId: row.projectId,
    organizationId: row.organizationId,
    projectSnapshot,
    state: 'COMMITTED',
    completedAt: row.completedAt.toISOString(),
    proof,
    result,
    operationId: row.operationId,
  };
}

/**
 * Reserve a non-secret signed-capability authorization before every provider
 * signing call. A COMMITTED operation can reserve repeatedly after a lost HTTP
 * response; each reservation advances attempts/fence and never stores the URL.
 */
export async function reserveSignedCapabilityAuthorization(
  tx: Tx,
  input: {
    operationId: string;
    requestHash: string;
    scopeHash: string;
    authorizationToken: string;
    reservedCapabilityExpiresAt: string;
    lease?: ObjectStorageOperationLease;
    checkpointBarrierAuthority?: ObjectStorageCheckpointBarrierAuthority;
  },
): Promise<SignedCapabilityAuthorization> {
  validateOperationIdentity(input);
  if (input.authorizationToken.length < 16 || input.authorizationToken.length > 255) {
    throw operationError('OBJECT_STORAGE_OPERATION_AUTHORIZATION_INVALID', 'Capability authorization is invalid', 400);
  }
  const expiresAt = parseDate(input.reservedCapabilityExpiresAt, 'reservedCapabilityExpiresAt');
  const initialScopes = await readScopeRows(tx, input.operationId);
  if (initialScopes.length === 0) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  const projectIds = initialScopes.map((scope) => scope.projectIdSnapshot);
  const projects = await lockPhysicalDatabaseScope(tx, projectIds);
  const row = await readOperationRow(tx, input.operationId, true);
  if (!row || row.requestHash !== input.requestHash || row.scopeHash !== input.scopeHash) {
    throw operationError('OBJECT_STORAGE_OPERATION_NOT_FOUND', 'Object-storage operation was not found', 404);
  }
  if (!SIGNED_CAPABILITY_KINDS.has(row.kind)) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CAPABILITY_FLOW_INVALID',
      'Operation is not a signed capability',
      409,
    );
  }
  if (row.status !== 'PREPARED' && row.status !== 'COMMITTED') {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CAPABILITY_FLOW_INVALID',
      'Capability operation cannot reserve',
      409,
    );
  }
  if (row.status === 'PREPARED') {
    const lease = input.lease;
    if (
      !lease ||
      lease.operationId !== row.id ||
      lease.ownerToken !== row.ownerToken ||
      lease.fencingToken !== bigint(row.fencingToken) ||
      !row.leaseExpiresAt ||
      row.leaseExpiresAt <= (await databaseNow(tx))
    ) {
      throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Initial capability lease was lost', 409, true);
    }
  }

  await validateLockedProjects(tx, {
    kind: row.kind,
    scopes: initialScopes,
    projects,
    preconditions: normalizeJsonObject(row.preconditions, 'stored preconditions'),
    operationId: row.id,
    existingOperation: true,
    checkpointBarrierAuthority: input.checkpointBarrierAuthority,
  });
  const payload = normalizeJsonObject(row.payload, 'stored payload');
  const method = payload.method;
  const objectKeyHash = payload.objectKeyHash;
  if ((method !== 'GET' && method !== 'PUT') || typeof objectKeyHash !== 'string' || !SHA256.test(objectKeyHash)) {
    throw operationError('OBJECT_STORAGE_OPERATION_CAPABILITY_RECEIPT_CORRUPT', 'Capability receipt is invalid', 500);
  }
  const expectedMethod = row.kind === 'SIGNED_UPLOAD_CAPABILITY' ? 'PUT' : 'GET';
  if (method !== expectedMethod) {
    throw operationError('OBJECT_STORAGE_OPERATION_CAPABILITY_RECEIPT_CORRUPT', 'Capability method is invalid', 500);
  }
  const signedMethod = method as 'GET' | 'PUT';
  const now = await databaseNow(tx);
  await reserveCapabilityUpperBound(tx, projectIds, expiresAt, now);

  const nextAttempt = row.attempts + 1;
  const nextFence = bigint(row.fencingToken) + 1n;
  const receipt = {
    requiresResign: true as const,
    objectKeyHash,
    method: signedMethod,
    reservedCapabilityExpiresAt: expiresAt.toISOString(),
    reservationAttempt: nextAttempt,
  };
  const updated = await tx.$queryRaw<OperationRow[]>(Prisma.sql`
    UPDATE "ObjectStorageOperation"
    SET "status" = 'COMMITTED'::"ObjectStorageOperationStatus",
        "ownerToken" = NULL,
        "fencingToken" = ${nextFence},
        "leaseExpiresAt" = NULL,
        "attempts" = ${nextAttempt},
        "reservedCapabilityExpiresAt" = GREATEST("reservedCapabilityExpiresAt", ${expiresAt}),
        "evidence" = COALESCE("evidence", '{}'::jsonb)
          || jsonb_build_object('authorizationReserved', true),
        "result" = ${JSON.stringify(receipt)}::jsonb,
        "effectStartedAt" = COALESCE("effectStartedAt", clock_timestamp()),
        "verificationStartedAt" = COALESCE("verificationStartedAt", clock_timestamp()),
        "committedAt" = COALESCE("committedAt", clock_timestamp()),
        "updatedAt" = clock_timestamp()
    WHERE "id" = ${row.id}
      AND "fencingToken" = ${bigint(row.fencingToken)}
      AND "requestHash" = ${input.requestHash}
      AND "status" = ${row.status}::"ObjectStorageOperationStatus"
      ${
        row.status === 'PREPARED'
          ? Prisma.sql`AND "ownerToken" = ${input.lease!.ownerToken} AND "leaseExpiresAt" > clock_timestamp()`
          : Prisma.empty
      }
    RETURNING *
  `);
  if (!updated[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Capability reservation fence changed', 409, true);
  }

  const reservationId = `objcap_${randomUUID()}`;
  await tx.$executeRaw`
    INSERT INTO "ObjectStorageCapabilityReservation" (
      "id", "operationId", "attempt", "fencingToken", "authorizationTokenHash",
      "method", "objectKeyHash", "reservedExpiresAt", "status", "reservedAt"
    ) VALUES (
      ${reservationId}, ${row.id}, ${nextAttempt}, ${nextFence}, ${sha256(input.authorizationToken)},
      ${signedMethod}, ${objectKeyHash}, ${expiresAt},
      'RESERVED'::"ObjectStorageCapabilityReservationStatus", clock_timestamp()
    )
  `;

  return {
    reservationId,
    operationId: row.id,
    attempt: nextAttempt,
    fencingToken: nextFence,
    method: signedMethod,
    objectKeyHash,
    reservedCapabilityExpiresAt: expiresAt.toISOString(),
    receipt,
  };
}

/** Record only non-secret provider metadata after signing; URL/signature input is rejected. */
export async function markSignedCapabilityIssued(
  tx: Tx,
  input: {
    reservationId: string;
    operationId: string;
    fencingToken: bigint;
    authorizationToken: string;
    method: SignedCapabilityMethod;
    objectKeyHash: string;
    providerExpiresAt: string;
    evidence: ObjectStorageJsonObject;
  },
): Promise<{ issuedAt: string; replayed: boolean }> {
  assertSafeId(input.reservationId, 'reservationId');
  assertSafeId(input.operationId, 'operationId');
  if (input.authorizationToken.length < 16 || input.authorizationToken.length > 255 || input.fencingToken < 1n) {
    throw operationError('OBJECT_STORAGE_OPERATION_AUTHORIZATION_INVALID', 'Capability authorization is invalid', 400);
  }
  assertJsonObject(input.evidence, 'capability issue evidence');
  if ((input.method !== 'GET' && input.method !== 'PUT') || !SHA256.test(input.objectKeyHash)) {
    throw operationError('OBJECT_STORAGE_OPERATION_AUTHORIZATION_INVALID', 'Capability authorization is invalid', 400);
  }
  const providerExpiresAt = parseDate(input.providerExpiresAt, 'providerExpiresAt');
  const durableEvidence: ObjectStorageJsonObject = {
    ...input.evidence,
    providerExpiresAt: providerExpiresAt.toISOString(),
  };
  assertJsonObject(durableEvidence, 'capability issue evidence');
  const existing = await tx.$queryRaw<
    Array<{
      status: 'RESERVED' | 'ISSUED';
      issuedAt: Date | null;
      reservedExpiresAt: Date;
      method: SignedCapabilityMethod;
      objectKeyHash: string;
      evidence: unknown | null;
    }>
  >(Prisma.sql`
    SELECT "status", "issuedAt", "reservedExpiresAt", "method", "objectKeyHash", "evidence"
    FROM "ObjectStorageCapabilityReservation"
    WHERE "id" = ${input.reservationId}
      AND "operationId" = ${input.operationId}
      AND "fencingToken" = ${input.fencingToken}
      AND "authorizationTokenHash" = ${sha256(input.authorizationToken)}
    FOR UPDATE
  `);
  if (!existing[0]) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_AUTHORIZATION_INVALID',
      'Capability authorization was not found',
      404,
    );
  }
  if (existing[0].method !== input.method || existing[0].objectKeyHash !== input.objectKeyHash) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_CAPABILITY_ISSUE_CONFLICT',
      'Capability issue replay does not match its durable reservation',
      409,
    );
  }
  if (existing[0].status === 'ISSUED') {
    if (!existing[0].issuedAt) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_CAPABILITY_RECEIPT_CORRUPT',
        'Capability issue receipt is invalid',
        500,
      );
    }
    const storedEvidence = normalizeJsonObject(existing[0].evidence, 'stored capability issue evidence');
    if (canonicalJson(storedEvidence) !== canonicalJson(durableEvidence)) {
      throw operationError(
        'OBJECT_STORAGE_OPERATION_CAPABILITY_ISSUE_CONFLICT',
        'Capability issue replay has different durable evidence',
        409,
      );
    }
    return { issuedAt: existing[0].issuedAt.toISOString(), replayed: true };
  }
  const now = await databaseNow(tx);
  if (providerExpiresAt <= now || providerExpiresAt > existing[0].reservedExpiresAt) {
    throw operationError(
      'OBJECT_STORAGE_OPERATION_PROVIDER_EXPIRY_OUT_OF_BOUNDS',
      'Provider capability expiry exceeds its durable reservation',
      409,
    );
  }
  const rows = await tx.$queryRaw<Array<{ issuedAt: Date }>>(Prisma.sql`
    UPDATE "ObjectStorageCapabilityReservation"
    SET "status" = 'ISSUED'::"ObjectStorageCapabilityReservationStatus",
        "evidence" = ${JSON.stringify(durableEvidence)}::jsonb,
        "issuedAt" = clock_timestamp()
    WHERE "id" = ${input.reservationId}
      AND "operationId" = ${input.operationId}
      AND "fencingToken" = ${input.fencingToken}
      AND "authorizationTokenHash" = ${sha256(input.authorizationToken)}
      AND "status" = 'RESERVED'
    RETURNING "issuedAt"
  `);
  if (!rows[0]) {
    throw operationError('OBJECT_STORAGE_OPERATION_FENCE_LOST', 'Capability issue fence changed', 409, true);
  }
  return { issuedAt: rows[0].issuedAt.toISOString(), replayed: false };
}
