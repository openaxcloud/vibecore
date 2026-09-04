import { createHash } from 'node:crypto';
import {
  canReconcileProviderDeployHook,
  providerDeployHookTargetIsConfigured,
  providerDeployHookTargetIsDedicated,
  providerDeployHookTargetSnapshot,
  triggerProviderDeployHook,
  type ProviderHookResult,
} from './deployments.js';
import type { ProjectReleaseGuard } from './project-release-barrier.js';
import type {
  ApiStore,
  ProviderDeployHookIntentKind,
  ProviderDeployHookOperationRecord,
  ProviderDeployHookProvider,
} from './store.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function isProviderDeployHookProvider(value: string): value is ProviderDeployHookProvider {
  return ['vercel', 'netlify', 'github-pages', 'cloudflare-pages', 'google-cloud-run', 'docker'].includes(value);
}

/** Stable identity contains no release lease/token, request id, or wall clock. */
export function providerDeployHookIdentity(input: {
  projectId: string;
  deploymentId: string;
  intentKind: ProviderDeployHookIntentKind;
  provider: ProviderDeployHookProvider;
  publishRegion?: string;
  projectManifestDigest: string;
  providerTargetHash: string;
}) {
  const canonical = JSON.stringify({
    schemaVersion: 'provider-deploy-hook-v1',
    projectId: input.projectId,
    deploymentId: input.deploymentId,
    intentKind: input.intentKind,
    provider: input.provider,
    publishRegion: input.publishRegion ?? null,
    projectManifestDigest: input.projectManifestDigest,
    providerTargetHash: input.providerTargetHash,
  });
  const digest = sha256(canonical);
  return {
    operationId: `provider-deploy-hook:${input.deploymentId}`,
    operationTag: `ecode-deploy-${digest.slice(0, 40)}`,
    intentHash: `sha256:${digest}`,
  };
}

function replayResult(operation: ProviderDeployHookOperationRecord): ProviderHookResult {
  if (operation.phase === 'IDENTIFIED') {
    return {
      status: 'queued',
      outcome: 'accepted',
      ...(operation.providerBuildId ? { buildId: operation.providerBuildId } : {}),
      ...(operation.providerUrl ? { url: operation.providerUrl } : {}),
      ...(operation.lastHttpStatus ? { httpStatus: operation.lastHttpStatus } : {}),
      log: `${operation.provider}: durable deploy hook identity replayed (id=${operation.providerBuildId ?? 'unknown'})`,
    };
  }
  if (operation.phase === 'TERMINAL' && operation.outcomeStatus === 'ACCEPTED') {
    const providerReady = operation.providerTerminalStatus === 'READY';
    return {
      status: providerReady ? 'started' : 'failed',
      outcome: 'accepted',
      ...(operation.providerBuildId ? { buildId: operation.providerBuildId } : {}),
      ...(operation.providerUrl ? { url: operation.providerUrl } : {}),
      ...(operation.lastHttpStatus ? { httpStatus: operation.lastHttpStatus } : {}),
      log: providerReady
        ? `${operation.provider}: durable provider READY observation replayed`
        : `${operation.provider}: durable provider terminal failure replayed`,
    };
  }
  return {
    status: 'failed',
    outcome: operation.phase === 'MANUAL_RECOVERY' ? 'ambiguous' : 'rejected',
    ...(operation.lastHttpStatus ? { httpStatus: operation.lastHttpStatus } : {}),
    ...(operation.lastErrorCode ? { errorCode: operation.lastErrorCode } : {}),
    log:
      operation.phase === 'MANUAL_RECOVERY'
        ? `${operation.provider}: provider outcome requires manual recovery; no second POST was sent`
        : `${operation.provider}: durable deploy hook rejection replayed`,
  };
}

/**
 * Execute one provider POST behind a live ProjectReleaseBarrier.
 *
 * PREPARED is the only dispatchable phase. DISPATCHING is committed together
 * with append-only attempt #1 before fetch starts. A fetch exception is
 * inherently ambiguous, so it enters MANUAL_RECOVERY; a later invocation that
 * observes DISPATCHING also freezes it without issuing a second POST.
 */
export async function runProviderDeployHookSaga(input: {
  store: ApiStore;
  releaseGuard: ProjectReleaseGuard;
  projectId: string;
  deploymentId: string;
  actorUserId?: string;
  requestId?: string;
  intentKind: ProviderDeployHookIntentKind;
  provider: ProviderDeployHookProvider;
  publishRegion?: string;
  projectManifestDigest: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<ProviderHookResult> {
  const env = input.env ?? (process.env as Record<string, string | undefined>);
  const providerTarget = providerDeployHookTargetSnapshot(input.provider, env);
  if (!providerDeployHookTargetIsConfigured(providerTarget)) {
    throw Object.assign(new Error('The immutable provider target is not fully configured.'), {
      code: 'PROVIDER_DEPLOY_HOOK_TARGET_UNCONFIGURED',
      statusCode: 503,
    });
  }
  const providerTargetDedicated = providerDeployHookTargetIsDedicated(input.provider, input.projectId, env);
  if (!providerTargetDedicated) {
    throw Object.assign(
      new Error('Provider deployment hooks require a set-once target dedicated to this project.'),
      { code: 'PROVIDER_DEPLOY_HOOK_DEDICATED_TARGET_REQUIRED', statusCode: 409 },
    );
  }
  const identity = providerDeployHookIdentity({ ...input, providerTargetHash: providerTarget.targetHash });
  await input.releaseGuard.assert();
  const prepared = await input.store.prepareProviderDeployHookOperation({
    ...identity,
    projectId: input.projectId,
    deploymentId: input.deploymentId,
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    intentKind: input.intentKind,
    provider: input.provider,
    ...(input.publishRegion ? { publishRegion: input.publishRegion } : {}),
    projectManifestDigest: input.projectManifestDigest,
    providerTargetHash: providerTarget.targetHash,
    providerTargetSnapshot: providerTarget.target,
    providerTargetDedicated,
    releaseFence: input.releaseGuard.fence,
  });
  const begun = await input.store.beginProviderDeployHookDispatch({
    operationId: prepared.id,
    projectId: input.projectId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    releaseFence: input.releaseGuard.fence,
  });

  if (!begun.shouldDispatch) {
    if (begun.operation.phase === 'DISPATCHING') {
      if (!begun.attempt) throw new Error('PROVIDER_DEPLOY_HOOK_ATTEMPT_MISSING');
      const frozen = await input.store.recordProviderDeployHookOutcome({
        operationId: begun.operation.id,
        projectId: input.projectId,
        deploymentId: input.deploymentId,
        expectedOrganizationId: begun.operation.organizationId,
        provider: input.provider,
        attemptId: begun.attempt.attemptId,
        phase: 'MANUAL_RECOVERY',
        errorCode: 'PROVIDER_DEPLOY_OUTCOME_UNPROVABLE',
        errorMessage: 'The provider request may have been accepted before its response was durably recorded.',
        manualRecoveryReason: 'DISPATCHING_WITHOUT_DURABLE_PROVIDER_IDENTITY',
      });
      return replayResult(frozen);
    }
    return replayResult(begun.operation);
  }

  if (!begun.attempt) throw new Error('PROVIDER_DEPLOY_HOOK_ATTEMPT_MISSING');
  const observationAuthority = {
    operationId: begun.operation.id,
    projectId: input.projectId,
    deploymentId: input.deploymentId,
    expectedOrganizationId: begun.operation.organizationId,
    provider: input.provider,
    attemptId: begun.attempt.attemptId,
  } as const;

  /* DISPATCHING + attempt #1 are durable before this final effect boundary. */
  await input.releaseGuard.assert();
  const result = await triggerProviderDeployHook(
    input.provider,
    input.fetchImpl ?? fetch,
    env,
    {
      ...(input.publishRegion ? { publishRegion: input.publishRegion } : {}),
      operationTag: begun.operation.operationTag,
      deployedAt: begun.operation.preparedAt,
      expectedTargetHash: begun.operation.providerTargetHash,
      signal: input.releaseGuard.signal,
    },
  );

  if (!result) {
    /* Configuration validation should have rejected this before row creation. */
    const rejected = await input.store.recordProviderDeployHookOutcome({
      ...observationAuthority,
      phase: 'TERMINAL',
      outcomeStatus: 'REJECTED',
      providerTerminalStatus: 'REJECTED',
      errorCode: 'PROVIDER_DEPLOY_HOOK_NOT_CONFIGURED',
      errorMessage: 'No provider deployment hook is configured.',
    });
    return replayResult(rejected);
  }

  /*
   * A lost fence aborts fetch but cannot erase a response already observed.
   * Provider evidence is persisted under exact operation/attempt/tenant
   * identity; only the later Deployment/release mutation remains fenced.
   */

  if (result.outcome === 'ambiguous') {
    const frozen = await input.store.recordProviderDeployHookOutcome({
      ...observationAuthority,
      phase: 'MANUAL_RECOVERY',
      ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
      errorCode: result.errorCode ?? 'PROVIDER_DEPLOY_RESPONSE_LOST',
      errorMessage: result.log,
      manualRecoveryReason:
        result.errorCode === 'PROVIDER_DEPLOY_IDENTITY_MISMATCH'
          ? 'PROVIDER_IDENTITY_MISMATCH'
          : 'PROVIDER_RESPONSE_AMBIGUOUS',
    });
    return replayResult(frozen);
  }

  if (result.outcome === 'rejected' || result.status === 'failed') {
    const rejected = await input.store.recordProviderDeployHookOutcome({
      ...observationAuthority,
      phase: 'TERMINAL',
      outcomeStatus: 'REJECTED',
      providerTerminalStatus: 'REJECTED',
      ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
      errorCode: result.errorCode ?? 'PROVIDER_DEPLOY_REJECTED',
      errorMessage: result.log,
    });
    return replayResult(rejected);
  }

  if (result.buildId) {
    if (!canReconcileProviderDeployHook(input.provider, String(result.buildId), input.env)) {
      const frozen = await input.store.recordProviderDeployHookOutcome({
        ...observationAuthority,
        phase: 'MANUAL_RECOVERY',
        providerBuildId: String(result.buildId),
        ...(result.url ? { providerUrl: result.url } : {}),
        ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
        errorCode: 'PROVIDER_DEPLOY_IDENTITY_NOT_RECONCILABLE',
        errorMessage: `${input.provider}: build identity cannot be verified by a configured exact status lookup`,
        manualRecoveryReason: 'IDENTITY_NOT_EXACTLY_RECONCILABLE',
      });
      return replayResult(frozen);
    }
    const identified = await input.store.recordProviderDeployHookOutcome({
      ...observationAuthority,
      phase: 'IDENTIFIED',
      outcomeStatus: 'ACCEPTED',
      providerBuildId: String(result.buildId),
      ...(result.url ? { providerUrl: result.url } : {}),
      ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
    });
    return replayResult(identified);
  }

  const accepted = await input.store.recordProviderDeployHookOutcome({
    ...observationAuthority,
    phase: 'MANUAL_RECOVERY',
    ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
    errorCode: 'PROVIDER_DEPLOY_ACCEPTED_WITHOUT_IDENTITY',
    errorMessage: result.log,
    manualRecoveryReason: 'ACCEPTED_WITHOUT_DURABLE_PROVIDER_IDENTITY',
  });
  return replayResult(accepted);
}
