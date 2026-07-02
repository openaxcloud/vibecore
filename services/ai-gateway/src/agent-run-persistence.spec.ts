import { describe, expect, it } from 'vitest';
import { createDatabaseClient } from '@vibecore/database';
import { PrismaAgentRunPersistence } from './agent-run-persistence.js';
import type { AgentRunRequest, AgentRunResponse } from './agent-executor.js';
import { runConsensus } from './consensus/index.js';

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
