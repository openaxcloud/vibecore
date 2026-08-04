/*
 * ecode.lock.json — the per-project ENVIRONMENT lockfile (CTR-RUNTIME-NIX).
 *
 * The declarative, versioned source of truth for "which toolchain does this
 * project run on": store generation + nixpkgs rev + the exact activation
 * bundles (store paths, hashed). Written by the platform (never by hand),
 * read by every surface (Preview, Build, Publish, Scheduled) so "works in
 * preview, not deployed" cannot exist by construction. Language lockfiles
 * (package-lock.json, uv.lock…) keep owning app dependencies — this file pins
 * only the TOOLCHAIN.
 *
 * Format = docs/parity/schemas/ecode.lock.schema.json (schema v1), enforced
 * here field-for-field: strict (unknown properties rejected), typed errors,
 * and a CANONICAL serialization (sorted bundles, stable key order, trailing
 * newline) so the same environment always produces the same bytes — the lock
 * participates in the revision sha256 of the reproducible pipeline.
 */

import {
  assertNixGenerationUsable,
  type NixGeneration,
  type NixGenerationRegistry,
} from './nix-generations.js';

export interface EcodeLockBundle {
  name: string;
  storePath: string;
  sha256: string;
}

export interface EcodeLock {
  lockVersion: 1;
  storeGeneration: string;
  nixpkgsRev: string;
  bundles: EcodeLockBundle[];
}

export const ECODE_LOCK_FILENAME = 'ecode.lock.json';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const STORE_PATH = /^\/nix\/store\//;

export class EcodeLockError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'ECODE_LOCK_INVALID'
      | 'ECODE_LOCK_GENERATION_UNKNOWN'
      | 'ECODE_LOCK_GENERATION_REVOKED'
      | 'ECODE_LOCK_NIXPKGS_MISMATCH'
      | 'ECODE_LOCK_UNPINNED'
      | 'ECODE_LOCK_BUNDLE_UNKNOWN'
      | 'ECODE_LOCK_BUNDLE_TAMPERED',
  ) {
    super(message);
    this.name = 'EcodeLockError';
  }
}

/*
 * A store-generation reference is a CONCRETE, immutable pin when it names a
 * generation entry (`gen-N`) or a catalog content hash (`sha256:…`). Mutable
 * aliases that could re-resolve to a different generation without editing the
 * lock (active/latest/current/head/stable/default) are NOT concrete — a lock
 * carrying one is not really pinned (expert refusal v3, point 1).
 */
const MUTABLE_ALIAS = new Set(['active', 'latest', 'current', 'head', 'stable', 'default', '*', '']);

export function isConcreteGenerationPin(ref: string | undefined): boolean {
  const value = (ref ?? '').trim().toLowerCase();

  return value.length > 0 && !MUTABLE_ALIAS.has(value);
}

function invalid(message: string): never {
  throw new EcodeLockError(`${ECODE_LOCK_FILENAME} invalid: ${message}`, 'ECODE_LOCK_INVALID');
}

const LOCK_KEYS = new Set(['lockVersion', 'storeGeneration', 'nixpkgsRev', 'bundles']);
const BUNDLE_KEYS = new Set(['name', 'storePath', 'sha256']);

/** Strict parse — mirrors the JSON schema exactly (additionalProperties: false). */
export function parseEcodeLock(content: string): EcodeLock {
  let raw: unknown;

  try {
    raw = JSON.parse(content);
  } catch (error) {
    invalid(`not valid JSON (${(error as Error).message})`);
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    invalid('root must be an object');
  }

  const doc = raw as Record<string, unknown>;

  for (const key of Object.keys(doc)) {
    if (!LOCK_KEYS.has(key)) {
      invalid(`unknown property "${key}"`);
    }
  }

  if (doc.lockVersion !== 1) {
    invalid(`lockVersion must be 1, got ${JSON.stringify(doc.lockVersion)}`);
  }

  if (typeof doc.storeGeneration !== 'string' || doc.storeGeneration.length === 0) {
    invalid('storeGeneration must be a non-empty string');
  }

  if (typeof doc.nixpkgsRev !== 'string' || doc.nixpkgsRev.length === 0) {
    invalid('nixpkgsRev must be a non-empty string');
  }

  if (!Array.isArray(doc.bundles) || doc.bundles.length === 0) {
    invalid('bundles must be a non-empty array');
  }

  const bundles: EcodeLockBundle[] = [];
  const seen = new Set<string>();

  for (const entry of doc.bundles as Record<string, unknown>[]) {
    if (typeof entry !== 'object' || entry === null) {
      invalid('every bundle must be an object');
    }

    for (const key of Object.keys(entry)) {
      if (!BUNDLE_KEYS.has(key)) {
        invalid(`bundle has unknown property "${key}"`);
      }
    }

    const { name, storePath, sha256 } = entry as Partial<EcodeLockBundle>;

    if (typeof name !== 'string' || name.length === 0) {
      invalid('bundle.name must be a non-empty string');
    }

    if (seen.has(name)) {
      invalid(`duplicate bundle "${name}"`);
    }

    seen.add(name);

    if (typeof storePath !== 'string' || !STORE_PATH.test(storePath)) {
      invalid(`bundle "${name}": storePath must start with /nix/store/`);
    }

    if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) {
      invalid(`bundle "${name}": sha256 must be 64 hex chars`);
    }

    bundles.push({ name, storePath, sha256 });
  }

  return {
    lockVersion: 1,
    storeGeneration: doc.storeGeneration as string,
    nixpkgsRev: doc.nixpkgsRev as string,
    bundles,
  };
}

/**
 * Compose a lock from a registry generation — the ONLY legitimate writer
 * input. Bundle subset defaults to the generation's full catalog.
 */
export function buildEcodeLock(generation: NixGeneration, bundleNames?: readonly string[]): EcodeLock {
  const wanted = bundleNames && bundleNames.length > 0 ? new Set(bundleNames) : undefined;
  const bundles = generation.bundles
    .filter((bundle) => !wanted || wanted.has(bundle.name))
    .map(({ name, storePath, sha256 }) => ({ name, storePath, sha256 }));

  if (wanted) {
    for (const name of wanted) {
      if (!bundles.some((bundle) => bundle.name === name)) {
        invalid(`generation "${generation.id}" has no bundle "${name}"`);
      }
    }
  }

  if (bundles.length === 0) {
    invalid(`generation "${generation.id}" published no bundles — nothing to lock`);
  }

  return {
    lockVersion: 1,
    storeGeneration: generation.id,
    nixpkgsRev: generation.nixpkgs.rev,
    bundles: [...bundles].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Canonical bytes: fixed key order, bundles sorted by name, 2-space indent,
 * trailing newline. Same lock ⇒ same bytes ⇒ same revision sha256.
 */
export function serializeEcodeLock(lock: EcodeLock): string {
  const canonical = {
    lockVersion: lock.lockVersion,
    storeGeneration: lock.storeGeneration,
    nixpkgsRev: lock.nixpkgsRev,
    bundles: [...lock.bundles]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, storePath, sha256 }) => ({ name, storePath, sha256 })),
  };

  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/**
 * The enforcement point: a lock is only honoured when its generation exists
 * in the registry, is not REVOKED, and its nixpkgs pin matches the
 * generation's published pin. Typed failures, never a silent fallback to the
 * active generation — a lock that cannot be honoured FAILS the operation.
 */
export function assertLockAgainstRegistry(lock: EcodeLock, registry: NixGenerationRegistry): NixGeneration {
  let generation: NixGeneration;

  try {
    generation = assertNixGenerationUsable(registry, lock.storeGeneration);
  } catch (error) {
    const cause = error as { code?: string; message?: string };

    if (cause.code === 'NIX_GENERATION_REVOKED') {
      throw new EcodeLockError(
        `${ECODE_LOCK_FILENAME} pins ${cause.message}`,
        'ECODE_LOCK_GENERATION_REVOKED',
      );
    }

    throw new EcodeLockError(
      `${ECODE_LOCK_FILENAME} pins unknown store generation "${lock.storeGeneration}"`,
      'ECODE_LOCK_GENERATION_UNKNOWN',
    );
  }

  if (lock.nixpkgsRev !== generation.nixpkgs.rev) {
    throw new EcodeLockError(
      `${ECODE_LOCK_FILENAME} pins nixpkgs ${lock.nixpkgsRev} but generation "${generation.id}" published ${generation.nixpkgs.rev}`,
      'ECODE_LOCK_NIXPKGS_MISMATCH',
    );
  }

  /*
   * EXHAUSTIVE catalog binding (expert refusal v3, point 3): every locked
   * bundle must exist in the generation's SIGNED catalog with the EXACT same
   * store path AND sha256. This is what makes the lock immutable — the bytes
   * are bound to the signed generation, so a tampered path/hash, an unknown
   * bundle, or a bundle silently dropped from the catalog all fail the publish
   * instead of resolving to something the catalog never signed.
   */
  const catalogBundles = new Map(generation.bundles.map((bundle) => [bundle.name, bundle]));

  for (const locked of lock.bundles) {
    const signed = catalogBundles.get(locked.name);

    if (!signed) {
      throw new EcodeLockError(
        `${ECODE_LOCK_FILENAME} locks bundle "${locked.name}" which the signed catalog of generation "${generation.id}" does not contain`,
        'ECODE_LOCK_BUNDLE_UNKNOWN',
      );
    }

    if (locked.storePath !== signed.storePath || locked.sha256 !== signed.sha256) {
      throw new EcodeLockError(
        `${ECODE_LOCK_FILENAME} bundle "${locked.name}" does not match the signed catalog of generation "${generation.id}" ` +
          `(lock ${locked.storePath}@${locked.sha256.slice(0, 12)} vs catalog ${signed.storePath}@${signed.sha256.slice(0, 12)})`,
        'ECODE_LOCK_BUNDLE_TAMPERED',
      );
    }
  }

  return generation;
}

/**
 * Publishability gate (expert refusal v3, point 1): a lock is only publishable
 * when it pins a CONCRETE, immutable generation. A missing or mutable-alias
 * pin (active/latest/…) is refused — such a "lock" could re-resolve to a
 * different generation without any file change, which is not a pin at all.
 * Called at both write time (the platform never writes an unpinned lock) and
 * publish time (an unpinned lock, however it arrived, fails the deploy).
 */
export function assertLockPublishable(lock: EcodeLock): void {
  if (!isConcreteGenerationPin(lock.storeGeneration)) {
    throw new EcodeLockError(
      `${ECODE_LOCK_FILENAME} does not pin a concrete store generation (got "${lock.storeGeneration}") — a publishable lock must name an immutable generation, not a mutable alias`,
      'ECODE_LOCK_UNPINNED',
    );
  }
}
