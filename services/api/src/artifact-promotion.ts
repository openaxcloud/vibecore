/**
 * Secure Artifact Registry promotion (DOMAIN_MODEL §5, audit v4 P0-#4).
 *
 * THE SECURITY BUG this closes: Artifact Registry stores the signature, SBOM and
 * provenance as SEPARATE OCI referrers/attachments linked to the image digest.
 * `gcloud ... copy` (or any copy-by-digest) copies ONLY the image manifest — the
 * attachments do NOT follow. Promoting by digest alone lands an UNVERIFIABLE
 * image in the tenant: Binary Authorization has nothing to check.
 *
 * The correct contract, enforced here:
 *   1. discover ALL referrers/attachments of the SOURCE digest,
 *   2. copy the image AND copy + re-link every attachment into the tenant repo,
 *   3. VERIFY presence + that each attachment's subjectDigest points at the
 *      image digest IN THE TARGET context,
 *   4. Binary Authorization gate over the required attestations;
 *   a missing/mismatched attachment at ANY step ⇒ promotion BLOCKED (and any
 *   partial copy rolled back — the tenant never receives an unverifiable image).
 *
 * This module is adapter-driven and PURE of GCP SDKs: `RegistryAdapter` abstracts
 * the OCI referrers API so the whole contract is unit-testable (incl. the
 * negative "missing attachment ⇒ refused" path). The live Artifact Registry
 * adapter lives in `artifact-registry-adapter.ts`.
 */

import { createHash } from 'node:crypto';

import type { PromotionManifest } from './lifecycle-state-machines.js';

export type AttestationKind = 'signature' | 'sbom' | 'provenance';

/** Map an OCI artifactType to the attestation kind it carries. */
export function classifyArtifactType(artifactType: string): AttestationKind | undefined {
  const t = artifactType.toLowerCase();

  if (
    t === 'application/vnd.dev.cosign.simplesigning.v1+json' ||
    t === 'application/vnd.dev.cosign.signature' ||
    t === 'application/vnd.cncf.notary.signature'
  ) {
    return 'signature';
  }

  if (
    t === 'application/spdx+json' ||
    t === 'application/vnd.cyclonedx+json' ||
    t === 'application/vnd.syft+json' ||
    t === 'application/vnd.dev.cosign.artifact.sbom.v1+json'
  ) {
    return 'sbom';
  }

  if (
    t === 'application/vnd.in-toto+json' ||
    t === 'application/vnd.in-toto.provenance+dsse' ||
    t === 'application/vnd.in-toto.statement.v1+json' ||
    t === 'application/vnd.slsa.provenance.v1+json'
  ) {
    return 'provenance';
  }

  return undefined;
}

export interface OciAttachment {
  /** Digest of the attachment manifest itself. */
  digest: string;

  /** OCI artifactType (drives classification). */
  artifactType: string;

  /** The image digest this attachment refers to (OCI `subject`). */
  subjectDigest: string;

  /** Content-addressed evidence payloads verified readable in this repository. */
  payloadDigests?: string[];
  payloadVerified?: boolean;

  /**
   * Kind derived from the authenticated payload shape, never merely from an
   * attacker-controlled artifactType. The live adapter sets this only after it
   * parses DSSE/in-toto and binds statement.subject to the image digest.
   */
  verifiedKind?: AttestationKind;
  predicateType?: string;
  evidenceFormat?: 'sigstore-bundle-message-signature' | 'sigstore-bundle-dsse' | 'cloud-build-dsse';
}

export interface RegistryRef {
  /** e.g. "europe-west9-docker.pkg.dev/proj/repo/image". */
  repo: string;
  digest: string;
}

export interface RegistryRequestOptions {
  signal?: AbortSignal;
}

/**
 * Abstracts the OCI/Artifact-Registry surface. The in-memory test adapter and
 * the (follow-up) live-AR adapter both implement this — the promotion logic
 * never talks to GCP directly.
 */
export interface RegistryAdapter {
  imageExists(repo: string, digest: string, options?: RegistryRequestOptions): Promise<boolean>;

  /** All referrers/attachments whose subject is `digest` in `repo`. */
  listReferrers(repo: string, digest: string, options?: RegistryRequestOptions): Promise<OciAttachment[]>;

  /** Copy the image manifest + config + layers by digest. */
  copyImage(source: RegistryRef, targetRepo: string, options?: RegistryRequestOptions): Promise<{ created: boolean }>;

  /**
   * Copy an attachment blob into `targetRepo` and RE-LINK its subject to
   * `newSubjectDigest` (the image digest in the target context).
   */
  copyAndRelinkReferrer(
    source: { repo: string; attachment: OciAttachment },
    targetRepo: string,
    newSubjectDigest: string,
    options?: RegistryRequestOptions,
  ): Promise<{ attachment: OciAttachment; created: boolean }>;

  /** Delete one attachment manifest created by this attempt. */
  deleteReferrer(repo: string, digest: string, options?: RegistryRequestOptions): Promise<void>;

  /** Delete the image manifest created by this attempt. */
  deleteImage(repo: string, digest: string, options?: RegistryRequestOptions): Promise<void>;

  /** Pin the verified digest under an immutable cleanup-policy retention tag. */
  pinImage(repo: string, digest: string, tag: string, options?: RegistryRequestOptions): Promise<{ created: boolean }>;
}

export const DEFAULT_REQUIRED_ATTESTATIONS: AttestationKind[] = ['signature', 'sbom', 'provenance'];

export class PromotionBlockedError extends Error {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: string,
    readonly missing: AttestationKind[] = [],
  ) {
    super(message);
    this.name = 'PromotionBlockedError';
  }
}

export interface PromotionResult {
  ok: true;
  target: RegistryRef;
  promotedAttestations: AttestationKind[];
  manifest: PromotionManifest;

  /** True when an already-complete target was verified and reused without writes. */
  reused: boolean;
}

export interface BinaryAuthorizationGateResult {
  admitted: boolean;
  policy: string;
  policyEtag: string;
  evaluatedImage: string;
  evaluatedAt: string;
}

function promotionId(source: RegistryRef, targetRepo: string, policy: string, policyEtag: string): string {
  return `promo-${createHash('sha256')
    .update(`${source.repo}\0${source.digest}\0${targetRepo}\0${policy}\0${policyEtag}`, 'utf8')
    .digest('hex')
    .slice(0, 32)}`;
}

function retentionTag(source: RegistryRef, targetRepo: string, policy: string, policyEtag: string): string {
  return `active-${promotionId(source, targetRepo, policy, policyEtag)}`;
}

function committedManifest(input: {
  source: RegistryRef;
  target: RegistryRef;
  targetTenant: string;
  targetReferrers: OciAttachment[];
  preparedAt: string;
  binaryAuthorization: BinaryAuthorizationGateResult;
  retentionTag: string;
}): PromotionManifest {
  return {
    promotionId: promotionId(
      input.source,
      input.target.repo,
      input.binaryAuthorization.policy,
      input.binaryAuthorization.policyEtag,
    ),
    sourceRepo: input.source.repo,
    sourceDigest: input.source.digest,
    targetRepo: input.target.repo,
    targetTenant: input.targetTenant,
    retentionTag: input.retentionTag,
    attachments: input.targetReferrers
      .filter((attachment) => attachment.subjectDigest === input.target.digest)
      .map((attachment) => ({
        type: attachment.verifiedKind ?? classifyArtifactType(attachment.artifactType) ?? attachment.artifactType,
        digest: attachment.digest,
        subjectDigest: attachment.subjectDigest,
        relinked: true,
        ...(attachment.payloadDigests ? { payloadDigests: attachment.payloadDigests } : {}),
        ...(attachment.predicateType ? { predicateType: attachment.predicateType } : {}),
        ...(attachment.evidenceFormat ? { evidenceFormat: attachment.evidenceFormat } : {}),
      })),
    binaryAuthorizationResult: 'PASSED',
    binaryAuthorizationPolicy: input.binaryAuthorization.policy,
    binaryAuthorizationPolicyEtag: input.binaryAuthorization.policyEtag,
    binaryAuthorizationEvaluatedImage: input.binaryAuthorization.evaluatedImage,
    binaryAuthorizationEvaluatedAt: input.binaryAuthorization.evaluatedAt,
    state: 'PROMOTION_COMMITTED',
    preparedAt: input.preparedAt,
    committedAt: new Date().toISOString(),
  };
}

/**
 * Which required attestation kinds are MISSING from a set of attachments.
 * Pure helper — used for both the source pre-check and the target verify.
 */
export function missingAttestations(
  attachments: OciAttachment[],
  required: AttestationKind[],
  imageDigest: string,
): AttestationKind[] {
  const present = new Set<AttestationKind>();

  for (const attachment of attachments) {
    const kind = attachment.verifiedKind;

    // Only count an attachment that ACTUALLY refers to this image digest.
    if (kind && attachment.subjectDigest === imageDigest && attachment.payloadVerified === true) {
      present.add(kind);
    }
  }

  return required.filter((kind) => !present.has(kind));
}

function targetContainsSourceEvidence(
  sourceReferrers: OciAttachment[],
  targetReferrers: OciAttachment[],
  imageDigest: string,
): boolean {
  return sourceReferrers
    .filter((attachment) => attachment.subjectDigest === imageDigest)
    .every((source) =>
      targetReferrers.some(
        (target) =>
          target.digest === source.digest &&
          target.artifactType === source.artifactType &&
          target.subjectDigest === imageDigest &&
          target.payloadVerified === true &&
          target.verifiedKind === source.verifiedKind &&
          target.predicateType === source.predicateType &&
          target.evidenceFormat === source.evidenceFormat &&
          JSON.stringify([...(target.payloadDigests ?? [])].sort()) ===
            JSON.stringify([...(source.payloadDigests ?? [])].sort()),
      ),
    );
}

/**
 * Promote an image from a source repo to a tenant target repo WITH its full
 * attestation chain. Throws {@link PromotionBlockedError} — and rolls back any
 * partial target copy — if any required attestation is absent at the source, is
 * not re-linked into the target, or fails the Binary Authorization gate.
 */
export async function promoteArtifact(input: {
  source: RegistryRef;
  targetRepo: string;

  /** Organization/tenant that exclusively owns targetRepo. */
  targetTenant: string;
  adapter: RegistryAdapter;
  required?: AttestationKind[];
  signal?: AbortSignal;

  /**
   * Binary Authorization gate over the VERIFIED target attestations. Returns
   * false to block (e.g. policy demands a specific signer). Defaults to
   * "all required kinds present" (already guaranteed by the verify step).
   */
  binaryAuthorization?: (
    verified: AttestationKind[],
  ) => boolean | BinaryAuthorizationGateResult | Promise<boolean | BinaryAuthorizationGateResult>;
}): Promise<PromotionResult> {
  const assertActive = () => input.signal?.throwIfAborted();
  const requestOptions = input.signal ? { signal: input.signal } : undefined;
  assertActive();
  const required = input.required ?? DEFAULT_REQUIRED_ATTESTATIONS;
  const { adapter, source } = input;
  const target: RegistryRef = { repo: input.targetRepo, digest: source.digest };
  const preparedAt = new Date().toISOString();

  // 0. Source image must exist.
  if (!(await adapter.imageExists(source.repo, source.digest, requestOptions))) {
    throw new PromotionBlockedError(
      `Source image ${source.repo}@${source.digest} not found`,
      'PROMOTION_SOURCE_MISSING',
    );
  }
  assertActive();

  /*
   * 1. Discover ALL referrers at the source and pre-check completeness. An image
   *    whose attestations are already incomplete at the source must never be
   *    promoted — it is unverifiable by construction.
   */
  const sourceReferrers = await adapter.listReferrers(source.repo, source.digest, requestOptions);
  assertActive();
  const missingAtSource = missingAttestations(sourceReferrers, required, source.digest);

  if (missingAtSource.length > 0) {
    throw new PromotionBlockedError(
      `Source is missing required attestation(s): ${missingAtSource.join(', ')} — refusing to promote an unverifiable image.`,
      'PROMOTION_SOURCE_INCOMPLETE',
      missingAtSource,
    );
  }

  const targetExisted = await adapter.imageExists(target.repo, target.digest, requestOptions);
  assertActive();

  /*
   * Referrers may have been pushed before their subject on OCI 1.1 registries.
   * Snapshot them even when the subject manifest is absent so rollback never
   * deletes evidence that predates this attempt.
   */
  const targetBefore = await adapter.listReferrers(target.repo, target.digest, requestOptions);
  assertActive();

  const targetWasComplete =
    targetExisted &&
    missingAttestations(targetBefore, required, target.digest).length === 0 &&
    targetContainsSourceEvidence(sourceReferrers, targetBefore, target.digest);

  if (targetWasComplete) {
    const verified = required.filter((kind) =>
      targetBefore.some((attachment) => attachment.verifiedKind === kind && attachment.subjectDigest === target.digest),
    );
    const gate =
      input.binaryAuthorization ??
      ((v: AttestationKind[]): BinaryAuthorizationGateResult => ({
        admitted: required.every((kind) => v.includes(kind)),
        policy: 'builtin:required-attestation-contract',
        policyEtag: 'builtin-contract-v1',
        evaluatedImage: `${target.repo}@${target.digest}`,
        evaluatedAt: new Date().toISOString(),
      }));

    const rawGate = await gate(verified);
    assertActive();

    const gateResult: BinaryAuthorizationGateResult =
      typeof rawGate === 'boolean'
        ? {
            admitted: rawGate,
            policy: 'test:boolean-gate',
            policyEtag: 'test-boolean-v1',
            evaluatedImage: `${target.repo}@${target.digest}`,
            evaluatedAt: new Date().toISOString(),
          }
        : rawGate;

    if (!gateResult.admitted || gateResult.evaluatedImage !== `${target.repo}@${target.digest}`) {
      /*
       * A retry must never destroy a complete target created by an earlier
       * successful attempt merely because today's policy evaluation failed.
       */
      throw new PromotionBlockedError(
        'Binary Authorization denied the existing promoted image.',
        'PROMOTION_BINAUTHZ_DENIED',
      );
    }

    const finalReferrers = await adapter.listReferrers(target.repo, target.digest, requestOptions);
    assertActive();

    if (
      !(await adapter.imageExists(target.repo, target.digest, requestOptions)) ||
      missingAttestations(finalReferrers, required, target.digest).length > 0 ||
      !targetContainsSourceEvidence(sourceReferrers, finalReferrers, target.digest)
    ) {
      throw new PromotionBlockedError(
        'Existing target changed during policy evaluation.',
        'PROMOTION_TARGET_UNVERIFIED',
      );
    }

    const targetRetentionTag = retentionTag(source, target.repo, gateResult.policy, gateResult.policyEtag);
    await adapter.pinImage(target.repo, target.digest, targetRetentionTag, requestOptions);
    assertActive();

    return {
      ok: true,
      target,
      promotedAttestations: verified,
      manifest: committedManifest({
        source,
        target,
        targetTenant: input.targetTenant,
        targetReferrers: finalReferrers,
        preparedAt,
        binaryAuthorization: gateResult,
        retentionTag: targetRetentionTag,
      }),
      reused: true,
    };
  }

  let imageCreated = false;

  const createdReferrers: string[] = [];
  const preexistingReferrers = new Set(targetBefore.map((attachment) => attachment.digest));

  try {
    /*
     * 2. Copy image by digest, then copy + RE-LINK each required attachment into
     *    the tenant repo (re-linked to the image digest in the target context).
     * Pre-register for rollback for the same "PUT accepted, response lost"
     * ambiguity handled for referrers below.
     */
    imageCreated = !targetExisted;

    const imageReceipt = await adapter.copyImage(source, target.repo, requestOptions);
    assertActive();

    if (!imageReceipt.created) {
      imageCreated = false;
    }

    /*
     * Copy every well-formed source referrer, not only the three release gates.
     * This preserves extra security evidence (vulnerability reports, custom
     * attestations) while the required set below remains fail-closed.
     */
    const attachmentsToCopy = sourceReferrers.filter((attachment) => attachment.subjectDigest === source.digest);

    for (const attachment of attachmentsToCopy) {
      /*
       * Register the rollback candidate BEFORE the adapter call. A registry can
       * accept the PUT and then lose the response/verification read; in that
       * failure mode the call throws even though the manifest now exists.
       */
      if (!preexistingReferrers.has(attachment.digest)) {
        createdReferrers.push(attachment.digest);
      }

      const copied = await adapter.copyAndRelinkReferrer(
        { repo: source.repo, attachment },
        target.repo,
        target.digest,
        requestOptions,
      );
      assertActive();

      if (!copied.created) {
        const index = createdReferrers.lastIndexOf(copied.attachment.digest);

        if (index >= 0) {
          createdReferrers.splice(index, 1);
        }
      }
    }

    /*
     * 3. VERIFY in the TARGET context: re-list referrers at the target and confirm
     *    every required kind is present AND its subjectDigest matches the target
     *    image digest. This catches a silent copy/relink failure.
     */
    const targetReferrers = await adapter.listReferrers(target.repo, target.digest, requestOptions);
    assertActive();
    const missingAtTarget = missingAttestations(targetReferrers, required, target.digest);

    if (missingAtTarget.length > 0) {
      throw new PromotionBlockedError(
        `Target verification failed — missing attestation(s) after copy: ${missingAtTarget.join(', ')}`,
        'PROMOTION_TARGET_UNVERIFIED',
        missingAtTarget,
      );
    }

    const verified = required.filter((kind) =>
      targetReferrers.some(
        (attachment) => attachment.verifiedKind === kind && attachment.subjectDigest === target.digest,
      ),
    );

    // 4. Binary Authorization gate over the verified attestations.
    const gate =
      input.binaryAuthorization ??
      ((v: AttestationKind[]): BinaryAuthorizationGateResult => ({
        admitted: required.every((kind) => v.includes(kind)),
        policy: 'builtin:required-attestation-contract',
        policyEtag: 'builtin-contract-v1',
        evaluatedImage: `${target.repo}@${target.digest}`,
        evaluatedAt: new Date().toISOString(),
      }));

    const rawGate = await gate(verified);
    assertActive();

    const gateResult: BinaryAuthorizationGateResult =
      typeof rawGate === 'boolean'
        ? {
            admitted: rawGate,
            policy: 'test:boolean-gate',
            policyEtag: 'test-boolean-v1',
            evaluatedImage: `${target.repo}@${target.digest}`,
            evaluatedAt: new Date().toISOString(),
          }
        : rawGate;

    if (!gateResult.admitted || gateResult.evaluatedImage !== `${target.repo}@${target.digest}`) {
      throw new PromotionBlockedError(
        'Binary Authorization denied the promoted image.',
        'PROMOTION_BINAUTHZ_DENIED',
        required.filter((k) => !verified.includes(k)),
      );
    }

    /*
     * The policy service is an external await. Re-read at the point of commit so
     * a concurrent cleanup/rewrite cannot turn stale pre-policy evidence into a
     * committed release proof.
     */
    const finalReferrers = await adapter.listReferrers(target.repo, target.digest, requestOptions);
    assertActive();
    const missingAtCommit = missingAttestations(finalReferrers, required, target.digest);

    if (
      !(await adapter.imageExists(target.repo, target.digest, requestOptions)) ||
      missingAtCommit.length > 0 ||
      !targetContainsSourceEvidence(sourceReferrers, finalReferrers, target.digest)
    ) {
      throw new PromotionBlockedError(
        'Target changed during Binary Authorization evaluation.',
        'PROMOTION_TARGET_UNVERIFIED',
        missingAtCommit,
      );
    }

    const targetRetentionTag = retentionTag(source, target.repo, gateResult.policy, gateResult.policyEtag);
    await adapter.pinImage(target.repo, target.digest, targetRetentionTag, requestOptions);
    assertActive();

    return {
      ok: true,
      target,
      promotedAttestations: verified,
      manifest: committedManifest({
        source,
        target,
        targetTenant: input.targetTenant,
        targetReferrers: finalReferrers,
        preparedAt,
        binaryAuthorization: gateResult,
        retentionTag: targetRetentionTag,
      }),
      reused: false,
    };
  } catch (error) {
    /*
     * Roll back only objects THIS attempt created. Deleting a pre-existing image
     * here is the subtle retry/concurrency bug that used to let a losing worker
     * erase a winner's already-verified target.
     */
    const rollbackErrors: unknown[] = [];

    /* Losing the durable registry fence makes every further mutation unsafe,
     * including compensation. Leave the partial graph for verify-first
     * operator recovery; a stale owner must never delete a winner's objects. */
    assertActive();

    for (const digest of [...new Set(createdReferrers)].reverse()) {
      assertActive();
      try {
        await adapter.deleteReferrer(target.repo, digest, requestOptions);
      } catch (rollbackError) {
        assertActive();
        rollbackErrors.push(rollbackError);
      }
      assertActive();
    }

    if (imageCreated) {
      assertActive();
      try {
        await adapter.deleteImage(target.repo, target.digest, requestOptions);
      } catch (rollbackError) {
        assertActive();
        rollbackErrors.push(rollbackError);
      }
      assertActive();
    }

    if (rollbackErrors.length > 0) {
      throw new PromotionBlockedError(
        'Artifact promotion failed and its partial target could not be completely rolled back.',
        'PROMOTION_ROLLBACK_FAILED',
      );
    }

    throw error;
  }
}
