import { describe, expect, it, vi } from 'vitest';
import { ProjectCheckpointLeaseLostError, ProjectCheckpointLeaseManager } from './checkpoint-lease.js';

const lease = {
  checkpointId: 'checkpoint-1',
  barrierId: 'barrier-1',
  ownerToken: 'owner-1',
  fence: 7,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe('ProjectCheckpointLeaseManager', () => {
  it('renews well below TTL and keeps the fenced guard live', async () => {
    vi.useFakeTimers();

    const store = {
      renewProjectCheckpointBarrier: vi.fn(async () => new Date(Date.now() + 60_000).toISOString()),
      assertProjectCheckpointBarrier: vi.fn(async () => undefined),
    };

    const manager = new ProjectCheckpointLeaseManager(store, lease, 60, 10_000);
    manager.start();
    await vi.advanceTimersByTimeAsync(10_001);
    await manager.guard();
    expect(store.renewProjectCheckpointBarrier).toHaveBeenCalledWith({
      checkpointId: lease.checkpointId,
      ownerToken: lease.ownerToken,
      fence: lease.fence,
      ttlSeconds: 60,
    });
    expect(store.assertProjectCheckpointBarrier).toHaveBeenCalledTimes(1);
    await manager.stop();
    vi.useRealTimers();
  });

  it('is permanently fail-closed after a renewal loses ownership', async () => {
    vi.useFakeTimers();

    const store = {
      renewProjectCheckpointBarrier: vi.fn(async () => undefined),
      assertProjectCheckpointBarrier: vi.fn(async () => undefined),
    };

    const manager = new ProjectCheckpointLeaseManager(store, lease, 60, 10_000);
    manager.start();
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(manager.guard()).rejects.toBeInstanceOf(ProjectCheckpointLeaseLostError);
    expect(store.assertProjectCheckpointBarrier).not.toHaveBeenCalled();
    await manager.stop();
    vi.useRealTimers();
  });
});
