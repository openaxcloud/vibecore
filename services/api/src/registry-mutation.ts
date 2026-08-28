import { createHash } from 'node:crypto';

import type { RegistryMutationRecoveryEvidence } from './store.js';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError('REGISTRY_MUTATION_INTENT_VALUE_INVALID');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

/** Canonical, non-secret identity committed before any registry/provider I/O. */
export function registryMutationIntentHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

/**
 * Structural validation shared by the real store and its in-memory contract
 * double. Context-bound fields are checked against the durable row by the
 * store while holding its row lock.
 */
export function isRegistryMutationRecoveryEvidence(
  evidence: RegistryMutationRecoveryEvidence,
): evidence is RegistryMutationRecoveryEvidence {
  if (
    evidence.schemaVersion !== 'registry-mutation-recovery-v1' ||
    !evidence.operatorUserId.trim() ||
    !evidence.auditEventId.trim() ||
    !evidence.operationId.trim() ||
    !evidence.projectId.trim() ||
    !evidence.organizationId.trim() ||
    !/^sha256:[a-f0-9]{64}$/u.test(evidence.intentHash) ||
    !canonicalTimestamp(evidence.observationWindowStartedAt) ||
    !canonicalTimestamp(evidence.observationWindowEndedAt) ||
    Date.parse(evidence.observationWindowStartedAt) >= Date.parse(evidence.observationWindowEndedAt) ||
    evidence.providerQueries.length < 2 ||
    evidence.providerQueries.length > 16
  ) {
    return false;
  }

  let previousQueryAt = Date.parse(evidence.observationWindowStartedAt) - 1;
  const windowEnd = Date.parse(evidence.observationWindowEndedAt);
  for (const query of evidence.providerQueries) {
    const queryAt = Date.parse(query.queriedAt);
    if (
      !canonicalTimestamp(query.queriedAt) ||
      queryAt <= previousQueryAt ||
      queryAt > windowEnd ||
      (query.providerOperationId !== undefined && !query.providerOperationId.trim())
    ) {
      return false;
    }
    previousQueryAt = queryAt;
  }

  return evidence.resolution === 'VERIFIED'
    ? /^sha256:[a-f0-9]{64}$/u.test(evidence.providerEvidenceHash) &&
        evidence.providerQueries.every(({ result }) => result === 'MATCHED_EFFECT')
    : evidence.resolution === 'FAILED_SAFE' &&
        evidence.providerEvidenceHash === undefined &&
        evidence.providerQueries.every(({ result }) => result === 'ABSENT');
}
