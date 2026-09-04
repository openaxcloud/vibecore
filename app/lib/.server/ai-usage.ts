import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ai-usage');

/*
 * Matches app/lib/enterprise-api.server.ts: vite-plugin-node-polyfills wipes
 * process.env in the SSR bundle, but process.env.NODE_ENV is build-time
 * inlined via vite `define`, so we use it to pick an in-cluster default.
 */
const IN_CLUSTER_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
const WEB_SESSION_COOKIE_NAME = 'vc_session';

/*
 * ⚠️ vite-plugin-node-polyfills shims `process.env` to {} in the SSR bundle, so
 * a bare `process.env.X` reads undefined in production. Read off globalThis —
 * the same reason apiBaseUrl() below does it.
 */
function readServerEnv(name: string): string {
  const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
    string,
    string | undefined
  >;

  return (env[name] ?? '').trim();
}

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

export interface RecordChatUsageInput {
  projectId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
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
    source?: string;
  };

  /** Browser cookies forwarded so the api can authenticate the user. */
  cookieHeader?: string;

  /** Bearer token override (used by tests / future agent contexts). */
  bearerToken?: string;
}

/**
 * Fire-and-log POST to services/api `/projects/:projectId/ai/record-usage`.
 *
 * Called from `app/routes/api.chat.ts` onFinish so every completed Bolt
 * chat ends up in the AiCostLedger and the quota counters. Failures are
 * logged and swallowed — we never want a metering hiccup to crash the
 * user's chat stream.
 *
 * Until C1.b.4 reroutes the actual LLM call through services/ai-gateway,
 * this is how the cost ledger gets populated for the managed-keys SaaS
 * model (see audit C1).
 */
export interface CheckChatQuotaInput {
  projectId: string;
  estimatedInputTokens: number;
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

export type CheckChatQuotaResult =
  | {
      ok: true;
      inputTokensRemaining?: number;
      messagesRemaining?: number;
      byok?: ByokPolicy;
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
 * Fail-open on network errors (returns ok:true) — we'd rather risk
 * over-spending a chat than break the UX when the api is degraded.
 * Auditing in `recordChatUsage` would still catch a runaway loop.
 */
export async function checkChatQuota(input: CheckChatQuotaInput): Promise<CheckChatQuotaResult> {
  if (!input.projectId) {
    return { ok: true };
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/check-quota`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };

  if (!applyApiAuthHeaders(headers, input)) {
    // No credentials forwarded — fail-open, the api would reject anyway.
    return { ok: true };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        estimatedInputTokens: input.estimatedInputTokens,
        model: input.model,
        provider: input.provider,
      }),

      /*
       * Bounded so a hung api pod can't stall the chat stream at its very first
       * step. The surrounding try/catch already fails open on error.
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
        };
        return {
          ok: true,
          inputTokensRemaining: payload.ai?.inputTokens?.remaining,
          messagesRemaining: payload.ai?.messages?.remaining,
          byok: payload.byok,
        };
      } catch {
        return { ok: true };
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
     * 401/403/5xx → fail-open so we don't break chat when auth or api
     * is transiently degraded. The post-stream recorder still tries to
     * bill, and the api's own audit logs will flag the discrepancy.
     */
    logger.warn(
      JSON.stringify({
        event: 'ai-usage.check-quota.unexpected-status',
        status: response.status,
        projectId: input.projectId,
      }),
    );

    return { ok: true };
  } catch (error) {
    logger.warn(
      JSON.stringify({
        event: 'ai-usage.check-quota.fetch-failed',
        error: error instanceof Error ? error.message : String(error),
        projectId: input.projectId,
      }),
    );
    return { ok: true };
  }
}

export async function recordChatUsage(input: RecordChatUsageInput): Promise<void> {
  if (!input.projectId) {
    return;
  }

  if (input.inputTokens === 0 && input.outputTokens === 0) {
    // Nothing to bill, no point bouncing through api.
    return;
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/ai/record-usage`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };

  /*
   * AUDX-017 — prove this report is the platform's own, not a caller's claim.
   *
   * /ai/record-usage is session-authenticated, so anyone holding a session can
   * post `inputTokens: 0`. This header (checked constant-time by the api) is
   * something only a server-side caller holding the internal secret can send, so
   * the api records the row as 'trusted' rather than 'declared'.
   *
   * Absent secret = no header = the row is still recorded, just marked
   * 'declared'. Metering must not stop because provenance cannot be proven.
   */
  const internalSecret =
    readServerEnv('INTERNAL_API_SHARED_SECRET') || readServerEnv('WORKSPACE_MANAGER_SHARED_SECRET');

  if (internalSecret) {
    headers['x-vibecore-internal'] = internalSecret;
  }

  if (!applyApiAuthHeaders(headers, input)) {
    logger.warn(
      JSON.stringify({
        event: 'ai-usage.skipped',
        reason: 'no_auth',
        projectId: input.projectId,
      }),
    );
    return;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        finishReason: input.finishReason,
        conversationId: input.conversationId,
        messageId: input.messageId,
        source: input.source ?? 'remix-chat',
        ...(input.agentRouting ? { agentRouting: input.agentRouting } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      logger.warn(
        JSON.stringify({
          event: 'ai-usage.api-error',
          status: response.status,
          projectId: input.projectId,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
        }),
      );
      return;
    }

    /*
     * Trace-level acknowledgement so we can correlate the local C1.a log
     * with the api-side ledger row in Cloud Logging.
     */
    logger.debug(
      JSON.stringify({
        event: 'ai-usage.recorded',
        projectId: input.projectId,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
      }),
    );
  } catch (error) {
    logger.warn(
      JSON.stringify({
        event: 'ai-usage.fetch-failed',
        error: error instanceof Error ? error.message : String(error),
        projectId: input.projectId,
      }),
    );
  }
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
