import type { AgentRoleId, AgentRunResult } from '../agent-executor.js';
import type { AiGatewayLocale } from '../public-i18n.js';

export type ConsensusAlgorithm = 'QUORUM' | 'BYZANTINE_PBFT' | 'WEIGHTED_PLURALITY';

export type ConsensusOutcome = 'ACCEPTED' | 'REJECTED' | 'PARTIAL' | 'ABSTAINED';

export type ClaimType = 'risk' | 'verification' | 'file';

export interface ClaimVote {
  claim: string;
  type: ClaimType;
  supporters: AgentRoleId[];
  dissenters: AgentRoleId[];
  abstainers: AgentRoleId[];
  agreementRatio: number;
  decision: 'accepted' | 'rejected' | 'inconclusive';
}

export interface ConsensusConflict {
  type: 'file-overlap' | 'risk-disagreement' | 'verification-gap' | 'role-failure';
  description: string;
  involvedRoles: AgentRoleId[];
  severity: 'low' | 'medium' | 'high';
}

export interface ConsolidatedResult {
  summary: string;
  acceptedRisks: string[];
  acceptedVerification: string[];
  acceptedFiles: string[];
  rejectedClaims: { claim: string; type: ClaimType }[];
  perRoleSummaries: { roleId: AgentRoleId; summary: string; status: AgentRunResult['status'] }[];
}

export interface ConsensusOutput {
  algorithm: ConsensusAlgorithm;
  outcome: ConsensusOutcome;
  threshold: number;
  agreementScore: number;
  rounds: number;
  durationMs: number;
  claimVotes: ClaimVote[];
  conflicts: ConsensusConflict[];
  consolidated: ConsolidatedResult;
}

export interface ConsensusRunInput {
  results: AgentRunResult[];
  algorithm: ConsensusAlgorithm;
  locale?: AiGatewayLocale;
  threshold?: number;
  roleWeights?: Partial<Record<AgentRoleId, number>>;
}

export interface ConsensusEngine {
  algorithm: ConsensusAlgorithm;
  run(input: ConsensusRunInput): ConsensusOutput;
}

export const DEFAULT_CONSENSUS_THRESHOLD = 0.66;
