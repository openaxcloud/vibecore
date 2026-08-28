import { createHash } from 'node:crypto';

import { decryptJson, encryptJson } from '@vibecore/security';
import { z } from 'zod';

import { isCommittedPromotionForTenant } from './server-image-promotion.js';
import type { ReleasePlanEntitlementsPin } from './store.js';

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const PROJECT_MANIFEST_DIGEST = SHA256;
const KEY_ID = /^[A-Za-z0-9._:-]{1,64}$/u;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;
const RELEASE_ENVIRONMENTS = ['preview', 'staging', 'production'] as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('ROLLBACK_MANIFEST_NON_FINITE_NUMBER');
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  if (!value || typeof value !== 'object') throw new TypeError('ROLLBACK_MANIFEST_UNSUPPORTED_VALUE');

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function rollbackManifestDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export class DeterministicRollbackError extends Error {
  readonly statusCode = 409;

  constructor(readonly code: string) {
    super(code);
    this.name = 'DeterministicRollbackError';
  }
}

export interface RollbackManifestKeyring {
  currentId: string;
  keys: ReadonlyMap<string, string>;
}

const ROLLBACK_MANIFEST_DEV_KEY = 'dev-rollback-manifest-key-change-me';
const CONFIG_ENCRYPTION_DEV_KEY = 'dev-config-encryption-key-change-me';

function invalidRollbackManifestKeyring(): never {
  throw new DeterministicRollbackError('ROLLBACK_MANIFEST_KEYRING_INVALID');
}

/**
 * Durable encrypted rollback payloads use an explicit key id. Operators may
 * rotate the writer key while retaining old reader keys in
 * ROLLBACK_MANIFEST_DECRYPTION_KEYS_JSON. CONFIG_ENCRYPTION_KEY remains the
 * rollout-compatible current-key source when a dedicated key is not configured.
 */
export function rollbackManifestKeyring(options: { production?: boolean } = {}): RollbackManifestKeyring {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const dedicatedSecret = process.env.ROLLBACK_MANIFEST_ENCRYPTION_KEY;
  const configuredSecret = dedicatedSecret?.length ? dedicatedSecret : process.env.CONFIG_ENCRYPTION_KEY;
  const currentSecret = configuredSecret?.length ? configuredSecret : ROLLBACK_MANIFEST_DEV_KEY;

  if (
    production &&
    (!configuredSecret ||
      currentSecret.length < 32 ||
      currentSecret === ROLLBACK_MANIFEST_DEV_KEY ||
      currentSecret === CONFIG_ENCRYPTION_DEV_KEY)
  ) {
    invalidRollbackManifestKeyring();
  }

  const currentId =
    process.env.ROLLBACK_MANIFEST_ENCRYPTION_KEY_ID?.trim() ||
    `config-${createHash('sha256').update(currentSecret, 'utf8').digest('hex').slice(0, 20)}`;

  if (!KEY_ID.test(currentId)) invalidRollbackManifestKeyring();

  if (production && currentSecret.length < 32) {
    invalidRollbackManifestKeyring();
  }

  const keys = new Map<string, string>([[currentId, currentSecret]]);
  const previous = process.env.ROLLBACK_MANIFEST_DECRYPTION_KEYS_JSON?.trim();

  if (previous) {
    try {
      const parsed = JSON.parse(previous) as unknown;

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalidRollbackManifestKeyring();

      for (const [keyId, secret] of Object.entries(parsed as Record<string, unknown>)) {
        if (!KEY_ID.test(keyId) || typeof secret !== 'string' || secret.length < 32) {
          invalidRollbackManifestKeyring();
        }
        if (keyId === currentId && secret !== currentSecret) {
          invalidRollbackManifestKeyring();
        }
        if (!keys.has(keyId)) keys.set(keyId, secret);
      }
    } catch {
      invalidRollbackManifestKeyring();
    }
  }

  return { currentId, keys };
}

const encryptedEnvironmentSchema = z
  .object({
    keyId: z.string().regex(KEY_ID),
    ciphertext: z.string().regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),
    digest: z.string().regex(SHA256),
  })
  .strict();

const databasePinSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('exact-ledger'), ledgerDigest: z.string().regex(SHA256) }).strict(),
]);

const runtimeSpecBodySchema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: z.string().min(1).max(191),
    projectId: z.string().min(1).max(191),
    environment: z.enum(RELEASE_ENVIRONMENTS),
    projectManifestDigest: z.string().regex(PROJECT_MANIFEST_DIGEST),
    plan: z
      .object({
        key: z.string().min(1).max(64),
        entitlementsDigest: z.string().regex(SHA256),
      })
      .strict(),
    accessPolicyVersion: z.number().int().positive(),
    machine: z
      .object({
        key: z.string().min(1).max(64),
        rateCardVersion: z.number().int().positive(),
        cpuMillicores: z.number().int().positive(),
        memoryMb: z.number().int().positive(),
      })
      .strict(),
    port: z.number().int().min(1).max(65_535),
    healthPath: z.string().regex(/^\/(?!\/)[^\s?#]{0,1023}$/u),
    envOverrides: encryptedEnvironmentSchema,
    secretPolicy: z.enum(['CURRENT', 'PINNED']),
    database: databasePinSchema,
  })
  .strict();

const runtimeSpecSchema = runtimeSpecBodySchema.extend({ hash: z.string().regex(SHA256) }).strict();

const promotionEvidenceBodySchema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: z.string().min(1).max(191),
    projectId: z.string().min(1).max(191),
    artifactRef: z.string().min(1).max(1024),
    artifactDigest: z.string().regex(SHA256),
    promotion: z.record(z.string(), z.unknown()),
  })
  .strict();

const promotionEvidenceSchema = promotionEvidenceBodySchema.extend({ hash: z.string().regex(SHA256) }).strict();

const staticRollbackRoutingEvidenceBodySchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('static-rollback-routing'),
    projectId: z.string().min(1).max(191),
    environment: z.enum(RELEASE_ENVIRONMENTS),
    sourceManifestId: z.string().min(1).max(191),
    sourceManifestVersion: z.number().int().positive(),
    sourceDeploymentId: z.string().min(1).max(191),
    artifactRef: z.string().regex(/^static-artifacts\/sha256\/[a-f0-9]{64}$/u),
    artifactDigest: z.string().regex(SHA256),
  })
  .strict();

const staticRollbackRoutingEvidenceSchema = staticRollbackRoutingEvidenceBodySchema
  .extend({ hash: z.string().regex(SHA256) })
  .strict();

export type ServerRollbackRuntimeSpecV1 = z.infer<typeof runtimeSpecSchema>;

/**
 * Independent commit authority for the machine tuple. Never use the active or
 * default size: the exact historical card version and exact key must exist.
 */
export function serverRollbackMachineMatchesRateCard(
  machine: ServerRollbackRuntimeSpecV1['machine'],
  rateCard: unknown,
): boolean {
  if (!rateCard || typeof rateCard !== 'object' || Array.isArray(rateCard)) return false;
  const candidate = rateCard as { version?: unknown; machineSizes?: unknown };
  if (candidate.version !== machine.rateCardVersion || !Array.isArray(candidate.machineSizes)) return false;
  const exact = candidate.machineSizes.find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry) && entry.key === machine.key,
  );
  return (
    exact?.cpuMillicores === machine.cpuMillicores &&
    exact?.ramMb === machine.memoryMb &&
    Number.isSafeInteger(exact.cpuMillicores) &&
    Number.isSafeInteger(exact.ramMb)
  );
}
export type ServerRollbackPromotionEvidenceV1 = z.infer<typeof promotionEvidenceSchema>;
export type ServerRollbackDatabasePin = z.infer<typeof databasePinSchema>;
export type StaticRollbackRoutingEvidenceV1 = z.infer<typeof staticRollbackRoutingEvidenceSchema>;

/** Canonical hash of the exact immutable outer ReleaseManifest policy pin. */
export function rollbackPlanEntitlementsDigest(input: ReleasePlanEntitlementsPin): string {
  return rollbackManifestDigest(input);
}

function assertEnvironmentOverrides(value: Record<string, string>): void {
  for (const [key, entry] of Object.entries(value)) {
    if (!ENV_KEY.test(key) || typeof entry !== 'string') {
      throw new DeterministicRollbackError('ROLLBACK_RUNTIME_SPEC_ENV_INVALID');
    }
  }
}

export function buildServerRollbackRuntimeSpec(input: {
  organizationId: string;
  projectId: string;
  environment: (typeof RELEASE_ENVIRONMENTS)[number];
  projectManifestDigest: string;
  planEntitlements: ReleasePlanEntitlementsPin;
  accessPolicyVersion: number;
  machine: { key: string; rateCardVersion: number; cpuMillicores: number; memoryMb: number };
  port: number;
  healthPath: string;
  envOverrides: Record<string, string>;
  database: ServerRollbackDatabasePin;
  keyring?: RollbackManifestKeyring;
}): ServerRollbackRuntimeSpecV1 {
  assertEnvironmentOverrides(input.envOverrides);
  const keyring = input.keyring ?? rollbackManifestKeyring();
  const secret = keyring.keys.get(keyring.currentId);

  if (!secret) throw new DeterministicRollbackError('ROLLBACK_MANIFEST_KEYRING_INVALID');

  const ciphertext = encryptJson({ envOverrides: input.envOverrides }, secret);
  const body = runtimeSpecBodySchema.parse({
    schemaVersion: 1,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.environment,
    projectManifestDigest: input.projectManifestDigest,
    plan: {
      key: input.planEntitlements.plan,
      entitlementsDigest: rollbackPlanEntitlementsDigest(input.planEntitlements),
    },
    accessPolicyVersion: input.accessPolicyVersion,
    machine: input.machine,
    port: input.port,
    healthPath: input.healthPath,
    envOverrides: {
      keyId: keyring.currentId,
      ciphertext,
      digest: rollbackManifestDigest(ciphertext),
    },
    secretPolicy: 'CURRENT',
    database: input.database,
  });

  return runtimeSpecSchema.parse({ ...body, hash: rollbackManifestDigest(body) });
}

export function parseServerRollbackRuntimeSpec(
  value: unknown,
  keyring: RollbackManifestKeyring = rollbackManifestKeyring(),
): { spec: ServerRollbackRuntimeSpecV1; envOverrides: Record<string, string> } {
  const parsed = runtimeSpecSchema.safeParse(value);

  if (!parsed.success) throw new DeterministicRollbackError('ROLLBACK_RUNTIME_SPEC_INVALID');

  const { hash, ...body } = parsed.data;

  if (rollbackManifestDigest(body) !== hash) {
    throw new DeterministicRollbackError('ROLLBACK_RUNTIME_SPEC_TAMPERED');
  }

  if (rollbackManifestDigest(parsed.data.envOverrides.ciphertext) !== parsed.data.envOverrides.digest) {
    throw new DeterministicRollbackError('ROLLBACK_RUNTIME_SPEC_ENV_TAMPERED');
  }

  const secret = keyring.keys.get(parsed.data.envOverrides.keyId);

  if (!secret) throw new DeterministicRollbackError('ROLLBACK_RUNTIME_SPEC_KEY_UNAVAILABLE');

  try {
    const decrypted = decryptJson<{ envOverrides?: unknown }>(parsed.data.envOverrides.ciphertext, secret);
    const envOverrides = z.record(z.string(), z.string()).parse(decrypted.envOverrides);
    assertEnvironmentOverrides(envOverrides);
    return { spec: parsed.data, envOverrides };
  } catch (error) {
    if (error instanceof DeterministicRollbackError) throw error;
    throw new DeterministicRollbackError('ROLLBACK_RUNTIME_SPEC_ENV_DECRYPTION_FAILED');
  }
}

/**
 * A READY deployment access-policy change is itself a release. Rebind only the
 * access-policy pin while preserving every other immutable runtime field and
 * the exact encrypted environment reference. The source must still decrypt and
 * hash-verify, and v1 never turns an unsupported PINNED policy into CURRENT.
 */
export function rebindServerRollbackRuntimeSpecAccessPolicy(
  value: unknown,
  accessPolicyVersion: number,
  database: ServerRollbackDatabasePin,
  keyring: RollbackManifestKeyring = rollbackManifestKeyring(),
): ServerRollbackRuntimeSpecV1 {
  const { spec } = parseServerRollbackRuntimeSpec(value, keyring);

  if (spec.secretPolicy !== 'CURRENT') {
    throw new DeterministicRollbackError('ROLLBACK_SECRET_POLICY_UNSATISFIABLE');
  }

  const { hash: _hash, ...body } = spec;
  const rebound = runtimeSpecBodySchema.parse({ ...body, accessPolicyVersion, database });

  return runtimeSpecSchema.parse({ ...rebound, hash: rollbackManifestDigest(rebound) });
}

export function buildServerRollbackPromotionEvidence(input: {
  organizationId: string;
  projectId: string;
  artifactRef: string;
  artifactDigest: string;
  promotion: unknown;
}): ServerRollbackPromotionEvidenceV1 {
  if (!isCommittedPromotionForTenant(input.promotion, input.organizationId, input.artifactDigest, input.artifactRef)) {
    throw new DeterministicRollbackError('ROLLBACK_PROMOTION_EVIDENCE_INVALID');
  }

  const body = promotionEvidenceBodySchema.parse({
    schemaVersion: 1,
    organizationId: input.organizationId,
    projectId: input.projectId,
    artifactRef: input.artifactRef,
    artifactDigest: input.artifactDigest,
    promotion: input.promotion,
  });

  return promotionEvidenceSchema.parse({ ...body, hash: rollbackManifestDigest(body) });
}

export function parseServerRollbackPromotionEvidence(value: unknown): ServerRollbackPromotionEvidenceV1 {
  const parsed = promotionEvidenceSchema.safeParse(value);

  if (!parsed.success) throw new DeterministicRollbackError('ROLLBACK_PROMOTION_EVIDENCE_INVALID');

  const { hash, ...body } = parsed.data;

  if (rollbackManifestDigest(body) !== hash) {
    throw new DeterministicRollbackError('ROLLBACK_PROMOTION_EVIDENCE_TAMPERED');
  }

  if (
    !isCommittedPromotionForTenant(
      parsed.data.promotion,
      parsed.data.organizationId,
      parsed.data.artifactDigest,
      parsed.data.artifactRef,
    )
  ) {
    throw new DeterministicRollbackError('ROLLBACK_PROMOTION_EVIDENCE_INVALID');
  }

  return parsed.data;
}

/**
 * Immutable edge proof for a static rollback alias. It lets the serving route
 * validate a chain even after an intermediate Deployment row is pruned; the
 * append-only ReleaseManifest remains the authority for the exact source edge.
 */
export function buildStaticRollbackRoutingEvidence(input: {
  projectId: string;
  environment: (typeof RELEASE_ENVIRONMENTS)[number];
  sourceManifestId: string;
  sourceManifestVersion: number;
  sourceDeploymentId: string;
  artifactRef: string;
  artifactDigest: string;
}): StaticRollbackRoutingEvidenceV1 {
  const body = staticRollbackRoutingEvidenceBodySchema.parse({
    schemaVersion: 1,
    kind: 'static-rollback-routing',
    ...input,
  });

  return staticRollbackRoutingEvidenceSchema.parse({ ...body, hash: rollbackManifestDigest(body) });
}

export function parseStaticRollbackRoutingEvidence(value: unknown): StaticRollbackRoutingEvidenceV1 {
  const parsed = staticRollbackRoutingEvidenceSchema.safeParse(value);

  if (!parsed.success) throw new DeterministicRollbackError('ROLLBACK_STATIC_ROUTING_EVIDENCE_INVALID');

  const { hash, ...body } = parsed.data;
  if (rollbackManifestDigest(body) !== hash) {
    throw new DeterministicRollbackError('ROLLBACK_STATIC_ROUTING_EVIDENCE_TAMPERED');
  }

  return parsed.data;
}

/**
 * Transaction-bound validation used when READY and ReleaseManifest are
 * committed together. This proves that the two opaque JSON envelopes describe
 * the exact tenant, artifact, runtime, access policy, database ledger and
 * promotion being persisted; callers must run it inside their write
 * transaction after locking the Deployment.
 */
export function validateServerReleaseCommitPins(input: {
  runtimeSpec: unknown;
  promotionEvidence: unknown;
  organizationId: string;
  projectId: string;
  /** Outer database value; the parsed runtime envelope remains the strict enum authority. */
  environment: string;
  projectManifestDigest: string;
  planEntitlements: ReleasePlanEntitlementsPin;
  accessPolicyVersion: number;
  machineKey: string;
  artifactRef: string;
  artifactDigest: string;
  dbMigrationPoint?: string;
  promotion: unknown;
  keyring?: RollbackManifestKeyring;
}): {
  runtimeSpec: ServerRollbackRuntimeSpecV1;
  promotionEvidence: ServerRollbackPromotionEvidenceV1;
  envOverrides: Record<string, string>;
} {
  const runtime = parseServerRollbackRuntimeSpec(input.runtimeSpec, input.keyring);
  const promotion = parseServerRollbackPromotionEvidence(input.promotionEvidence);
  const expectedPromotion = buildServerRollbackPromotionEvidence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    artifactRef: input.artifactRef,
    artifactDigest: input.artifactDigest,
    promotion: input.promotion,
  });

  if (runtime.spec.secretPolicy !== 'CURRENT') {
    throw new DeterministicRollbackError('ROLLBACK_SECRET_POLICY_UNSATISFIABLE');
  }

  if (
    runtime.spec.organizationId !== input.organizationId ||
    runtime.spec.projectId !== input.projectId ||
    runtime.spec.environment !== input.environment ||
    runtime.spec.projectManifestDigest !== input.projectManifestDigest ||
    runtime.spec.plan.key !== input.planEntitlements.plan ||
    runtime.spec.plan.entitlementsDigest !== rollbackPlanEntitlementsDigest(input.planEntitlements) ||
    runtime.spec.accessPolicyVersion !== input.accessPolicyVersion ||
    runtime.spec.machine.key !== input.machineKey ||
    (runtime.spec.database.mode === 'none'
      ? input.dbMigrationPoint !== undefined
      : input.dbMigrationPoint !== runtime.spec.database.ledgerDigest) ||
    promotion.organizationId !== input.organizationId ||
    promotion.projectId !== input.projectId ||
    promotion.artifactRef !== input.artifactRef ||
    promotion.artifactDigest !== input.artifactDigest ||
    promotion.hash !== expectedPromotion.hash
  ) {
    throw new DeterministicRollbackError('ROLLBACK_MANIFEST_PIN_MISMATCH');
  }

  return {
    runtimeSpec: runtime.spec,
    promotionEvidence: promotion,
    envOverrides: runtime.envOverrides,
  };
}

/**
 * In-place Reserved publish changes only the environment and its independently
 * inspected database pin. Every other runtime pin, including the decrypted env
 * overrides, must remain byte-equivalent to the source release contract.
 */
export function sameServerRollbackRuntimePinsForPublish(
  source: { runtimeSpec: ServerRollbackRuntimeSpecV1; envOverrides: Record<string, string> },
  published: { runtimeSpec: ServerRollbackRuntimeSpecV1; envOverrides: Record<string, string> },
): boolean {
  const {
    database: _sourceDatabase,
    environment: _sourceEnvironment,
    envOverrides: _sourceEncryptedEnv,
    hash: _sourceHash,
    ...sourceRuntime
  } = source.runtimeSpec;
  const {
    database: _publishedDatabase,
    environment: _publishedEnvironment,
    envOverrides: _publishedEncryptedEnv,
    hash: _publishedHash,
    ...publishedRuntime
  } = published.runtimeSpec;

  return (
    rollbackManifestDigest(sourceRuntime) === rollbackManifestDigest(publishedRuntime) &&
    rollbackManifestDigest(source.envOverrides) === rollbackManifestDigest(published.envOverrides)
  );
}

export function validateServerRollbackManifestPins(input: {
  runtimeSpec: unknown;
  promotionEvidence: unknown;
  organizationId: string;
  projectId: string;
  /** Outer database value; unknown/legacy values fail the exact comparison below. */
  environment: string;
  projectManifestDigest: string;
  planEntitlements: ReleasePlanEntitlementsPin;
  accessPolicyVersion: number;
  artifactRef: string;
  artifactDigest: string;
  keyring?: RollbackManifestKeyring;
}): {
  runtimeSpec: ServerRollbackRuntimeSpecV1;
  promotionEvidence: ServerRollbackPromotionEvidenceV1;
  envOverrides: Record<string, string>;
} {
  const runtime = parseServerRollbackRuntimeSpec(input.runtimeSpec, input.keyring);
  const promotion = parseServerRollbackPromotionEvidence(input.promotionEvidence);

  if (runtime.spec.secretPolicy !== 'CURRENT') {
    throw new DeterministicRollbackError('ROLLBACK_SECRET_POLICY_UNSATISFIABLE');
  }

  if (
    runtime.spec.organizationId !== input.organizationId ||
    runtime.spec.projectId !== input.projectId ||
    runtime.spec.environment !== input.environment ||
    runtime.spec.projectManifestDigest !== input.projectManifestDigest ||
    runtime.spec.plan.key !== input.planEntitlements.plan ||
    runtime.spec.plan.entitlementsDigest !== rollbackPlanEntitlementsDigest(input.planEntitlements) ||
    runtime.spec.accessPolicyVersion !== input.accessPolicyVersion ||
    promotion.organizationId !== input.organizationId ||
    promotion.projectId !== input.projectId ||
    promotion.artifactRef !== input.artifactRef ||
    promotion.artifactDigest !== input.artifactDigest
  ) {
    throw new DeterministicRollbackError('ROLLBACK_MANIFEST_PIN_MISMATCH');
  }

  return {
    runtimeSpec: runtime.spec,
    promotionEvidence: promotion,
    envOverrides: runtime.envOverrides,
  };
}
