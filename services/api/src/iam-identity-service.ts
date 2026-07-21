/*
 * Platform IAM identities (DOMAIN_MODEL.md §4). THREE identities, not one per
 * revision:
 *
 *  - BuildIdentity      `platform-build`, isolated, NO runtime access.
 *  - PromotionIdentity  control plane, promotes by digest, short-lived
 *                       impersonation only.
 *  - RuntimeIdentity    per app × environment × privilege boundary, REUSED by
 *                       every revision of that app (I-IAM-1).
 *
 * I-IAM-2: zero persistent keys. The GcpCloudClient interface has NO
 * key-creation method, and ensure* re-counts USER_MANAGED keys on every call —
 * a key that appears out-of-band flips the identity into violation.
 * I-IAM-3: build cannot promote, promotion cannot build — verifiable from the
 * project IAM policy (verifyIdentitySeparation).
 */

import { createHash } from 'node:crypto';
import type {
  CloudGovernanceStore,
  PlatformIamIdentity,
  PlatformIamIdentityBoundary,
} from './cloud-governance-store.js';
import { CloudTenantError } from './cloud-tenant-service.js';
import { GcpApiError, type GcpCloudClient } from './gcp-cloud-client.js';

/** Impersonation tokens are short-lived by contract; 1h is the hard cap. */
export const MAX_IMPERSONATION_LIFETIME_SECONDS = 3600;

/** Revocation SLO: a revoked identity must be inert within this budget.
 *  (Live-measured 2026-07-17: full owner-transfer revocation observed
 *  effective in 215 s — inside the 300 s budget.) */
export const REVOCATION_SLO_SECONDS = 300;

export class IamInvariantViolation extends CloudTenantError {
  constructor(code: string, message: string) {
    super(code, message, 409);
    this.name = 'IamInvariantViolation';
  }
}

/**
 * Deterministic service-account id for a boundary (≤30 chars, starts with a
 * letter). Deterministic so a lost DB row can never mint a SECOND identity
 * for the same boundary — the create call would 409 and the existing SA is
 * adopted instead.
 */
export function serviceAccountIdForBoundary(boundary: PlatformIamIdentityBoundary): string {
  const prefix = boundary.kind === 'BUILD' ? 'bld' : boundary.kind === 'PROMOTION' ? 'prm' : 'rt';
  const digest = createHash('sha256')
    .update(`${boundary.kind}|${boundary.app}|${boundary.environment}|${boundary.privilegeBoundary}`)
    .digest('hex')
    .slice(0, 12);
  const slug = (boundary.app || boundary.privilegeBoundary)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30 - prefix.length - digest.length - 2);

  return `${prefix}-${slug ? `${slug}-` : ''}${digest}`.slice(0, 30).replace(/-+$/, '');
}

export interface EnsureIdentityResult {
  identity: PlatformIamIdentity;

  /** false = the identity was REUSED (the normal case for revisions 2..n). */
  created: boolean;
}

async function countUserManagedKeys(gcp: GcpCloudClient, gcpProjectId: string, email: string): Promise<number> {
  const keys = await gcp.listServiceAccountKeys(gcpProjectId, email);

  return keys.filter((k) => k.keyType === 'USER_MANAGED').length;
}

async function ensureIdentity(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  boundary: PlatformIamIdentityBoundary,
): Promise<EnsureIdentityResult> {
  const existing = await store.findPlatformIamIdentity(boundary);

  if (existing) {
    const persistentKeys = await countUserManagedKeys(gcp, boundary.gcpProjectId, existing.gcpServiceAccountEmail);
    const identity = await store.updatePlatformIamIdentity(existing.id, {
      revisionsServed: existing.revisionsServed + 1,
      lastUsedAt: new Date(),
      persistentKeys,
    });

    if (persistentKeys > 0) {
      throw new IamInvariantViolation(
        'IAM_PERSISTENT_KEY_FORBIDDEN',
        `${existing.gcpServiceAccountEmail} carries ${persistentKeys} user-managed key(s) — zero persistent keys is the contract (I-IAM-2)`,
      );
    }

    return { identity, created: false };
  }

  const accountId = serviceAccountIdForBoundary(boundary);
  let email: string;

  try {
    const created = await gcp.createServiceAccount(
      boundary.gcpProjectId,
      accountId,
      `${boundary.kind} ${boundary.app || boundary.privilegeBoundary} (${boundary.environment || 'platform'})`,
    );
    email = created.email;
  } catch (error) {
    if (error instanceof GcpApiError && error.isAlreadyExists) {
      // DB row was lost but the SA exists (deterministic id) — adopt it.
      email = `${accountId}@${boundary.gcpProjectId}.iam.gserviceaccount.com`;
    } else {
      throw error;
    }
  }

  const identity = await store.createPlatformIamIdentity({ ...boundary, gcpServiceAccountEmail: email });
  const updated = await store.updatePlatformIamIdentity(identity.id, {
    revisionsServed: 1,
    lastUsedAt: new Date(),
  });

  return { identity: updated, created: true };
}

/**
 * Acquire the RuntimeIdentity for app × environment × privilege boundary.
 * Called once per DEPLOYMENT/REVISION — and that is exactly why it must NOT
 * create anything after the first call: revisions REUSE the identity
 * (I-IAM-1). `revisionsServed` counts the reuses as an auditable fact.
 */
export async function ensureRuntimeIdentity(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  input: { app: string; environment: string; privilegeBoundary: string; gcpProjectId: string },
): Promise<EnsureIdentityResult> {
  if (!input.app || !input.environment || !input.privilegeBoundary) {
    throw new CloudTenantError(
      'IAM_BOUNDARY_INCOMPLETE',
      'RuntimeIdentity requires app, environment and privilegeBoundary — an identity per deployment/revision is forbidden (I-IAM-1)',
    );
  }

  return ensureIdentity(store, gcp, { kind: 'RUNTIME', ...input });
}

/** BuildIdentity: platform-build, isolated from runtime. One per project. */
export function ensureBuildIdentity(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  gcpProjectId: string,
): Promise<EnsureIdentityResult> {
  return ensureIdentity(store, gcp, {
    kind: 'BUILD',
    app: '',
    environment: '',
    privilegeBoundary: 'platform-build',
    gcpProjectId,
  });
}

/** PromotionIdentity: control plane, promotes by digest. One per project. */
export function ensurePromotionIdentity(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  gcpProjectId: string,
): Promise<EnsureIdentityResult> {
  return ensureIdentity(store, gcp, {
    kind: 'PROMOTION',
    app: '',
    environment: '',
    privilegeBoundary: 'platform-promotion',
    gcpProjectId,
  });
}

/**
 * Record a short-lived impersonation (audit trail, I-IAM-2). Lifetimes beyond
 * the 1h cap are refused — persistent access is what keys were, and keys are
 * forbidden.
 */
export async function recordImpersonation(
  store: CloudGovernanceStore,
  input: {
    identityId: string;
    actorPrincipal: string;
    purpose: string;
    tokenLifetimeSeconds: number;
  },
): Promise<void> {
  if (input.tokenLifetimeSeconds <= 0 || input.tokenLifetimeSeconds > MAX_IMPERSONATION_LIFETIME_SECONDS) {
    throw new IamInvariantViolation(
      'IAM_IMPERSONATION_LIFETIME',
      `Impersonation lifetime must be 1..${MAX_IMPERSONATION_LIFETIME_SECONDS}s`,
    );
  }

  await store.recordImpersonation(input);
}

/** Roles that make an identity able to PROMOTE (deploy/route traffic). */
const PROMOTE_CAPABLE_ROLES = new Set([
  'roles/run.admin',
  'roles/run.developer',
  'roles/container.admin',
  'roles/container.developer',
  'roles/appengine.deployer',
]);

/** Roles that make an identity able to BUILD (produce artifacts). */
const BUILD_CAPABLE_ROLES = new Set([
  'roles/cloudbuild.builds.editor',
  'roles/cloudbuild.builds.builder',
  'roles/artifactregistry.writer',
  'roles/artifactregistry.admin',
]);

export interface SeparationViolation {
  identity: string;
  kind: string;
  role: string;
  reason: string;
}

/**
 * I-IAM-3 checker: reads the LIVE project IAM policy and reports every role
 * that crosses the build/promotion separation. Empty result = separation
 * holds and is verifiable, which is the contract's requirement.
 */
export async function verifyIdentitySeparation(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  gcpProjectId: string,
): Promise<SeparationViolation[]> {
  const identities = await store.listPlatformIamIdentities({ gcpProjectId });
  const policy = await gcp.getProjectIamPolicy(gcpProjectId);
  const violations: SeparationViolation[] = [];

  for (const identity of identities) {
    const member = `serviceAccount:${identity.gcpServiceAccountEmail}`;
    const heldRoles = (policy.bindings ?? []).filter((b) => b.members?.includes(member)).map((b) => b.role);

    for (const role of heldRoles) {
      if (identity.kind === 'BUILD' && PROMOTE_CAPABLE_ROLES.has(role)) {
        violations.push({
          identity: identity.gcpServiceAccountEmail,
          kind: identity.kind,
          role,
          reason: 'BuildIdentity must not be able to promote (I-IAM-3)',
        });
      }

      if (identity.kind === 'PROMOTION' && BUILD_CAPABLE_ROLES.has(role)) {
        violations.push({
          identity: identity.gcpServiceAccountEmail,
          kind: identity.kind,
          role,
          reason: 'PromotionIdentity must not be able to build (I-IAM-3)',
        });
      }
    }
  }

  return violations;
}

/**
 * Sweep every recorded identity of a project for out-of-band persistent keys
 * (I-IAM-2 drift detector). Returns the identities found in violation.
 */
export async function auditPersistentKeys(
  store: CloudGovernanceStore,
  gcp: GcpCloudClient,
  gcpProjectId: string,
): Promise<PlatformIamIdentity[]> {
  const identities = await store.listPlatformIamIdentities({ gcpProjectId });
  const violating: PlatformIamIdentity[] = [];

  for (const identity of identities) {
    const persistentKeys = await countUserManagedKeys(gcp, gcpProjectId, identity.gcpServiceAccountEmail);
    const updated = await store.updatePlatformIamIdentity(identity.id, { persistentKeys });

    if (persistentKeys > 0) {
      violating.push(updated);
    }
  }

  return violating;
}
