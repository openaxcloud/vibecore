import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ai-usage');

function apiBaseUrl() {
  return (
    process.env.SAAS_API_URL ??
    process.env.API_BASE_URL ??
    // Same in-cluster DNS the Helm chart uses for service-to-service calls.
    process.env.VITE_API_URL ??
    'http://localhost:3001'
  );
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

  if (input.bearerToken) {
    headers.authorization = `Bearer ${input.bearerToken}`;
  } else if (input.cookieHeader) {
    headers.cookie = input.cookieHeader;
  } else {
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
      }),
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

    // Trace-level acknowledgement so we can correlate the local C1.a log
    // with the api-side ledger row in Cloud Logging.
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
