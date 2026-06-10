import { describe, expect, it } from 'vitest';
import { buildAiGatewayApp } from './app.js';
import type { AgentRoleId } from './agent-executor.js';
import type { AiGateway } from './gateway.js';
import type { ConsensusOutput } from './consensus/index.js';

interface RoleScript {
  summary: string;
  files: string[];
  risks: string[];
  verification: string[];
}

const fiveRoleScripts: Record<AgentRoleId, RoleScript> = {
  architect: {
    summary: 'Designed event-driven layout with Postgres of record.',
    files: ['docs/architecture.md'],
    risks: ['Service mesh adds 30ms p95 latency.'],
    verification: ['Run latency benchmark.'],
  },
  frontend: {
    summary: 'Plans React 19 hooks for the dashboard.',
    files: ['app/components/Dashboard.tsx'],
    risks: ['Hydration mismatch with old state.'],
    verification: ['Run latency benchmark.'],
  },
  backend: {
    summary: 'Adds Postgres index and migration 0099.',
    files: ['packages/database/prisma/migrations/0099/migration.sql'],
    risks: ['Service mesh adds 30ms p95 latency.'],
    verification: ['Run latency benchmark.'],
  },
  devops: {
    summary: 'Adds Helm overrides for new service.',
    files: ['k8s/overlays/dashboard/values.yaml'],
    risks: ['Service mesh adds 30ms p95 latency.'],
    verification: ['Run latency benchmark.'],
  },
  qa: {
    summary: 'Plans Playwright suite covering happy paths.',
    files: ['tests/e2e/dashboard.spec.ts'],
    risks: ['Service mesh adds 30ms p95 latency.'],
    verification: ['Run latency benchmark.'],
  },
};

function scriptedGateway(scripts: Record<AgentRoleId, RoleScript>): AiGateway {
  const calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  return {
    health: async () => [],
    models: () => [],
    stream: async function* () {},
    complete: async (request: { messages: Array<{ role: string; content: string }> }) => {
      calls.push(request);
      const systemMessage = request.messages.find((m) => m.role === 'system')?.content ?? '';
      const role = (Object.keys(scripts) as AgentRoleId[]).find((r) => systemMessage.toLowerCase().includes(r));
      const script = role ? scripts[role] : scripts.architect;
      return {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        content: JSON.stringify(script),
        usage: { inputTokens: 100, outputTokens: 50, estimatedCostCents: 0 },
      };
    },
  } as unknown as AiGateway;
}

const fiveRolePayload = {
  mode: 'parallel-subagents' as const,
  organizationId: 'org_consensus_e2e',
  roles: [
    { id: 'architect', title: 'Architect', responsibility: 'Plan structure', output: 'JSON' },
    { id: 'frontend', title: 'Frontend', responsibility: 'Plan UI', output: 'JSON' },
    { id: 'backend', title: 'Backend', responsibility: 'Plan API', output: 'JSON' },
    { id: 'devops', title: 'DevOps', responsibility: 'Plan infra', output: 'JSON' },
    { id: 'qa', title: 'QA', responsibility: 'Plan tests', output: 'JSON' },
  ],
  messages: [{ role: 'user', content: 'Build a dashboard app.' }],
};

describe('parallel-subagents E2E with consensus', () => {
  it('runs 5 roles, applies QUORUM consensus by default, returns claim votes + conflicts', async () => {
    const app = await buildAiGatewayApp({
      gateway: scriptedGateway(fiveRoleScripts),
      logger: false,
      env: { NODE_ENV: 'test' },
      agentRunPersistence: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs',
      payload: fiveRolePayload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      runId: string;
      status: string;
      results: Array<{ roleId: AgentRoleId; status: string; files: string[]; risks: string[] }>;
      consensus: ConsensusOutput;
    };

    expect(body.results).toHaveLength(5);
    expect(body.results.every((r) => r.status === 'complete')).toBe(true);
    expect(body.consensus.algorithm).toBe('QUORUM');
    expect(body.consensus.rounds).toBe(1);
    expect(body.consensus.threshold).toBeCloseTo(0.66, 5);

    // 4 of 5 roles list "service mesh adds 30ms" risk → should be accepted
    // (4/5 = 0.8 >= 0.66 threshold)
    const meshRisk = body.consensus.claimVotes.find((vote) => vote.type === 'risk' && /service mesh/i.test(vote.claim));
    expect(meshRisk).toBeTruthy();
    expect(meshRisk!.decision).toBe('accepted');
    expect(meshRisk!.supporters.sort()).toEqual(['architect', 'backend', 'devops', 'qa'].sort());
    expect(meshRisk!.dissenters).toEqual(['frontend']);

    // All 5 roles list the same verification step → unanimous accepted
    const latencyCheck = body.consensus.claimVotes.find(
      (vote) => vote.type === 'verification' && /latency benchmark/i.test(vote.claim),
    );
    expect(latencyCheck).toBeTruthy();
    expect(latencyCheck!.decision).toBe('accepted');
    expect(latencyCheck!.supporters).toHaveLength(5);

    // Each role owns its own files → 5 file claims, all accepted (file exemption)
    const fileVotes = body.consensus.claimVotes.filter((v) => v.type === 'file');
    expect(fileVotes).toHaveLength(5);
    expect(fileVotes.every((v) => v.decision === 'accepted')).toBe(true);

    // No file-overlap conflict (each role wrote a different file).
    const fileOverlap = body.consensus.conflicts.filter((c) => c.type === 'file-overlap');
    expect(fileOverlap).toHaveLength(0);

    // The frontend role raised a unique risk → flagged as risk-disagreement.
    const riskDisagreement = body.consensus.conflicts.filter((c) => c.type === 'risk-disagreement');
    expect(riskDisagreement.length).toBeGreaterThan(0);

    // Outcome: ACCEPTED (all participating, agreement >= threshold).
    expect(body.consensus.outcome).toBe('ACCEPTED');
    expect(body.consensus.agreementScore).toBeGreaterThanOrEqual(0.66);

    // Consolidated payload includes accepted claims.
    expect(body.consensus.consolidated).toBeDefined();
    expect(body.consensus.consolidated.acceptedRisks.length).toBeGreaterThan(0);
    expect(body.consensus.consolidated.acceptedVerification.length).toBeGreaterThan(0);

    await app.close();
  });

  it('honours explicit consensusAlgorithm: BYZANTINE_PBFT and reports 3 rounds', async () => {
    // Use uniform scripts where every role agrees on the same risk + verification
    // so Byzantine PBFT's 2f+1 commit requirement is met for every claim.
    const uniform = Object.fromEntries(
      (Object.keys(fiveRoleScripts) as AgentRoleId[]).map((role) => [
        role,
        {
          summary: fiveRoleScripts[role].summary,
          files: fiveRoleScripts[role].files,
          risks: ['Service mesh adds 30ms p95 latency.'],
          verification: ['Run latency benchmark.'],
        },
      ]),
    ) as Record<AgentRoleId, RoleScript>;

    const app = await buildAiGatewayApp({
      gateway: scriptedGateway(uniform),
      logger: false,
      env: { NODE_ENV: 'test' },
      agentRunPersistence: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs',
      payload: { ...fiveRolePayload, consensusAlgorithm: 'BYZANTINE_PBFT' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { consensus: ConsensusOutput };
    expect(body.consensus.algorithm).toBe('BYZANTINE_PBFT');
    expect(body.consensus.rounds).toBe(3);
    expect(body.consensus.outcome).toBe('ACCEPTED');

    await app.close();
  });

  it('detects file-overlap conflict when two roles claim the same file', async () => {
    const overlapping: Record<AgentRoleId, RoleScript> = {
      ...fiveRoleScripts,
      frontend: {
        ...fiveRoleScripts.frontend,
        files: ['docs/architecture.md'], // same as architect → overlap
      },
    };
    const app = await buildAiGatewayApp({
      gateway: scriptedGateway(overlapping),
      logger: false,
      env: { NODE_ENV: 'test' },
      agentRunPersistence: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs',
      payload: fiveRolePayload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { consensus: ConsensusOutput };
    const overlap = body.consensus.conflicts.filter((c) => c.type === 'file-overlap');
    expect(overlap.length).toBeGreaterThanOrEqual(1);
    expect(overlap[0]!.involvedRoles.sort()).toEqual(['architect', 'frontend'].sort());

    await app.close();
  });

  it('reports role-failure conflict and PARTIAL outcome when one role throws', async () => {
    const flakyGateway: AiGateway = {
      health: async () => [],
      models: () => [],
      stream: async function* () {},
      complete: async (request: { messages: Array<{ role: string; content: string }> }) => {
        const systemMessage = request.messages.find((m) => m.role === 'system')?.content ?? '';
        if (/devops/i.test(systemMessage)) {
          throw new Error('devops upstream timeout');
        }
        const role = (Object.keys(fiveRoleScripts) as AgentRoleId[]).find((r) =>
          systemMessage.toLowerCase().includes(r),
        );
        const script = role ? fiveRoleScripts[role] : fiveRoleScripts.architect;
        return {
          provider: 'openai',
          model: 'gpt-4.1-mini',
          content: JSON.stringify(script),
          usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 0 },
        };
      },
    } as unknown as AiGateway;

    const app = await buildAiGatewayApp({
      gateway: flakyGateway,
      logger: false,
      env: { NODE_ENV: 'test' },
      agentRunPersistence: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs',
      payload: fiveRolePayload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      status: string;
      results: Array<{ roleId: AgentRoleId; status: string }>;
      consensus: ConsensusOutput;
    };

    expect(body.status).toBe('partial');
    const devopsResult = body.results.find((r) => r.roleId === 'devops');
    expect(devopsResult?.status).toBe('failed');

    expect(body.consensus.outcome).toBe('PARTIAL');
    const roleFailure = body.consensus.conflicts.find((c) => c.type === 'role-failure');
    expect(roleFailure).toBeTruthy();
    expect(roleFailure!.involvedRoles).toEqual(['devops']);

    await app.close();
  });
});
