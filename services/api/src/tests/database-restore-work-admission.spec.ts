import type { DatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';
import { PrismaRestoreWorkAdmission, type RestoreWorkScope } from '../database-restore-work-admission.js';

const scope: RestoreWorkScope = {
  instanceId: 'instance',
  projectId: 'project',
  organizationId: 'organization',
  environment: 'development',
  bindingVersion: 0,
  targetRef: null,
  ownerIncarnation: 'incarnation',
};

function transaction() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
    databaseInstance: {
      findUnique: vi.fn().mockResolvedValue({
        id: scope.instanceId,
        projectId: scope.projectId,
        organizationId: scope.organizationId,
        environment: scope.environment,
        bindingVersion: 0,
        activeTargetRef: null,
        status: 'ACTIVE',
      }),
    },
    project: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ organizationId: scope.organizationId, deletedAt: null, runtimeDeletionPending: false }),
    },
    databaseRestoreExecution: { findUnique: vi.fn().mockResolvedValue(null) },
    databaseRestoreAdmittedWork: { create: vi.fn().mockResolvedValue({}) },
  };
}
describe('durable work admission confirmation boundary', () => {
  it('never returns an admission ticket when commit acknowledgement is uncertain', async () => {
    const tx = transaction();

    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        await callback(tx);
        throw new Error('connection dropped: secret database URI');
      },
    } as unknown as DatabaseClient;
    await expect(new PrismaRestoreWorkAdmission(prisma).admit(scope)).rejects.toMatchObject({
      code: 'RESTORE_WORK_ADMISSION_UNCERTAIN',
    });
    expect(tx.databaseRestoreAdmittedWork.create).toHaveBeenCalledOnce();
  });
  it('returns no ticket before the commit barrier, and copies mutable caller input', async () => {
    const tx = transaction();

    let commit!: () => void;

    const barrier = new Promise<void>((resolve) => {
      commit = resolve;
    });
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const ticket = await callback(tx);
        await barrier;

        return ticket;
      },
    } as unknown as DatabaseClient;

    const input = { ...scope };

    let admitted = false;

    const pending = new PrismaRestoreWorkAdmission(prisma).admit(input).then((ticket) => {
      admitted = true;
      return ticket;
    });
    input.organizationId = 'changed';
    input.ownerIncarnation = 'changed';
    await vi.waitFor(() => expect(tx.databaseRestoreAdmittedWork.create).toHaveBeenCalledOnce());
    expect(admitted).toBe(false);
    commit();
    expect(await pending).toMatchObject(scope);
  });
  it('fails closed on busy scope without issuing a durable work record', async () => {
    const tx = transaction();
    tx.$queryRaw.mockResolvedValue([]);

    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(tx),
    } as unknown as DatabaseClient;
    await expect(new PrismaRestoreWorkAdmission(prisma).admit(scope)).rejects.toMatchObject({
      code: 'RESTORE_WORK_ADMISSION_BUSY',
    });
    expect(tx.databaseRestoreAdmittedWork.create).not.toHaveBeenCalled();
  });
  it('reports an uncertain settlement commit and permits a tombstone retry without new admission', async () => {
    const tx = transaction();

    let settledAt: Date | null = null;
    let loseAcknowledgement = true;

    const work = {
      updateMany: vi.fn(async () => {
        if (settledAt) {
          return { count: 0 };
        }

        settledAt = new Date();

        return { count: 1 };
      }),
      findFirst: vi.fn(async () => ({ settledAt })),
    };
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const result = await callback({ ...tx, databaseRestoreAdmittedWork: work });

        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error('lost commit acknowledgement');
        }

        return result;
      },
    } as unknown as DatabaseClient;

    const admission = new PrismaRestoreWorkAdmission(prisma);
    const ticket = { ...scope, id: 'ticket' };
    await expect(admission.acknowledgeSettledWork(ticket)).rejects.toMatchObject({
      code: 'RESTORE_WORK_SETTLEMENT_UNCERTAIN',
    });
    await expect(admission.acknowledgeSettledWork(ticket)).resolves.toBeUndefined();
    expect(work.findFirst).toHaveBeenCalledWith({ where: ticket });
    expect(tx.databaseRestoreAdmittedWork.create).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, Infinity, 1.1])(
    'rejects invalid binding version %s before database access',
    async (bindingVersion) => {
      const prisma = { $transaction: vi.fn() } as unknown as DatabaseClient;
      await expect(new PrismaRestoreWorkAdmission(prisma).admit({ ...scope, bindingVersion })).rejects.toMatchObject({
        code: 'RESTORE_WORK_SCOPE_INVALID',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
