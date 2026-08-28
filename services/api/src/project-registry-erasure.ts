import { createHash } from 'node:crypto';

import type { OciAttachment } from './artifact-promotion.js';
import {
  assertSha256Digest,
  parseArtifactRegistryImageRepository,
  type ArtifactRegistryPackageSnapshot,
} from './artifact-registry-adapter.js';
import { parseServerRollbackPromotionEvidence } from './deterministic-rollback.js';

export interface ProjectRegistryReleaseReference {
  projectId: string;
  artifactKind: string;
  artifactRef: string;
  artifactDigest: string;
  promotionEvidence?: unknown;
}

const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{3,127}$/u;
const OCI_TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;

export class ProjectRegistryErasureError extends Error {
  readonly statusCode = 409;

  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectRegistryErasureError';
  }
}

export interface ProjectRegistryImageReference {
  repo: string;
  digest: string;
  tags?: readonly string[];
}

export interface RegistryManifestReference {
  kind: 'manifest';
  repository: string;
  digest: string;
}

export interface RegistryTagReference {
  kind: 'tag';
  repository: string;
  tag: string;
  digest: string;
}

export type RegistryErasureReference = RegistryManifestReference | RegistryTagReference;

/**
 * Database authority for global reference counts. Implementations must inspect
 * source-image pins and immutable ReleaseManifest promotion evidence outside
 * `excludedProjectId`; counts must be obtained without any provider call in the
 * same database transaction.
 */
export interface ProjectRegistryReferenceAuthority {
  countOutsideProject(reference: RegistryErasureReference, excludedProjectId: string): Promise<number>;
}

/** Artifact Registry surface required by the erasure executor. */
export interface ProjectRegistryErasureProvider {
  snapshotPackage(repo: string): Promise<ArtifactRegistryPackageSnapshot>;
  manifestExists(repo: string, digest: string): Promise<boolean>;
  listReferrers(repo: string, digest: string): Promise<OciAttachment[]>;
  tagExists(repo: string, tag: string): Promise<boolean>;
  deleteTag(repo: string, tag: string): Promise<void>;
  deleteReferrer(repo: string, digest: string): Promise<void>;
  deleteImage(repo: string, digest: string): Promise<void>;
  deleteVersion(repo: string, digest: string): Promise<void>;
  deletePackage(repo: string): Promise<void>;
}

/**
 * Caller-owned durable lease and global package fence. `withPackageFence` must
 * use a session/distributed lock shared by ALL publishers of the package; it
 * must never keep a database transaction open while `effect` performs provider
 * I/O. `assertPreparedAndLease` must prove the exact inventory hash was durably
 * committed before the first mutation and is re-run between provider effects.
 */
export interface ProjectRegistryErasureGuard {
  assertPreparedAndLease(input: { projectId: string; inventoryHash: string }): Promise<void>;
  withPackageFence<T>(repository: string, effect: () => Promise<T>): Promise<T>;
}

export type RegistryInventoryManifestKind = 'image' | 'referrer' | 'version';

export interface ProjectRegistryInventoryManifest {
  kind: RegistryInventoryManifestKind;
  digest: string;
  subjectDigest?: string;
  projectReferenceCount: number;
  plannedOtherReferenceCount: number;
  presentAtCapture: boolean;
}

export interface ProjectRegistryInventoryTag {
  tag: string;
  digest: string;
  projectReferenceCount: number;
  plannedOtherReferenceCount: number;
  presentAtCapture: boolean;
}

export interface ProjectRegistryInventoryPackage {
  repository: string;
  existedAtCapture: boolean;
  manifests: ProjectRegistryInventoryManifest[];
  tags: ProjectRegistryInventoryTag[];
}

/** Persist this complete value before calling executeProjectRegistryErasure. */
export interface ProjectRegistryErasureInventory {
  schemaVersion: 1;
  projectId: string;
  packages: ProjectRegistryInventoryPackage[];
  inventoryHash: string;
}

export interface ProjectRegistryErasureReceipt {
  [key: string]: string | number;
  schemaVersion: 1;
  projectIdHash: string;
  inventoryHash: string;
  packageCount: number;
  manifestCount: number;
  tagCount: number;
  erasedPackageCount: number;
  retainedPackageCount: number;
  erasedManifestCount: number;
  retainedManifestCount: number;
  erasedTagCount: number;
  retainedTagCount: number;
  dispositionDigest: string;
}

interface KnownManifest {
  kind: Exclude<RegistryInventoryManifestKind, 'version'>;
  subjectDigest?: string;
  projectReferenceCount: number;
}

interface KnownTag {
  digest: string;
  projectReferenceCount: number;
}

interface KnownPackage {
  manifests: Map<string, KnownManifest>;
  tags: Map<string, KnownTag>;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('REGISTRY_ERASURE_NON_FINITE_NUMBER');
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  if (!value || typeof value !== 'object') {
    throw new TypeError('REGISTRY_ERASURE_UNSUPPORTED_VALUE');
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function digestValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function fail(code: string, message: string, cause?: unknown): never {
  throw new ProjectRegistryErasureError(code, message, cause === undefined ? undefined : { cause });
}

function assertProjectPackage(projectId: string, repository: string): string {
  let parsed: ReturnType<typeof parseArtifactRegistryImageRepository>;

  try {
    parsed = parseArtifactRegistryImageRepository(repository);
  } catch (error) {
    fail('REGISTRY_ERASURE_REFERENCE_INVALID', 'Registry erasure reference is malformed.', error);
  }

  const expected = `p-${projectId.toLowerCase()}`;

  if (parsed.packagePath.length !== 1 || parsed.packagePath[0] !== expected) {
    fail('REGISTRY_ERASURE_SCOPE_MISMATCH', 'Registry erasure reference escaped the project package.');
  }

  return parsed.original;
}

function assertDigest(value: string): string {
  try {
    return assertSha256Digest(value);
  } catch (error) {
    return fail('REGISTRY_ERASURE_REFERENCE_INVALID', 'Registry erasure digest is malformed.', error);
  }
}

function assertTag(value: string): string {
  if (!OCI_TAG_RE.test(value)) {
    fail('REGISTRY_ERASURE_REFERENCE_INVALID', 'Registry erasure tag is malformed.');
  }

  return value;
}

function packageFor(packages: Map<string, KnownPackage>, repository: string): KnownPackage {
  const prior = packages.get(repository);

  if (prior) {
    return prior;
  }

  const created: KnownPackage = { manifests: new Map(), tags: new Map() };
  packages.set(repository, created);

  return created;
}

function addManifest(
  packages: Map<string, KnownPackage>,
  input: {
    repository: string;
    digest: string;
    kind: KnownManifest['kind'];
    subjectDigest?: string;
  },
): void {
  const target = packageFor(packages, input.repository);
  const prior = target.manifests.get(input.digest);

  if (prior) {
    if (prior.kind !== input.kind || prior.subjectDigest !== input.subjectDigest) {
      fail('REGISTRY_ERASURE_EVIDENCE_CONFLICT', 'Registry erasure evidence assigns conflicting identities.');
    }

    prior.projectReferenceCount += 1;

    return;
  }

  target.manifests.set(input.digest, {
    kind: input.kind,
    ...(input.subjectDigest ? { subjectDigest: input.subjectDigest } : {}),
    projectReferenceCount: 1,
  });
}

function addTag(packages: Map<string, KnownPackage>, repository: string, tag: string, digest: string): void {
  const target = packageFor(packages, repository);
  const prior = target.tags.get(tag);

  if (prior) {
    if (prior.digest !== digest) {
      fail('REGISTRY_ERASURE_EVIDENCE_CONFLICT', 'Registry erasure evidence assigns a tag to two digests.');
    }

    prior.projectReferenceCount += 1;

    return;
  }

  target.tags.set(tag, { digest, projectReferenceCount: 1 });
}

function addImageReferences(
  packages: Map<string, KnownPackage>,
  projectId: string,
  references: readonly ProjectRegistryImageReference[],
): void {
  for (const reference of references) {
    const repository = assertProjectPackage(projectId, reference.repo);
    const digest = assertDigest(reference.digest);
    addManifest(packages, { repository, digest, kind: 'image' });

    for (const rawTag of reference.tags ?? []) {
      addTag(packages, repository, assertTag(rawTag), digest);
    }
  }
}

/**
 * Pure authority derivation. It reads no provider state and intentionally keeps
 * policy names, encrypted runtime data, actor data and credentials out of the
 * resulting package/digest/tag inventory.
 */
function deriveProjectRegistryErasureAuthority(input: {
  projectId: string;
  projectPackages?: readonly string[];
  sourceImages: readonly ProjectRegistryImageReference[];
  tenantImages: readonly ProjectRegistryImageReference[];
  releaseManifests: ReadonlyArray<ProjectRegistryReleaseReference>;
}): Map<string, KnownPackage> {
  if (!PROJECT_ID_RE.test(input.projectId)) {
    fail('REGISTRY_ERASURE_PROJECT_INVALID', 'Project id cannot form an Artifact Registry package.');
  }

  const packages = new Map<string, KnownPackage>();
  for (const repository of input.projectPackages ?? []) {
    packageFor(packages, assertProjectPackage(input.projectId, repository));
  }
  addImageReferences(packages, input.projectId, input.sourceImages);
  addImageReferences(packages, input.projectId, input.tenantImages);

  for (const manifest of input.releaseManifests) {
    if (manifest.projectId !== input.projectId) {
      fail('REGISTRY_ERASURE_SCOPE_MISMATCH', 'Release inventory contains another project.');
    }

    if (manifest.artifactKind !== 'server-image') {
      continue;
    }

    if (manifest.promotionEvidence === undefined) {
      fail('REGISTRY_ERASURE_EVIDENCE_INVALID', 'Server release is missing immutable promotion evidence.');
    }

    let evidence: ReturnType<typeof parseServerRollbackPromotionEvidence>;

    try {
      evidence = parseServerRollbackPromotionEvidence(manifest.promotionEvidence);
    } catch (error) {
      fail('REGISTRY_ERASURE_EVIDENCE_INVALID', 'Server release promotion evidence failed verification.', error);
    }

    if (
      evidence.projectId !== input.projectId ||
      evidence.artifactRef !== manifest.artifactRef ||
      evidence.artifactDigest !== manifest.artifactDigest
    ) {
      fail('REGISTRY_ERASURE_EVIDENCE_CONFLICT', 'Release and promotion evidence disagree.');
    }

    const promotion = evidence.promotion;
    const sourceRepository = assertProjectPackage(input.projectId, promotion.sourceRepo);
    const targetRepository = assertProjectPackage(input.projectId, promotion.targetRepo);
    const imageDigest = assertDigest(promotion.sourceDigest);

    if (targetRepository !== manifest.artifactRef || imageDigest !== manifest.artifactDigest) {
      fail('REGISTRY_ERASURE_EVIDENCE_CONFLICT', 'Release and promoted image identity disagree.');
    }

    addManifest(packages, { repository: sourceRepository, digest: imageDigest, kind: 'image' });
    addManifest(packages, { repository: targetRepository, digest: imageDigest, kind: 'image' });
    const retentionTag = promotion.retentionTag;

    if (typeof retentionTag !== 'string') {
      fail('REGISTRY_ERASURE_EVIDENCE_INVALID', 'Promotion retention-tag evidence is missing.');
    }

    addTag(packages, targetRepository, assertTag(retentionTag), imageDigest);

    for (const attachment of promotion.attachments) {
      if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
        fail('REGISTRY_ERASURE_EVIDENCE_INVALID', 'Promotion attachment evidence is malformed.');
      }

      const attachmentDigest = assertDigest(attachment.digest);
      const subjectDigest = assertDigest(attachment.subjectDigest);

      if (attachment.relinked !== true || subjectDigest !== imageDigest) {
        fail('REGISTRY_ERASURE_EVIDENCE_INVALID', 'Promotion attachment is not bound to the image.');
      }

      addManifest(packages, {
        repository: sourceRepository,
        digest: attachmentDigest,
        kind: 'referrer',
        subjectDigest,
      });
      addManifest(packages, {
        repository: targetRepository,
        digest: attachmentDigest,
        kind: 'referrer',
        subjectDigest,
      });
    }
  }

  return packages;
}

function assertReferenceCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('REGISTRY_ERASURE_REFCOUNT_INVALID', 'Registry reference authority returned an invalid count.');
  }

  return value;
}

/**
 * Capture the exact live package contents and global refcounts. This function
 * performs only reads; the caller must durably persist its returned inventory
 * (including inventoryHash) before any erasure effect is allowed.
 */
export async function captureProjectRegistryErasureInventory(input: {
  projectId: string;
  projectPackages?: readonly string[];
  sourceImages: readonly ProjectRegistryImageReference[];
  tenantImages: readonly ProjectRegistryImageReference[];
  releaseManifests: ReadonlyArray<ProjectRegistryReleaseReference>;
  provider: Pick<ProjectRegistryErasureProvider, 'snapshotPackage'>;
  referenceAuthority: ProjectRegistryReferenceAuthority;
}): Promise<ProjectRegistryErasureInventory> {
  const authority = deriveProjectRegistryErasureAuthority(input);
  const packages: ProjectRegistryInventoryPackage[] = [];

  for (const [repository, known] of [...authority].sort(([a], [b]) => a.localeCompare(b))) {
    const snapshot = await input.provider.snapshotPackage(repository);

    if (
      snapshot.repository !== repository ||
      (!snapshot.exists && (snapshot.versions.length || snapshot.tags.length))
    ) {
      fail('REGISTRY_ERASURE_PROVIDER_INVENTORY_INVALID', 'Artifact Registry returned an inconsistent package view.');
    }

    const liveVersions = new Set(snapshot.versions.map(assertDigest));
    const manifests: ProjectRegistryInventoryManifest[] = [];

    for (const [digest, reference] of [...known.manifests].sort(([a], [b]) => a.localeCompare(b))) {
      const plannedOtherReferenceCount = assertReferenceCount(
        await input.referenceAuthority.countOutsideProject({ kind: 'manifest', repository, digest }, input.projectId),
      );
      manifests.push({
        kind: reference.kind,
        digest,
        ...(reference.subjectDigest ? { subjectDigest: reference.subjectDigest } : {}),
        projectReferenceCount: reference.projectReferenceCount,
        plannedOtherReferenceCount,
        presentAtCapture: liveVersions.delete(digest),
      });
    }

    for (const digest of [...liveVersions].sort()) {
      const plannedOtherReferenceCount = assertReferenceCount(
        await input.referenceAuthority.countOutsideProject({ kind: 'manifest', repository, digest }, input.projectId),
      );
      manifests.push({
        kind: 'version',
        digest,
        projectReferenceCount: 0,
        plannedOtherReferenceCount,
        presentAtCapture: true,
      });
    }

    manifests.sort((a, b) => a.digest.localeCompare(b.digest));

    const liveTags = new Map<string, string>();

    for (const rawTag of snapshot.tags) {
      const tag = assertTag(rawTag.name);
      const digest = assertDigest(rawTag.digest);
      const prior = liveTags.get(tag);

      if (prior && prior !== digest) {
        fail('REGISTRY_ERASURE_PROVIDER_INVENTORY_INVALID', 'Artifact Registry returned an ambiguous tag.');
      }

      liveTags.set(tag, digest);
    }

    const tags: ProjectRegistryInventoryTag[] = [];

    for (const [tag, reference] of [...known.tags].sort(([a], [b]) => a.localeCompare(b))) {
      const liveDigest = liveTags.get(tag);

      if (liveDigest && liveDigest !== reference.digest) {
        fail('REGISTRY_ERASURE_PROVIDER_INVENTORY_INVALID', 'Artifact Registry tag changed its digest.');
      }

      const plannedOtherReferenceCount = assertReferenceCount(
        await input.referenceAuthority.countOutsideProject(
          { kind: 'tag', repository, tag, digest: reference.digest },
          input.projectId,
        ),
      );
      tags.push({
        tag,
        digest: reference.digest,
        projectReferenceCount: reference.projectReferenceCount,
        plannedOtherReferenceCount,
        presentAtCapture: liveTags.delete(tag),
      });
    }

    for (const [tag, digest] of [...liveTags].sort(([a], [b]) => a.localeCompare(b))) {
      const plannedOtherReferenceCount = assertReferenceCount(
        await input.referenceAuthority.countOutsideProject({ kind: 'tag', repository, tag, digest }, input.projectId),
      );
      tags.push({
        tag,
        digest,
        projectReferenceCount: 0,
        plannedOtherReferenceCount,
        presentAtCapture: true,
      });
    }

    tags.sort((a, b) => a.tag.localeCompare(b.tag));

    const capturedDigests = new Set(manifests.map((manifest) => manifest.digest));

    if (tags.some((tag) => !capturedDigests.has(tag.digest))) {
      fail('REGISTRY_ERASURE_PROVIDER_INVENTORY_INVALID', 'Artifact Registry tag points outside its package view.');
    }

    packages.push({ repository, existedAtCapture: snapshot.exists, manifests, tags });
  }

  const body = { schemaVersion: 1 as const, projectId: input.projectId, packages };

  return { ...body, inventoryHash: digestValue(body) };
}

export function validateProjectRegistryErasureInventory(inventory: ProjectRegistryErasureInventory): void {
  const { inventoryHash, ...body } = inventory;

  if (inventory.schemaVersion !== 1 || digestValue(body) !== inventoryHash) {
    fail('REGISTRY_ERASURE_INVENTORY_TAMPERED', 'Registry erasure inventory hash is invalid.');
  }

  if (!PROJECT_ID_RE.test(inventory.projectId)) {
    fail('REGISTRY_ERASURE_PROJECT_INVALID', 'Project id cannot form an Artifact Registry package.');
  }

  let priorRepository = '';

  for (const pkg of inventory.packages) {
    const repository = assertProjectPackage(inventory.projectId, pkg.repository);

    if (repository <= priorRepository || typeof pkg.existedAtCapture !== 'boolean') {
      fail('REGISTRY_ERASURE_INVENTORY_INVALID', 'Registry packages are duplicated or unsorted.');
    }

    priorRepository = repository;

    let priorDigest = '';

    const manifestDigests = new Set<string>();

    for (const manifest of pkg.manifests) {
      const digest = assertDigest(manifest.digest);

      if (
        digest <= priorDigest ||
        !['image', 'referrer', 'version'].includes(manifest.kind) ||
        typeof manifest.presentAtCapture !== 'boolean'
      ) {
        fail('REGISTRY_ERASURE_INVENTORY_INVALID', 'Registry manifests are duplicated or unsorted.');
      }

      priorDigest = digest;
      manifestDigests.add(digest);
      assertReferenceCount(manifest.projectReferenceCount);
      assertReferenceCount(manifest.plannedOtherReferenceCount);

      if (
        (manifest.kind === 'referrer' && !manifest.subjectDigest) ||
        (manifest.kind !== 'referrer' && manifest.subjectDigest !== undefined)
      ) {
        fail('REGISTRY_ERASURE_INVENTORY_INVALID', 'Registry manifest kind is inconsistent.');
      }

      if (manifest.subjectDigest) {
        assertDigest(manifest.subjectDigest);
      }
    }

    let priorTag = '';

    for (const tag of pkg.tags) {
      assertTag(tag.tag);
      assertDigest(tag.digest);

      if (tag.tag <= priorTag || typeof tag.presentAtCapture !== 'boolean' || !manifestDigests.has(tag.digest)) {
        fail('REGISTRY_ERASURE_INVENTORY_INVALID', 'Registry tags are duplicated or unsorted.');
      }

      priorTag = tag.tag;
      assertReferenceCount(tag.projectReferenceCount);
      assertReferenceCount(tag.plannedOtherReferenceCount);
    }

    if (
      !pkg.existedAtCapture &&
      (pkg.manifests.some((manifest) => manifest.presentAtCapture) || pkg.tags.some((tag) => tag.presentAtCapture))
    ) {
      fail('REGISTRY_ERASURE_INVENTORY_INVALID', 'Absent registry package contains live resources.');
    }
  }
}

/** Reject fabricated or internally inconsistent receipts before durable commit. */
export function validateProjectRegistryErasureReceipt(
  receipt: ProjectRegistryErasureReceipt,
  inventory: ProjectRegistryErasureInventory,
): void {
  validateProjectRegistryErasureInventory(inventory);
  const manifestCount = inventory.packages.reduce((sum, pkg) => sum + pkg.manifests.length, 0);
  const tagCount = inventory.packages.reduce((sum, pkg) => sum + pkg.tags.length, 0);
  const counts = [
    receipt.packageCount,
    receipt.manifestCount,
    receipt.tagCount,
    receipt.erasedPackageCount,
    receipt.retainedPackageCount,
    receipt.erasedManifestCount,
    receipt.retainedManifestCount,
    receipt.erasedTagCount,
    receipt.retainedTagCount,
  ];

  if (
    receipt.schemaVersion !== 1 ||
    receipt.projectIdHash !== digestValue(inventory.projectId) ||
    receipt.inventoryHash !== inventory.inventoryHash ||
    receipt.packageCount !== inventory.packages.length ||
    receipt.manifestCount !== manifestCount ||
    receipt.tagCount !== tagCount ||
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    receipt.erasedPackageCount + receipt.retainedPackageCount !== receipt.packageCount ||
    receipt.erasedManifestCount + receipt.retainedManifestCount !== receipt.manifestCount ||
    receipt.erasedTagCount + receipt.retainedTagCount !== receipt.tagCount ||
    !/^sha256:[a-f0-9]{64}$/u.test(receipt.dispositionDigest)
  ) {
    fail('REGISTRY_ERASURE_RECEIPT_INVALID', 'Registry erasure receipt is inconsistent with its inventory.');
  }
}

function assertSnapshotWithinInventory(
  snapshot: ArtifactRegistryPackageSnapshot,
  pkg: ProjectRegistryInventoryPackage,
): void {
  if (
    snapshot.repository !== pkg.repository ||
    (!snapshot.exists && (snapshot.versions.length || snapshot.tags.length))
  ) {
    fail('REGISTRY_ERASURE_PROVIDER_INVENTORY_INVALID', 'Artifact Registry returned an inconsistent package view.');
  }

  const allowedVersions = new Set(pkg.manifests.filter((item) => item.presentAtCapture).map((item) => item.digest));

  const allowedTags = new Map(
    pkg.tags.filter((item) => item.presentAtCapture).map((item) => [item.tag, item.digest] as const),
  );

  if (
    snapshot.versions.some((digest) => !allowedVersions.has(assertDigest(digest))) ||
    snapshot.tags.some((tag) => allowedTags.get(assertTag(tag.name)) !== assertDigest(tag.digest))
  ) {
    fail('REGISTRY_ERASURE_INVENTORY_STALE', 'Artifact Registry package gained content after durable capture.');
  }
}

interface Disposition {
  type: 'package' | 'manifest' | 'tag';
  repository: string;
  identity: string;
  disposition: 'ERASED' | 'RETAINED_SHARED';
  finalOtherReferenceCount: number;
}

async function assertLease(
  guard: ProjectRegistryErasureGuard,
  inventory: ProjectRegistryErasureInventory,
): Promise<void> {
  await guard.assertPreparedAndLease({ projectId: inventory.projectId, inventoryHash: inventory.inventoryHash });
}

async function verifyRetainedReferrer(
  provider: ProjectRegistryErasureProvider,
  repository: string,
  subjectDigest: string,
  digest: string,
): Promise<void> {
  const linked = (await provider.listReferrers(repository, subjectDigest)).some(
    (attachment) => attachment.digest === digest && attachment.subjectDigest === subjectDigest,
  );

  if (!linked) {
    fail('REGISTRY_ERASURE_SHARED_REFERENCE_MISSING', 'A shared registry referrer disappeared during erasure.');
  }
}

/**
 * Idempotent provider executor. A replay reuses the same durable inventory;
 * resources already absent remain ERASED, while every live shared reference is
 * retained and verified. No timestamps, policy names, actor data or credentials
 * enter the compact receipt.
 */
export async function executeProjectRegistryErasure(input: {
  inventory: ProjectRegistryErasureInventory;
  provider: ProjectRegistryErasureProvider;
  referenceAuthority: ProjectRegistryReferenceAuthority;
  guard: ProjectRegistryErasureGuard;
}): Promise<ProjectRegistryErasureReceipt> {
  validateProjectRegistryErasureInventory(input.inventory);
  await assertLease(input.guard, input.inventory);

  const dispositions: Disposition[] = [];

  /* Database corruption must be detected before the first provider mutation.
   * The migration forbids new cross-project package references; this full
   * preflight is the fail-closed guard for legacy/tampered rows. */
  for (const pkg of input.inventory.packages) {
    await input.guard.withPackageFence(pkg.repository, async () => {
      await assertLease(input.guard, input.inventory);
      assertSnapshotWithinInventory(await input.provider.snapshotPackage(pkg.repository), pkg);
      for (const tag of pkg.tags) {
        const count = assertReferenceCount(
          await input.referenceAuthority.countOutsideProject(
            { kind: 'tag', repository: pkg.repository, tag: tag.tag, digest: tag.digest },
            input.inventory.projectId,
          ),
        );
        if (count > 0) {
          fail(
            'REGISTRY_CROSS_PROJECT_REFERENCE_FORBIDDEN',
            'A project-private registry tag is referenced by another project; refusing GC until the database invariant is repaired.',
          );
        }
      }
      for (const manifest of pkg.manifests) {
        const count = assertReferenceCount(
          await input.referenceAuthority.countOutsideProject(
            { kind: 'manifest', repository: pkg.repository, digest: manifest.digest },
            input.inventory.projectId,
          ),
        );
        if (count > 0) {
          fail(
            'REGISTRY_CROSS_PROJECT_REFERENCE_FORBIDDEN',
            'A project-private registry manifest is referenced by another project; refusing GC until the database invariant is repaired.',
          );
        }
      }
    });
  }

  for (const pkg of input.inventory.packages) {
    await input.guard.withPackageFence(pkg.repository, async () => {
      await assertLease(input.guard, input.inventory);
      assertSnapshotWithinInventory(await input.provider.snapshotPackage(pkg.repository), pkg);

      const retainedVersions = new Set<string>();
      const retainedTags = new Map<string, string>();
      const indirectReferenceCounts = new Map<string, number>();

      for (const tag of pkg.tags) {
        await assertLease(input.guard, input.inventory);

        const finalOtherReferenceCount = assertReferenceCount(
          await input.referenceAuthority.countOutsideProject(
            { kind: 'tag', repository: pkg.repository, tag: tag.tag, digest: tag.digest },
            input.inventory.projectId,
          ),
        );

        if (finalOtherReferenceCount > 0) {
          fail(
            'REGISTRY_CROSS_PROJECT_REFERENCE_FORBIDDEN',
            'A project-private registry tag is referenced by another project; refusing GC until the database invariant is repaired.',
          );
        }

        await assertLease(input.guard, input.inventory);
        await input.provider.deleteTag(pkg.repository, tag.tag);
        dispositions.push({
          type: 'tag',
          repository: pkg.repository,
          identity: `${tag.tag}\0${tag.digest}`,
          disposition: 'ERASED',
          finalOtherReferenceCount: 0,
        });
      }

      const orderedManifests = [...pkg.manifests].sort((a, b) => {
        const order: Record<RegistryInventoryManifestKind, number> = { referrer: 0, image: 1, version: 2 };
        return order[a.kind] - order[b.kind] || a.digest.localeCompare(b.digest);
      });

      for (const manifest of orderedManifests) {
        await assertLease(input.guard, input.inventory);

        const directOtherReferenceCount = assertReferenceCount(
          await input.referenceAuthority.countOutsideProject(
            { kind: 'manifest', repository: pkg.repository, digest: manifest.digest },
            input.inventory.projectId,
          ),
        );
        const finalOtherReferenceCount = Math.max(
          directOtherReferenceCount,
          indirectReferenceCounts.get(manifest.digest) ?? 0,
        );

        if (finalOtherReferenceCount > 0) {
          fail(
            'REGISTRY_CROSS_PROJECT_REFERENCE_FORBIDDEN',
            'A project-private registry manifest is referenced by another project; refusing GC until the database invariant is repaired.',
          );
        }

        await assertLease(input.guard, input.inventory);

        if (manifest.kind === 'referrer') {
          await input.provider.deleteReferrer(pkg.repository, manifest.digest);
        } else if (manifest.kind === 'image') {
          await input.provider.deleteImage(pkg.repository, manifest.digest);
        } else {
          await input.provider.deleteVersion(pkg.repository, manifest.digest);
        }

        dispositions.push({
          type: 'manifest',
          repository: pkg.repository,
          identity: manifest.digest,
          disposition: 'ERASED',
          finalOtherReferenceCount: 0,
        });
      }

      await assertLease(input.guard, input.inventory);

      if (retainedVersions.size === 0 && retainedTags.size === 0) {
        await input.provider.deletePackage(pkg.repository);
      }

      const verified = await input.provider.snapshotPackage(pkg.repository);

      if (retainedVersions.size === 0 && retainedTags.size === 0) {
        if (verified.exists || verified.versions.length > 0 || verified.tags.length > 0) {
          fail('REGISTRY_ERASURE_VERIFY_FAILED', 'Artifact Registry package deletion was not verified.');
        }

        dispositions.push({
          type: 'package',
          repository: pkg.repository,
          identity: 'package',
          disposition: 'ERASED',
          finalOtherReferenceCount: 0,
        });

        return;
      }

      const actualVersions = [...new Set(verified.versions.map(assertDigest))].sort();
      const expectedVersions = [...retainedVersions].sort();
      const actualTags = verified.tags.map((tag) => `${assertTag(tag.name)}\0${assertDigest(tag.digest)}`).sort();
      const expectedTags = [...retainedTags].map(([tag, digest]) => `${tag}\0${digest}`).sort();

      if (
        !verified.exists ||
        canonicalJson(actualVersions) !== canonicalJson(expectedVersions) ||
        canonicalJson(actualTags) !== canonicalJson(expectedTags)
      ) {
        fail('REGISTRY_ERASURE_VERIFY_FAILED', 'Artifact Registry retained-package state is not exact.');
      }

      for (const manifest of pkg.manifests) {
        if (manifest.kind === 'referrer' && retainedVersions.has(manifest.digest)) {
          await verifyRetainedReferrer(input.provider, pkg.repository, manifest.subjectDigest!, manifest.digest);
        }
      }

      dispositions.push({
        type: 'package',
        repository: pkg.repository,
        identity: 'package',
        disposition: 'RETAINED_SHARED',
        finalOtherReferenceCount: [...retainedVersions].length + retainedTags.size,
      });
    });
  }

  dispositions.sort(
    (a, b) =>
      a.repository.localeCompare(b.repository) || a.type.localeCompare(b.type) || a.identity.localeCompare(b.identity),
  );

  const count = (type: Disposition['type'], disposition: Disposition['disposition']) =>
    dispositions.filter((entry) => entry.type === type && entry.disposition === disposition).length;

  const receipt: ProjectRegistryErasureReceipt = {
    schemaVersion: 1,
    projectIdHash: digestValue(input.inventory.projectId),
    inventoryHash: input.inventory.inventoryHash,
    packageCount: input.inventory.packages.length,
    manifestCount: input.inventory.packages.reduce((sum, pkg) => sum + pkg.manifests.length, 0),
    tagCount: input.inventory.packages.reduce((sum, pkg) => sum + pkg.tags.length, 0),
    erasedPackageCount: count('package', 'ERASED'),
    retainedPackageCount: count('package', 'RETAINED_SHARED'),
    erasedManifestCount: count('manifest', 'ERASED'),
    retainedManifestCount: count('manifest', 'RETAINED_SHARED'),
    erasedTagCount: count('tag', 'ERASED'),
    retainedTagCount: count('tag', 'RETAINED_SHARED'),
    dispositionDigest: digestValue(dispositions),
  };
  validateProjectRegistryErasureReceipt(receipt, input.inventory);
  return receipt;
}
