import { describe, expect, it, vi } from 'vitest';
import {
  eraseProjectsStorage,
  type ObjectStorageErasurePort,
  type WorkspaceVolumeErasurePort,
} from '../account-storage-purge.js';

/* ------------------------- in-memory fake backends ------------------------- */

class FakeObjectStorage implements ObjectStorageErasurePort {
  // projectId -> object keys
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
    if (this.refuseDelete) {
      return { deleted: false, bucket: `vc-${projectId}` };
    }

    this.buckets.delete(projectId);

    return { deleted: true, bucket: `vc-${projectId}` };
  }
}

class FakeWorkspaceVolumes implements WorkspaceVolumeErasurePort {
  readonly present = new Set<string>();
  refuseDelete = false;

  seed(workspaceId: string) {
    this.present.add(workspaceId);
  }

  async workspaceExists(workspaceId: string) {
    return this.present.has(workspaceId);
  }

  async deleteWorkspace(workspaceId: string) {
    if (this.refuseDelete) {
      throw new Error('kubectl unavailable');
    }

    this.present.delete(workspaceId);
  }
}

const wsIdFor = (projectId: string) => `ws-${projectId}`;

describe('eraseProjectsStorage', () => {
  it('lists before, deletes, verifies 0 remaining, and reports evidence', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.seed('p1', ['a.png', 'b.json', 'nested/c.txt']);
    const workspaceVolumes = new FakeWorkspaceVolumes();
    workspaceVolumes.seed('ws-p1');

    const out = await eraseProjectsStorage(['p1'], { objectStorage, workspaceVolumes, workspaceIdFor: wsIdFor });

    expect(out.verified).toBe(true);
    const [os, ws] = out.classes;
    expect(os).toMatchObject({
      dataClass: 'object_storage',
      action: 'deleted',
      remainingAfterPurge: 0,
      models: { Projects: 1, BucketsDeleted: 1, ObjectsErased: 3 },
    });
    expect(ws).toMatchObject({ dataClass: 'workspace_volumes', remainingAfterPurge: 0, models: { WorkspacesDeleted: 1 } });
    expect(objectStorage.buckets.has('p1')).toBe(false);
    expect(workspaceVolumes.present.has('ws-p1')).toBe(false);
  });

  it('FAIL-CLOSED: a bucket that will not delete leaves remainingAfterPurge > 0 (not verified)', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.seed('p1', ['keep.png']);
    objectStorage.refuseDelete = true;

    const out = await eraseProjectsStorage(['p1'], { objectStorage, workspaceIdFor: wsIdFor });

    expect(out.verified).toBe(false);
    expect(out.classes[0].remainingAfterPurge).toBe(1);
  });

  it('FAIL-CLOSED: a workspace delete that throws leaves the volume as remaining', async () => {
    const workspaceVolumes = new FakeWorkspaceVolumes();
    workspaceVolumes.seed('ws-p1');
    workspaceVolumes.refuseDelete = true;
    const warn = vi.fn();

    const out = await eraseProjectsStorage(['p1'], { workspaceVolumes, workspaceIdFor: wsIdFor, log: { warn } });

    expect(out.verified).toBe(false);
    expect(out.classes[1].remainingAfterPurge).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it('is a verified no-op when a project has no bucket and no workspace (idempotent retry)', async () => {
    const objectStorage = new FakeObjectStorage();
    const workspaceVolumes = new FakeWorkspaceVolumes();

    const out = await eraseProjectsStorage(['p1'], { objectStorage, workspaceVolumes, workspaceIdFor: wsIdFor });

    expect(out.verified).toBe(true);
    expect(out.classes[0].models).toMatchObject({ ObjectsErased: 0, BucketsDeleted: 0 });
    expect(out.classes[1].models).toMatchObject({ WorkspacesDeleted: 0 });
  });

  it('verifies vacuously (nothing to erase) for an account with no projects', async () => {
    const out = await eraseProjectsStorage([], {
      objectStorage: new FakeObjectStorage(),
      workspaceVolumes: new FakeWorkspaceVolumes(),
      workspaceIdFor: wsIdFor,
    });

    expect(out.verified).toBe(true);
    expect(out.results).toHaveLength(0);
  });

  it('aggregates across multiple projects and fails closed if ANY remains', async () => {
    const objectStorage = new FakeObjectStorage();
    objectStorage.seed('p1', ['x']);
    objectStorage.seed('p2', ['y', 'z']);
    const workspaceVolumes = new FakeWorkspaceVolumes();
    workspaceVolumes.seed('ws-p1');
    workspaceVolumes.seed('ws-p2');
    // p2's workspace refuses deletion.
    const original = workspaceVolumes.deleteWorkspace.bind(workspaceVolumes);
    workspaceVolumes.deleteWorkspace = async (id: string) => {
      if (id === 'ws-p2') {
        throw new Error('boom');
      }

      return original(id);
    };

    const out = await eraseProjectsStorage(['p1', 'p2'], { objectStorage, workspaceVolumes, workspaceIdFor: wsIdFor });

    expect(out.classes[0].remainingAfterPurge).toBe(0); // both buckets gone
    expect(out.classes[1].remainingAfterPurge).toBe(1); // p2 workspace stuck
    expect(out.verified).toBe(false);
  });
});
