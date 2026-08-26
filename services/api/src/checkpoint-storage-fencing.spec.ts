import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { CheckpointBarrierError } from './checkpoint-barrier-storage.js';
import { LocalProjectStorage, withProjectLock } from './project-storage.js';

const temporaryRoots: string[] = [];

async function temporaryStorageRoot() {
  const root = await mkdtemp(join(tmpdir(), 'vibecore-checkpoint-storage-'));
  temporaryRoots.push(root);

  return root;
}

afterEach(async () => {
  delete process.env.PROJECT_STORAGE_DIR;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('checkpoint storage fencing at the tree mutation linearization point', () => {
  it('serializes barrier acquisition after an in-flight mutation, then blocks every later mutation', async () => {
    process.env.PROJECT_STORAGE_DIR = await temporaryStorageRoot();

    const projectId = `project-lock-${Date.now()}`;

    let activeBarrier = false;
    let releaseGuard!: () => void;

    const guardGate = new Promise<void>((resolve) => {
      releaseGuard = resolve;
    });

    let guardEntered!: () => void;

    const entered = new Promise<void>((resolve) => {
      guardEntered = resolve;
    });

    let holdFirstGuard = true;

    const storage = new LocalProjectStorage(async () => {
      if (activeBarrier) {
        throw new CheckpointBarrierError('bar_test');
      }

      if (holdFirstGuard) {
        holdFirstGuard = false;
        guardEntered();
        await guardGate;
      }
    });

    const firstWrite = storage.writeFiles(projectId, [{ path: 'state.txt', content: 'before barrier' }]);
    await entered;

    let barrierAcquired = false;

    const acquire = withProjectLock(projectId, async () => {
      activeBarrier = true;
      barrierAcquired = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(barrierAcquired).toBe(false);
    releaseGuard();
    await firstWrite;
    await acquire;
    expect(barrierAcquired).toBe(true);

    await expect(
      storage.writeFiles(projectId, [{ path: 'state.txt', content: 'must not land' }]),
    ).rejects.toMatchObject({ code: 'CHECKPOINT_BARRIER_ACTIVE' });
    expect((await storage.listFiles(projectId)).find((file) => file.path === 'state.txt')?.content).toBe(
      'before barrier',
    );
  });

  it('revalidates immediately before clear and before every restore write, stopping permanently on loss', async () => {
    process.env.PROJECT_STORAGE_DIR = await temporaryStorageRoot();

    const projectId = `project-restore-${Date.now()}`;
    const storage = new LocalProjectStorage();
    await storage.writeFiles(projectId, [
      { path: 'a.txt', content: 'old-a' },
      { path: 'b.txt', content: 'old-b' },
    ]);

    let guards = 0;

    const guard = async () => {
      guards += 1;

      if (guards >= 3) {
        throw Object.assign(new Error('lease lost'), { code: 'CHECKPOINT_BARRIER_LOST' });
      }
    };

    await expect(
      storage.restoreSnapshot(
        {
          projectId,
          files: [
            { path: 'a.txt', content: 'new-a', updatedAt: '' },
            { path: 'b.txt', content: 'new-b', updatedAt: '' },
            { path: 'c.txt', content: 'new-c', updatedAt: '' },
          ],
        },
        guard,
      ),
    ).rejects.toMatchObject({ code: 'CHECKPOINT_BARRIER_LOST' });

    const after = await storage.listFiles(projectId);
    expect(after).toEqual([{ path: 'a.txt', content: 'new-a', encoding: 'utf8', updatedAt: expect.any(String) }]);
    expect(guards).toBe(3);
  });
});
