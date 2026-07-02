import type { DatabaseClient } from '@vibecore/database';
import type { AgentRunRequest, AgentRunResponse, AgentRunResult } from './agent-executor.js';
import type { ConsensusOutput } from './consensus/index.js';

export interface AgentRunPersistence {
  recordRun(input: {
    runId: string;
    request: AgentRunRequest;
    response: AgentRunResponse;
    consensus: ConsensusOutput;
    startedAt: Date;
    completedAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

function mapRunStatus(status: AgentRunResponse['status']): 'COMPLETE' | 'PARTIAL' | 'FAILED' {
  if (status === 'complete') return 'COMPLETE';
  if (status === 'failed') return 'FAILED';
  return 'PARTIAL';
}

function mapResultStatus(status: AgentRunResult['status']): 'COMPLETE' | 'PARTIAL' | 'FAILED' {
  if (status === 'complete') return 'COMPLETE';
  if (status === 'failed') return 'FAILED';
  return 'PARTIAL';
}

export class PrismaAgentRunPersistence implements AgentRunPersistence {
  constructor(private readonly prisma: DatabaseClient) {}

  async recordRun(input: {
    runId: string;
    request: AgentRunRequest;
    response: AgentRunResponse;
    consensus: ConsensusOutput;
    startedAt: Date;
    completedAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { runId, request, response, consensus, startedAt, completedAt, metadata } = input;

    /*
     * organizationId is an unvalidated request-body string written into a real FK
     * column. A stale/empty/unknown id raised a P2003 FK violation that aborted the
     * whole persistence transaction → the run was silently dropped. Resolve it to a
     * real org id or null (the column is nullable) before inserting.
     */
    const organizationId =
      request.organizationId && request.organizationId.length > 0
        ? ((
            await this.prisma.organization.findUnique({
              where: { id: request.organizationId },
              select: { id: true },
            })
          )?.id ?? null)
        : null;

    /*
     * userId is also a real FK column (relation to User). Resolve it the same way
     * as organizationId so an unknown/stale id can't raise a P2003 that aborts the
     * whole persistence transaction (which would silently drop the run).
     */
    const userId =
      request.userId && request.userId.length > 0
        ? ((
            await this.prisma.user.findUnique({
              where: { id: request.userId },
              select: { id: true },
            })
          )?.id ?? null)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.agentRun.create({
        data: {
          id: runId,
          organizationId,

          /*
           * Persist the owning project so the consensus panel can find this run
           * (it queries ConsensusRecord where run.projectId === the open project).
           * projectId is a plain nullable column (no FK), so an unknown id can't
           * raise a P2003 — write it as-is, or null when absent.
           */
          projectId: request.projectId && request.projectId.length > 0 ? request.projectId : null,
          userId,

          /* conversationId is a plain nullable column (no FK) — write it as-is or null. */
          conversationId:
            request.conversationId && request.conversationId.length > 0 ? request.conversationId : null,
          mode: request.mode,
          status: mapRunStatus(response.status),
          rolesPlanned: request.roles.map((role) => ({
            id: role.id,
            title: role.title,
            responsibility: role.responsibility,
            output: role.output,
          })) as never,
          startedAt,
          completedAt,
          metadata: (metadata ?? {}) as never,
        },
      });

      for (const result of response.results) {
        await tx.agentRunResult.create({
          data: {
            runId,
            roleId: result.roleId,
            status: mapResultStatus(result.status),
            summary: result.summary,
            files: (result.files ?? []) as never,
            risks: (result.risks ?? []) as never,
            verification: (result.verification ?? []) as never,
            startedAt,
            completedAt,
          },
        });
      }

      await tx.consensusRecord.create({
        data: {
          runId,
          algorithm: consensus.algorithm,
          threshold: consensus.threshold,
          outcome: consensus.outcome,
          agreementScore: consensus.agreementScore,
          claimVotes: consensus.claimVotes as never,
          conflicts: consensus.conflicts as never,
          consolidated: consensus.consolidated as never,
          rounds: consensus.rounds,
          durationMs: consensus.durationMs,
        },
      });
    });
  }
}

export async function createDefaultAgentRunPersistence(): Promise<AgentRunPersistence | undefined> {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const { createDatabaseClient } = await import('@vibecore/database');
  return new PrismaAgentRunPersistence(createDatabaseClient());
}
