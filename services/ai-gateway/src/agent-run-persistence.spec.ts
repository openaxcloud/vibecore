import { describe, expect, it, vi } from 'vitest';
import { createDatabaseClient } from '@vibecore/database';
import { PrismaAgentRunPersistence } from './agent-run-persistence.js';
import type { AgentRunRequest, AgentRunResponse } from './agent-executor.js';
import { runConsensus } from './consensus/index.js';

/*
 * Fake Prisma that records the exact `data` handed to agentRun.create — enough to
 * assert the write-path mapping (projectId/userId/conversationId) WITHOUT a real
 * Postgres, so this runs in CI where DATABASE_URL is unset. The FK columns
 * (organizationId, userId) are resolved via findUnique first; the fake returns a
 * hit only for ids we pre-seed, mirroring the "unknown id → null" behaviour.
 */
function createRecordingPrisma(knownIds: { orgIds?: string[]; userIds?: string[] } = {}) {
  const orgIds = new Set(knownIds.orgIds ?? []);
  const userIds = new Set(knownIds.userIds ?? []);
  const created = { agentRun: undefined as unknown, consensusRecord: undefined as unknown };

  const tx = {
    agentRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.agentRun = data;
        return data;
      }),
    },
    agentRunResult: { create: vi.fn(async () => ({})) },
    consensusRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.consensusRecord = data;
        return data;
      }),
    },
  };

  const prisma = {
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        orgIds.has(where.id) ? { id: where.id } : null,
      ),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        userIds.has(where.id) ? { id: where.id } : null,
      ),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };

  return { prisma, tx, created };
}

function baseRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    mode: 'parallel-subagents',
    roles: [{ id: 'architect', title: 'Architect', responsibility: 'Plan', output: 'JSON' }],
    messages: [{ role: 'user', content: 'Build a feature.' }],
    ...overrides,
  };
}

describe('PrismaAgentRunPersistence write-path mapping (no DB)', () => {
  it('persists projectId + conversationId as-is and resolves a known userId', async () => {
    const userId = 'user-known';
    const { prisma, created } = createRecordingPrisma({ userIds: [userId] });
    const persistence = new PrismaAgentRunPersistence(prisma as never);

    const request = baseRequest({
      projectId: 'proj-42',
      userId,
      conversationId: 'conv-7',
    });
    const results: AgentRunResponse['results'] = [
      { roleId: 'architect', status: 'complete', summary: 'ok', files: [], risks: [], verification: [] },
    ];
    const consensus = runConsensus({ results, algorithm: 'QUORUM' });

    await persistence.recordRun({
      runId: 'run-1',
      request,
      response: { runId: 'run-1', status: 'complete', results, consensus },
      consensus,
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const data = created.agentRun as Record<string, unknown>;
    expect(data.projectId).toBe('proj-42');
    expect(data.userId).toBe(userId);
    expect(data.conversationId).toBe('conv-7');
  });

  it('drops an unknown userId to null (no P2003) while keeping projectId', async () => {
    const { prisma, created } = createRecordingPrisma({ userIds: [] });
    const persistence = new PrismaAgentRunPersistence(prisma as never);

    await persistence.recordRun({
      runId: 'run-2',
      request: baseRequest({ projectId: 'proj-9', userId: 'ghost-user' }),
      response: {
        runId: 'run-2',
        status: 'complete',
        results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
        consensus: runConsensus({
          results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
          algorithm: 'QUORUM',
        }),
      },
      consensus: runConsensus({
        results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
        algorithm: 'QUORUM',
      }),
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const data = created.agentRun as Record<string, unknown>;
    expect(data.projectId).toBe('proj-9');
    expect(data.userId).toBeNull();
  });

  it('nulls projectId/userId/conversationId when the request omits them', async () => {
    const { prisma, created } = createRecordingPrisma();
    const persistence = new PrismaAgentRunPersistence(prisma as never);

    await persistence.recordRun({
      runId: 'run-3',
      request: baseRequest(),
      response: {
        runId: 'run-3',
        status: 'complete',
        results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
        consensus: runConsensus({
          results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
          algorithm: 'QUORUM',
        }),
      },
      consensus: runConsensus({
        results: [{ roleId: 'architect', status: 'complete', summary: 'ok' }],
        algorithm: 'QUORUM',
      }),
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const data = created.agentRun as Record<string, unknown>;
    expect(data.projectId).toBeNull();
    expect(data.userId).toBeNull();
    expect(data.conversationId).toBeNull();
  });
});

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

runDbTests('PrismaAgentRunPersistence (real Postgres)', () => {
  it('persists agent run, results and consensus record atomically', async () => {
    const prisma = createDatabaseClient();
    try {
      const persistence = new PrismaAgentRunPersistence(prisma);
      const runId = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const projectId = `test-project-${Date.now()}`;
      const request: AgentRunRequest = {
        mode: 'parallel-subagents',
        roles: [
          { id: 'architect', title: 'Architect', responsibility: 'Plan structure', output: 'JSON' },
          { id: 'qa', title: 'QA', responsibility: 'Plan tests', output: 'JSON' },
        ],
        messages: [{ role: 'user', content: 'Build a feature.' }],
        projectId,
      };

      const response: AgentRunResponse['results'] = [
        { roleId: 'architect', status: 'complete', summary: 'Plan ready.', files: ['arch.md'], risks: [], verification: ['Lint'] },
        { roleId: 'qa', status: 'complete', summary: 'Tests planned.', files: ['tests.md'], risks: [], verification: ['Lint'] },
      ];

      const consensus = runConsensus({ results: response, algorithm: 'QUORUM' });

      const fullResponse: AgentRunResponse = {
        runId,
        status: 'complete',
        results: response,
        consensus,
      };

      const startedAt = new Date();
      const completedAt = new Date(startedAt.getTime() + 100);

      await persistence.recordRun({
        runId,
        request,
        response: fullResponse,
        consensus,
        startedAt,
        completedAt,
      });

      const stored = await prisma.agentRun.findUnique({
        where: { id: runId },
        include: { results: true, consensus: true },
      });

      expect(stored).toBeTruthy();
      expect(stored!.status).toBe('COMPLETE');
      // The consensus panel scopes by run.projectId — it must be persisted, not null.
      expect(stored!.projectId).toBe(projectId);

      // And the panel's exact query shape must find the record via the parent run.
      const viaProject = await prisma.consensusRecord.findMany({ where: { run: { projectId } } });
      expect(viaProject).toHaveLength(1);
      expect(stored!.results).toHaveLength(2);
      expect(stored!.consensus).toBeTruthy();
      expect(stored!.consensus!.algorithm).toBe('QUORUM');
      expect(stored!.consensus!.outcome).toBe('ACCEPTED');
      expect(stored!.consensus!.rounds).toBe(1);

      // cleanup
      await prisma.agentRun.delete({ where: { id: runId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('persists ConsensusRecord for partial runs with failures', async () => {
    const prisma = createDatabaseClient();
    try {
      const persistence = new PrismaAgentRunPersistence(prisma);
      const runId = `test-run-fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const request: AgentRunRequest = {
        mode: 'parallel-subagents',
        roles: [
          { id: 'architect', title: 'Architect', responsibility: 'Plan', output: 'JSON' },
          { id: 'devops', title: 'DevOps', responsibility: 'Plan', output: 'JSON' },
        ],
        messages: [{ role: 'user', content: 'Build a feature.' }],
      };

      const results: AgentRunResponse['results'] = [
        { roleId: 'architect', status: 'complete', summary: 'a', risks: ['risk-1'] },
        { roleId: 'devops', status: 'failed', summary: 'devops timed out' },
      ];

      const consensus = runConsensus({ results, algorithm: 'QUORUM' });

      await persistence.recordRun({
        runId,
        request,
        response: { runId, status: 'partial', results, consensus },
        consensus,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const stored = await prisma.agentRun.findUnique({
        where: { id: runId },
        include: { results: true, consensus: true },
      });

      expect(stored!.status).toBe('PARTIAL');
      expect(stored!.results.find((r) => r.roleId === 'devops')!.status).toBe('FAILED');
      expect(stored!.consensus!.outcome).not.toBe('ACCEPTED');
      const conflicts = stored!.consensus!.conflicts as Array<{ type: string }>;
      expect(conflicts.some((c) => c.type === 'role-failure')).toBe(true);

      await prisma.agentRun.delete({ where: { id: runId } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
