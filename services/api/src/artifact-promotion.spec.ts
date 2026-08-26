import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REQUIRED_ATTESTATIONS,
  type OciAttachment,
  type RegistryAdapter,
  classifyArtifactType,
  missingAttestations,
  promoteArtifact,
} from './artifact-promotion.js';

const SIG = 'application/vnd.dev.cosign.simplesigning.v1+json';
const SBOM = 'application/vnd.cyclonedx+json';
const PROV = 'application/vnd.in-toto+json';

/**
 * Faithful in-memory OCI registry. Referrers live keyed by (repo, subjectDigest)
 * and are NOT carried by copyImage — exactly like real Artifact Registry, where
 * copy-by-digest drops the attachments. That is the bug the promotion contract
 * exists to defeat, so the test adapter must model it honestly.
 */
class FakeRegistry implements RegistryAdapter {
  images = new Set<string>(); // `${repo}@${digest}`
  referrers = new Map<string, OciAttachment[]>(); // `${repo}@${subjectDigest}` -> attachments
  tags = new Map<string, string>();

  seedImage(repo: string, digest: string, attachments: OciAttachment[]) {
    this.images.add(`${repo}@${digest}`);
    this.referrers.set(`${repo}@${digest}`, attachments);
  }

  async imageExists(repo: string, digest: string) {
    return this.images.has(`${repo}@${digest}`);
  }

  async listReferrers(repo: string, digest: string) {
    return [...(this.referrers.get(`${repo}@${digest}`) ?? [])];
  }

  async copyImage(source: { repo: string; digest: string }, targetRepo: string) {
    // Copies the MANIFEST ONLY — attachments do not follow (real AR behavior).
    const created = !this.images.has(`${targetRepo}@${source.digest}`);
    this.images.add(`${targetRepo}@${source.digest}`);

    return { created };
  }

  async copyAndRelinkReferrer(
    source: { repo: string; attachment: OciAttachment },
    targetRepo: string,
    newSubjectDigest: string,
  ) {
    const key = `${targetRepo}@${newSubjectDigest}`;
    const list = this.referrers.get(key) ?? [];
    const attachment = { ...source.attachment, subjectDigest: newSubjectDigest };
    const created = !list.some((entry) => entry.digest === attachment.digest);

    if (created) {
      list.push(attachment);
    }

    this.referrers.set(key, list);

    return { attachment, created };
  }

  async deleteReferrer(repo: string, digest: string) {
    for (const [key, attachments] of this.referrers) {
      this.referrers.set(
        key,
        attachments.filter((attachment) => attachment.digest !== digest),
      );
    }
  }

  async deleteImage(repo: string, digest: string) {
    this.images.delete(`${repo}@${digest}`);
  }

  async pinImage(repo: string, digest: string, tag: string) {
    const key = `${repo}:${tag}`;
    const existing = this.tags.get(key);

    if (existing && existing !== digest) {
      throw new Error('retention tag conflict');
    }

    this.tags.set(key, digest);

    return { created: !existing };
  }
}

const fullChain = (subjectDigest: string): OciAttachment[] => [
  {
    digest: 'sha256:sig',
    artifactType: SIG,
    subjectDigest,
    payloadDigests: ['sha256:sig-payload'],
    payloadVerified: true,
    verifiedKind: 'signature',
  },
  {
    digest: 'sha256:sbom',
    artifactType: SBOM,
    subjectDigest,
    payloadDigests: ['sha256:sbom-payload'],
    payloadVerified: true,
    verifiedKind: 'sbom',
  },
  {
    digest: 'sha256:prov',
    artifactType: PROV,
    subjectDigest,
    payloadDigests: ['sha256:prov-payload'],
    payloadVerified: true,
    verifiedKind: 'provenance',
  },
];

const SRC = 'europe-west9-docker.pkg.dev/proj/source/app';
const TENANT = 'europe-west9-docker.pkg.dev/proj/tenant-abc/app';
const DIGEST = 'sha256:abc123';

describe('classifyArtifactType', () => {
  it('maps cosign/sbom/in-toto artifactTypes to the right kind', () => {
    expect(classifyArtifactType(SIG)).toBe('signature');
    expect(classifyArtifactType(SBOM)).toBe('sbom');
    expect(classifyArtifactType(PROV)).toBe('provenance');
    expect(classifyArtifactType('application/vnd.in-toto.provenance+dsse')).toBe('provenance');
    expect(classifyArtifactType('application/vnd.oci.image.layer.v1.tar')).toBeUndefined();
  });
});

describe('missingAttestations — only counts attachments that refer to THIS digest', () => {
  it('ignores an attachment whose subjectDigest points elsewhere', () => {
    const attachments: OciAttachment[] = [
      { digest: 'x', artifactType: SIG, subjectDigest: DIGEST, payloadVerified: true, verifiedKind: 'signature' },
      {
        digest: 'y',
        artifactType: SBOM,
        subjectDigest: 'sha256:OTHER',
        payloadVerified: true,
        verifiedKind: 'sbom',
      }, // wrong subject
      { digest: 'z', artifactType: PROV, subjectDigest: DIGEST, payloadVerified: true, verifiedKind: 'provenance' },
    ];
    expect(missingAttestations(attachments, DEFAULT_REQUIRED_ATTESTATIONS, DIGEST)).toEqual(['sbom']);
  });
});

describe('promoteArtifact — the security contract', () => {
  it('copies the image AND re-links signature+SBOM+provenance, verified in the tenant context', async () => {
    const reg = new FakeRegistry();
    reg.seedImage(SRC, DIGEST, fullChain(DIGEST));

    // Before: tenant has nothing.
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
    expect(await reg.listReferrers(TENANT, DIGEST)).toEqual([]);

    const result = await promoteArtifact({
      source: { repo: SRC, digest: DIGEST },
      targetRepo: TENANT,
      targetTenant: 'org-a',
      adapter: reg,
    });

    expect(result.ok).toBe(true);
    expect(result.promotedAttestations.sort()).toEqual(['provenance', 'sbom', 'signature']);
    expect(result.manifest.retentionTag).toMatch(/^active-promo-/u);
    expect(reg.tags.get(`${TENANT}:${result.manifest.retentionTag}`)).toBe(DIGEST);

    /*
     * After: tenant image exists AND all three attestations are present, each
     * re-linked to the TARGET image digest (subjectDigest === DIGEST at TENANT).
     */
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(true);

    const targetReferrers = await reg.listReferrers(TENANT, DIGEST);
    expect(targetReferrers.map((r) => classifyArtifactType(r.artifactType)).sort()).toEqual([
      'provenance',
      'sbom',
      'signature',
    ]);
    expect(targetReferrers.every((r) => r.subjectDigest === DIGEST)).toBe(true);
  });

  it('NEGATIVE — a missing SBOM at the source BLOCKS promotion; tenant stays clean', async () => {
    const reg = new FakeRegistry();

    // Source has signature + provenance but NO SBOM.
    reg.seedImage(SRC, DIGEST, [
      {
        digest: 'sha256:sig',
        artifactType: SIG,
        subjectDigest: DIGEST,
        payloadVerified: true,
        verifiedKind: 'signature',
      },
      {
        digest: 'sha256:prov',
        artifactType: PROV,
        subjectDigest: DIGEST,
        payloadVerified: true,
        verifiedKind: 'provenance',
      },
    ]);

    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_SOURCE_INCOMPLETE', missing: ['sbom'] });

    // The tenant received NOTHING — no unverifiable image landed.
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
    expect(await reg.listReferrers(TENANT, DIGEST)).toEqual([]);
  });

  it('NEGATIVE — a silent relink failure fails target VERIFY and rolls back', async () => {
    const reg = new FakeRegistry();
    reg.seedImage(SRC, DIGEST, fullChain(DIGEST));

    // Simulate a copy/relink that silently drops the SBOM at the target.
    const realRelink = reg.copyAndRelinkReferrer.bind(reg);

    reg.copyAndRelinkReferrer = async (source, targetRepo, newSubjectDigest) => {
      if (classifyArtifactType(source.attachment.artifactType) === 'sbom') {
        return {
          attachment: { ...source.attachment, subjectDigest: newSubjectDigest },
          created: false,
        }; // silently do nothing — the failure mode we must catch
      }

      return realRelink(source, targetRepo, newSubjectDigest);
    };

    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_TARGET_UNVERIFIED', missing: ['sbom'] });

    // Rolled back — tenant left clean.
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
    expect(await reg.listReferrers(TENANT, DIGEST)).toEqual([]);
  });

  it('NEGATIVE — Binary Authorization denial blocks and rolls back', async () => {
    const reg = new FakeRegistry();
    reg.seedImage(SRC, DIGEST, fullChain(DIGEST));

    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
        binaryAuthorization: () => false, // policy denies
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_BINAUTHZ_DENIED' });

    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
  });

  it('is idempotent and never deletes a pre-existing complete target when a retry is denied', async () => {
    const reg = new FakeRegistry();
    reg.seedImage(SRC, DIGEST, fullChain(DIGEST));

    const first = await promoteArtifact({
      source: { repo: SRC, digest: DIGEST },
      targetRepo: TENANT,
      targetTenant: 'org-a',
      adapter: reg,
    });
    expect(first.reused).toBe(false);

    const retry = await promoteArtifact({
      source: { repo: SRC, digest: DIGEST },
      targetRepo: TENANT,
      targetTenant: 'org-a',
      adapter: reg,
    });
    expect(retry.reused).toBe(true);
    expect(retry.manifest.promotionId).toBe(first.manifest.promotionId);

    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
        binaryAuthorization: () => false,
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_BINAUTHZ_DENIED' });
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(true);
    expect(await reg.listReferrers(TENANT, DIGEST)).toHaveLength(3);
  });

  it('does not reuse a complete-looking target until every source evidence digest is present', async () => {
    const reg = new FakeRegistry();

    const extra: OciAttachment = {
      digest: 'sha256:vulnerability-report',
      artifactType: 'application/vnd.example.vulnerability-report+json',
      subjectDigest: DIGEST,
      payloadDigests: ['sha256:vulnerability-payload'],
      payloadVerified: true,
    };

    const sourceChain = [...fullChain(DIGEST), extra];

    const unrelatedTargetChain = fullChain(DIGEST).map((attachment) => ({
      ...attachment,
      digest: `${attachment.digest}-other`,
    }));
    reg.seedImage(SRC, DIGEST, sourceChain);
    reg.seedImage(TENANT, DIGEST, unrelatedTargetChain);

    const result = await promoteArtifact({
      source: { repo: SRC, digest: DIGEST },
      targetRepo: TENANT,
      targetTenant: 'org-a',
      adapter: reg,
    });

    expect(result.reused).toBe(false);

    const target = await reg.listReferrers(TENANT, DIGEST);
    expect(sourceChain.every((source) => target.some((entry) => entry.digest === source.digest))).toBe(true);
  });

  it('refuses commit when the target disappears during Binary Authorization evaluation', async () => {
    const reg = new FakeRegistry();
    reg.seedImage(SRC, DIGEST, fullChain(DIGEST));

    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
        binaryAuthorization: async () => {
          await reg.deleteImage(TENANT, DIGEST);

          for (const attachment of await reg.listReferrers(TENANT, DIGEST)) {
            await reg.deleteReferrer(TENANT, attachment.digest);
          }

          return {
            admitted: true,
            policy: 'projects/policy-proj/platforms/gke/policies/release-policy',
            policyEtag: 'policy-etag-0001',
            evaluatedImage: `${TENANT}@${DIGEST}`,
            evaluatedAt: new Date().toISOString(),
          };
        },
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_TARGET_UNVERIFIED' });
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
    expect(await reg.listReferrers(TENANT, DIGEST)).toEqual([]);
  });

  it('rolls back a referrer whose PUT succeeded even when the adapter loses its verification response', async () => {
    const reg = new FakeRegistry();
    reg.seedImage(SRC, DIGEST, fullChain(DIGEST));

    const realRelink = reg.copyAndRelinkReferrer.bind(reg);

    let calls = 0;

    reg.copyAndRelinkReferrer = async (source, targetRepo, newSubjectDigest) => {
      const copied = await realRelink(source, targetRepo, newSubjectDigest);
      calls += 1;

      if (calls === 2) {
        throw new Error('response lost after registry accepted referrer');
      }

      return copied;
    };

    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
      }),
    ).rejects.toThrow(/response lost/u);
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
    expect(await reg.listReferrers(TENANT, DIGEST)).toEqual([]);
  });

  it('rolls back an image whose PUT succeeded even when the adapter loses its verification response', async () => {
    const reg = new FakeRegistry();
    reg.seedImage(SRC, DIGEST, fullChain(DIGEST));

    const realCopy = reg.copyImage.bind(reg);

    reg.copyImage = async (source, targetRepo) => {
      await realCopy(source, targetRepo);
      throw new Error('response lost after registry accepted image');
    };

    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
      }),
    ).rejects.toThrow(/response lost/u);
    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
  });

  it('blocks when the source image itself is absent', async () => {
    const reg = new FakeRegistry();
    await expect(
      promoteArtifact({
        source: { repo: SRC, digest: DIGEST },
        targetRepo: TENANT,
        targetTenant: 'org-a',
        adapter: reg,
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_SOURCE_MISSING' });
  });

  it('does not accept substring-spoofed types or payload-less attestations', () => {
    expect(classifyArtifactType('application/not-a-signature')).toBeUndefined();
    expect(classifyArtifactType('application/fake-attestation+json')).toBeUndefined();
    expect(
      missingAttestations(
        [
          { digest: 'x', artifactType: SIG, subjectDigest: DIGEST, payloadVerified: false },
          { digest: 'y', artifactType: SBOM, subjectDigest: DIGEST, payloadVerified: true, verifiedKind: 'sbom' },
          {
            digest: 'z',
            artifactType: PROV,
            subjectDigest: DIGEST,
            payloadVerified: true,
            verifiedKind: 'provenance',
          },
        ],
        DEFAULT_REQUIRED_ATTESTATIONS,
        DIGEST,
      ),
    ).toEqual(['signature']);
  });

  it('does not let artifactType spoofing or two provenance envelopes satisfy the signed SBOM gate', () => {
    const spoofedBundle: OciAttachment = {
      digest: 'sha256:spoof',
      artifactType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
      subjectDigest: DIGEST,
      payloadVerified: true,
    };
    const provenanceTwice = [
      {
        ...spoofedBundle,
        digest: 'sha256:prov-one',
        verifiedKind: 'provenance' as const,
        predicateType: 'https://slsa.dev/provenance/v1',
      },
      {
        ...spoofedBundle,
        digest: 'sha256:prov-two',
        verifiedKind: 'provenance' as const,
        predicateType: 'https://slsa.dev/provenance/v0.1',
      },
      {
        ...spoofedBundle,
        digest: 'sha256:sig',
        verifiedKind: 'signature' as const,
      },
    ];

    expect(missingAttestations([spoofedBundle], DEFAULT_REQUIRED_ATTESTATIONS, DIGEST)).toEqual([
      'signature',
      'sbom',
      'provenance',
    ]);
    expect(missingAttestations(provenanceTwice, DEFAULT_REQUIRED_ATTESTATIONS, DIGEST)).toEqual(['sbom']);
  });
});
