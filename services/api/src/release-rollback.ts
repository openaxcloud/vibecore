/**
 * Server-deploy rollback FROM A RETAINED IMAGE DIGEST (audit v4 — rollback vertical).
 *
 * MEASURED GAP this module closes: today the server-deploy rollback handler
 * (`POST /projects/:id/deployments/:id/rollback` for provider='server') copies
 * the previous deployment's URL/metadata into a new READY row and re-deploys
 * NOTHING. If the underlying image/revision is gone, the "rolled-back" URL is
 * dead. There is no ReleaseCatalog and no image digest persisted — so the
 * contract's promise (I-REL-1: "the catalog is sufficient to re-deploy even if
 * the runtime revision disappeared") is unmet for server deploys.
 *
 * This module is the pure core of the fix: a release retains its immutable image
 * reference (repo path + sha256 digest), and a rollback resolves THAT digest —
 * independent of any live runtime state — so it works even after the current
 * revision is deleted. It also REFUSES to fake a rollback when no digest was
 * retained, instead of silently pointing at a dead URL.
 *
 * Pure — no I/O — so the invariants are unit-testable. WIRED into the real deploy
 * path in app.ts: the build persists imageRef@digest into the deployment metadata,
 * and the rollback endpoint (flag SERVER_DEPLOY_ROLLBACK_FROM_DIGEST) re-deploys
 * that digest via the workspace manager. The handler wiring is proven by
 * deployment-rollback-digest.spec.ts (real endpoint + mocked manager).
 */

export class RollbackError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'RollbackError';
  }
}

/**
 * The immutable record retained for every successful server release. `imageRef`
 * is the AR repository path (…-docker.pkg.dev/proj/repo/pkg) and `imageDigest`
 * the `sha256:…` content digest captured from Cloud Build (`build.results`).
 * Pinning by digest is what makes rollback revision-independent.
 */
export interface RetainedRelease {
  deploymentId: string;
  projectId: string;
  imageRef: string;
  imageDigest: string;
  createdAt: string;
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

// …-docker.pkg.dev/<project>/<repo>/<package…> (no tag/digest suffix)
const AR_IMAGE_REF = /^[a-z0-9-]+-docker\.pkg\.dev\/[^/]+\/[^/]+\/.+$/;

/**
 * Build a RetainedRelease from a successful build result. Throws if the build
 * did not yield a digest — a release WITHOUT a retained digest can never be
 * rolled back to, so it must be caught at retention time, not at rollback time.
 */
export function retainRelease(input: {
  deploymentId: string;
  projectId: string;
  imageUri: string;
  digest: string | undefined;
  createdAt: string;
}): RetainedRelease {
  if (!input.digest || !SHA256_DIGEST.test(input.digest)) {
    throw new RollbackError(
      `Release ${input.deploymentId} has no sha256 image digest — it cannot be a rollback target.`,
      'RELEASE_NO_DIGEST',
    );
  }

  // Strip any tag from the imageUri to keep the bare repo path.
  const imageRef = input.imageUri.replace(/:[^:/]+$/, '');

  if (!AR_IMAGE_REF.test(imageRef)) {
    throw new RollbackError(
      `Release ${input.deploymentId} has an unrecognized image ref "${imageRef}".`,
      'RELEASE_BAD_IMAGE_REF',
    );
  }

  return {
    deploymentId: input.deploymentId,
    projectId: input.projectId,
    imageRef,
    imageDigest: input.digest,
    createdAt: input.createdAt,
  };
}

/**
 * Runtime state of the current live release — passed in so the resolver stays
 * pure. `revisionExists` is DELIBERATELY consulted only to assert that rollback
 * does NOT depend on it: a deleted current revision must not block the rollback.
 */
export interface LiveRuntimeState {
  revisionExists: boolean;
}

export interface RollbackPlan {
  /** Immutable pull ref: `imageRef@sha256:…`. Pull-by-digest = exact bytes. */
  pullRef: string;
  imageDigest: string;
  fromDeploymentId: string;

  /** True when resolved despite the current revision being gone (the I-REL-1 case). */
  resolvedWithoutLiveRevision: boolean;
}

/**
 * Resolve the image a rollback must re-deploy. The heart of I-REL-1: the plan is
 * derived ENTIRELY from the retained digest, so it is returned even when the
 * current live revision has been deleted. Refuses (RollbackError) when no digest
 * was retained — never returns a URL-only, un-redeployable "rollback".
 *
 * I-REL-2: this resolves an IMAGE only. It carries no DB state and never implies
 * the database was reverted — schema compatibility is the migration's concern.
 */
export function resolveRollbackImage(target: RetainedRelease | null | undefined, live: LiveRuntimeState): RollbackPlan {
  if (!target) {
    throw new RollbackError('No retained release to roll back to.', 'ROLLBACK_NO_TARGET');
  }

  if (!target.imageDigest || !SHA256_DIGEST.test(target.imageDigest)) {
    /*
     * The current bug made concrete: a server "rollback" with no retained digest
     * would copy a URL and re-deploy nothing. Refuse loudly instead.
     */
    throw new RollbackError(
      `Rollback target ${target.deploymentId} has no retained image digest — cannot re-deploy from the catalog (would point at a possibly-dead URL).`,
      'ROLLBACK_NO_RETAINED_DIGEST',
    );
  }

  return {
    pullRef: `${target.imageRef}@${target.imageDigest}`,
    imageDigest: target.imageDigest,
    fromDeploymentId: target.deploymentId,
    resolvedWithoutLiveRevision: live.revisionExists === false,
  };
}

/* ============================ secret policy ============================ */

/**
 * Which secret VALUES a rolled-back release runs with. Declared on the release
 * (the ReleaseManifest), never inferred at rollback time.
 *  - CURRENT: the app runs with the project's CURRENT secret values. This is the
 *    only policy E-Code can honour today — `ProjectSecret` is unique per
 *    (projectId, key) and a rotation OVERWRITES the value, so no prior version is
 *    retained to pin to.
 *  - PINNED: the app must run with the secret values as of the original release.
 *    Requires the release to have retained those versions; if it did not, the
 *    policy is UNSATISFIABLE and the rollback is refused — never silently served
 *    with current values under a "pinned" label.
 */
export type SecretPolicy = 'CURRENT' | 'PINNED';

export interface RollbackSecretInputs {
  policy: SecretPolicy;

  /** Current project secret values (post-rotation). */
  currentSecrets: Record<string, string>;

  /** Secret values captured at the original release, if any were retained. */
  pinnedSecrets?: Record<string, string> | null;
}

export interface RollbackSecretResolution {
  policy: SecretPolicy;
  secrets: Record<string, string>;

  /** True when the resolved values came from the pinned snapshot, not current. */
  pinned: boolean;
}

/**
 * Resolve which secret values the rolled-back release runs with, honouring the
 * DECLARED policy. The secret-rotation negative case: with policy CURRENT the
 * rotated value flows through; with policy PINNED and no retained snapshot the
 * rollback is REFUSED (ROLLBACK_SECRET_POLICY_UNSATISFIABLE) rather than lying.
 */
export function resolveRollbackSecrets(input: RollbackSecretInputs): RollbackSecretResolution {
  if (input.policy === 'PINNED') {
    if (!input.pinnedSecrets) {
      throw new RollbackError(
        'Release declares secretPolicy=PINNED but retained no secret snapshot — cannot honour it (ProjectSecret keeps no version history). Refusing rather than serving current values under a pinned label.',
        'ROLLBACK_SECRET_POLICY_UNSATISFIABLE',
      );
    }

    return { policy: 'PINNED', secrets: input.pinnedSecrets, pinned: true };
  }

  return { policy: 'CURRENT', secrets: input.currentSecrets, pinned: false };
}
