import { describe, expect, it, vi } from 'vitest';

import type { PurgeEffectDescriptor, PurgeEffectExecution, PurgeLeaseContext } from '../account-purge.js';
import {
  eraseSubjectStorage,
  type ObjectStorageErasurePort,
  type WorkspaceVolumeErasurePort,
  type WriteBarrierPort,
} from '../account-storage-purge.js';

class FakeObjectStorage implements ObjectStorageErasurePort {
  readonly active = true;
  readonly buckets = new Map<string, string[]>();
  keepBucket = false;

  async bucketExists(projectId: string) {
    return this.buckets.has(projectId);
  }

  async listObjects(projectId: string) {
    return { objects: (this.buckets.get(projectId) ?? []).map((key) => ({ key })) };
  }

  async deleteBucket(projectId: string) {
    if (!this.keepBucket) this.buckets.delete(projectId);
    return { deleted: !this.keepBucket, bucket: `vc-${projectId}` };
  }
}

class FakeWorkspaces implements WorkspaceVolumeErasurePort {
  readonly pvcs = new Set<string>();
  readonly deleted: string[] = [];

  async pvcExists(workspaceId: string) {
    return this.pvcs.has(workspaceId);
  }

  async deleteWorkspace(workspaceId: string) {
    this.deleted.push(workspaceId);
    this.pvcs.delete(workspaceId);
  }
}

function barrier(): WriteBarrierPort & { calls: number } {
  return {
    calls: 0,
    async freeze() {
      this.calls += 1;
    },
  };
}

function lease(): PurgeLeaseContext & { receipts: Map<string, Record<string, unknown>> } {
  const receipts = new Map<string, Record<string, unknown>>();
  return {
    planId: 'plan-1',
    ownerToken: 'owner-token-123456',
    receipts,
    validate: async () => undefined,
    executeEffect: async <T extends Record<string, unknown>>(
      descriptor: PurgeEffectDescriptor,
      effect: () => Promise<T>,
    ): Promise<PurgeEffectExecution<T>> => {
      const existing = receipts.get(descriptor.key);
      if (existing) return { executed: false, receipt: existing as T };
      const receipt = await effect();
      receipts.set(descriptor.key, receipt);
      return { executed: true, receipt };
    },
  };
}

describe('account physical-storage erasure', () => {
  it('freezes first and records a provider-verified GCS receipt', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.buckets.set('project-1', ['a', 'b']);
    const workspaces = new FakeWorkspaces();
    workspaces.pvcs.add('workspace-1');
    const writeBarrier = barrier();
    const purgeLease = lease();

    const result = await eraseSubjectStorage(
      { bucketProjectIds: ['project-1'], workspaceIds: ['workspace-1'] },
      { objectStorage, workspaceVolumes: workspaces, writeBarrier, lease: purgeLease },
    );

    expect(writeBarrier.calls).toBe(1);
    expect(result.verified).toBe(true);
    expect(result.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dataClass: 'object_storage', remainingAfterPurge: 0 }),
        expect.objectContaining({ dataClass: 'workspace_volumes', remainingAfterPurge: 0 }),
      ]),
    );
    expect(purgeLease.receipts.get('gcs-bucket:project-1')).toMatchObject({
      bucket: 'vc-project-1',
      verifiedAbsent: true,
      bucketStillExists: false,
      objectsRemaining: 0,
    });
  });

  it('still purges the Pod, Service and Secret path when the PVC was already absent', async () => {
    const workspaces = new FakeWorkspaces();

    const result = await eraseSubjectStorage(
      { bucketProjectIds: [], workspaceIds: ['workspace-without-pvc'] },
      { workspaceVolumes: workspaces, writeBarrier: barrier(), lease: lease() },
    );

    expect(workspaces.deleted).toEqual(['workspace-without-pvc']);
    expect(result.verified).toBe(true);
    expect(result.workspaces[0]).toMatchObject({ pvcExistedBefore: false, pvcRemaining: 0 });
  });

  it('fails closed without invoking a physical effect when the write barrier cannot be installed', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.buckets.set('project-1', ['keep']);
    const purgeLease = lease();
    const deleteBucket = vi.spyOn(objectStorage, 'deleteBucket');

    const result = await eraseSubjectStorage(
      { bucketProjectIds: ['project-1'], workspaceIds: [] },
      {
        objectStorage,
        writeBarrier: {
          freeze: async () => {
            throw new Error('barrier unavailable');
          },
        },
        lease: purgeLease,
      },
    );

    expect(result.verified).toBe(false);
    expect(deleteBucket).not.toHaveBeenCalled();
    expect(purgeLease.receipts.size).toBe(0);
  });

  it('refuses to certify an empty-but-still-present bucket', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.buckets.set('project-1', []);
    objectStorage.keepBucket = true;

    const result = await eraseSubjectStorage(
      { bucketProjectIds: ['project-1'], workspaceIds: [] },
      { objectStorage, writeBarrier: barrier(), lease: lease() },
    );

    expect(result.verified).toBe(false);
    expect(result.classes[0]).toMatchObject({
      dataClass: 'object_storage',
      remainingAfterPurge: expect.any(Number),
    });
    expect(result.classes[0].remainingAfterPurge).toBeGreaterThan(0);
  });
});
