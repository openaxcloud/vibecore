import { ByzantineConsensus } from './byzantine.js';
import { QuorumConsensus } from './quorum.js';
import { WeightedPluralityConsensus } from './weighted-plurality.js';
import type { ConsensusAlgorithm, ConsensusEngine, ConsensusOutput, ConsensusRunInput } from './types.js';

export * from './types.js';
export { QuorumConsensus } from './quorum.js';
export { ByzantineConsensus } from './byzantine.js';
export { WeightedPluralityConsensus, DEFAULT_ROLE_WEIGHTS } from './weighted-plurality.js';
export {
  aggregateClaims,
  buildClaimVote,
  determineParticipation,
  normalizeClaim,
  normalizeFilePath,
} from './voting.js';
export {
  detectAllConflicts,
  detectFileOverlapConflicts,
  detectRiskDisagreement,
  detectVerificationGaps,
  detectRoleFailures,
} from './conflict-detection.js';

export function createConsensusEngine(algorithm: ConsensusAlgorithm): ConsensusEngine {
  switch (algorithm) {
    case 'BYZANTINE_PBFT':
      return new ByzantineConsensus();
    case 'WEIGHTED_PLURALITY':
      return new WeightedPluralityConsensus();
    case 'QUORUM':
    default:
      return new QuorumConsensus();
  }
}

export function selectAlgorithmForRequest(input: {
  highStakes?: boolean;
  hasFailedRoles?: boolean;
  preferWeighted?: boolean;
}): ConsensusAlgorithm {
  if (input.highStakes && !input.hasFailedRoles) return 'BYZANTINE_PBFT';
  if (input.preferWeighted) return 'WEIGHTED_PLURALITY';
  return 'QUORUM';
}

export function runConsensus(input: ConsensusRunInput): ConsensusOutput {
  return createConsensusEngine(input.algorithm).run(input);
}
