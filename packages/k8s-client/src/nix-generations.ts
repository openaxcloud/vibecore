/*
 * Nix store GENERATION REGISTRY — the declarative source of truth for which
 * store generations exist, which one is ACTIVE, and which are REVOKED.
 *
 * Lifts the CTR-RUNTIME-NIX open dependency "rotation/révocation des
 * générations": until now rotation was three hand-flipped helm values
 * (nixStorePvc / nixStorePvcZones / nixGenerationHash) with no revocation
 * concept at all. The registry replaces them with ONE versioned document
 * (helm value `platformEnv.runtime.nixGenerations`, rendered to the
 * NIX_STORE_GENERATIONS env), so:
 *
 *   - ROTATION  = publish gen-N entry (status ACTIVE) + flip gen-N-1 to
 *     RETIRED in the same document → one atomic helm upgrade (configmap
 *     checksum rolls consumers). Retention: RETIRED generations stay mounted
 *     and USABLE for existing ecode.lock pins (N-1 retention is explicit in
 *     the document — delete the entry only when its disks are gone).
 *   - RÉVOCATION = status REVOKED (+ mandatory revokedAt/revokedReason) →
 *     every resolution path REFUSES the generation with a typed error, even
 *     when an ecode.lock still pins it. Revocation is for a poisoned or
 *     key-compromised generation: correctness beats reproducibility.
 *
 * Absent registry (env unset) ⇒ callers fall back to the legacy envs,
 * byte-for-byte — the same kill-switch contract as every /nix feature.
 */

export type NixGenerationStatus = 'ACTIVE' | 'RETIRED' | 'REVOKED';

export interface NixGenerationBundle {
  /** Catalog env id, e.g. "python312". */
  name: string;

  /** The buildEnv profile store path this bundle activates. */
  storePath: string;

  /** sha256 (64 hex) of the bundle manifest — copied from the signed catalog. */
  sha256: string;
}

export interface NixGeneration {
  /** Stable id, e.g. "gen-2". */
  id: string;
  status: NixGenerationStatus;

  /** sha256:<64hex> of /nix/ecode/catalog.json — the drift-guard pin. */
  catalogSha256: string;

  /** Exact pins (docs/NIX_V2_DECISION.md §0). Never floating. */
  nixVersion: string;
  nixpkgs: { channel: string; rev: string };

  /** Store signing public key (nix store sign). */
  storePublicKey?: string;

  /** zone -> ReadOnlyMany PVC of that zone's identical clone. */
  zones: Record<string, string>;

  /** Activation bundles as published in the generation's signed catalog. */
  bundles: NixGenerationBundle[];
  publishedAt: string;
  retiredAt?: string;
  revokedAt?: string;
  revokedReason?: string;
}

export interface NixGenerationRegistry {
  schemaVersion: 1;
  generations: NixGeneration[];
}

const CATALOG_HASH = /^sha256:[a-f0-9]{64}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const STORE_PATH = /^\/nix\/store\//;

export class NixGenerationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NIX_GENERATIONS_INVALID'
      | 'NIX_GENERATION_UNKNOWN'
      | 'NIX_GENERATION_REVOKED'
      | 'NIX_GENERATION_NONE_ACTIVE',
  ) {
    super(message);
    this.name = 'NixGenerationError';
  }
}

function invalid(message: string): never {
  throw new NixGenerationError(`nix generation registry invalid: ${message}`, 'NIX_GENERATIONS_INVALID');
}

/**
 * Parse + validate the registry document (JSON text of NIX_STORE_GENERATIONS).
 * Every structural invariant of the rotation contract is enforced HERE, at the
 * single entry point, so no consumer can observe a half-valid registry:
 *
 *   - schemaVersion 1, unique generation ids
 *   - AT MOST one ACTIVE generation (zero = store disabled via registry)
 *   - every generation: drift-guard hash format, non-empty zone map, pins
 *   - REVOKED requires revokedAt + revokedReason (an unexplained revocation
 *     is an operator error, not a state)
 *   - RETIRED requires retiredAt
 */
export function parseNixGenerationRegistry(content: string): NixGenerationRegistry {
  let raw: unknown;

  try {
    raw = JSON.parse(content);
  } catch (error) {
    invalid(`not valid JSON (${(error as Error).message})`);
  }

  const doc = raw as Partial<NixGenerationRegistry>;

  if (doc?.schemaVersion !== 1) {
    invalid(`schemaVersion must be 1, got ${JSON.stringify(doc?.schemaVersion)}`);
  }

  if (!Array.isArray(doc.generations) || doc.generations.length === 0) {
    invalid('generations must be a non-empty array');
  }

  const ids = new Set<string>();
  let activeCount = 0;

  for (const gen of doc.generations as NixGeneration[]) {
    if (!gen.id || typeof gen.id !== 'string') {
      invalid('every generation needs a string id');
    }

    if (ids.has(gen.id)) {
      invalid(`duplicate generation id "${gen.id}"`);
    }

    ids.add(gen.id);

    if (gen.status !== 'ACTIVE' && gen.status !== 'RETIRED' && gen.status !== 'REVOKED') {
      invalid(`"${gen.id}": status must be ACTIVE|RETIRED|REVOKED, got ${JSON.stringify(gen.status)}`);
    }

    if (!CATALOG_HASH.test(gen.catalogSha256 ?? '')) {
      invalid(`"${gen.id}": catalogSha256 must match sha256:<64 hex>`);
    }

    if (!gen.nixVersion || !gen.nixpkgs?.channel || !gen.nixpkgs?.rev) {
      invalid(`"${gen.id}": nixVersion and nixpkgs.channel/rev pins are mandatory (no floating labels)`);
    }

    if (!gen.zones || typeof gen.zones !== 'object' || Object.keys(gen.zones).length === 0) {
      invalid(`"${gen.id}": zones must map at least one zone to a PVC`);
    }

    if (!Array.isArray(gen.bundles)) {
      invalid(`"${gen.id}": bundles must be an array (may be empty only for a legacy import)`);
    }

    for (const bundle of gen.bundles) {
      if (!bundle.name || !STORE_PATH.test(bundle.storePath ?? '') || !SHA256_HEX.test(bundle.sha256 ?? '')) {
        invalid(`"${gen.id}": bundle "${bundle?.name ?? '?'}" needs name + /nix/store path + sha256 hex`);
      }
    }

    if (!gen.publishedAt) {
      invalid(`"${gen.id}": publishedAt is mandatory (atomic publication is part of the contract)`);
    }

    if (gen.status === 'ACTIVE') {
      activeCount += 1;
    }

    if (gen.status === 'REVOKED' && (!gen.revokedAt || !gen.revokedReason)) {
      invalid(`"${gen.id}": REVOKED requires revokedAt AND revokedReason`);
    }

    if (gen.status === 'RETIRED' && !gen.retiredAt) {
      invalid(`"${gen.id}": RETIRED requires retiredAt`);
    }
  }

  if (activeCount > 1) {
    invalid(`exactly one generation may be ACTIVE, found ${activeCount}`);
  }

  return { schemaVersion: 1, generations: doc.generations as NixGeneration[] };
}

/** The single ACTIVE generation, or undefined (registry-level kill switch). */
export function activeNixGeneration(registry: NixGenerationRegistry): NixGeneration | undefined {
  return registry.generations.find((gen) => gen.status === 'ACTIVE');
}

/** Find by id (`gen-2`) or drift-guard hash (`sha256:…`). */
export function findNixGeneration(registry: NixGenerationRegistry, ref: string): NixGeneration | undefined {
  return registry.generations.find((gen) => gen.id === ref || gen.catalogSha256 === ref);
}

/**
 * The revocation gate. UNKNOWN and REVOKED both throw typed errors — never a
 * silent fallback to another generation. RETIRED resolves normally: retention
 * keeps existing ecode.lock pins working until the entry itself is removed.
 */
export function assertNixGenerationUsable(registry: NixGenerationRegistry, ref: string): NixGeneration {
  const gen = findNixGeneration(registry, ref);

  if (!gen) {
    throw new NixGenerationError(
      `nix store generation "${ref}" is not in the generation registry`,
      'NIX_GENERATION_UNKNOWN',
    );
  }

  if (gen.status === 'REVOKED') {
    throw new NixGenerationError(
      `nix store generation "${gen.id}" is REVOKED (${gen.revokedAt}: ${gen.revokedReason}) — refusing to use it`,
      'NIX_GENERATION_REVOKED',
    );
  }

  return gen;
}

/**
 * Read the registry from the environment (NIX_STORE_GENERATIONS). Absent/empty
 * ⇒ undefined (legacy env behaviour, kill-switch contract). Invalid content
 * THROWS — a malformed registry must fail loudly, not degrade silently.
 */
export function nixGenerationRegistryFromEnv(
  env: Record<string, string | undefined> = process.env,
): NixGenerationRegistry | undefined {
  const content = env.NIX_STORE_GENERATIONS?.trim();

  return content ? parseNixGenerationRegistry(content) : undefined;
}
