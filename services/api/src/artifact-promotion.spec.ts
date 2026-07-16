import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REQUIRED_ATTESTATIONS,
  PromotionBlockedError,
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
    this.images.add(`${targetRepo}@${source.digest}`);
  }

  async copyAndRelinkReferrer(
    source: { repo: string; attachment: OciAttachment },
    targetRepo: string,
    newSubjectDigest: string,
  ) {
    const key = `${targetRepo}@${newSubjectDigest}`;
    const list = this.referrers.get(key) ?? [];
    list.push({ ...source.attachment, subjectDigest: newSubjectDigest });
    this.referrers.set(key, list);
  }

  async deleteImageAndReferrers(repo: string, digest: string) {
    this.images.delete(`${repo}@${digest}`);
    this.referrers.delete(`${repo}@${digest}`);
  }
}

const fullChain = (subjectDigest: string): OciAttachment[] => [
  { digest: 'sha256:sig', artifactType: SIG, subjectDigest },
  { digest: 'sha256:sbom', artifactType: SBOM, subjectDigest },
  { digest: 'sha256:prov', artifactType: PROV, subjectDigest },
];

const SRC = 'europe-west9-docker.pkg.dev/proj/source/app';
const TENANT = 'europe-west9-docker.pkg.dev/proj/tenant-abc/app';
const DIGEST = 'sha256:abc123';

describe('classifyArtifactType', () => {
  it('maps cosign/sbom/in-toto artifactTypes to the right kind', () => {
    expect(classifyArtifactType(SIG)).toBe('signature');
    expect(classifyArtifactType(SBOM)).toBe('sbom');
    expect(classifyArtifactType(PROV)).toBe('provenance');
    expect(classifyArtifactType('application/vnd.oci.image.layer.v1.tar')).toBeUndefined();
  });
});

describe('missingAttestations — only counts attachments that refer to THIS digest', () => {
  it('ignores an attachment whose subjectDigest points elsewhere', () => {
    const attachments: OciAttachment[] = [
      { digest: 'x', artifactType: SIG, subjectDigest: DIGEST },
      { digest: 'y', artifactType: SBOM, subjectDigest: 'sha256:OTHER' }, // wrong subject
      { digest: 'z', artifactType: PROV, subjectDigest: DIGEST },
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

    const result = await promoteArtifact({ source: { repo: SRC, digest: DIGEST }, targetRepo: TENANT, adapter: reg });

    expect(result.ok).toBe(true);
    expect(result.promotedAttestations.sort()).toEqual(['provenance', 'sbom', 'signature']);

    // After: tenant image exists AND all three attestations are present, each
    // re-linked to the TARGET image digest (subjectDigest === DIGEST at TENANT).
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
      { digest: 'sha256:sig', artifactType: SIG, subjectDigest: DIGEST },
      { digest: 'sha256:prov', artifactType: PROV, subjectDigest: DIGEST },
    ]);

    await expect(
      promoteArtifact({ source: { repo: SRC, digest: DIGEST }, targetRepo: TENANT, adapter: reg }),
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
        return; // silently do nothing — the failure mode we must catch
      }
      return realRelink(source, targetRepo, newSubjectDigest);
    };

    await expect(
      promoteArtifact({ source: { repo: SRC, digest: DIGEST }, targetRepo: TENANT, adapter: reg }),
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
        adapter: reg,
        binaryAuthorization: () => false, // policy denies
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_BINAUTHZ_DENIED' });

    expect(await reg.imageExists(TENANT, DIGEST)).toBe(false);
  });

  it('blocks when the source image itself is absent', async () => {
    const reg = new FakeRegistry();
    await expect(
      promoteArtifact({ source: { repo: SRC, digest: DIGEST }, targetRepo: TENANT, adapter: reg }),
    ).rejects.toMatchObject({ code: 'PROMOTION_SOURCE_MISSING' });
  });
});
