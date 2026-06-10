import type { AgentRoleId, AgentRunResult } from '../agent-executor.js';
import { normalizeClaim, normalizeFilePath } from './voting.js';
import type { ConsensusConflict } from './types.js';

export function detectFileOverlapConflicts(results: AgentRunResult[]): ConsensusConflict[] {
  const ownership = new Map<string, AgentRoleId[]>();

  for (const result of results) {
    if (result.status === 'failed') continue;
    for (const file of result.files ?? []) {
      const key = normalizeFilePath(file);
      if (!key) continue;
      const owners = ownership.get(key) ?? [];
      if (!owners.includes(result.roleId)) {
        owners.push(result.roleId);
      }
      ownership.set(key, owners);
    }
  }

  const conflicts: ConsensusConflict[] = [];

  for (const [key, owners] of ownership.entries()) {
    if (owners.length > 1) {
      conflicts.push({
        type: 'file-overlap',
        description: `${owners.length} sub-agents claim ownership of ${key}`,
        involvedRoles: [...owners],
        severity: owners.length >= 3 ? 'high' : 'medium',
      });
    }
  }

  return conflicts;
}

export function detectRiskDisagreement(results: AgentRunResult[], minDissentingRoles = 2): ConsensusConflict[] {
  const claims = new Map<string, { raw: string; supporters: Set<AgentRoleId> }>();

  /*
   * The full set of participating (non-failed) roles, computed up front. The
   * previous version grew each bucket's allRoles incrementally as results were
   * processed, so any role seen BEFORE a bucket was first created was never
   * recorded as a dissenter for that bucket — undercounting dissent and silently
   * dropping real risk-disagreement conflicts depending on caller-controlled
   * role order. Dissent is allRoles \ supporters, so allRoles must be complete.
   */
  const allRoles = new Set<AgentRoleId>();

  for (const result of results) {
    if (result.status === 'failed') continue;
    allRoles.add(result.roleId);
    for (const risk of result.risks ?? []) {
      const trimmed = risk.trim();
      if (!trimmed) continue;
      const key = normalizeClaim(trimmed);
      let bucket = claims.get(key);
      if (!bucket) {
        bucket = { raw: trimmed, supporters: new Set() };
        claims.set(key, bucket);
      }
      bucket.supporters.add(result.roleId);
    }
  }

  const conflicts: ConsensusConflict[] = [];

  for (const bucket of claims.values()) {
    const dissenters = [...allRoles].filter((role) => !bucket.supporters.has(role));
    if (dissenters.length >= minDissentingRoles && bucket.supporters.size >= 1) {
      conflicts.push({
        type: 'risk-disagreement',
        description: `Risk "${bucket.raw}" raised by ${bucket.supporters.size} role(s) but ignored by ${dissenters.length} other(s)`,
        involvedRoles: [...bucket.supporters, ...dissenters],
        severity: dissenters.length >= bucket.supporters.size ? 'medium' : 'low',
      });
    }
  }

  return conflicts;
}

export function detectVerificationGaps(results: AgentRunResult[]): ConsensusConflict[] {
  const conflicts: ConsensusConflict[] = [];
  const lacking: AgentRoleId[] = [];

  for (const result of results) {
    if (result.status !== 'failed' && (result.verification?.length ?? 0) === 0) {
      lacking.push(result.roleId);
    }
  }

  if (lacking.length === 0) {
    return conflicts;
  }

  const totalNonFailed = results.filter((r) => r.status !== 'failed').length;
  if (totalNonFailed === 0) return conflicts;

  conflicts.push({
    type: 'verification-gap',
    description: `${lacking.length} of ${totalNonFailed} sub-agents produced no verification steps`,
    involvedRoles: lacking,
    severity: lacking.length === totalNonFailed ? 'high' : 'medium',
  });

  return conflicts;
}

export function detectRoleFailures(results: AgentRunResult[]): ConsensusConflict[] {
  const failed = results.filter((r) => r.status === 'failed').map((r) => r.roleId);
  if (failed.length === 0) return [];

  return [
    {
      type: 'role-failure',
      description: `${failed.length} sub-agent role(s) failed: ${failed.join(', ')}`,
      involvedRoles: failed,
      severity: failed.length >= results.length / 2 ? 'high' : 'medium',
    },
  ];
}

export function detectAllConflicts(results: AgentRunResult[]): ConsensusConflict[] {
  return [
    ...detectRoleFailures(results),
    ...detectFileOverlapConflicts(results),
    ...detectRiskDisagreement(results),
    ...detectVerificationGaps(results),
  ];
}
