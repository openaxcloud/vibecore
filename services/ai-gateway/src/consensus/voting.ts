import type { AgentRoleId, AgentRunResult } from '../agent-executor.js';
import type { ClaimType, ClaimVote } from './types.js';

export function normalizeClaim(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeFilePath(value: string): string {
  return value
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .toLowerCase();
}

export interface ClaimAggregation {
  claim: string;
  type: ClaimType;
  supporters: AgentRoleId[];
  participatingRoles: AgentRoleId[];
}

export interface RoleParticipation {
  participating: AgentRoleId[];
  failed: AgentRoleId[];
}

export function determineParticipation(results: AgentRunResult[]): RoleParticipation {
  const participating: AgentRoleId[] = [];
  const failed: AgentRoleId[] = [];

  for (const result of results) {
    if (result.status === 'failed') {
      failed.push(result.roleId);
    } else {
      participating.push(result.roleId);
    }
  }

  return { participating, failed };
}

export function aggregateClaims(results: AgentRunResult[]): ClaimAggregation[] {
  const buckets = new Map<string, ClaimAggregation>();
  const participating = results.filter((r) => r.status !== 'failed');
  const participatingRoles = participating.map((r) => r.roleId);

  const collect = (type: ClaimType, raw: string, normalize: (value: string) => string, roleId: AgentRoleId) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    const key = `${type}::${normalize(cleaned)}`;
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = {
        claim: cleaned,
        type,
        supporters: [],
        participatingRoles,
      };
      buckets.set(key, bucket);
    }

    if (!bucket.supporters.includes(roleId)) {
      bucket.supporters.push(roleId);
    }
  };

  for (const result of participating) {
    for (const risk of result.risks ?? []) collect('risk', risk, normalizeClaim, result.roleId);
    for (const check of result.verification ?? []) collect('verification', check, normalizeClaim, result.roleId);
    for (const file of result.files ?? []) collect('file', file, normalizeFilePath, result.roleId);
  }

  return [...buckets.values()];
}

export function buildClaimVote(
  aggregation: ClaimAggregation,
  threshold: number,
  weights?: Partial<Record<AgentRoleId, number>>,
): ClaimVote {
  const supporters = aggregation.supporters;
  const dissenters = aggregation.participatingRoles.filter((roleId) => !supporters.includes(roleId));

  const supporterWeight = supporters.reduce((sum, role) => sum + (weights?.[role] ?? 1), 0);
  const totalWeight = aggregation.participatingRoles.reduce((sum, role) => sum + (weights?.[role] ?? 1), 0);

  const agreementRatio = totalWeight === 0 ? 0 : supporterWeight / totalWeight;

  let decision: ClaimVote['decision'] = 'inconclusive';
  // Files: any role owning the file is enough to accept it (files are not
  // opinion claims and don't require quorum). Risks/verifications: full
  // threshold-based voting.
  if (aggregation.type === 'file' && supporters.length > 0) {
    decision = 'accepted';
  } else if (agreementRatio >= threshold) {
    decision = 'accepted';
  } else if (agreementRatio <= 1 - threshold) {
    /*
     * A claim only a small minority raised (agreement at/below 1-threshold) is
     * rejected. The previous `&& supporters.length === 0` made this unreachable —
     * aggregateClaims always seeds a bucket with its declaring role, so supporters
     * is never empty — leaving rejectedClaims permanently empty and disputed
     * claims silently dropped from the consolidated report.
     */
    decision = 'rejected';
  }

  return {
    claim: aggregation.claim,
    type: aggregation.type,
    supporters: [...supporters],
    dissenters,
    abstainers: [],
    agreementRatio,
    decision,
  };
}
