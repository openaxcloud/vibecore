import { describe, expect, it } from 'vitest';

import type { OciAttachment } from './artifact-promotion.js';
import type { ArtifactRegistryPackageSnapshot } from './artifact-registry-adapter.js';
import { buildServerRollbackPromotionEvidence } from './deterministic-rollback.js';
import {
  captureProjectRegistryErasureInventory,
  executeProjectRegistryErasure,
  type ProjectRegistryErasureGuard,
  type ProjectRegistryErasureProvider,
  type ProjectRegistryReferenceAuthority,
  type RegistryErasureReference,
} from './project-registry-erasure.js';
import type { ReleaseManifestRecord } from './store.js';

const PROJECT_ID = 'project1234';
const ORGANIZATION_ID = 'organization1234';
const SOURCE = `europe-west9-docker.pkg.dev/source-proj/build-repo/p-${PROJECT_ID}`;
const TARGET = `europe-west9-docker.pkg.dev/tenant-proj/tenant-repo/p-${PROJECT_ID}`;
const IMAGE = `sha256:${'a'.repeat(64)}`;
const ATTACHMENTS = ['b', 'c', 'd'].map((value) => `sha256:${value.repeat(64)}`);
const UNKNOWN = `sha256:${'e'.repeat(64)}`;
const RETENTION_TAG = `active-promo-${'f'.repeat(32)}`;

function promotionEvidence(): ReleaseManifestRecord['promotionEvidence'] {
  return buildServerRollbackPromotionEvidence({
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    artifactRef: TARGET,
    artifactDigest: IMAGE,
    promotion: {
      promotionId: `promo-${'1'.repeat(32)}`,
      sourceRepo: SOURCE,
      sourceDigest: IMAGE,
      targetRepo: TARGET,
      targetTenant: ORGANIZATION_ID,
      retentionTag: RETENTION_TAG,
      attachments: ['signature', 'sbom', 'provenance'].map((type, index) => ({
        type,
        digest: ATTACHMENTS[index]!,
        subjectDigest: IMAGE,
        relinked: true,
      })),
      binaryAuthorizationResult: 'PASSED',
      binaryAuthorizationPolicy: 'projects/tenant-proj/platforms/gke/policies/prod-policy',
      binaryAuthorizationPolicyEtag: 'policy-etag-v1',
      binaryAuthorizationEvaluatedImage: `${TARGET}@${IMAGE}`,
      binaryAuthorizationEvaluatedAt: '2026-08-28T00:00:00.000Z',
      state: 'PROMOTION_COMMITTED',
      preparedAt: '2026-08-28T00:00:00.000Z',
      committedAt: '2026-08-28T00:00:01.000Z',
    },
  });
}

function releases(): Array<
  Pick<ReleaseManifestRecord, 'projectId' | 'artifactKind' | 'artifactRef' | 'artifactDigest' | 'promotionEvidence'>
> {
  return [
    {
      projectId: PROJECT_ID,
      artifactKind: 'server-image',
      artifactRef: TARGET,
      artifactDigest: IMAGE,
      promotionEvidence: promotionEvidence(),
    },
  ];
}

interface PackageState {
  exists: boolean;
  versions: Set<string>;
  tags: Map<string, string>;
  referrers: Map<string, OciAttachment>;
}

class MemoryProvider implements ProjectRegistryErasureProvider {
  readonly packages = new Map<string, PackageState>();
  readonly effects: string[] = [];
  throwAfterEffect: string | undefined;

  seed(repository: string, input: { unknown?: boolean; buildTag?: boolean } = {}): void {
    const referrers = new Map<string, OciAttachment>();
    ATTACHMENTS.forEach((digest, index) => {
      referrers.set(digest, {
        digest,
        artifactType: `application/unit-${index}`,
        subjectDigest: IMAGE,
        payloadVerified: true,
        verifiedKind: ['signature', 'sbom', 'provenance'][index] as OciAttachment['verifiedKind'],
      });
    });

    const versions = new Set([IMAGE, ...ATTACHMENTS]);

    if (input.unknown) {
      versions.add(UNKNOWN);
    }

    this.packages.set(repository, {
      exists: true,
      versions,
      tags: new Map([
        ...(repository === TARGET ? ([[RETENTION_TAG, IMAGE]] as Array<[string, string]>) : []),
        ...(input.buildTag ? ([['build-42', IMAGE]] as Array<[string, string]>) : []),
      ]),
      referrers,
    });
  }

  private _state(repository: string): PackageState {
    return (
      this.packages.get(repository) ?? {
        exists: false,
        versions: new Set(),
        tags: new Map(),
        referrers: new Map(),
      }
    );
  }

  private _effect(name: string): void {
    this.effects.push(name);

    if (this.throwAfterEffect === name) {
      this.throwAfterEffect = undefined;
      throw new Error('simulated response loss after provider accepted mutation');
    }
  }

  async snapshotPackage(repository: string): Promise<ArtifactRegistryPackageSnapshot> {
    const state = this._state(repository);
    return {
      repository,
      exists: state.exists,
      versions: [...state.versions].sort(),
      tags: [...state.tags].map(([name, digest]) => ({ name, digest })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async manifestExists(repository: string, digest: string): Promise<boolean> {
    return this._state(repository).versions.has(digest);
  }

  async listReferrers(repository: string, digest: string): Promise<OciAttachment[]> {
    return [...this._state(repository).referrers.values()].filter(
      (attachment) => attachment.subjectDigest === digest && this._state(repository).versions.has(attachment.digest),
    );
  }

  async tagExists(repository: string, tag: string): Promise<boolean> {
    return this._state(repository).tags.has(tag);
  }

  async deleteTag(repository: string, tag: string): Promise<void> {
    this._state(repository).tags.delete(tag);
    this._effect(`tag:${repository}:${tag}`);
  }

  async deleteReferrer(repository: string, digest: string): Promise<void> {
    const state = this._state(repository);
    state.versions.delete(digest);
    state.referrers.delete(digest);
    this._effect(`referrer:${repository}:${digest}`);
  }

  async deleteImage(repository: string, digest: string): Promise<void> {
    const state = this._state(repository);
    state.versions.delete(digest);

    for (const [tag, target] of state.tags) {
      if (target === digest) {
        state.tags.delete(tag);
      }
    }
    this._effect(`image:${repository}:${digest}`);
  }

  async deleteVersion(repository: string, digest: string): Promise<void> {
    this._state(repository).versions.delete(digest);
    this._effect(`version:${repository}:${digest}`);
  }

  async deletePackage(repository: string): Promise<void> {
    const state = this._state(repository);
    state.exists = false;
    state.versions.clear();
    state.tags.clear();
    state.referrers.clear();
    this._effect(`package:${repository}`);
  }
}

function referenceKey(reference: RegistryErasureReference): string {
  return reference.kind === 'manifest'
    ? `manifest:${reference.repository}:${reference.digest}`
    : `tag:${reference.repository}:${reference.tag}:${reference.digest}`;
}

class MemoryAuthority implements ProjectRegistryReferenceAuthority {
  readonly outside = new Map<string, number>();

  set(reference: RegistryErasureReference, count: number): void {
    this.outside.set(referenceKey(reference), count);
  }

  async countOutsideProject(reference: RegistryErasureReference, excludedProjectId: string): Promise<number> {
    expect(excludedProjectId).toBe(PROJECT_ID);
    return this.outside.get(referenceKey(reference)) ?? 0;
  }
}

class MemoryGuard implements ProjectRegistryErasureGuard {
  assertions = 0;
  fences = 0;
  expectedHash: string | undefined;

  async assertPreparedAndLease(input: { projectId: string; inventoryHash: string }): Promise<void> {
    expect(input.projectId).toBe(PROJECT_ID);
    expect(input.inventoryHash).toBe(this.expectedHash);
    this.assertions += 1;
  }

  async withPackageFence<T>(_repository: string, effect: () => Promise<T>): Promise<T> {
    this.fences += 1;
    return effect();
  }
}

async function capture(provider: MemoryProvider, authority: MemoryAuthority) {
  return captureProjectRegistryErasureInventory({
    projectId: PROJECT_ID,
    sourceImages: [{ repo: SOURCE, digest: IMAGE, tags: ['build-42'] }],
    tenantImages: [{ repo: TARGET, digest: IMAGE }],
    releaseManifests: releases(),
    provider,
    referenceAuthority: authority,
  });
}

async function execute(
  provider: MemoryProvider,
  authority: MemoryAuthority,
  inventory: Awaited<ReturnType<typeof capture>>,
) {
  const guard = new MemoryGuard();
  guard.expectedHash = inventory.inventoryHash;

  const receipt = await executeProjectRegistryErasure({ inventory, provider, referenceAuthority: authority, guard });

  return { guard, receipt };
}

describe('project Artifact Registry permanent erasure', () => {
  it('captures source, tenant, attestations, unknown live versions and tags without secret promotion fields', async () => {
    const provider = new MemoryProvider();
    provider.seed(SOURCE, { unknown: true, buildTag: true });
    provider.seed(TARGET);

    const inventory = await capture(provider, new MemoryAuthority());

    expect(inventory.packages).toHaveLength(2);
    expect(inventory.packages.find((pkg) => pkg.repository === SOURCE)?.manifests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'image', digest: IMAGE, presentAtCapture: true }),
        expect.objectContaining({ kind: 'version', digest: UNKNOWN, presentAtCapture: true }),
        expect.objectContaining({ kind: 'referrer', digest: ATTACHMENTS[0], subjectDigest: IMAGE }),
      ]),
    );
    expect(inventory.packages.find((pkg) => pkg.repository === TARGET)?.tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: RETENTION_TAG, digest: IMAGE })]),
    );

    const serialized = JSON.stringify(inventory);
    expect(serialized).not.toContain('binaryAuthorizationPolicy');
    expect(serialized).not.toContain('organization1234');
    expect(serialized).not.toContain('policy-etag-v1');
    expect(inventory.inventoryHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('erases exact packages and replays the same durable inventory after a lost provider response', async () => {
    const provider = new MemoryProvider();
    provider.seed(SOURCE, { unknown: true, buildTag: true });
    provider.seed(TARGET);

    const authority = new MemoryAuthority();
    const inventory = await capture(provider, authority);
    provider.throwAfterEffect = `tag:${SOURCE}:build-42`;

    const guard = new MemoryGuard();
    guard.expectedHash = inventory.inventoryHash;
    await expect(
      executeProjectRegistryErasure({ inventory, provider, referenceAuthority: authority, guard }),
    ).rejects.toThrow('simulated response loss');

    const replay = await execute(provider, authority, inventory);
    expect(await provider.snapshotPackage(SOURCE)).toMatchObject({ exists: false, versions: [], tags: [] });
    expect(await provider.snapshotPackage(TARGET)).toMatchObject({ exists: false, versions: [], tags: [] });
    expect(replay.receipt).toMatchObject({
      packageCount: 2,
      erasedPackageCount: 2,
      retainedPackageCount: 0,
      retainedManifestCount: 0,
      retainedTagCount: 0,
    });
    expect(replay.guard.fences).toBe(2);
    expect(replay.guard.assertions).toBeGreaterThan(provider.effects.length);

    const secondReplay = await execute(provider, authority, inventory);
    expect(secondReplay.receipt).toEqual(replay.receipt);
    expect(JSON.stringify(replay.receipt)).not.toContain(PROJECT_ID);
  });

  it('rechecks global refcounts under the package fence and retains shared image/referrer evidence exactly', async () => {
    const provider = new MemoryProvider();
    provider.seed(SOURCE, { buildTag: true });
    provider.seed(TARGET);

    const authority = new MemoryAuthority();
    const inventory = await capture(provider, authority);

    authority.set({ kind: 'manifest', repository: TARGET, digest: IMAGE }, 2);
    authority.set({ kind: 'manifest', repository: TARGET, digest: ATTACHMENTS[0]! }, 1);

    const { receipt } = await execute(provider, authority, inventory);
    expect(await provider.snapshotPackage(SOURCE)).toMatchObject({ exists: false, versions: [], tags: [] });
    expect(await provider.snapshotPackage(TARGET)).toEqual({
      repository: TARGET,
      exists: true,
      versions: [IMAGE, ATTACHMENTS[0]!].sort(),
      tags: [],
    });
    expect(receipt).toMatchObject({
      erasedPackageCount: 1,
      retainedPackageCount: 1,
      retainedManifestCount: 2,
      retainedTagCount: 0,
    });
  });

  it('fails before every mutation when the provider gained an unplanned version after durable capture', async () => {
    const provider = new MemoryProvider();
    provider.seed(SOURCE, { buildTag: true });
    provider.seed(TARGET);

    const authority = new MemoryAuthority();
    const inventory = await capture(provider, authority);
    provider.packages.get(SOURCE)!.versions.add(UNKNOWN);

    const guard = new MemoryGuard();
    guard.expectedHash = inventory.inventoryHash;

    await expect(
      executeProjectRegistryErasure({ inventory, provider, referenceAuthority: authority, guard }),
    ).rejects.toMatchObject({ code: 'REGISTRY_ERASURE_INVENTORY_STALE' });
    expect(provider.effects).toEqual([]);
  });

  it('rejects cross-project package references and tampered durable inventories', async () => {
    const provider = new MemoryProvider();
    const authority = new MemoryAuthority();

    await expect(
      captureProjectRegistryErasureInventory({
        projectId: PROJECT_ID,
        sourceImages: [
          {
            repo: 'europe-west9-docker.pkg.dev/source-proj/build-repo/p-another-project',
            digest: IMAGE,
          },
        ],
        tenantImages: [],
        releaseManifests: [],
        provider,
        referenceAuthority: authority,
      }),
    ).rejects.toMatchObject({ code: 'REGISTRY_ERASURE_SCOPE_MISMATCH' });

    provider.seed(SOURCE, { buildTag: true });
    provider.seed(TARGET);

    const inventory = await capture(provider, authority);
    const guard = new MemoryGuard();
    guard.expectedHash = inventory.inventoryHash;

    await expect(
      executeProjectRegistryErasure({
        inventory: { ...inventory, packages: inventory.packages.slice(1) },
        provider,
        referenceAuthority: authority,
        guard,
      }),
    ).rejects.toMatchObject({ code: 'REGISTRY_ERASURE_INVENTORY_TAMPERED' });
    expect(provider.effects).toEqual([]);
  });
});
