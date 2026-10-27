import { describe, expect, it } from 'vitest';
import type { AgentRoleId, AgentRunResult } from './agent-executor.js';
import { runConsensus, type ConsensusAlgorithm } from './consensus/index.js';

const roles: AgentRoleId[] = ['architect', 'frontend', 'backend', 'qa'];

describe('consensus agreement does not certify execution', () => {
  it.each<ConsensusAlgorithm>(['QUORUM', 'BYZANTINE_PBFT', 'WEIGHTED_PLURALITY'])(
    '%s retains agreed model claims without promoting them to executed checks',
    (algorithm) => {
      const results: AgentRunResult[] = roles.map((roleId) => ({
        roleId,
        status: 'complete',
        summary: 'I ran all frontend tests successfully.',
        verification: ['npm test: 300 passed'],
      }));

      const output = runConsensus({ algorithm, results });

      expect(output.outcome).toBe('ACCEPTED');
      expect(output.agreementScore).toBe(1);
      expect(output.consolidated.acceptedVerification).toEqual([]);
      expect(output.consolidated.agreedVerificationClaims).toEqual(['npm test: 300 passed']);
      expect(output.claimVotes).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'verification', decision: 'accepted' })]),
      );
    },
  );

  it('keeps a partial quorum partial and preserves its agreement ratio', () => {
    const results: AgentRunResult[] = roles.map((roleId) => ({
      roleId,
      status: 'partial',
      summary: `${roleId} report is incomplete`,
      verification: [`${roleId} declares a different check`],
    }));

    const output = runConsensus({ algorithm: 'QUORUM', results });

    expect(output.outcome).toBe('PARTIAL');
    expect(output.agreementScore).toBe(0.25);
    expect(output.consolidated.acceptedVerification).toEqual([]);
    expect(output.consolidated.agreedVerificationClaims).toEqual([]);
  });
});
