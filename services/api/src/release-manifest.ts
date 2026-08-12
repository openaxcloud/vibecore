/*
 * P0-V3-08 — deployment rollback manifest (pure core).
 *
 * A published deployment must be restorable to its PREVIOUS version for real. The
 * ReleaseManifest row persisted at each publish is what makes that deterministic:
 * a content-addressed digest of the served artifact plus the metadata a rollback
 * needs. This module is the pure, unit-testable heart:
 *
 *  - `hashSnapshotEntries` / `configDigest`: deterministic content digests, so a
 *    rollback can PROVE the bytes it is about to re-serve are byte-identical to
 *    what the manifest recorded — never a blind rollback.
 *  - `selectPreviousRelease`: pick N-1 from the version-desc history and FAIL
 *    CLOSED (RollbackManifestError, 409) when there is no previous release or its
 *    manifest is unusable. It never falls back to "just re-point the URL".
 *
 * No I/O here (the fs walk that produces the entry list lives in deployments.ts),
 * so the invariants are testable without a filesystem or DB.
 */
import { createHash } from 'node:crypto';
import type { ReleaseManifestRecord } from './store.js';

export class RollbackManifestError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'RollbackManifestError';
  }
}

/**
 * The release-stream head moved between the moment a rollback selected its N-1 and the
 * moment it tried to commit — i.e. a concurrent rollback or publish won the race.
 */
export class ReleaseHeadMovedError extends Error {
  readonly code = 'ROLLBACK_RELEASE_MOVED';
  readonly statusCode = 409;

  constructor(
    readonly expectedVersion: number,
    readonly observedVersion: number,
  ) {
    super(
      `The release history moved while this rollback was running (expected head v${expectedVersion}, found v${observedVersion}) — refusing to commit a rollback computed against a stale head.`,
    );
    this.name = 'ReleaseHeadMovedError';
  }
}

/** The advisory-lock key that serializes one project+environment release stream. */
export function releaseStreamLockKey(projectId: string, environment: string): string {
  return `release-manifest:${projectId}:${environment}`;
}

/** The store surface the release-stream CAS needs — a narrow slice of ApiStore. */
export interface ReleaseStreamStore {
  withSerializedMutation<T>(key: string, fn: () => Promise<T>): Promise<T>;
  listReleaseManifests(
    projectId: string,
    environment: string,
    options?: { take?: number },
  ): Promise<ReleaseManifestRecord[]>;
  createReleaseManifest(input: {
    projectId: string;
    deploymentId: string;
    environment: string;
    version: number;
    provider: string;
    artifactKind: 'static-snapshot' | 'server-image';
    artifactRef: string;
    artifactDigest: string;
    storeGeneration?: string;
    configDigest?: string;
    dbMigrationPoint?: string;
  }): Promise<ReleaseManifestRecord>;
}

/**
 * Read the current head version of a project+environment release stream, under the
 * stream's advisory lock. This is the value a rollback must later compare-and-set
 * against, so it MUST be read under the same lock the append takes.
 */
export async function readReleaseHeadVersion(
  store: ReleaseStreamStore,
  projectId: string,
  environment: string,
): Promise<number> {
  return store.withSerializedMutation(releaseStreamLockKey(projectId, environment), async () => {
    const latest = await store.listReleaseManifests(projectId, environment, { take: 1 });

    return latest[0]?.version ?? 0;
  });
}

/**
 * ============================================================================
 * THE LINEARIZATION POINT of the rollback chain (expert concurrency reserve).
 * ============================================================================
 *
 * Append a release manifest ONLY IF the stream head is still `expectedHeadVersion`,
 * atomically, under the stream's advisory lock. Otherwise throw
 * {@link ReleaseHeadMovedError} and write nothing.
 *
 * Why a compare-and-set rather than one long lock: the rollback chain is
 * select N-1 → restore → manifest → READY, and its middle step is a bounded-at-200s
 * call to the workspace manager. `withSerializedMutation` holds a pg_advisory_xact_lock
 * on a dedicated 5-connection pool, so wrapping the whole chain would pin a transaction
 * for minutes and, with any nesting, exhaust that pool and deadlock. The CAS gives the
 * same guarantee — at most one rollback commits against a given head — while holding
 * the lock only for two short reads/writes.
 *
 * Without it, N concurrent rollbacks all read head=[vN] outside any lock, all select the
 * same N-1, and all restore it, receiving distinct version numbers that make the result
 * look ordered while being unreachable by any sequential execution.
 */
export async function appendReleaseManifestAtHead(
  store: ReleaseStreamStore,
  params: {
    projectId: string;
    environment: string;
    expectedHeadVersion: number;
    manifest: {
      deploymentId: string;
      provider: string;
      artifactKind: 'static-snapshot' | 'server-image';
      artifactRef: string;
      artifactDigest: string;
      storeGeneration?: string;
      configDigest?: string;
      dbMigrationPoint?: string;
    };
  },
): Promise<ReleaseManifestRecord> {
  const { projectId, environment, expectedHeadVersion, manifest } = params;

  return store.withSerializedMutation(releaseStreamLockKey(projectId, environment), async () => {
    const latest = await store.listReleaseManifests(projectId, environment, { take: 1 });
    const observedVersion = latest[0]?.version ?? 0;

    if (observedVersion !== expectedHeadVersion) {
      throw new ReleaseHeadMovedError(expectedHeadVersion, observedVersion);
    }

    return store.createReleaseManifest({
      projectId,
      environment,
      version: observedVersion + 1,
      ...manifest,
    });
  });
}

/** A single file in a static snapshot: its deployment-root-relative path + the sha256 of its bytes. */
export interface SnapshotEntry {
  path: string;
  sha256: string;
}

/**
 * Deterministic content digest of a static snapshot. Entries are sorted by path
 * so the digest is independent of directory-walk order, and each line binds the
 * path to its byte-hash so neither a rename nor a content change can collide.
 * Returns a `sha256:<hex>` string (same shape as an image digest) so the manifest
 * treats static and server artifacts uniformly.
 */
export function hashSnapshotEntries(entries: ReadonlyArray<SnapshotEntry>): string {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');

  for (const entry of sorted) {
    // NUL separators: a path or hash can never contain NUL, so no two distinct
    // entry sets can serialize to the same buffer.
    hash.update(entry.path);
    hash.update('\0');
    hash.update(entry.sha256);
    hash.update('\0');
  }

  return `sha256:${hash.digest('hex')}`;
}

/**
 * Deterministic fingerprint of the effective env/config a release was published
 * with. Sorted by key; records WHICH keys and value-hashes were in effect without
 * persisting secret values in the clear. Empty config → a stable sentinel digest.
 */
export function configDigest(env: Record<string, string>): string {
  const hash = createHash('sha256');

  for (const key of Object.keys(env).sort()) {
    hash.update(key);
    hash.update('\0');
    hash.update(createHash('sha256').update(env[key]).digest('hex'));
    hash.update('\0');
  }

  return `sha256:${hash.digest('hex')}`;
}

const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

export interface PreviousReleaseSelection {
  current: ReleaseManifestRecord;
  previous: ReleaseManifestRecord;
}

/**
 * Given the release history newest-first (version desc), resolve the current
 * release (N) and the one a rollback restores (N-1). FAIL CLOSED:
 *  - no manifest at all            → ROLLBACK_NO_MANIFEST
 *  - only one release              → ROLLBACK_NO_PREVIOUS_MANIFEST
 *  - N-1 carries no usable digest  → ROLLBACK_PREVIOUS_NO_DIGEST
 * so a rollback is refused loudly instead of re-serving nothing / a stale URL.
 */
export function selectPreviousRelease(manifestsDesc: ReadonlyArray<ReleaseManifestRecord>): PreviousReleaseSelection {
  if (manifestsDesc.length === 0) {
    throw new RollbackManifestError(
      'No release manifest recorded for this deployment target — refusing a blind rollback.',
      'ROLLBACK_NO_MANIFEST',
    );
  }

  if (manifestsDesc.length < 2) {
    throw new RollbackManifestError(
      'Only one release exists — there is no previous version to roll back to.',
      'ROLLBACK_NO_PREVIOUS_MANIFEST',
    );
  }

  const current = manifestsDesc[0];
  const previous = manifestsDesc[1];

  if (!previous.artifactDigest || !DIGEST_RE.test(previous.artifactDigest)) {
    throw new RollbackManifestError(
      `Previous release v${previous.version} has no valid artifact digest — cannot deterministically restore it.`,
      'ROLLBACK_PREVIOUS_NO_DIGEST',
    );
  }

  return { current, previous };
}

/**
 * Assert the bytes about to be re-served match the digest the manifest recorded.
 * This is the gate that turns "copy the old URL and hope" into a verified restore:
 * a mismatch (artifact tampered, partially reaped, or rebuilt) FAILS CLOSED.
 */
export function assertArtifactMatchesManifest(recomputedDigest: string, manifest: ReleaseManifestRecord): void {
  if (recomputedDigest !== manifest.artifactDigest) {
    throw new RollbackManifestError(
      `Artifact for release v${manifest.version} no longer matches its manifest digest ` +
        `(recomputed ${recomputedDigest}, manifest ${manifest.artifactDigest}) — refusing to serve a divergent rollback.`,
      'ROLLBACK_ARTIFACT_DIGEST_MISMATCH',
    );
  }
}
