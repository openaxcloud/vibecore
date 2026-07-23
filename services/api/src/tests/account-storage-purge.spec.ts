import { describe, expect, it, vi } from 'vitest';
import {
  eraseSubjectStorage,
  type ObjectStorageErasurePort,
  type WorkspaceVolumeErasurePort,
  type WriteBarrierPort,
} from '../account-storage-purge.js';

/* ------------------------- in-memory fake backends ------------------------- */

class FakeObjectStorage implements ObjectStorageErasurePort {
  readonly active = true;
  readonly buckets = new Map<string, string[]>();
  refuseDelete = false;

  seed(projectId: string, keys: string[]) {
    this.buckets.set(projectId, keys);
  }

  async bucketExists(projectId: string) {
    return this.buckets.has(projectId);
  }

  async listObjects(projectId: string) {
    return { objects: (this.buckets.get(projectId) ?? []).map((key) => ({ key })) };
  }

  async deleteBucket(projectId: string) {
    if (!this.refuseDelete) {
      this.buckets.delete(projectId);
    }

    return { deleted: !this.refuseDelete, bucket: `vc-${projectId}` };
  }
}

class FakePvcs implements WorkspaceVolumeErasurePort {
  readonly present = new Set<string>();
  refuseDelete = false;

  seed(workspaceId: string) {
    this.present.add(workspaceId);
  }

  async pvcExists(workspaceId: string) {
    return this.present.has(workspaceId);
  }

  async deleteWorkspace(workspaceId: string) {
    if (this.refuseDelete) {
      throw new Error('kubectl unavailable');
    }

    this.present.delete(workspaceId);
  }
}

function recordingBarrier(): WriteBarrierPort & { frozen: boolean } {
  const barrier = {
    frozen: false,
    async freeze() {
      barrier.frozen = true;
    },
  };

  return barrier;
}

describe('eraseSubjectStorage', () => {
  it('freezes writes first, then erases buckets + PVCs and verifies 0 remaining', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.seed('p1', ['a.png', 'b.json']);
    const workspaceVolumes = new FakePvcs();
    workspaceVolumes.seed('ws-p1');
    workspaceVolumes.seed('ws-shared'); // a collaborator workspace in a shared org
    const barrier = recordingBarrier();

    const out = await eraseSubjectStorage(
      { bucketProjectIds: ['p1'], workspaceIds: ['ws-p1', 'ws-shared'] },
      { objectStorage, workspaceVolumes, writeBarrier: barrier },
    );

    expect(barrier.frozen).toBe(true); // reserve #1
    expect(out.verified).toBe(true);
    const [os, vols] = out.classes;
    expect(os).toMatchObject({ remainingAfterPurge: 0, models: { ObjectsErased: 2, BucketsDeleted: 1 } });
    expect(vols).toMatchObject({ remainingAfterPurge: 0, models: { Workspaces: 2, PvcsDeleted: 2, WriteBarrier: 1 } });
    expect(objectStorage.buckets.has('p1')).toBe(false);
    expect(workspaceVolumes.present.size).toBe(0);
  });

  it('FAIL-CLOSED: a freeze failure aborts erasure — nothing deleted, not verified (reserve #1)', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.seed('p1', ['keep.png']);
    const workspaceVolumes = new FakePvcs();
    workspaceVolumes.seed('ws-p1');
    const warn = vi.fn();

    const out = await eraseSubjectStorage(
      { bucketProjectIds: ['p1'], workspaceIds: ['ws-p1'] },
      {
        objectStorage,
        workspaceVolumes,
        writeBarrier: {
          async freeze() {
            throw new Error('cannot revoke tokens');
          },
        },
        log: { warn },
      },
    );

    expect(out.frozen).toBe(false);
    expect(out.verified).toBe(false);
    expect(objectStorage.buckets.has('p1')).toBe(true); // NOT deleted — barrier held it closed
    expect(workspaceVolumes.present.has('ws-p1')).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('FAIL-CLOSED: a PVC that survives the delete (real k8s check) is caught (reserve #2)', async () => {
    const workspaceVolumes = new FakePvcs();
    workspaceVolumes.seed('ws-p1');
    workspaceVolumes.refuseDelete = true;

    const out = await eraseSubjectStorage(
      { bucketProjectIds: [], workspaceIds: ['ws-p1'] },
      { workspaceVolumes, writeBarrier: recordingBarrier() },
    );

    expect(out.verified).toBe(false);
    expect(out.classes[1].remainingAfterPurge).toBe(1);
  });

  it('erases buckets and workspaces from independent inventories (reserve #3)', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.seed('sole1', ['x']);
    const workspaceVolumes = new FakePvcs();
    // buckets only for the sole org, but workspaces for sole + two collaborator projects
    workspaceVolumes.seed('ws-sole1');
    workspaceVolumes.seed('ws-collab1');
    workspaceVolumes.seed('ws-collab2');

    const out = await eraseSubjectStorage(
      { bucketProjectIds: ['sole1'], workspaceIds: ['ws-sole1', 'ws-collab1', 'ws-collab2'] },
      { objectStorage, workspaceVolumes, writeBarrier: recordingBarrier() },
    );

    expect(out.verified).toBe(true);
    expect(out.classes[0].models).toMatchObject({ Buckets: 1, BucketsDeleted: 1 });
    expect(out.classes[1].models).toMatchObject({ Workspaces: 3, PvcsDeleted: 3 });
  });

  it('FAIL-CLOSED: an inert (active:false) object-storage backend cannot certify absence (reserve #2)', async () => {
    // A NoopObjectStorage would return bucketExists=false ("absent") — but it
    // proves nothing. With buckets to erase, the purge must be REFUSED.
    const inertObjectStorage: ObjectStorageErasurePort = {
      active: false,
      async bucketExists() {
        return false;
      },
      async listObjects() {
        return { objects: [] };
      },
      async deleteBucket(projectId) {
        return { deleted: false, bucket: `vc-${projectId}` };
      },
    };
    const deleteSpy = vi.spyOn(inertObjectStorage, 'deleteBucket');

    const out = await eraseSubjectStorage(
      { bucketProjectIds: ['p1'], workspaceIds: [] },
      { objectStorage: inertObjectStorage, writeBarrier: recordingBarrier() },
    );

    expect(out.verified).toBe(false);
    expect(out.classes[0].remainingAfterPurge).toBeGreaterThan(0);
    expect(out.classes[0].models.RealBackend).toBe(0);
    expect(deleteSpy).not.toHaveBeenCalled(); // never even attempts a destructive delete
  });

  it('is a verified no-op for an empty inventory', async () => {
    const out = await eraseSubjectStorage(
      { bucketProjectIds: [], workspaceIds: [] },
      { objectStorage: new FakeObjectStorage(), workspaceVolumes: new FakePvcs(), writeBarrier: recordingBarrier() },
    );

    expect(out.verified).toBe(true);
    expect(out.buckets).toHaveLength(0);
    expect(out.workspaces).toHaveLength(0);
  });
});
