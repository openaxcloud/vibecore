import type { DatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';
import { PrismaApiStore } from './prisma-store.js';

describe('workspace IDE migration persistence', () => {
  it('uses conflict-ignore insertion and returns a concurrent winner without updating it', async () => {
    const winner = {
      workspaceId: 'primary',
      state: {},
      version: 7,
      updatedByUserId: 'other-user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const workspaceIdeState = {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(winner),
      update: vi.fn(),
      upsert: vi.fn(),
    };

    const store = new PrismaApiStore({ workspaceIdeState } as unknown as DatabaseClient);
    const input = { workspaceId: 'primary', state: { ui: { agentWidth: 520 } }, updatedByUserId: 'legacy-user' };
    const result = await store.createWorkspaceIdeStateIfAbsent(input);
    expect(workspaceIdeState.createMany).toHaveBeenCalledWith({ data: input, skipDuplicates: true });
    expect(workspaceIdeState.findUniqueOrThrow).toHaveBeenCalledWith({ where: { workspaceId: 'primary' } });
    expect(result).toMatchObject({ state: {}, version: 7, updatedByUserId: 'other-user' });
    expect(workspaceIdeState.update).not.toHaveBeenCalled();
    expect(workspaceIdeState.upsert).not.toHaveBeenCalled();
  });
});
