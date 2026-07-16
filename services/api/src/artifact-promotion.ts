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
 * adapter is a thin implementation of this interface (follow-up, needs infra
 * credentials) — the security logic lives and is proven here.
 */

export type AttestationKind = 'signature' | 'sbom' | 'provenance';

/** Map an OCI artifactType to the attestation kind it carries. */
export function classifyArtifactType(artifactType: string): AttestationKind | undefined {
  const t = artifactType.toLowerCase();

  if (t.includes('cosign') || t.includes('signature') || t.includes('simplesigning')) {
    return 'signature';
  }

  if (t.includes('spdx') || t.includes('cyclonedx') || t.includes('sbom')) {
    return 'sbom';
  }

  if (t.includes('in-toto') || t.includes('slsa') || t.includes('provenance') || t.includes('attestation')) {
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
}

export interface RegistryRef {
  /** e.g. "europe-west9-docker.pkg.dev/proj/repo/image". */
  repo: string;
  digest: string;
}

/**
 * Abstracts the OCI/Artifact-Registry surface. The in-memory test adapter and
 * the (follow-up) live-AR adapter both implement this — the promotion logic
 * never talks to GCP directly.
 */
export interface RegistryAdapter {
  imageExists(repo: string, digest: string): Promise<boolean>;

  /** All referrers/attachments whose subject is `digest` in `repo`. */
  listReferrers(repo: string, digest: string): Promise<OciAttachment[]>;

  /** Copy the image manifest + config + layers by digest. */
  copyImage(source: RegistryRef, targetRepo: string): Promise<void>;

  /**
   * Copy an attachment blob into `targetRepo` and RE-LINK its subject to
   * `newSubjectDigest` (the image digest in the target context).
   */
  copyAndRelinkReferrer(
    source: { repo: string; attachment: OciAttachment },
    targetRepo: string,
    newSubjectDigest: string,
  ): Promise<void>;

  /** Best-effort cleanup of a partially-promoted target (rollback). */
  deleteImageAndReferrers(repo: string, digest: string): Promise<void>;
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
    const kind = classifyArtifactType(attachment.artifactType);

    // Only count an attachment that ACTUALLY refers to this image digest.
    if (kind && attachment.subjectDigest === imageDigest) {
      present.add(kind);
    }
  }

  return required.filter((kind) => !present.has(kind));
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
  adapter: RegistryAdapter;
  required?: AttestationKind[];

  /**
   * Binary Authorization gate over the VERIFIED target attestations. Returns
   * false to block (e.g. policy demands a specific signer). Defaults to
   * "all required kinds present" (already guaranteed by the verify step).
   */
  binaryAuthorization?: (verified: AttestationKind[]) => boolean | Promise<boolean>;
}): Promise<PromotionResult> {
  const required = input.required ?? DEFAULT_REQUIRED_ATTESTATIONS;
  const { adapter, source } = input;
  const target: RegistryRef = { repo: input.targetRepo, digest: source.digest };

  // 0. Source image must exist.
  if (!(await adapter.imageExists(source.repo, source.digest))) {
    throw new PromotionBlockedError(`Source image ${source.repo}@${source.digest} not found`, 'PROMOTION_SOURCE_MISSING');
  }

  // 1. Discover ALL referrers at the source and pre-check completeness. An image
  //    whose attestations are already incomplete at the source must never be
  //    promoted — it is unverifiable by construction.
  const sourceReferrers = await adapter.listReferrers(source.repo, source.digest);
  const missingAtSource = missingAttestations(sourceReferrers, required, source.digest);

  if (missingAtSource.length > 0) {
    throw new PromotionBlockedError(
      `Source is missing required attestation(s): ${missingAtSource.join(', ')} — refusing to promote an unverifiable image.`,
      'PROMOTION_SOURCE_INCOMPLETE',
      missingAtSource,
    );
  }

  try {
    // 2. Copy image by digest, then copy + RE-LINK each required attachment into
    //    the tenant repo (re-linked to the image digest in the target context).
    await adapter.copyImage(source, target.repo);

    const requiredAttachments = sourceReferrers.filter((attachment) => {
      const kind = classifyArtifactType(attachment.artifactType);
      return kind && required.includes(kind) && attachment.subjectDigest === source.digest;
    });

    for (const attachment of requiredAttachments) {
      await adapter.copyAndRelinkReferrer({ repo: source.repo, attachment }, target.repo, target.digest);
    }

    // 3. VERIFY in the TARGET context: re-list referrers at the target and confirm
    //    every required kind is present AND its subjectDigest matches the target
    //    image digest. This catches a silent copy/relink failure.
    const targetReferrers = await adapter.listReferrers(target.repo, target.digest);
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
        (attachment) => classifyArtifactType(attachment.artifactType) === kind && attachment.subjectDigest === target.digest,
      ),
    );

    // 4. Binary Authorization gate over the verified attestations.
    const gate = input.binaryAuthorization ?? ((v: AttestationKind[]) => required.every((k) => v.includes(k)));
    const admitted = await gate(verified);

    if (!admitted) {
      throw new PromotionBlockedError(
        'Binary Authorization denied the promoted image.',
        'PROMOTION_BINAUTHZ_DENIED',
        required.filter((k) => !verified.includes(k)),
      );
    }

    return { ok: true, target, promotedAttestations: verified };
  } catch (error) {
    // Any failure after we began copying: roll the tenant target back to clean.
    await adapter.deleteImageAndReferrers(target.repo, target.digest).catch(() => undefined);
    throw error;
  }
}
