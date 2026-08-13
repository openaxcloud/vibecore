import { describe, expect, it } from 'vitest';
import type { AgentRunResult } from '../agent-executor.js';
import {
  ByzantineConsensus,
  QuorumConsensus,
  WeightedPluralityConsensus,
  aggregateClaims,
  buildClaimVote,
  createConsensusEngine,
  detectFileOverlapConflicts,
  detectRiskDisagreement,
  detectVerificationGaps,
  detectRoleFailures,
  determineParticipation,
  normalizeClaim,
  normalizeFilePath,
  runConsensus,
  selectAlgorithmForRequest,
} from './index.js';

const fullAgreement: AgentRunResult[] = [
  {
    roleId: 'architect',
    status: 'complete',
    summary: 'Designed event-driven layout.',
    files: ['src/architecture.md'],
    risks: ['SLA might miss if upstream lags.'],
    verification: ['Inspect dependency graph.'],
  },
  {
    roleId: 'frontend',
    status: 'complete',
    summary: 'Plans React 19 hooks.',
    files: ['app/components/Foo.tsx'],
    risks: ['SLA might miss if upstream lags.'],
    verification: ['Inspect dependency graph.'],
  },
  {
    roleId: 'backend',
    status: 'complete',
    summary: 'Adds Postgres index.',
    files: ['services/api/migration.sql'],
    risks: ['SLA might miss if upstream lags.'],
    verification: ['Inspect dependency graph.'],
  },
  {
    roleId: 'devops',
    status: 'complete',
    summary: 'Adds Helm overrides.',
    files: ['k8s/deployment.yaml'],
    risks: ['SLA might miss if upstream lags.'],
    verification: ['Inspect dependency graph.'],
  },
  {
    roleId: 'qa',
    status: 'complete',
    summary: 'Plans Playwright suite.',
    files: ['tests/playwright.spec.ts'],
    risks: ['SLA might miss if upstream lags.'],
    verification: ['Inspect dependency graph.'],
  },
];

const splitOpinions: AgentRunResult[] = [
  {
    roleId: 'architect',
    status: 'complete',
    summary: 'Likes microservices.',
    risks: ['Service mesh adds latency.'],
    verification: ['Run latency benchmark.'],
  },
  {
    roleId: 'backend',
    status: 'complete',
    summary: 'Wants monolith.',
    risks: ['Distributed tracing complexity.'],
    verification: ['Trace 100 requests.'],
  },
  {
    roleId: 'frontend',
    status: 'complete',
    summary: 'Wants the API surface stable.',
    verification: ['Run latency benchmark.'],
  },
  {
    roleId: 'devops',
    status: 'failed',
    summary: 'Sub-agent timed out.',
  },
];

describe('voting helpers', () => {
  it('normalizes claims and file paths', () => {
    expect(normalizeClaim('   Use   POSTGRES   for state ')).toBe('use postgres for state');
    expect(normalizeFilePath('./src/Foo.tsx')).toBe('src/foo.tsx');
    expect(normalizeFilePath('app//components///bar.tsx')).toBe('app/components/bar.tsx');
  });

  it('separates participating from failed roles', () => {
    const { participating, failed } = determineParticipation(splitOpinions);
    expect(participating).toEqual(['architect', 'backend', 'frontend']);
    expect(failed).toEqual(['devops']);
  });

  it('aggregates claims across roles', () => {
    const aggregated = aggregateClaims(fullAgreement);
    const sharedRisk = aggregated.find((c) => c.type === 'risk');
    expect(sharedRisk).toBeTruthy();
    expect(sharedRisk!.supporters).toEqual(['architect', 'frontend', 'backend', 'devops', 'qa']);
  });

  it('builds claim votes with role weights', () => {
    const vote = buildClaimVote(
      {
        claim: 'shared',
        type: 'risk',
        supporters: ['architect', 'qa'],
        participatingRoles: ['architect', 'frontend', 'backend', 'devops', 'qa'],
      },
      0.5,
      { architect: 2, qa: 2 },
    );
    expect(vote.agreementRatio).toBeCloseTo(4 / 7, 5); // (2+2)/(2+1+1+1+2)
    expect(vote.dissenters).toEqual(['frontend', 'backend', 'devops']);
  });
});

describe('conflict detection', () => {
  it('detects file overlaps', () => {
    const overlap: AgentRunResult[] = [
      { roleId: 'frontend', status: 'complete', summary: '', files: ['app/Foo.tsx'] },
      { roleId: 'backend', status: 'complete', summary: '', files: ['app/foo.tsx'] },
    ];
    const conflicts = detectFileOverlapConflicts(overlap);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe('file-overlap');
    expect(conflicts[0]!.involvedRoles).toEqual(['frontend', 'backend']);
  });

  it('detects risk disagreement', () => {
    const conflicts = detectRiskDisagreement(splitOpinions, 1);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.every((c) => c.type === 'risk-disagreement')).toBe(true);
  });

  it('detects verification gaps', () => {
    const partial: AgentRunResult[] = [
      { roleId: 'architect', status: 'complete', summary: 'a', verification: ['check'] },
      { roleId: 'backend', status: 'complete', summary: 'b' },
    ];
    const conflicts = detectVerificationGaps(partial);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.involvedRoles).toEqual(['backend']);
  });

  it('detects role failures', () => {
    const conflicts = detectRoleFailures(splitOpinions);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe('role-failure');
    expect(conflicts[0]!.involvedRoles).toEqual(['devops']);
  });
});

describe('QuorumConsensus', () => {
  const engine = new QuorumConsensus();

  it('accepts when all roles agree above threshold', () => {
    const out = engine.run({ results: fullAgreement, algorithm: 'QUORUM', threshold: 0.66 });
    expect(out.outcome).toBe('ACCEPTED');
    expect(out.agreementScore).toBeGreaterThanOrEqual(0.66);
    expect(out.consolidated.acceptedRisks.length).toBe(1);
    expect(out.consolidated.acceptedVerification.length).toBe(1);
  });

  it('returns PARTIAL when some roles fail', () => {
    const out = engine.run({ results: splitOpinions, algorithm: 'QUORUM', threshold: 0.66 });
    expect(['PARTIAL', 'REJECTED']).toContain(out.outcome);
    expect(out.conflicts.some((c) => c.type === 'role-failure')).toBe(true);
  });

  it('does NOT reject a healthy fan-out where every lane succeeds but opinions differ', () => {
    /*
     * Regression: 5 specialists that each raise DIFFERENT (complementary) risks +
     * verification steps score low agreement, but every lane completed with real
     * work — that is PARTIAL usable consensus, not "REJECTED · 0-20%". Full
     * participation + low overlap must NOT be labelled REJECTED.
     */
    const divergentButComplete: AgentRunResult[] = [
      { roleId: 'architect', status: 'complete', summary: 'a', risks: ['only architect risk'], verification: ['check A'] },
      { roleId: 'frontend', status: 'complete', summary: 'b', risks: ['only frontend risk'], verification: ['check B'] },
      { roleId: 'backend', status: 'complete', summary: 'c', risks: ['only backend risk'], verification: ['check C'] },
    ];

    const out = engine.run({ results: divergentButComplete, algorithm: 'QUORUM', threshold: 0.66 });
    expect(out.outcome).toBe('PARTIAL');
    // The score is still reported honestly (genuinely low), only the label changed.
    expect(out.agreementScore).toBeLessThan(0.66);
  });

  it('returns ABSTAINED when no claims emit', () => {
    const empty: AgentRunResult[] = [
      { roleId: 'architect', status: 'complete', summary: 'no risks no checks' },
      { roleId: 'qa', status: 'complete', summary: 'silent' },
    ];
    const out = engine.run({ results: empty, algorithm: 'QUORUM' });
    expect(out.outcome).toBe('ABSTAINED');
  });

  it('runs in 1 round', () => {
    const out = engine.run({ results: fullAgreement, algorithm: 'QUORUM' });
    expect(out.rounds).toBe(1);
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('ByzantineConsensus', () => {
  const engine = new ByzantineConsensus();

  it('accepts when 2f+1 roles agree', () => {
    const out = engine.run({ results: fullAgreement, algorithm: 'BYZANTINE_PBFT' });
    expect(out.algorithm).toBe('BYZANTINE_PBFT');
    expect(out.outcome).toBe('ACCEPTED');
    expect(out.rounds).toBe(3);
  });

  it('reports REJECTED when participation is too low', () => {
    const allFailed: AgentRunResult[] = [
      { roleId: 'architect', status: 'failed', summary: 'x' },
      { roleId: 'qa', status: 'failed', summary: 'y' },
    ];
    const out = engine.run({ results: allFailed, algorithm: 'BYZANTINE_PBFT' });
    expect(out.outcome).toBe('REJECTED');
  });
});

describe('WeightedPluralityConsensus', () => {
  it('overrides default weights with caller-provided ones', () => {
    const engine = new WeightedPluralityConsensus();
    const out = engine.run({
      results: splitOpinions,
      algorithm: 'WEIGHTED_PLURALITY',
      threshold: 0.5,
      roleWeights: { architect: 5 },
    });
    expect(out.algorithm).toBe('WEIGHTED_PLURALITY');
    expect(out.claimVotes.length).toBeGreaterThan(0);
  });
});

describe('createConsensusEngine + selectAlgorithmForRequest', () => {
  it('creates the requested engine', () => {
    expect(createConsensusEngine('QUORUM')).toBeInstanceOf(QuorumConsensus);
    expect(createConsensusEngine('BYZANTINE_PBFT')).toBeInstanceOf(ByzantineConsensus);
    expect(createConsensusEngine('WEIGHTED_PLURALITY')).toBeInstanceOf(WeightedPluralityConsensus);
  });

  it('selects byzantine for high-stakes scenarios', () => {
    expect(selectAlgorithmForRequest({ highStakes: true })).toBe('BYZANTINE_PBFT');
    expect(selectAlgorithmForRequest({ highStakes: true, hasFailedRoles: true })).toBe('QUORUM');
    expect(selectAlgorithmForRequest({ preferWeighted: true })).toBe('WEIGHTED_PLURALITY');
    expect(selectAlgorithmForRequest({})).toBe('QUORUM');
  });

  it('runs consensus end-to-end via runConsensus()', () => {
    const out = runConsensus({ results: fullAgreement, algorithm: 'QUORUM' });
    expect(out.outcome).toBe('ACCEPTED');
  });
});
