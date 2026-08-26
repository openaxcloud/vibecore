import { describe, expect, it } from 'vitest';

import type { OciAttachment, RegistryAdapter, RegistryRef } from './artifact-promotion.js';
import { BinaryAuthorizationClient } from './binary-authorization-client.js';
import { LiveServerImagePromotionRuntime, parseArtifactPromotionConfig } from './server-image-promotion.js';

const ORG = 'org_abcd';
const PROJECT = 'project_1234';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const SOURCE = `europe-west9-docker.pkg.dev/source-proj/build-repo/p-${PROJECT}`;
const TARGET = `europe-west9-docker.pkg.dev/tenant-proj/tenant-repo/p-${PROJECT}`;

const configJson = (
  tenants: Record<string, unknown> = {
    [ORG]: {
      targetRepository: 'europe-west9-docker.pkg.dev/tenant-proj/tenant-repo',
      binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
      binaryAuthorizationPolicyEtag: 'policy-etag-0001',
    },
  },
) =>
  JSON.stringify({
    sourceRepository: 'europe-west9-docker.pkg.dev/source-proj/build-repo',
    tenants,
  });

class MemoryRegistry implements RegistryAdapter {
  images = new Set([`${SOURCE}@${DIGEST}`]);
  tags = new Map<string, string>();
  refs = new Map<string, OciAttachment[]>([
    [
      `${SOURCE}@${DIGEST}`,
      [
        {
          digest: `sha256:${'b'.repeat(64)}`,
          artifactType: 'application/vnd.dev.cosign.signature',
          subjectDigest: DIGEST,
          payloadVerified: true,
          verifiedKind: 'signature',
        },
        {
          digest: `sha256:${'c'.repeat(64)}`,
          artifactType: 'application/vnd.cyclonedx+json',
          subjectDigest: DIGEST,
          payloadVerified: true,
          verifiedKind: 'sbom',
        },
        {
          digest: `sha256:${'d'.repeat(64)}`,
          artifactType: 'application/vnd.in-toto+json',
          subjectDigest: DIGEST,
          payloadVerified: true,
          verifiedKind: 'provenance',
        },
      ],
    ],
  ]);

  async imageExists(repo: string, digest: string) {
    return this.images.has(`${repo}@${digest}`);
  }

  async listReferrers(repo: string, digest: string) {
    return [...(this.refs.get(`${repo}@${digest}`) ?? [])];
  }

  async copyImage(source: RegistryRef, targetRepo: string) {
    const key = `${targetRepo}@${source.digest}`;
    const created = !this.images.has(key);
    this.images.add(key);

    return { created };
  }

  async copyAndRelinkReferrer(
    source: { repo: string; attachment: OciAttachment },
    targetRepo: string,
    newSubjectDigest: string,
  ) {
    const key = `${targetRepo}@${newSubjectDigest}`;
    const refs = this.refs.get(key) ?? [];
    const attachment = { ...source.attachment, subjectDigest: newSubjectDigest };
    const created = !refs.some((item) => item.digest === attachment.digest);

    if (created) {
      refs.push(attachment);
    }

    this.refs.set(key, refs);

    return { attachment, created };
  }

  async deleteReferrer(repo: string, digest: string) {
    for (const [key, refs] of this.refs) {
      this.refs.set(
        key,
        refs.filter((item) => item.digest !== digest),
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

function binaryAuthorization(verdict: 'CONFORMANT' | 'NON_CONFORMANT' = 'CONFORMANT') {
  return new BinaryAuthorizationClient({
    tokenProvider: { getAccessToken: async () => 'adc-token' },
    fetchImpl: async (_url, init) => {
      if (init?.method !== 'POST') {
        return new Response(
          JSON.stringify({
            name: 'projects/policy-proj/platforms/gke/policies/release-policy',
            etag: 'policy-etag-0001',
          }),
          { status: 200 },
        );
      }

      const body = JSON.parse(String(init?.body)) as {
        resource: {
          metadata: { name: string; namespace: string };
          spec: { serviceAccountName: string; containers: Array<{ image: string }> };
        };
      };

      return new Response(
        JSON.stringify({
          verdict,
          results: [
            {
              podName: body.resource.metadata.name,
              kubernetesNamespace: body.resource.metadata.namespace,
              kubernetesServiceAccount: body.resource.spec.serviceAccountName,
              verdict,
              imageResults: [
                {
                  imageUri: body.resource.spec.containers[0]?.image,
                  verdict,
                  checkSetResult: {
                    checkResults: { results: [{ evaluationResult: { verdict } }] },
                  },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
}

describe('server-image promotion configuration and tenant isolation', () => {
  it('promotes only the project-owned source path into the organization-owned target', async () => {
    const registry = new MemoryRegistry();

    const runtime = new LiveServerImagePromotionRuntime(
      parseArtifactPromotionConfig(configJson()),
      registry,
      binaryAuthorization(),
    );
    const result = await runtime.promote({
      organizationId: ORG,
      projectId: PROJECT,
      source: { repo: SOURCE, digest: DIGEST },
    });
    expect(result.target).toEqual({ repo: TARGET, digest: DIGEST });
    expect(result.manifest).toMatchObject({
      state: 'PROMOTION_COMMITTED',
      targetTenant: ORG,
      targetRepo: TARGET,
      binaryAuthorizationResult: 'PASSED',
    });
  });

  it('rejects an unconfigured tenant and another project source before registry I/O', async () => {
    const registry = new MemoryRegistry();

    const runtime = new LiveServerImagePromotionRuntime(
      parseArtifactPromotionConfig(configJson()),
      registry,
      binaryAuthorization(),
    );
    await expect(
      runtime.promote({ organizationId: 'org_other', projectId: PROJECT, source: { repo: SOURCE, digest: DIGEST } }),
    ).rejects.toMatchObject({ code: 'PROMOTION_TENANT_UNCONFIGURED' });
    await expect(
      runtime.promote({
        organizationId: ORG,
        projectId: PROJECT,
        source: { repo: SOURCE.replace(PROJECT, 'project_other'), digest: DIGEST },
      }),
    ).rejects.toMatchObject({ code: 'PROMOTION_SOURCE_SCOPE_MISMATCH' });
  });

  it('blocks and rolls back when Binary Authorization is non-conformant', async () => {
    const registry = new MemoryRegistry();

    const runtime = new LiveServerImagePromotionRuntime(
      parseArtifactPromotionConfig(configJson()),
      registry,
      binaryAuthorization('NON_CONFORMANT'),
    );
    await expect(
      runtime.promote({ organizationId: ORG, projectId: PROJECT, source: { repo: SOURCE, digest: DIGEST } }),
    ).rejects.toMatchObject({ code: 'PROMOTION_BINAUTHZ_DENIED' });
    expect(registry.images.has(`${TARGET}@${DIGEST}`)).toBe(false);
  });

  it('refuses duplicate tenant targets, source=target and unknown config keys', () => {
    expect(() =>
      parseArtifactPromotionConfig(
        configJson({
          [ORG]: {
            targetRepository: 'europe-west9-docker.pkg.dev/tenant-proj/shared-repo',
            binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
            binaryAuthorizationPolicyEtag: 'policy-etag-0001',
          },
          org_other: {
            targetRepository: 'europe-west9-docker.pkg.dev/tenant-proj/shared-repo',
            binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
            binaryAuthorizationPolicyEtag: 'policy-etag-0001',
          },
        }),
      ),
    ).toThrow(/cannot be shared/u);
    expect(() =>
      parseArtifactPromotionConfig(
        configJson({
          [ORG]: {
            targetRepository: 'europe-west9-docker.pkg.dev/source-proj/build-repo',
            binaryAuthorizationPolicy: 'projects/policy-proj/platforms/gke/policies/release-policy',
            binaryAuthorizationPolicyEtag: 'policy-etag-0001',
          },
        }),
      ),
    ).toThrow(/distinct/u);
    expect(() =>
      parseArtifactPromotionConfig(
        JSON.stringify({
          sourceRepository: 'europe-west9-docker.pkg.dev/source-proj/build-repo',
          tenants: {},
          unexpected: true,
        }),
      ),
    ).toThrow();
  });
});
