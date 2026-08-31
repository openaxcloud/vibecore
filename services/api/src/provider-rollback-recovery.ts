import { appPublicEnglish } from './app-public-copy.js';
import type { RollbackOperationRecord } from './store.js';

export const PROVIDER_ROLLBACK_OPERATOR_OBSERVATION_WINDOW_MS = 60_000;
export const PROVIDER_ROLLBACK_USER_OBSERVATION_LIMIT = 64;

const VERCEL_ROLLBACK_ACTIVITY_QUIESCENCE_MS = 3 * 60_000;
const VERCEL_ALIAS_REQUEST_CLOCK_SKEW_MS = 5_000;

export interface ProviderRollbackSupersededEvidenceWindow {
  observationWindowStartedAt: string;
  observationWindowEndedAt: string;
  providerQueryCount: number;
}

function providerAuthority(operation: RollbackOperationRecord): string | undefined {
  return operation.provider === 'vercel'
    ? 'project.production_aliases.deploymentId+rolling_release+skew_disabled'
    : operation.provider === 'netlify'
      ? 'site.published_deploy.id+traffic_splits'
      : operation.provider === 'cloudflare-pages'
        ? 'project.canonical_deployment.id'
        : undefined;
}

export function requireProviderRollbackTargetEvidence(operation: RollbackOperationRecord): void {
  const latest = operation.providerRecoveryEvidence?.at(-1);
  const liveDeploymentIds = latest?.liveDeploymentIds;

  if (
    !latest ||
    latest.state !== 'TARGET' ||
    latest.provider !== operation.provider ||
    latest.authority !== providerAuthority(operation) ||
    latest.providerTarget !== operation.providerTarget ||
    latest.targetDeploymentId !== operation.providerDeploymentId ||
    typeof latest.responseStatus !== 'number' ||
    latest.responseStatus < 200 ||
    latest.responseStatus >= 300 ||
    !Array.isArray(liveDeploymentIds) ||
    liveDeploymentIds.length === 0 ||
    liveDeploymentIds.some((deploymentId) => deploymentId !== operation.providerDeploymentId)
  ) {
    throw Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), {
      code: 'PROVIDER_ROLLBACK_RECOVERY_AUTHORITY_INVALID',
      statusCode: 409,
    });
  }
}

/**
 * Require a contiguous, exact tail of provider-live `OTHER` observations.
 * Timestamps are appended by the store from its authoritative database clock;
 * callers cannot shorten the safety window by supplying their own clock.
 */
export function requireProviderRollbackSupersededEvidence(
  operation: RollbackOperationRecord,
  operatorUserId: string,
  authoritativeNow: Date,
): ProviderRollbackSupersededEvidenceWindow {
  const history = operation.providerRecoveryEvidence ?? [];
  const expectedAuthority = providerAuthority(operation);

  const exactOther = (entry: Record<string, unknown>) => {
    const liveDeploymentIds = entry.liveDeploymentIds;
    return (
      entry.state === 'OTHER' &&
      entry.provider === operation.provider &&
      entry.authority === expectedAuthority &&
      entry.providerTarget === operation.providerTarget &&
      entry.targetDeploymentId === operation.providerDeploymentId &&
      typeof entry.responseStatus === 'number' &&
      entry.responseStatus >= 200 &&
      entry.responseStatus < 300 &&
      Array.isArray(liveDeploymentIds) &&
      liveDeploymentIds.length > 0 &&
      liveDeploymentIds.every(
        (deploymentId) =>
          typeof deploymentId === 'string' &&
          deploymentId.length > 0 &&
          deploymentId !== operation.providerDeploymentId,
      ) &&
      typeof entry.observedAt === 'string' &&
      Number.isFinite(Date.parse(entry.observedAt)) &&
      Date.parse(entry.observedAt) <= authoritativeNow.getTime() &&
      vercelOtherObservationIsQuiescent(operation, entry)
    );
  };

  const latest = history.at(-1);
  const latestLiveDeploymentSignature = latest && exactOther(latest) ? liveDeploymentSignature(latest) : undefined;

  let windowStartIndex = history.length;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]!;

    /*
     * A different canonical deployment/alias set is observed provider
     * activity. Reset the safety window instead of treating two distinct live
     * states as continuous proof that the rollback was superseded.
     */
    if (!exactOther(entry) || liveDeploymentSignature(entry) !== latestLiveDeploymentSignature) {
      break;
    }

    windowStartIndex = index;
  }

  const window = history.slice(windowStartIndex);

  const operatorObservations = window.filter(
    (entry) => entry.recoveryMode === 'OPERATOR' && entry.operatorUserId === operatorUserId,
  );

  const first = operatorObservations[0];
  const last = operatorObservations.at(-1);

  if (
    window.length === 0 ||
    operatorObservations.length < 2 ||
    !first ||
    !last ||
    history.at(-1) !== last ||
    Date.parse(last.observedAt as string) - Date.parse(first.observedAt as string) <
      PROVIDER_ROLLBACK_OPERATOR_OBSERVATION_WINDOW_MS
  ) {
    const retryAt = first
      ? new Date(
          Date.parse(first.observedAt as string) + PROVIDER_ROLLBACK_OPERATOR_OBSERVATION_WINDOW_MS,
        ).toISOString()
      : new Date(authoritativeNow.getTime() + PROVIDER_ROLLBACK_OPERATOR_OBSERVATION_WINDOW_MS).toISOString();
    throw Object.assign(new Error(appPublicEnglish('GENERIC_REQUEST_FAILED')), {
      code: 'PROVIDER_ROLLBACK_RECOVERY_WINDOW_ACTIVE',
      statusCode: 409,
      retryAt,
    });
  }

  return {
    observationWindowStartedAt: first.observedAt as string,
    observationWindowEndedAt: last.observedAt as string,
    providerQueryCount: window.length,
  };
}

function vercelOtherObservationIsQuiescent(
  operation: RollbackOperationRecord,
  entry: Record<string, unknown>,
): boolean {
  if (operation.provider !== 'vercel') {
    return true;
  }

  const startedAt = operation.providerEffectStartedAt ? Date.parse(operation.providerEffectStartedAt) : Number.NaN;
  const observedAt = typeof entry.observedAt === 'string' ? Date.parse(entry.observedAt) : Number.NaN;

  if (!Number.isFinite(startedAt) || !Number.isFinite(observedAt)) {
    return false;
  }

  if (entry.vercelAliasRequestPresent === false) {
    return observedAt - startedAt >= VERCEL_ROLLBACK_ACTIVITY_QUIESCENCE_MS;
  }

  if (
    entry.vercelAliasRequestPresent !== true ||
    typeof entry.vercelAliasRequestType !== 'string' ||
    typeof entry.vercelAliasRequestTargetDeploymentId !== 'string' ||
    typeof entry.vercelAliasRequestRequestedAt !== 'number' ||
    !Number.isFinite(entry.vercelAliasRequestRequestedAt) ||
    typeof entry.vercelAliasRequestJobStatus !== 'string'
  ) {
    return false;
  }

  if (['pending', 'in-progress'].includes(entry.vercelAliasRequestJobStatus)) {
    return false;
  }

  if (entry.vercelAliasRequestTargetDeploymentId === operation.providerDeploymentId) {
    const belongsToCurrentAttempt =
      entry.vercelAliasRequestRequestedAt >= startedAt - VERCEL_ALIAS_REQUEST_CLOCK_SKEW_MS;

    if (belongsToCurrentAttempt) {
      return ['failed', 'skipped'].includes(entry.vercelAliasRequestJobStatus);
    }
  }

  /*
   * A different/absent completed last alias request is exhaustive only after
   * Vercel's documented CLI polling horizon has elapsed. Any active alias
   * mutation remains non-quiescent, regardless of type or target.
   */
  return observedAt - startedAt >= VERCEL_ROLLBACK_ACTIVITY_QUIESCENCE_MS;
}

function liveDeploymentSignature(entry: Record<string, unknown>): string | undefined {
  return Array.isArray(entry.liveDeploymentIds) &&
    entry.liveDeploymentIds.every((deploymentId) => typeof deploymentId === 'string')
    ? JSON.stringify([...entry.liveDeploymentIds].sort())
    : undefined;
}
