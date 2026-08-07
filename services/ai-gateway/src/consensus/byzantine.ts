import type { AgentRoleId, AgentRunResult } from '../agent-executor.js';
import { aiGatewayMessage } from '../public-i18n.js';
import { aggregateClaims, buildClaimVote, determineParticipation } from './voting.js';
import { detectAllConflicts } from './conflict-detection.js';
import {
  type ClaimVote,
  type ConsensusEngine,
  type ConsensusOutcome,
  type ConsensusOutput,
  type ConsensusRunInput,
  DEFAULT_CONSENSUS_THRESHOLD,
} from './types.js';

interface PbftPhaseResult {
  prepared: AgentRoleId[];
  committed: AgentRoleId[];
}

/*
 * Required signatures to commit. Classic PBFT is 2f+1, but with fewer than 3f+1
 * (=4) participating roles f collapses to 0 and 2f+1 = 1, so a SINGLE supporter
 * would "commit" — false byzantine assurance. When BFT can't tolerate a fault
 * (small N), require a strict majority of participants instead, so a lone (or
 * minority) claim is never accepted as consensus.
 */
function requiredCommitVotes(participantCount: number, faultThreshold: number, threshold: number): number {
  /*
   * Honor the CONFIGURED agreement threshold too. Previously the commit bar was
   * only max(2f+1, majority), so a caller-set high threshold (e.g. 0.9) was
   * silently ignored and claims committed at a bare majority. Require at least
   * ceil(threshold * N) supporters as well.
   */
  const thresholdVotes = Math.ceil(Math.max(0, Math.min(1, threshold)) * participantCount);

  return Math.max(2 * faultThreshold + 1, Math.floor(participantCount / 2) + 1, thresholdVotes);
}

function runPbftRound(
  claim: ClaimVote,
  allParticipating: AgentRoleId[],
  faultThreshold: number,
  threshold: number,
): PbftPhaseResult {
  // Pre-prepare: a leader (first supporter) broadcasts the claim.
  // Prepare: every supporter that has seen the required matching pre-prepares signs.
  // Commit: every node that has seen the required prepares signs commit.
  const required = requiredCommitVotes(allParticipating.length, faultThreshold, threshold);
  const prepared = claim.supporters.length >= required ? [...claim.supporters] : [];
  const committed = prepared.length >= required ? [...prepared] : [];

  if (prepared.length === 0 && claim.supporters.length === allParticipating.length && allParticipating.length > 0) {
    return { prepared: [...claim.supporters], committed: [...claim.supporters] };
  }

  return { prepared, committed };
}

export class ByzantineConsensus implements ConsensusEngine {
  readonly algorithm = 'BYZANTINE_PBFT' as const;

  run(input: ConsensusRunInput): ConsensusOutput {
    const start = performance.now();
    const threshold = input.threshold ?? DEFAULT_CONSENSUS_THRESHOLD;
    const { participating, failed } = determineParticipation(input.results);

    // Byzantine fault tolerance assumes up to f faulty nodes among 3f+1 total.
    const faultThreshold = Math.floor(Math.max(participating.length - 1, 0) / 3);

    const aggregations = aggregateClaims(input.results);
    const baseVotes = aggregations.map((agg) => buildClaimVote(agg, threshold, input.roleWeights));

    const finalVotes = baseVotes.map((vote) => {
      // File votes are exempt from PBFT — they're individual artifacts each
      // role legitimately owns. Trust them if any role declared them.
      if (vote.type === 'file' && vote.supporters.length > 0) {
        return { ...vote, decision: 'accepted' as const };
      }

      const phase = runPbftRound(vote, participating, faultThreshold, threshold);
      const supportersAfterCommit = phase.committed.length > 0 ? phase.committed : vote.supporters;
      const required = requiredCommitVotes(participating.length, faultThreshold, threshold);
      /*
       * Below the commit bar: a claim only a small minority raised (agreement at/
       * below 1-threshold) is REJECTED, otherwise inconclusive. The old
       * `vote.supporters.length === 0` condition was unreachable (aggregateClaims
       * always seeds a bucket with its declaring role), so byzantine never marked
       * anything rejected — disputed minority claims silently became inconclusive.
       */
      const decision: ClaimVote['decision'] =
        phase.committed.length >= required
          ? 'accepted'
          : vote.agreementRatio <= 1 - threshold
            ? 'rejected'
            : 'inconclusive';

      return {
        ...vote,
        supporters: supportersAfterCommit,
        decision,
      };
    });

    const conflicts = detectAllConflicts(input.results, input.locale);
    const accepted = finalVotes.filter((v) => v.decision === 'accepted');

    /*
     * Exclude file votes from the agreement score, consistent with QuorumConsensus
     * (computeAgreementScore): files are individual artifacts each role legitimately
     * owns, so scoring them as "disagreement" understated/inflated the score
     * inconsistently between the two engines. Conflicts on files are surfaced
     * separately via detectAllConflicts.
     */
    const opinionVotes = finalVotes.filter((v) => v.type !== 'file');
    const agreementScore =
      opinionVotes.length === 0
        ? // File-only run: nothing is contested (each role owns its files), so report
          // FULL agreement when at least one vote was accepted rather than a misleading
          // 0 alongside an ACCEPTED/PARTIAL outcome. Matches quorum.ts.
          finalVotes.some((v) => v.decision === 'accepted')
          ? 1
          : 0
        : opinionVotes.reduce((sum, vote) => sum + vote.agreementRatio, 0) / opinionVotes.length;

    const outcome: ConsensusOutcome =
      participating.length === 0
        ? 'REJECTED'
        : finalVotes.length === 0
          ? 'ABSTAINED'
          : accepted.length === finalVotes.length && participating.length === input.results.length
            ? 'ACCEPTED'
            : accepted.length > 0
              ? 'PARTIAL'
              : 'REJECTED';

    const consolidated = {
      summary:
        input.results
          .filter((r) => r.status !== 'failed' && r.summary)
          .map((r) => `[${r.roleId}] ${r.summary}`)
          .join('\n\n') || aiGatewayMessage('consensusEmptySummary', input.locale),
      acceptedRisks: accepted.filter((v) => v.type === 'risk').map((v) => v.claim),
      acceptedVerification: accepted.filter((v) => v.type === 'verification').map((v) => v.claim),
      acceptedFiles: accepted.filter((v) => v.type === 'file').map((v) => v.claim),
      rejectedClaims: finalVotes
        .filter((v) => v.decision === 'rejected')
        .map((v) => ({ claim: v.claim, type: v.type })),
      perRoleSummaries: input.results.map((r) => ({ roleId: r.roleId, summary: r.summary, status: r.status })),
    };

    return {
      algorithm: this.algorithm,
      outcome,
      threshold,
      agreementScore,
      rounds: 3, // pre-prepare, prepare, commit
      durationMs: Math.max(0, Math.round(performance.now() - start)),
      claimVotes: finalVotes,
      conflicts: failed.length > 0 ? conflicts : conflicts.filter((c) => c.type !== 'role-failure'),
      consolidated,
    };
  }
}
