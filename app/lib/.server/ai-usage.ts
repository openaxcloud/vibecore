import { getApiChatCopy } from '~/lib/i18n/catalogs/api-chat';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ai-usage');

/*
 * Matches app/lib/enterprise-api.server.ts: vite-plugin-node-polyfills wipes
 * process.env in the SSR bundle, but process.env.NODE_ENV is build-time
 * inlined via vite `define`, so we use it to pick an in-cluster default.
 */
const IN_CLUSTER_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
const WEB_SESSION_COOKIE_NAME = 'vc_session';

function apiBaseUrl() {
  /*
   * vite-plugin-node-polyfills shims `process.env` to {} in the SSR bundle, so
   * bare process.env.SAAS_API_URL read undefined and we silently fell back to
   * localhost in prod. Read the real env off globalThis. (NODE_ENV stays a bare
   * read — it's build-time inlined via vite `define`.)
   */
  const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
    string,
    string | undefined
  >;

  const fromEnv = env.SAAS_API_URL ?? env.API_BASE_URL ?? env.VITE_API_URL;

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return process.env.NODE_ENV === 'production' ? IN_CLUSTER_API_URL : 'http://localhost:3001';
}

function sessionTokenFromCookie(cookieHeader?: string) {
  if (!cookieHeader) {
    return undefined;
  }

  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${WEB_SESSION_COOKIE_NAME}=`));

  if (!match) {
    return undefined;
  }

  try {
    return decodeURIComponent(match.slice(WEB_SESSION_COOKIE_NAME.length + 1));
  } catch {
    // malformed percent-encoding in the cookie value — treat as no session
    return undefined;
  }
}

function applyApiAuthHeaders(headers: Record<string, string>, input: { bearerToken?: string; cookieHeader?: string }) {
  if (input.bearerToken) {
    headers.authorization = `Bearer ${input.bearerToken}`;
    return true;
  }

  const sessionToken = sessionTokenFromCookie(input.cookieHeader);

  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
    return true;
  }

  if (input.cookieHeader) {
    headers.cookie = input.cookieHeader;
    return true;
  }

  return false;
}

function internalMutationSecret(): string | undefined {
  const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
    string,
    string | undefined
  >;

  const secret = env.INTERNAL_API_SHARED_SECRET ?? env.WORKSPACE_MANAGER_SHARED_SECRET;
  const normalized = secret?.trim();

  return normalized && new TextEncoder().encode(normalized).byteLength >= 32 ? normalized : undefined;
}

export interface RecordChatUsageInput {
  projectId: string;
  requestId: string;
  executionToken: string;
  userSpendReservationId: string;
  calls: Array<{
    callId: string;
    kind: 'planner' | 'agent-lane' | 'summary' | 'context' | 'main' | 'classifier';
    billedToUser?: boolean;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }>;
  finishReason?: string;
  conversationId?: string;
  messageId?: string;

  /** Tag in the AiCostLedger reason field; defaults to "remix-chat". */
  source?: string;

  /*
   * AGM mode-routing metadata → api writes the admin-only AgentCallLog row
   * (credits + margin are recomputed server-side from the active routing card).
   */
  agentRouting?: {
    mode: 'lite' | 'economy' | 'power';
    highEffort: boolean;
    escalated: boolean;
    turbo: boolean;
    lineKey: string;
    routingCardVersion: number;
    source?: string;
  };

  /** Browser cookies forwarded so the api can authenticate the user. */
  cookieHeader?: string;

  /** Bearer token override (used by tests / future agent contexts). */
  bearerToken?: string;
}

/**
 * Canonical usage settlement is awaited and retried; completion is not
 * acknowledged while the authoritative receipt exists only in memory.
 */
export interface CheckChatQuotaInput {
  projectId: string;
  estimatedInputTokens: number;
  estimatedOutputTokens?: number;
  requestedParallelAgents?: number;
  idempotencyKey: string;
  requestHash: string;
  model?: string;
  provider?: string;

  /** Browser cookies forwarded so the api can authenticate the user. */
  cookieHeader?: string;

  /** Bearer token override (tests / future agent contexts). */
  bearerToken?: string;
}

export interface ByokPolicy {
  allowed: boolean;
  reason: string;
  plan: string;
}

export interface ChatPlanEntitlements {
  version: string;
  plan: 'starter' | 'core' | 'pro' | 'enterprise';
  parallelAgents: number;
}

export type CheckChatQuotaResult =
  | {
      ok: true;
      inputTokensRemaining?: number;
      messagesRemaining?: number;
      byok?: ByokPolicy;
      entitlements: ChatPlanEntitlements;
      userSpendReservationId?: string;
    }
  | {
      ok: false;
      statusCode: number;
      code: string;
      message: string;
      byok?: ByokPolicy;
    };

/**
 * Ask services/api whether the org has headroom for an incoming chat
 * BEFORE we start streaming the LLM. Returns ok:false on 429 with the
 * structured error code so the chat route can surface a friendly UX
 * message instead of letting the user burn tokens they'll be billed
 * for but can't afford.
 *
 * Plan enforcement is fail-closed: authentication, transport, malformed
 * payload, and server errors all deny the generation before any fan-out starts.
 */
export async function checkChatQuota(input: CheckChatQuotaInput): Promise<CheckChatQuotaResult> {
  if (!input.projectId) {
    return {
      ok: true,
      entitlements: { version: 'standalone-restrictive', plan: 'starter', parallelAgents: 1 },
    };
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/check-quota`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };

  if (!applyApiAuthHeaders(headers, input)) {
    return {
      ok: false,
      statusCode: 401,
      code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
      message: getApiChatCopy('en').entitlementsUnavailable,
    };
  }

  const serviceSecret = internalMutationSecret();

  if (!serviceSecret) {
    return {
      ok: false,
      statusCode: 503,
      code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
      message: getApiChatCopy('en').entitlementsUnavailable,
    };
  }

  headers['x-vibecore-internal-secret'] = serviceSecret;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        estimatedInputTokens: input.estimatedInputTokens,
        estimatedOutputTokens: input.estimatedOutputTokens,
        requestedParallelAgents: input.requestedParallelAgents,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        model: input.model,
        provider: input.provider,
      }),

      /*
       * Bounded so a hung api pod can't stall the chat stream at its very first
       * step. The surrounding try/catch denies generation on error.
       */
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 200) {
      try {
        const payload = (await response.json()) as {
          ai?: {
            inputTokens?: { remaining?: number };
            messages?: { remaining?: number };
          };
          byok?: ByokPolicy;
          entitlements?: ChatPlanEntitlements;
          userSpendReservationId?: string;
        };

        if (
          !payload.entitlements ||
          !['starter', 'core', 'pro', 'enterprise'].includes(payload.entitlements.plan) ||
          !Number.isSafeInteger(payload.entitlements.parallelAgents) ||
          payload.entitlements.parallelAgents < 1 ||
          payload.entitlements.parallelAgents > 10 ||
          !payload.entitlements.version
        ) {
          return {
            ok: false,
            statusCode: 503,
            code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
            message: getApiChatCopy('en').entitlementsUnavailable,
          };
        }

        return {
          ok: true,
          inputTokensRemaining: payload.ai?.inputTokens?.remaining,
          messagesRemaining: payload.ai?.messages?.remaining,
          byok: payload.byok,
          entitlements: payload.entitlements,
          userSpendReservationId: payload.userSpendReservationId,
        };
      } catch {
        return {
          ok: false,
          statusCode: 503,
          code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
          message: getApiChatCopy('en').entitlementsUnavailable,
        };
      }
    }

    if (response.status === 429) {
      let message = 'AI quota exceeded for this organization.';
      let code = 'QUOTA_EXCEEDED';

      try {
        const payload = (await response.json()) as { error?: string; code?: string };

        if (payload.error) {
          message = payload.error;
        }

        if (payload.code) {
          code = payload.code;
        }
      } catch {
        // body wasn't JSON; keep defaults
      }

      return { ok: false, statusCode: 429, code, message };
    }

    /*
     * Any non-quota error denies the stream: without an authoritative response
     * the web tier must not guess a more permissive Agent fan-out.
     */
    logger.warn(
      JSON.stringify({
        event: 'ai-usage.check-quota.unexpected-status',
        status: response.status,
        projectId: input.projectId,
      }),
    );

    return {
      ok: false,
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 503,
      code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
      message: getApiChatCopy('en').entitlementsUnavailable,
    };
  } catch (error) {
    logger.warn(
      JSON.stringify({
        event: 'ai-usage.check-quota.fetch-failed',
        error: error instanceof Error ? error.message : String(error),
        projectId: input.projectId,
      }),
    );
    return {
      ok: false,
      statusCode: 503,
      code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
      message: getApiChatCopy('en').entitlementsUnavailable,
    };
  }
}

export interface MarkChatProviderStartedInput {
  projectId: string;
  requestId: string;
  executionToken: string;
  userSpendReservationId: string;
  cookieHeader?: string;
  bearerToken?: string;
}

export interface ClaimChatExecutionInput {
  projectId: string;
  requestId: string;
  claimOwnerId: string;
  userSpendReservationId: string;
  cookieHeader?: string;
  bearerToken?: string;
}

export class CanonicalAiUsageError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'CanonicalAiUsageError';
  }
}

async function postCanonicalAiOperation(input: {
  url: string;
  body: unknown;
  auth: { bearerToken?: string; cookieHeader?: string };
  projectId: string;
}): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };

  if (!applyApiAuthHeaders(headers, input.auth)) {
    throw new CanonicalAiUsageError('CANONICAL_AI_AUTH_REQUIRED', 401, false);
  }

  const serviceSecret = internalMutationSecret();

  if (!serviceSecret) {
    throw new CanonicalAiUsageError('CANONICAL_AI_INTERNAL_AUTH_REQUIRED', 503, false);
  }

  headers['x-vibecore-internal-secret'] = serviceSecret;

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(input.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return response;
      }

      const payload = (await response.json().catch(() => ({}))) as { code?: string; retryable?: boolean };
      const retryable = payload.retryable === true || response.status >= 500;

      const error = new CanonicalAiUsageError(
        payload.code ?? 'CANONICAL_AI_OPERATION_FAILED',
        response.status,
        retryable,
      );

      if (!retryable || attempt === 2) {
        throw error;
      }

      lastError = error;
    } catch (error) {
      if (error instanceof CanonicalAiUsageError && !error.retryable) {
        throw error;
      }

      lastError = error;

      if (attempt === 2) {
        break;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
  }
  logger.error(
    JSON.stringify({
      event: 'ai-usage.canonical-operation-failed',
      projectId: input.projectId,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );

  if (lastError instanceof CanonicalAiUsageError) {
    throw lastError;
  }

  throw new CanonicalAiUsageError('CANONICAL_AI_TRANSPORT_FAILED', 503, true);
}

export async function markChatProviderStarted(input: MarkChatProviderStartedInput): Promise<{ replayed: boolean }> {
  if (!input.projectId) {
    return { replayed: false };
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/provider-started`;

  const response = await postCanonicalAiOperation({
    url,
    body: {
      requestId: input.requestId,
      executionToken: input.executionToken,
      userSpendReservationId: input.userSpendReservationId,
    },
    auth: input,
    projectId: input.projectId,
  });

  const payload = (await response.json()) as { replayed?: unknown };

  if (typeof payload.replayed !== 'boolean') {
    throw new CanonicalAiUsageError('CANONICAL_AI_START_RESPONSE_INVALID', 503, true);
  }

  return { replayed: payload.replayed };
}

export async function claimChatExecution(input: ClaimChatExecutionInput): Promise<{
  replayed: boolean;
  requestId: string;
  executionStatus: 'in-progress';
  reservationStatus: string;
  executionToken: string;
  leaseExpiresAt: string;
  platformReceipt?: { state: 'exact' | 'recovered'; outcome?: 'hard' | 'easy' };
}> {
  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/execution-claim`;

  const response = await postCanonicalAiOperation({
    url,
    body: {
      requestId: input.requestId,
      claimOwnerId: input.claimOwnerId,
      userSpendReservationId: input.userSpendReservationId,
    },
    auth: input,
    projectId: input.projectId,
  });
  const payload = (await response.json()) as {
    replayed?: unknown;
    requestId?: unknown;
    executionStatus?: unknown;
    reservationStatus?: unknown;
    executionToken?: unknown;
    leaseExpiresAt?: unknown;
    platformReceipt?: unknown;
  };

  if (
    typeof payload.replayed !== 'boolean' ||
    payload.requestId !== input.requestId ||
    payload.executionStatus !== 'in-progress' ||
    typeof payload.reservationStatus !== 'string' ||
    typeof payload.executionToken !== 'string' ||
    typeof payload.leaseExpiresAt !== 'string'
  ) {
    throw new CanonicalAiUsageError('CANONICAL_AI_CLAIM_RESPONSE_INVALID', 503, true);
  }

  return {
    replayed: payload.replayed,
    requestId: payload.requestId,
    executionStatus: payload.executionStatus,
    reservationStatus: payload.reservationStatus,
    executionToken: payload.executionToken,
    leaseExpiresAt: payload.leaseExpiresAt,
    ...(payload.platformReceipt &&
    typeof payload.platformReceipt === 'object' &&
    !Array.isArray(payload.platformReceipt) &&
    ((payload.platformReceipt as { state?: unknown }).state === 'exact' ||
      (payload.platformReceipt as { state?: unknown }).state === 'recovered')
      ? {
          platformReceipt: payload.platformReceipt as {
            state: 'exact' | 'recovered';
            outcome?: 'hard' | 'easy';
          },
        }
      : {}),
  };
}

export async function markPlatformChatUsageStarted(input: {
  projectId: string;
  requestId: string;
  executionToken: string;
  userSpendReservationId: string;
  agentRouting: {
    mode: 'lite' | 'economy' | 'power';
    highEffort: boolean;
    turbo: boolean;
    lineKey: 'classifier';
    routingCardVersion: number;
    source: 'classifier';
  };
  call: {
    callId: 'classifier';
    provider: string;
    model: string;
    maxInputTokens: number;
    maxOutputTokens: number;
  };
  cookieHeader?: string;
  bearerToken?: string;
}): Promise<void> {
  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/platform-usage-started`;
  await postCanonicalAiOperation({
    url,
    body: {
      requestId: input.requestId,
      executionToken: input.executionToken,
      userSpendReservationId: input.userSpendReservationId,
      agentRouting: input.agentRouting,
      call: input.call,
    },
    auth: input,
    projectId: input.projectId,
  });
}

export async function recordPlatformChatUsage(input: {
  projectId: string;
  requestId: string;
  executionToken: string;
  userSpendReservationId: string;
  outcome: 'hard' | 'easy';
  agentRouting: {
    mode: 'lite' | 'economy' | 'power';
    highEffort: boolean;
    escalated: boolean;
    turbo: boolean;
    lineKey: 'classifier';
    routingCardVersion: number;
    source: 'classifier';
  };
  call: Extract<RecordChatUsageInput['calls'][number], { kind: 'classifier' }> | RecordChatUsageInput['calls'][number];
  cookieHeader?: string;
  bearerToken?: string;
}): Promise<void> {
  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/record-platform-usage`;
  await postCanonicalAiOperation({
    url,
    body: {
      requestId: input.requestId,
      executionToken: input.executionToken,
      userSpendReservationId: input.userSpendReservationId,
      outcome: input.outcome,
      agentRouting: input.agentRouting,
      call: { ...input.call, kind: 'classifier', billedToUser: false },
    },
    auth: input,
    projectId: input.projectId,
  });
}

export async function recordChatUsage(input: RecordChatUsageInput): Promise<void> {
  if (!input.projectId) {
    return;
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/record-usage`;
  await postCanonicalAiOperation({
    url,
    body: {
      requestId: input.requestId,
      executionToken: input.executionToken,
      calls: input.calls,
      finishReason: input.finishReason,
      conversationId: input.conversationId,
      messageId: input.messageId,
      userSpendReservationId: input.userSpendReservationId,
      source: input.source ?? 'remix-chat',
      ...(input.agentRouting ? { agentRouting: input.agentRouting } : {}),
    },
    auth: input,
    projectId: input.projectId,
  });
  logger.debug(
    JSON.stringify({
      event: 'ai-usage.recorded',
      projectId: input.projectId,
      requestId: input.requestId,
      calls: input.calls.length,
    }),
  );
}

/** Input to {@link recordProviderMetric} (F18 admin p95/error-rate metrics). */
export interface RecordProviderMetricInput {
  projectId: string;
  provider: string;
  model?: string;
  latencyMs: number;
  errored: boolean;
  source?: string;

  /** Browser cookies forwarded so the api can authenticate the user. */
  cookieHeader?: string;

  /** Bearer token override (tests / future agent contexts). */
  bearerToken?: string;
}

/**
 * F18 — fire-and-forget POST to services/api `/projects/:id/ai/provider-metric`,
 * recording ONE provider request outcome (latency + errored). Decoupled from billing
 * so it fires on BOTH success and failure (an errored turn has no tokens and is
 * dropped by recordChatUsage's zero-token gate). Never throws — a metrics hiccup must
 * never disturb the chat stream.
 */
export async function recordProviderMetric(input: RecordProviderMetricInput): Promise<void> {
  if (!input.projectId || !input.provider) {
    return;
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/provider-metric`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };

  if (!applyApiAuthHeaders(headers, input)) {
    return;
  }

  const serviceSecret = internalMutationSecret();

  if (!serviceSecret) {
    return;
  }

  headers['x-vibecore-internal-secret'] = serviceSecret;

  try {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: input.provider,
        model: input.model,
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        errored: input.errored,
        source: input.source ?? 'remix-chat',
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    logger.warn(
      JSON.stringify({
        event: 'provider-metric.fetch-failed',
        error: error instanceof Error ? error.message : String(error),
        projectId: input.projectId,
      }),
    );
  }
}
