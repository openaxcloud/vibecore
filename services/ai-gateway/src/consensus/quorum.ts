import type { AgentRunResult } from '../agent-executor.js';
import { aggregateClaims, buildClaimVote, determineParticipation } from './voting.js';
import { detectAllConflicts } from './conflict-detection.js';
import {
  type ClaimVote,
  type ConsensusEngine,
  type ConsensusOutcome,
  type ConsensusOutput,
  type ConsensusRunInput,
  type ConsolidatedResult,
  DEFAULT_CONSENSUS_THRESHOLD,
} from './types.js';

function computeAgreementScore(votes: ClaimVote[]): number {
  // Files are individual artifacts each role legitimately owns — exclude them
  // from agreement scoring. Conflicts on file ownership are surfaced separately
  // through detectFileOverlapConflicts().
  const opinionVotes = votes.filter((v) => v.type !== 'file');

  if (opinionVotes.length === 0) {
    /*
     * File-only run: there are no contested opinions (each role owns its files),
     * so report FULL agreement when at least one file was accepted rather than a
     * misleading 0 alongside an ACCEPTED/PARTIAL outcome. No votes at all → 0.
     */
    return votes.some((v) => v.decision === 'accepted') ? 1 : 0;
  }

  const sum = opinionVotes.reduce((acc, vote) => acc + vote.agreementRatio, 0);

  return sum / opinionVotes.length;
}

function computeOutcome(
  votes: ClaimVote[],
  participatingCount: number,
  totalCount: number,
  threshold: number,
): ConsensusOutcome {
  if (totalCount === 0) return 'ABSTAINED';
  if (participatingCount === 0) return 'REJECTED';
  if (votes.length === 0) {
    return participatingCount === totalCount ? 'ABSTAINED' : 'PARTIAL';
  }

  /*
   * File votes are excluded from agreement scoring (each role owns its files), so
   * a run that produced ONLY file claims has opinionVotes=[] → agreementScore 0 →
   * the `<= 1 - threshold` branch would REJECT it, contradicting the accepted
   * files. Decide a file-only run by its accepted claims + participation instead.
   */
  const hasOpinionVotes = votes.some((v) => v.type !== 'file');

  if (!hasOpinionVotes) {
    const acceptedCount = votes.filter((v) => v.decision === 'accepted').length;

    if (acceptedCount === 0) {
      return 'REJECTED';
    }

    return participatingCount === totalCount ? 'ACCEPTED' : 'PARTIAL';
  }

  const agreementScore = computeAgreementScore(votes);
  if (agreementScore >= threshold && participatingCount === totalCount) return 'ACCEPTED';
  if (agreementScore >= threshold) return 'PARTIAL';

  /*
   * Low agreement REJECTS only when a lane actually FAILED (participation <
   * total). A multi-specialist BUILD fan-out where every lane succeeded but
   * raised DIFFERENT (complementary, non-overlapping) risks/verification steps
   * has a naturally low opinion-agreement score — that is usable PARTIAL
   * consensus, NOT a rejection. Previously this branch labelled such a healthy
   * run "REJECTED · 0-20% agreement", which read as a total failure to the user
   * even though all agents produced real work.
   */
  if (agreementScore <= 1 - threshold && participatingCount < totalCount) return 'REJECTED';

  return 'PARTIAL';
}

function buildConsolidated(results: AgentRunResult[], votes: ClaimVote[]): ConsolidatedResult {
  const accepted = votes.filter((vote) => vote.decision === 'accepted');
  const rejected = votes.filter((vote) => vote.decision === 'rejected');

  const participating = results.filter((r) => r.status !== 'failed');
  const summary = participating
    .filter((r) => r.summary)
    .map((r) => `[${r.roleId}] ${r.summary}`)
    .join('\n\n');

  return {
    summary: summary || 'No sub-agent produced a usable summary.',
    acceptedRisks: accepted.filter((v) => v.type === 'risk').map((v) => v.claim),
    acceptedVerification: accepted.filter((v) => v.type === 'verification').map((v) => v.claim),
    acceptedFiles: accepted.filter((v) => v.type === 'file').map((v) => v.claim),
    rejectedClaims: rejected.map((v) => ({ claim: v.claim, type: v.type })),
    perRoleSummaries: results.map((r) => ({ roleId: r.roleId, summary: r.summary, status: r.status })),
  };
}

export class QuorumConsensus implements ConsensusEngine {
  readonly algorithm = 'QUORUM' as const;

  run(input: ConsensusRunInput): ConsensusOutput {
    const start = performance.now();
    const threshold = input.threshold ?? DEFAULT_CONSENSUS_THRESHOLD;
    const { participating, failed } = determineParticipation(input.results);
    const aggregations = aggregateClaims(input.results);

    const claimVotes = aggregations.map((agg) => buildClaimVote(agg, threshold, input.roleWeights));

    const conflicts = detectAllConflicts(input.results);
    const outcome = computeOutcome(claimVotes, participating.length, input.results.length, threshold);
    const agreementScore = computeAgreementScore(claimVotes);
    const consolidated = buildConsolidated(input.results, claimVotes);

    return {
      algorithm: this.algorithm,
      outcome,
      threshold,
      agreementScore,
      rounds: 1,
      durationMs: Math.max(0, Math.round(performance.now() - start)),
      claimVotes,
      conflicts: failed.length > 0 ? conflicts : conflicts.filter((c) => c.type !== 'role-failure'),
      consolidated,
    };
  }
}
