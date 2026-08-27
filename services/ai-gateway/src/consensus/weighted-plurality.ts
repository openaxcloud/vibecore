import type { AgentRoleId } from '../agent-executor.js';
import { QuorumConsensus } from './quorum.js';
import { type ConsensusEngine, type ConsensusOutput, type ConsensusRunInput } from './types.js';

export const DEFAULT_ROLE_WEIGHTS: Record<AgentRoleId, number> = {
  architect: 1.5,
  backend: 1.2,
  database: 1.2,
  security: 1.4,
  frontend: 1.0,
  devops: 1.0,
  performance: 1.1,
  accessibility: 1.1,
  qa: 1.3,
  reviewer: 1.4,
};

export class WeightedPluralityConsensus implements ConsensusEngine {
  readonly algorithm = 'WEIGHTED_PLURALITY' as const;
  private readonly base = new QuorumConsensus();

  run(input: ConsensusRunInput): ConsensusOutput {
    const merged: Partial<Record<AgentRoleId, number>> = { ...DEFAULT_ROLE_WEIGHTS };
    if (input.roleWeights) {
      for (const [role, weight] of Object.entries(input.roleWeights)) {
        if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
          merged[role as AgentRoleId] = weight;
        }
      }
    }

    const result = this.base.run({ ...input, roleWeights: merged });
    return { ...result, algorithm: this.algorithm };
  }
}
