/* eslint-disable import/order */
import { createHash } from 'node:crypto';
import { type ActionFunctionArgs } from 'react-router';
import { createDataStream, formatDataStreamPart, generateId, type JSONValue } from 'ai';
import {
  agentMemoryAnnotation,
  persistAgentMemoryCandidate,
  retrieveMemoryForAgentContext,
} from '~/lib/.server/llm/agent-memory';
import {
  AgentExecutorError,
  areParallelSubagentsAvailable,
  buildAgentExecutionAnnotation,
  buildAgentOrchestrationPlan,
  createAgentExecutionContext,
  createAgentPlanContext,
  executeAgentOrchestration,
  executeAgentOrchestrationStream,
  parallelAgentsForBuildTier,
  shouldUseAgentOrchestration,
  type AgentBuildTier,
  type AgentRoleId,
} from '~/lib/.server/llm/agent-orchestration';
import { createAgentPlan } from '~/lib/.server/llm/create-agent-plan';
import { createConnectionRequestDataPart, detectConnectorNeeds } from '~/lib/.server/llm/connector-prompt';
import { buildChatStreamErrorPayload, ChatQuotaError } from './api.chat.quota-error';
import { apiRequest } from '~/lib/enterprise-api.server';
import type { ConnectorDataPart, ExistingAccountConnection } from '~/lib/chat/connector-messages';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import {
  anchoredHistoryDrop,
  computeSelectionCacheKey,
  computeSummaryCacheKey,
  estimateMessagesTokens,
  getMemoizedSelection,
  getMemoizedSummary,
  HISTORY_WINDOW_STEP,
  setMemoizedSelection,
  setMemoizedSummary,
  shouldGenerateSummary,
} from '~/lib/.server/llm/context-optimization';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import { classifyProviderFailure, markProviderUnhealthy } from '~/lib/.server/llm/provider-fallback';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { anthropicCacheStore } from '~/lib/.server/llm/anthropic-cache-als';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import { accumulateCacheUsage } from '~/lib/.server/llm/cache-usage';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import {
  checkChatQuota,
  claimChatExecution,
  markPlatformChatUsageStarted,
  markChatProviderStarted,
  recordPlatformChatUsage,
  recordChatUsage,
  recordProviderMetric,
  type RecordChatUsageInput,
} from '~/lib/.server/ai-usage';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { filterEnabledMcpServers, MCPService } from '~/lib/services/mcpService';
import { loadUserMcpConfig } from '~/lib/.server/mcp/load-config.server';
import { retrieveSkillsForAgentContext } from '~/lib/.server/llm/project-skills';
import { retrieveProjectRulesContext } from '~/lib/.server/llm/project-rules';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { classifyStreamError } from '~/types/context';
import type { DesignScheme } from '~/types/design-scheme';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import {
  decideTaskHardness,
  boltProviderName,
  isAgentModeRoutingDisabled,
  normalizeAgentSelection,
  resolveAgentRoute,
  type AgentRouteLine,
  type AgentRouteResolution,
} from '~/lib/.server/llm/agent-mode';
import { WORK_DIR } from '~/utils/constants';
import { responseEmittedFileAction } from '~/utils/response-file-actions';
import {
  createPortfolioTemplateArtifact,
  createPortfolioTemplateStreamChunks,
  shouldUsePortfolioTemplate,
} from '~/utils/portfolio-template';
import {
  API_CHAT_PROGRESS_LABELS,
  formatApiChatCopy,
  getApiChatCopy,
  localizeApiChatAgentResultSummary,
  localizeApiChatConflictDescription,
  localizeApiChatModeError,
  localizeApiChatOrchestrationReason,
  localizeApiChatQuotaError,
  localizeApiChatRole,
  localizeApiChatRoleTitle,
  localizeApiChatStreamError,
} from '~/lib/i18n/catalogs/api-chat';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');
const RECENT_HISTORY_MESSAGES = 12;
const AGENT_MODES_GATED_PLAN_REASON = 'plan';
const ORCHESTRATION_FALLBACK_SUFFIX = 'Falling back to single-model lanes.';
const ORCHESTRATION_FALLBACK_DIAGNOSTIC = `Sub-agent executor failed. ${ORCHESTRATION_FALLBACK_SUFFIX}`;
const SUMMARY_REUSE_SAME_WINDOW_REASON = 'palier-unchanged';
const SUMMARY_SKIP_RECENT_WINDOW_REASON = 'history-within-recent-window';
const CONTEXT_SELECTION_REUSE_REASON = 'inputs-unchanged';

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  /*
   * A malformed percent-encoding (e.g. a stray "%" in any cookie) makes
   * decodeURIComponent throw a URIError. This parser runs before the route's
   * try/catch, so an unguarded throw surfaced as an uncaught 500 on every chat
   * request that carried such a cookie. Fall back to the raw value instead.
   */
  const safeDecode = (raw: string) => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      const decodedName = safeDecode(name.trim());
      const decodedValue = safeDecode(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  let clientDisconnected = false;

  const localeResolution = resolveRequestLocale(request);
  const language = localeResolution.language;
  const copy = getApiChatCopy(language);

  const responseHeaders = (initial?: HeadersInit): Headers => {
    const headers = localeResponseHeaders(request, localeResolution);

    new Headers(initial).forEach((value, key) => {
      headers.set(key, value);
    });

    return headers;
  };

  const serializeLocalizedStreamError = (error: unknown): string => {
    const payload = buildChatStreamErrorPayload(error);

    if (error instanceof ChatQuotaError) {
      return JSON.stringify(payload);
    }

    return JSON.stringify({
      ...payload,
      message: localizeApiChatStreamError(language, classifyStreamError(error), payload.message),
    });
  };

  const streamRecovery = new StreamRecoveryManager({
    timeout: 45000,
    maxRetries: 2,
    onTimeout: () => {
      logger.warn('Stream timeout - attempting recovery');
    },
  });

  if (request.signal) {
    const abortHandler = () => {
      clientDisconnected = true;
      streamRecovery.stop();
      logger.warn('Client disconnected - cancelling stream');
    };
    request.signal.addEventListener('abort', abortHandler, { once: true });
  }

  let parsedBody: {
    id?: string;
    messages: Messages;
    files: any;
    promptId?: string;
    projectId?: string;
    contextOptimization: boolean;
    chatMode: 'discuss' | 'build';
    designScheme?: DesignScheme;
    supabase?: {
      isConnected: boolean;
      hasSelectedProject: boolean;
      credentials?: {
        anonKey?: string;
        supabaseUrl?: string;
      };
    };
    maxLLMSteps: number;

    /*
     * Composer power controls (Lite/Economy/Power + boosts). Previously these
     * were UI-only and never reached the server; they now drive the parallel-agent
     * cap, the planner role budget, and the agentic step depth.
     */
    agentPower?: {
      buildTier?: AgentBuildTier;
      highPowerModel?: boolean;
      extendedThinking?: boolean;
      turboMode?: boolean;
    };

    /** Composer "Plan" toggle — force a decompose-and-plan pass even for short prompts. */
    planFirstEnabled?: boolean;

    /*
     * Plan-approval gate (step 2). When the user approves a proposed plan, the
     * client re-submits with planApproved=true + the approved tasks, so the
     * server skips re-planning and executes the approved decomposition directly.
     */
    planApproved?: boolean;
    approvedPlanTasks?: Array<{ title: string; roleId: AgentRoleId }>;

    /*
     * Per-request MCP server allow-list (names). undefined/null = all configured
     * servers (unchanged); [] = none; ['github', …] = only those. Filters which
     * MCP servers' tools the agent can use for THIS message.
     */
    enabledMcpServers?: string[] | null;
  };

  try {
    parsedBody = await request.json();
  } catch {
    /*
     * A malformed JSON body would otherwise throw before the try block below,
     * surfacing as an unhandled 500 instead of a clear 400.
     */
    return new Response(JSON.stringify({ error: true, message: copy.invalidJsonBody }), {
      status: 400,
      headers: responseHeaders({ 'Content-Type': 'application/json' }),
      statusText: 'Bad Request',
    });
  }

  const {
    id: clientConversationId,
    messages,
    files,
    promptId,
    projectId,
    contextOptimization,
    supabase,
    chatMode,
    designScheme,
    maxLLMSteps,
    agentPower,
    planFirstEnabled,
    planApproved,
    approvedPlanTasks,
    enabledMcpServers,
  } = parsedBody;

  const latestUserTurn = [...messages].reverse().find((message) => message.role === 'user');
  const stableTurnId = typeof latestUserTurn?.id === 'string' ? latestUserTurn.id.trim() : '';
  const stableConversationId = typeof clientConversationId === 'string' ? clientConversationId.trim() : '';
  const stableRunPhase = planApproved ? 'execute-approved-plan' : planFirstEnabled ? 'propose-plan' : 'execute';

  const quotaIdempotencyKey = createHash('sha256')
    .update(
      JSON.stringify({
        projectId: projectId ?? null,
        conversationId: stableConversationId,
        turnId: stableTurnId,
        phase: stableRunPhase,
      }),
    )
    .digest('hex');
  const quotaRequestHash = createHash('sha256')
    .update(
      JSON.stringify({
        projectId: projectId ?? null,
        conversationId: stableConversationId,
        turnId: stableTurnId,
        messages,
        files,
        promptId: promptId ?? null,
        chatMode,
        contextOptimization,
        designScheme: designScheme ?? null,
        agentPower: agentPower ?? null,
        planFirstEnabled: planFirstEnabled ?? false,
        planApproved: planApproved ?? false,
        approvedPlanTasks: approvedPlanTasks ?? null,
      }),
    )
    .digest('hex');

  const claimOwnerId = generateId();

  if (projectId && (!stableConversationId || !stableTurnId)) {
    return new Response(
      JSON.stringify({ error: true, code: 'AI_RUN_IDENTITY_REQUIRED', message: copy.invalidJsonBody }),
      {
        status: 400,
        headers: responseHeaders({ 'Content-Type': 'application/json' }),
        statusText: 'Bad Request',
      },
    );
  }

  /*
   * Normalise the per-request MCP allow-list: a real array (possibly empty) of
   * strings applies as a filter; anything else (missing/malformed) → null = no
   * override so all configured servers stay enabled.
   */
  const resolvedEnabledMcpServers = Array.isArray(enabledMcpServers)
    ? enabledMcpServers.filter((name): name is string => typeof name === 'string')
    : null;

  /*
   * Tool-loop step cap actually applied to streamText. Overridden below by the
   * user's server-persisted setting when available (the client value is unvalidated).
   */
  let resolvedMaxSteps = maxLLMSteps;

  const cookieHeader = request.headers.get('Cookie');

  /*
   * A malformed `apiKeys` / `providers` cookie (corrupted, truncated, or
   * tampered) would make JSON.parse throw synchronously here — before the
   * try/catch below — surfacing as an unhandled 500 that leaks the raw
   * SyntaxError. Parse defensively and fall back to empty objects instead.
   */
  const parsedCookies = parseCookies(cookieHeader || '');

  const safeParseCookieJson = <T>(raw: string | undefined, label: string): T => {
    if (!raw) {
      return {} as T;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      logger.warn(`Ignoring malformed "${label}" cookie`);
      return {} as T;
    }
  };

  const apiKeys = safeParseCookieJson<Record<string, string>>(parsedCookies.apiKeys, 'apiKeys');
  const providerSettings = safeParseCookieJson<Record<string, IProviderSetting>>(parsedCookies.providers, 'providers');

  /*
   * AGM mode routing (control plane): resolve (mode, High effort, Turbo) into
   * the concrete provider+model from the api's ACTIVE routing card BEFORE any
   * streaming starts, so an unauthorized mode is refused with a clean 403 (never
   * a silent downgrade) and the model decision comes from config, not the client.
   */
  const agentSelection = normalizeAgentSelection(agentPower);

  let agentRoute: AgentRouteResolution | undefined;

  if (!isAgentModeRoutingDisabled()) {
    const routeResult = await resolveAgentRoute({
      projectId,
      selection: agentSelection,
      cookieHeader: cookieHeader ?? undefined,
    });

    if (routeResult.ok === false) {
      logger.info(
        JSON.stringify({ event: 'agent-mode.refused', projectId, code: routeResult.code, mode: agentSelection.mode }),
      );

      return new Response(
        JSON.stringify({
          error: true,
          code: routeResult.code,
          message: localizeApiChatModeError(language, routeResult.message),
        }),
        {
          status: routeResult.statusCode,
          headers: responseHeaders({ 'Content-Type': 'application/json' }),
          statusText: 'Forbidden',
        },
      );
    }

    if (routeResult.ok === true) {
      agentRoute = routeResult.route;
    }

    // ok === 'unavailable' → legacy fallback: tags/DEFAULT_MODEL keep working.
  }

  /*
   * Escalation + final target: High effort only escalates on genuinely hard
   * tasks (heuristic gate + the card's classifier line as confirmer), so the
   * surcharge is never systematic. Decided once per request; continuations
   * reuse the same line.
   */
  let agentTargetLine: AgentRouteLine | undefined = agentRoute?.base;
  let agentEscalated = false;
  let agentHardnessDecidedBy: 'heuristic' | 'llm' | undefined;

  let agentClassifierUsage: { provider: string; model: string; inputTokens: number; outputTokens: number } | undefined;

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,

    /*
     * Prompt-cache hit accounting (proves the caching from the Anthropic wire
     * middleware / OpenAI automatic caching is actually landing). `cachedPromptTokens`
     * are input tokens served from cache (~10% price); `cacheWriteTokens` are the
     * one-time write cost. Best-effort — populated from provider metadata when the
     * provider surfaces it, otherwise stays 0.
     */
    cachedPromptTokens: 0,
    cacheWriteTokens: 0,
  };

  /*
   * Real continuation counter. The previous bound used `stream.switches` from
   * SwitchableStream, but streaming now flows through mergeIntoDataStream and
   * `switchSource()` is never called — so `stream.switches` stayed 0 forever and
   * a model that kept finishing with finishReason==='length' recursed without
   * limit (runaway provider calls + token billing). This counter is incremented
   * on each continuation and capped at MAX_RESPONSE_SEGMENTS.
   */
  let continuationSegments = 0;

  /*
   * Model routing (Vague C) continuation consistency. When the request opted into
   * Auto, the first segment's `streamText` resolves 'auto' to a CONCRETE model and
   * reports it here via `onModelDecision`. Every auto-continuation segment then
   * reuses this exact id in its `[Model: …]` prefix instead of re-sending 'auto'
   * — so the model can never flip mid-generation (the CONTINUE_PROMPT classifies
   * differently from the original turn) and the prompt cache stays warm. For an
   * explicit (non-Auto) selection this stays the selected id, a no-op.
   */
  let routedTurnModel: string | undefined;
  let routedTurnProvider: string | undefined;

  /*
   * F18 — provider-request latency anchor. Reset right before each streamText() so
   * the elapsed time to the terminal finish (or error) is the provider call's
   * duration, recorded per outcome for the admin p95/error-rate metrics.
   */
  let providerCallStartedAt = Date.now();

  /*
   * Whether ANY segment of this build produced a `<boltAction type="file">` —
   * i.e. the model actually emitted files, not just prose. A weak model
   * (gpt-3.5) often narrates the plan and emits nothing applicable; without this
   * the run "completes" silently with no app and a PENDING preview. Accumulated
   * across continuation segments and checked at every terminal exit.
   */
  let emittedFileAction = false;

  const encoder: TextEncoder = new TextEncoder();

  let progressCounter: number = 1;
  let userSpendReservationId: string | undefined;
  let canonicalExecutionToken: string | undefined;
  let canonicalPlatformReceipt: { state: 'exact' | 'recovered'; outcome?: 'hard' | 'easy' } | undefined;
  type ProviderUsageCall = RecordChatUsageInput['calls'][number];

  const providerCalls = new Map<string, ProviderUsageCall>();

  let canonicalUsageFlushed = false;
  let canonicalUserSpendStarted = false;

  const addProviderCall = (call: ProviderUsageCall) => {
    const existing = providerCalls.get(call.callId);

    if (existing && JSON.stringify(existing) !== JSON.stringify(call)) {
      throw new Error(`Conflicting provider usage receipt for ${call.callId}`);
    }

    providerCalls.set(call.callId, call);
  };

  try {
    /*
     * Per-request instance — NOT the shared singleton. This request loads THIS
     * user's MCP servers (config, tools and credential-bearing clients are
     * instance state); a shared instance would leak one tenant's tools and
     * credentials into another tenant's concurrent chat. Closed on disconnect
     * and on completion below.
     */
    const mcpService = new MCPService(language);
    request.signal?.addEventListener('abort', () => void mcpService.close(), { once: true });

    /*
     * Audit C2/H7 — load this user's MCP servers (marketplace installs merged
     * with their manually-configured "Configuration" tab servers) and feed
     * them into the runtime before tools are read below. Previously the
     * runtime only saw whatever the Configuration tab last pushed via
     * /api/mcp-update-config, so marketplace installs never reached the agent.
     * We only refresh when there is something to load (or to clear), to avoid
     * tearing down and rebuilding clients on every message needlessly.
     */
    try {
      const { mcpConfig, maxLLMSteps: serverMaxLLMSteps } = await loadUserMcpConfig(request);

      /*
       * Prefer the user's server-persisted step cap (clamped 1–50 at save time)
       * over the unvalidated client value, so the saved Configuration-tab setting
       * actually governs tool-loop depth and bounds runaway tool loops.
       */
      if (typeof serverMaxLLMSteps === 'number' && Number.isFinite(serverMaxLLMSteps)) {
        resolvedMaxSteps = Math.max(1, Math.min(50, Math.floor(serverMaxLLMSteps)));
      }

      /*
       * Per-request MCP server toggle: drop servers the user disabled for this
       * message BEFORE they're connected, so their tools never reach the LLM and
       * no transport is opened for them. undefined = no override (all kept).
       */
      const effectiveMcpConfig = filterEnabledMcpServers(mcpConfig, resolvedEnabledMcpServers);

      if (Object.keys(effectiveMcpConfig.mcpServers).length > 0 || mcpService.configuredServerCount > 0) {
        await mcpService.updateConfig(effectiveMcpConfig);
      }
    } catch (error) {
      logger.warn('Failed to load MCP config for chat request', error);
    }

    /*
     * Extended-thinking boost (composer power control): give the agent a deeper
     * tool/iteration budget so it can plan + self-correct over more steps. Applied
     * on top of the resolved cap, still bounded at 50 so it can't run away.
     */
    if (agentPower?.extendedThinking) {
      resolvedMaxSteps = Math.min(50, Math.max(resolvedMaxSteps, resolvedMaxSteps + 4));
    }

    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    /*
     * Billing floor for providers that don't report streaming usage. xAI (and some
     * OpenAI-compatible endpoints) return promptTokens=0 on streamed generations
     * (they ignore stream_options.include_usage), so charging `usage.promptTokens`
     * verbatim would bill 0 input tokens for a real generation — a credit leak. This
     * char/4 estimate (same basis as the pre-flight quota check) is the fallback used
     * when the provider under-reports, so no provider gets its generations for free.
     * A floor, not exact accounting (it excludes the system prefix, like the pre-flight).
     */
    const estimatedInputTokens = Math.ceil((totalMessageContent.length / 4) * 1.2);
    const usesProviderlessPortfolioTemplate = shouldUsePortfolioTemplate({ messages, chatMode, files });

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        /*
         * Scope a per-request Anthropic cache tally to this execute's async
         * context. The provider's wire reader (spawned during streamText below)
         * accumulates cache_read/creation tokens as a fallback when normalized
         * provider metadata omits them, so flushUsage can still account correctly.
         * enterWith (not run) avoids re-indenting the whole body; each concurrent
         * request runs execute in its own async context.
         */
        anthropicCacheStore.enterWith({ read: 0, write: 0 });

        streamRecovery.startMonitoring();

        /*
         * C1.b.4 — Pre-flight quota check. We over-estimate (×1.2) on
         * char/4 so a chat that would clip the limit by a hair is
         * rejected up front rather than mid-stream. Fail-open inside
         * checkChatQuota when the api is unreachable; the post-stream
         * recordChatUsage call will still try to charge the ledger.
         */
        /*
         * Turbo / high-power are paid-plan-only premium modes (Replit parity).
         * Resolved from the quota check's plan below; fail-open (stays true) so an
         * unknown/degraded plan lookup NEVER blocks a paying user's request.
         */
        let premiumModesEligible = false;
        let planParallelAgents = 1;

        if (projectId && !usesProviderlessPortfolioTemplate) {
          const quota = await checkChatQuota({
            projectId,
            estimatedInputTokens,
            estimatedOutputTokens: MAX_TOKENS,
            idempotencyKey: quotaIdempotencyKey,
            requestHash: quotaRequestHash,
            requestedParallelAgents: agentPower
              ? agentPower.turboMode
                ? parallelAgentsForBuildTier('power', agentPower.highPowerModel)
                : parallelAgentsForBuildTier(agentPower.buildTier, agentPower.highPowerModel)
              : 10,
            provider:
              agentSelection.highEffort && agentRoute?.escalation
                ? agentRoute.escalation.provider
                : agentTargetLine?.provider,
            model:
              agentSelection.highEffort && agentRoute?.escalation
                ? agentRoute.escalation.model
                : agentTargetLine?.model,
            cookieHeader: cookieHeader ?? undefined,
          });

          if (!quota.ok) {
            const quotaMessage = localizeApiChatQuotaError(language, quota.code, quota.message);

            logger.warn(
              JSON.stringify({
                event: 'chat.quota.blocked',
                projectId,
                code: quota.code,
                statusCode: quota.statusCode,
              }),
            );
            dataStream.writeData({
              type: 'progress',
              label: API_CHAT_PROGRESS_LABELS.quotaExceeded,
              status: 'complete',
              order: progressCounter++,
              message: quotaMessage,
            } satisfies ProgressAnnotation);
            dataStream.writeMessageAnnotation({
              type: 'error',
              value: {
                code: quota.code,
                statusCode: quota.statusCode,
                message: quotaMessage,
              },
            });
            streamRecovery.stop();

            /*
             * Release this request's MCP clients before the throw below, mirroring
             * the portfolio fast-path exit; otherwise the stdio children / HTTP
             * transports leak on every quota-blocked request.
             */
            await mcpService.close().catch((closeError) => {
              logger.warn(
                `failed to close MCP clients on quota block: ${
                  closeError instanceof Error ? closeError.message : closeError
                }`,
              );
            });

            /*
             * Throw (instead of returning a clean 200) so the AI SDK emits a real
             * stream error part. Without it useChat.onError never fires and the
             * client shows no "Quota Exceeded" alert — the agent appears to stall
             * silently. createDataStream's onError serialises this into a payload
             * Chat.client.handleError can parse.
             */
            throw new ChatQuotaError(quotaMessage, quota.statusCode, quota.code);
          }

          /*
           * Premium-mode and fan-out permissions come from the exact versioned
           * entitlement snapshot returned by the API. Missing/malformed snapshots
           * are rejected inside checkChatQuota before generation starts.
           */
          premiumModesEligible = quota.entitlements.plan !== 'starter';
          planParallelAgents = quota.entitlements.parallelAgents;
          userSpendReservationId = quota.userSpendReservationId;

          if (!userSpendReservationId) {
            throw new ChatQuotaError(copy.entitlementsUnavailable, 503, 'CANONICAL_AI_RESERVATION_REQUIRED');
          }

          const claim = await claimChatExecution({
            projectId,
            requestId: quotaIdempotencyKey,
            claimOwnerId,
            userSpendReservationId,
            cookieHeader: cookieHeader ?? undefined,
          });

          if (claim.replayed) {
            throw new ChatQuotaError(copy.runAlreadyStarted, 409, 'AI_EXECUTION_IN_PROGRESS', {
              isRetryable: true,
              requestId: claim.requestId,
              executionStatus: claim.executionStatus,
              retryAfterMs: Math.max(1_000, Date.parse(claim.leaseExpiresAt) - Date.now()),
            });
          }

          canonicalExecutionToken = claim.executionToken;
          canonicalPlatformReceipt = claim.platformReceipt;

          /*
           * C1.b.6 — Force managed keys. When the org plan disallows BYOK,
           * strip the user-supplied apiKeys cookie so the provider modules
           * fall back to ANTHROPIC_API_KEY / OPENAI_API_KEY / ... from the
           * pod env. This closes the loop where a user could paste their
           * own key into the Bolt UI, consume vibecore's per-org quota,
           * but pay their own provider — leaving our cost ledger out of
           * sync with our quotas.
           */
          if (quota.byok && !quota.byok.allowed) {
            const userKeyCount = Object.keys(apiKeys).length;

            if (userKeyCount > 0) {
              logger.info(
                JSON.stringify({
                  event: 'chat.byok.overridden',
                  projectId,
                  plan: quota.byok.plan,
                  reason: quota.byok.reason,
                  userKeyCount,
                }),
              );

              for (const key of Object.keys(apiKeys)) {
                delete apiKeys[key];
              }
            }
          }

          /*
           * C1.b.7 — Surface the headroom payload so the front-end can render
           * "X tokens left" / "Y messages left this month" hints without
           * making a second round-trip. byok policy is included so the UI
           * can show a "managed mode" badge or hide the BYOK settings panel.
           */
          if (
            quota.inputTokensRemaining !== undefined ||
            quota.messagesRemaining !== undefined ||
            quota.byok !== undefined
          ) {
            const byokPayload = quota.byok
              ? { allowed: quota.byok.allowed, reason: quota.byok.reason, plan: quota.byok.plan }
              : null;
            dataStream.writeMessageAnnotation({
              type: 'quota',
              value: {
                inputTokensRemaining: quota.inputTokensRemaining ?? null,
                messagesRemaining: quota.messagesRemaining ?? null,
                byok: byokPayload,
              },
            });
          }
        }

        const ensureCanonicalUserSpendStarted = async () => {
          if (!projectId || canonicalUserSpendStarted) {
            return;
          }

          if (!userSpendReservationId || !canonicalExecutionToken) {
            throw new ChatQuotaError(copy.entitlementsUnavailable, 503, 'CANONICAL_AI_RESERVATION_REQUIRED');
          }

          await markChatProviderStarted({
            projectId,
            requestId: quotaIdempotencyKey,
            executionToken: canonicalExecutionToken,
            userSpendReservationId,
            cookieHeader: cookieHeader ?? undefined,
          });
          canonicalUserSpendStarted = true;
        };

        const settleCanonicalUsage = async (finishReason: string) => {
          if (!projectId || canonicalUsageFlushed) {
            return;
          }

          if (
            !userSpendReservationId ||
            !canonicalExecutionToken ||
            !canonicalUserSpendStarted ||
            providerCalls.size === 0
          ) {
            throw new ChatQuotaError(copy.usageSettlementUnavailable, 503, 'CANONICAL_AI_USAGE_INCOMPLETE');
          }

          await recordChatUsage({
            projectId,
            requestId: quotaIdempotencyKey,
            executionToken: canonicalExecutionToken,
            userSpendReservationId,
            calls: [...providerCalls.values()],
            finishReason,
            conversationId: stableConversationId,
            messageId: stableTurnId,
            cookieHeader: request.headers.get('Cookie') ?? undefined,
            source: 'remix-chat',
            ...(agentRoute && agentTargetLine
              ? {
                  agentRouting: {
                    mode: agentSelection.mode,
                    highEffort: agentSelection.highEffort,
                    escalated: agentEscalated,
                    turbo: agentSelection.turbo,
                    lineKey: agentTargetLine.lineKey,
                    routingCardVersion: agentRoute.routingVersion,
                    source: 'chat',
                  },
                }
              : {}),
          });
          canonicalUsageFlushed = true;
        };

        if (usesProviderlessPortfolioTemplate) {
          const streamChunks = createPortfolioTemplateStreamChunks(messages);
          const assistantText = createPortfolioTemplateArtifact(messages);

          const zeroUsage = {
            completionTokens: 0,
            promptTokens: 0,
            totalTokens: 0,
          };

          dataStream.writeData({
            type: 'progress',
            label: API_CHAT_PROGRESS_LABELS.portfolioTemplate,
            status: 'complete',
            order: progressCounter++,
            message: copy.loadedPortfolioTemplate,
          } satisfies ProgressAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: API_CHAT_PROGRESS_LABELS.response,
            status: 'in-progress',
            order: progressCounter++,
            message: copy.streamingPortfolioFiles,
          } satisfies ProgressAnnotation);

          for (const chunk of streamChunks) {
            dataStream.write(formatDataStreamPart('text', chunk));
            await new Promise((resolve) => setTimeout(resolve, 0));
          }

          streamRecovery.stop();
          dataStream.writeMessageAnnotation({
            type: 'usage',
            value: zeroUsage,
          });
          dataStream.writeData({
            type: 'progress',
            label: API_CHAT_PROGRESS_LABELS.response,
            status: 'complete',
            order: progressCounter++,
            message: copy.responseGenerated,
          } satisfies ProgressAnnotation);
          dataStream.write(
            formatDataStreamPart('finish_step', {
              finishReason: 'stop',
              usage: {
                completionTokens: zeroUsage.completionTokens,
                promptTokens: zeroUsage.promptTokens,
              },
              isContinued: false,
            }),
          );
          dataStream.write(
            formatDataStreamPart('finish_message', {
              finishReason: 'stop',
              usage: {
                completionTokens: zeroUsage.completionTokens,
                promptTokens: zeroUsage.promptTokens,
              },
            }),
          );

          await persistAgentMemoryCandidate(request, {
            messages,
            assistantText,
            projectId,
          }).catch((error) => {
            logger.warn('Portfolio template memory persistence skipped', error);
          });

          /*
           * Close the per-request MCPService before this fast-path return, same
           * as the normal exit paths; otherwise its transports (stdio children /
           * HTTP clients) leak for the life of the process on every template hit.
           */
          await mcpService.close();

          return;
        }

        const filePaths = getFilePaths(files || {});

        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        const processedMessages = await mcpService.processToolInvocations(messages, dataStream);

        /*
         * Stable per-conversation id: the project id when present, else the first
         * message id (unchanged across a conversation). Drives A1's context-selection
         * memo and A7's provider cache-affinity key. Falls back to undefined when
         * neither exists (memo/affinity simply disabled — no regression).
         */
        const conversationId = projectId || processedMessages[0]?.id;

        const agentMemory = await retrieveMemoryForAgentContext(request, { messages: processedMessages, projectId });

        if (agentMemory?.memories.length) {
          dataStream.writeMessageAnnotation(agentMemoryAnnotation(agentMemory.memories) as ContextAnnotation);
        }

        /*
         * Project Skills → agent context. Enabled skills (managed in the IDE
         * "Skills" panel) are injected into the system prompt so toggling a skill
         * actually changes agent behaviour. Fails open to "no skills".
         */
        /*
         * RPL-SK-001.2 — pass the latest user message so installed skills are
         * disclosed progressively: L1 (name+description) always, L2 (full body)
         * only for skills relevant to this request.
         */
        const latestUserMessageForSkills = processedMessages.filter((message) => message.role === 'user').slice(-1)[0];

        const skillUserPrompt = latestUserMessageForSkills
          ? extractPropertiesFromMessage(latestUserMessageForSkills).content
          : undefined;

        const projectSkills = await retrieveSkillsForAgentContext(request, { projectId, userPrompt: skillUserPrompt });

        /*
         * RPL-SK-001.2 — surface the progressive-disclosure trace as an annotation
         * so the lazy loading (L1 for all installed skills, L2 only for triggered
         * ones) is observable per turn, not just claimed.
         */
        if (projectSkills?.disclosureTrace.length) {
          dataStream.writeMessageAnnotation({
            type: 'skillDisclosure',
            triggered: projectSkills.triggeredSkills,
            trace: projectSkills.disclosureTrace.map((entry) => ({
              seq: entry.seq,
              level: entry.level,
              skill: entry.skill,
              bytes: entry.bytes,
            })),
          } as unknown as ContextAnnotation);
        }

        /*
         * Project rules → agent context (AGENTS.md / .cursorrules / .cursor/rules).
         * Read straight from the project files the request carries and injected as
         * BINDING system-prompt instructions, matching Cursor/Replit. Emit an
         * annotation so the UI can show which rules files steered the response.
         */
        const projectRules = retrieveProjectRulesContext(files as FileMap | undefined);

        if (projectRules?.files.length) {
          dataStream.writeMessageAnnotation({
            type: 'agentRules',
            files: projectRules.files.map((rule) => rule.path),
          } satisfies ContextAnnotation);
        }

        /*
         * Connector-need detection: scan the latest user message and emit a
         * connection_request data part for any provider that is referenced
         * but not yet linked to this project. The chat renderer turns the
         * data part into an inline Connect card so the builder can
         * authorize without leaving the conversation. The detection is
         * additive — the agent continues regardless; if it tries to call
         * the provider through @e-code/sdk before the connection is in
         * place, the sidecar returns CONNECTOR_LINK_MISSING and the next
         * turn surfaces another request.
         */
        await emitConnectorConnectionRequests({
          dataStream,
          language,
          processedMessages,
          projectId,
          request,
        });

        /*
         * Composer power controls → parallel-agent cap. Lite=1 (single lane, no
         * orchestration), Economy=2, Power=10. This is what
         * makes the Lite/Economy/Power selector VISIBLY change how many specialist
         * agents run, instead of every request silently using the same roster.
         */
        /*
         * Enforce Turbo / high-power gating on BEHAVIOUR: an ineligible (free)
         * plan can't fan out the full Turbo roster nor add the high-power lane —
         * strip those modes so the org gets (and is billed for) only what its plan
         * allows. Ambiguity is denied by the pre-flight entitlement lookup.
         */
        const effectivePower = agentPower
          ? premiumModesEligible
            ? agentPower
            : { ...agentPower, turboMode: false, highPowerModel: false }
          : undefined;

        if (agentPower && !premiumModesEligible && (agentPower.turboMode || agentPower.highPowerModel)) {
          logger.info(JSON.stringify({ event: 'chat.premiumModes.gated', projectId }));
          dataStream.writeMessageAnnotation({
            type: 'agentModesGated',
            reason: AGENT_MODES_GATED_PLAN_REASON,
            gated: ['turboMode', 'highPowerModel'].filter((mode) => (agentPower as Record<string, unknown>)[mode]),
          } as unknown as ContextAnnotation);
        }

        const requestedParallelAgents = effectivePower
          ? effectivePower.turboMode
            ? /* Turbo: fan out the full roster for the fastest wall-clock (more lanes
               * finishing concurrently), at the higher cost the control advertises. */
              parallelAgentsForBuildTier('power', effectivePower.highPowerModel)
            : parallelAgentsForBuildTier(effectivePower.buildTier, effectivePower.highPowerModel)
          : planParallelAgents;

        const parallelAgents = Math.min(requestedParallelAgents, planParallelAgents);

        /*
         * Decide up-front whether this request will orchestrate so we only pay for
         * the (LLM) planner when it matters. Plan mode forces orchestration even
         * for short prompts.
         */
        const willOrchestrate = shouldUseAgentOrchestration(processedMessages, chatMode, {
          planFirst: planFirstEnabled,
        });

        /*
         * Prompt-driven planner: ask the user's model to decompose the request
         * into specialist sub-tasks BEFORE the fan-out, so the roster is tailored
         * to THIS request (Replit-style) and the plan is shown to the user.
         * Fail-open — a null plan keeps the full roster.
         */
        let agentPlanTasks: Array<{ title: string; roleId: AgentRoleId }> | undefined;
        let selectedRoleIds: AgentRoleId[] | undefined;

        if (willOrchestrate) {
          if (planApproved && approvedPlanTasks?.length) {
            /*
             * Plan-approval step 2: the user already approved this decomposition,
             * so execute it directly instead of re-planning (saves a model call
             * and honours exactly what the user reviewed).
             */
            agentPlanTasks = approvedPlanTasks;
            selectedRoleIds = [...new Set(approvedPlanTasks.map((task) => task.roleId))];
          } else {
            const plan = await createAgentPlan({
              messages: processedMessages,
              env: context.cloudflare?.env,
              apiKeys,
              providerSettings,
              abortSignal: request.signal,
              maxRoles: parallelAgents,
              language,
              onProviderStart: ensureCanonicalUserSpendStarted,
              onUsage: (usage) => addProviderCall(usage),
            });

            if (plan) {
              agentPlanTasks = plan.tasks;
              selectedRoleIds = plan.roleIds;
            }
          }
        }

        let orchestrationPlan = buildAgentOrchestrationPlan({
          messages: processedMessages,
          chatMode,
          subagentsAvailable: areParallelSubagentsAvailable(
            context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined,
          ),
          parallelAgents,
          planFirst: planFirstEnabled,
          selectedRoleIds,
        });

        /*
         * PLAN-APPROVAL GATE (Plan mode, step 1): when the user turned on "Plan"
         * and this is the FIRST pass (not yet approved), propose the plan and STOP
         * before any code generation, so they can review + approve — the
         * Cursor/Replit "plan first" experience. The approval turn re-submits with
         * planApproved=true (handled above) and executes. Only gates when we
         * actually produced a plan; otherwise fall through to normal generation.
         *
         * Safe early return: mirror the portfolio-template fast path — stop the
         * recovery timer, write the finish parts (AI-SDK stream contract), and
         * close the per-request MCPService so nothing leaks. No memory persist /
         * usage recording here (the executing turn handles those).
         */
        if (planFirstEnabled && !planApproved && agentPlanTasks?.length) {
          await settleCanonicalUsage('plan-ready');
          dataStream.writeMessageAnnotation({
            type: 'agentPlan',
            planned: true,
            needsApproval: true,
            tasks: agentPlanTasks,
          } satisfies ContextAnnotation);

          streamRecovery.stop();

          dataStream.writeData({
            type: 'progress',
            label: API_CHAT_PROGRESS_LABELS.response,
            status: 'complete',
            order: progressCounter++,
            message: copy.planReady,
          } satisfies ProgressAnnotation);

          const planUsage = { completionTokens: 0, promptTokens: 0 };
          dataStream.write(
            formatDataStreamPart('finish_step', { finishReason: 'stop', usage: planUsage, isContinued: false }),
          );
          dataStream.write(formatDataStreamPart('finish_message', { finishReason: 'stop', usage: planUsage }));

          await mcpService.close().catch((closeError) => {
            logger.warn(
              `failed to close MCP clients on plan-approval gate: ${
                closeError instanceof Error ? closeError.message : closeError
              }`,
            );
          });

          return;
        }

        /*
         * Surface the decomposition to the UI BEFORE the lanes start so the user
         * sees what the agent decided to do (the visible plan).
         */
        if (orchestrationPlan.enabled && agentPlanTasks?.length) {
          dataStream.writeMessageAnnotation({
            type: 'agentPlan',
            planned: true,
            tasks: agentPlanTasks,
          } satisfies ContextAnnotation);
        }

        /*
         * Seed the orchestration context with the plan so the integrating model
         * (and the single-model-lanes fallback) follows the decomposition. The
         * lane-execution results are appended to this below.
         */
        let agentOrchestrationContext: string | undefined =
          orchestrationPlan.enabled && agentPlanTasks?.length ? createAgentPlanContext(agentPlanTasks) : undefined;

        /*
         * The provider/model the user picked in the composer. Threaded into both
         * the streaming and aggregate sub-agent executors so every specialist lane
         * AND the consensus run on the SAME model the user selected, instead of
         * silently falling back to the gateway's first-configured provider default
         * (e.g. gpt-4.1). The data is the same extractPropertiesFromMessage call
         * used for usage accounting below.
         */
        const lastUserMessageForOrchestration = processedMessages
          .filter((message) => message.role === 'user')
          .slice(-1)[0];

        const { provider: orchestrationProvider, model: orchestrationModel } = lastUserMessageForOrchestration
          ? extractPropertiesFromMessage(lastUserMessageForOrchestration)
          : { provider: undefined, model: undefined };

        if (orchestrationPlan.enabled) {
          if (orchestrationPlan.mode === 'parallel-subagents') {
            dataStream.writeData({
              type: 'progress',
              label: API_CHAT_PROGRESS_LABELS.orchestration,
              status: 'in-progress',
              order: progressCounter++,
              message: copy.executingSpecialistLanes,
            } satisfies ProgressAnnotation);

            try {
              let execution;

              try {
                /*
                 * Stream each specialist lane token-by-token so the IDE renders the
                 * parallel sub-agents live (Replit-style). The authoritative
                 * aggregate is still emitted as the single agentExecution annotation
                 * at the end.
                 */
                execution = await executeAgentOrchestrationStream({
                  env: context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined,
                  plan: orchestrationPlan,
                  messages: processedMessages,
                  provider: orchestrationProvider,
                  model: orchestrationModel,

                  /*
                   * Per-tenant rate-limit bucket (projectId is the best tenant key
                   * available here) so one project can't exhaust the global limit.
                   */
                  rateLimitKey: projectId,

                  /*
                   * Persist this run against the project so the multi-agent consensus
                   * panel (which scopes by AgentRun.projectId) can actually find it —
                   * without this every run is saved project-less and the panel is empty.
                   */
                  projectId,

                  /*
                   * Cancelling the chat must abort the upstream agent-run stream so
                   * the org isn't billed for lanes nobody is watching.
                   */
                  signal: request.signal,
                  onProviderStart: ensureCanonicalUserSpendStarted,
                  onEvent: (event) => {
                    if (event.type === 'lane-start') {
                      dataStream.writeMessageAnnotation({
                        type: 'agentLaneStream',
                        kind: 'start',
                        roleId: event.roleId,
                        title: localizeApiChatRoleTitle(language, event.roleId, event.title),
                      } satisfies ContextAnnotation);
                    } else if (event.type === 'lane-delta') {
                      dataStream.writeMessageAnnotation({
                        type: 'agentLaneStream',
                        kind: 'delta',
                        roleId: event.roleId,
                        text: event.content,
                      } satisfies ContextAnnotation);
                    } else if (event.type === 'lane-done') {
                      if (event.result.usage) {
                        addProviderCall(event.result.usage);
                      }

                      dataStream.writeMessageAnnotation({
                        type: 'agentLaneStream',
                        kind: 'done',
                        roleId: event.roleId,
                        status: event.result.status,
                        summary: localizeApiChatAgentResultSummary(language, event.result.status, event.result.summary),
                      } satisfies ContextAnnotation);
                    }
                  },
                });
              } catch (streamError) {
                logger.warn(
                  streamError instanceof AgentExecutorError
                    ? `${streamError.message} Falling back to aggregate sub-agent execution.`
                    : 'Streaming sub-agent executor failed. Falling back to aggregate sub-agent execution.',
                );
                execution = await executeAgentOrchestration({
                  env: context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined,
                  plan: orchestrationPlan,
                  messages: processedMessages,
                  provider: orchestrationProvider,
                  model: orchestrationModel,
                  rateLimitKey: projectId,

                  /*
                   * Same as the streaming path: persist against the project so the
                   * consensus panel finds this run. The streaming attempt fell back
                   * here, so omitting projectId would silently save the run
                   * project-less and leave the panel empty on the slow path.
                   */
                  projectId,
                  signal: request.signal,
                  onProviderStart: ensureCanonicalUserSpendStarted,
                });
              }

              for (const call of execution.usage.calls) {
                addProviderCall(call);
              }

              agentOrchestrationContext = [agentOrchestrationContext, createAgentExecutionContext(execution)]
                .filter(Boolean)
                .join('\n');

              const executionAnnotation = buildAgentExecutionAnnotation(execution);

              const localizedExecutionAnnotation = {
                ...executionAnnotation,
                results: executionAnnotation.results.map((result) => ({
                  ...result,
                  summary: localizeApiChatAgentResultSummary(language, result.status, result.summary),
                })),
                consensus: executionAnnotation.consensus
                  ? {
                      ...executionAnnotation.consensus,
                      conflicts: executionAnnotation.consensus.conflicts.map((conflict) => ({
                        ...conflict,
                        description: localizeApiChatConflictDescription(language, conflict),
                      })),
                    }
                  : undefined,
              } satisfies ContextAnnotation;

              dataStream.writeMessageAnnotation(localizedExecutionAnnotation as unknown as JSONValue);
            } catch (error) {
              const diagnostic =
                error instanceof AgentExecutorError
                  ? `${error.message} ${ORCHESTRATION_FALLBACK_SUFFIX}`
                  : ORCHESTRATION_FALLBACK_DIAGNOSTIC;
              logger.warn(diagnostic);
              orchestrationPlan = {
                ...orchestrationPlan,
                mode: 'single-model-lanes',
                reason: diagnostic,
              };
            }
          }

          const localizedOrchestrationRoles = orchestrationPlan.roles.map((role) =>
            localizeApiChatRole(language, role),
          );

          dataStream.writeMessageAnnotation({
            type: 'agentOrchestration',
            mode: orchestrationPlan.mode,
            reason: localizeApiChatOrchestrationReason(language, orchestrationPlan.reason),
            roles: localizedOrchestrationRoles.map((role) => ({
              id: role.id,
              title: role.title,
              responsibility: role.responsibility,
            })),
          } satisfies ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: API_CHAT_PROGRESS_LABELS.orchestration,
            status: 'complete',
            order: progressCounter++,
            message: formatApiChatCopy(language, 'plannedAgentLanes', {
              roles: localizedOrchestrationRoles.map((role) => role.title).join(', '),
            }),
          } satisfies ProgressAnnotation);
        }

        if (processedMessages.length > RECENT_HISTORY_MESSAGES) {
          /*
           * Pass the WINDOW SIZE (keep last N), not an absolute index — the
           * consumer slices its own (filtered) array from the end.
           */
          messageSliceId = RECENT_HISTORY_MESSAGES;
        }

        if (filePaths.length > 0 && contextOptimization) {
          try {
            /*
             * A1 (Wave A): only summarise when the history is actually large
             * enough that the recent-message window can't carry it losslessly.
             * Below the threshold the last RECENT_HISTORY_MESSAGES are still sent
             * in full, so the summary is redundant — skipping it drops one LLM
             * call/turn with zero information loss. When skipped, `summary` stays
             * undefined and the main call simply omits the (already conditional)
             * CHAT SUMMARY block.
             */
            const estimatedHistoryTokens = estimateMessagesTokens(processedMessages);

            const needsSummary = shouldGenerateSummary({
              messageCount: processedMessages.length,
              recentWindow: RECENT_HISTORY_MESSAGES,
              estimatedTokens: estimatedHistoryTokens,
            });

            if (needsSummary) {
              /*
               * Cache-max Rév.5: FREEZE the summary on the anchored-window palier. The
               * summary covers the messages the anchored window DROPS; within a palier
               * that dropped prefix is byte-stable, so reuse the previous summary and
               * skip the LLM call — regenerate ONLY when the window jumps a step (or an
               * older message is edited). Keyed on the dropped prefix so an edit still
               * invalidates. In-process memo: a cold pod just recomputes (no regression).
               * The summary is carried in the trailing ephemeral message, so this never
               * affects the cacheable prefix — it only saves one LLM call per turn.
               */
              const summaryDrop = anchoredHistoryDrop(
                processedMessages.length,
                RECENT_HISTORY_MESSAGES,
                HISTORY_WINDOW_STEP,
              );
              const summaryKey = computeSummaryCacheKey({
                droppedMessages: processedMessages.slice(0, summaryDrop),
              });

              const memoizedSummary = conversationId ? getMemoizedSummary(conversationId, summaryKey) : undefined;

              if (memoizedSummary !== undefined) {
                // INFO (not debug): prod drops debug logs, so this reuse must be INFO to be countable.
                logger.info(
                  JSON.stringify({
                    event: 'chat.summary.reused',
                    projectId,
                    reason: SUMMARY_REUSE_SAME_WINDOW_REASON,
                  }),
                );
                summary = memoizedSummary;
              } else {
                logger.debug('Generating Chat Summary');
                dataStream.writeData({
                  type: 'progress',
                  label: API_CHAT_PROGRESS_LABELS.summary,
                  status: 'in-progress',
                  order: progressCounter++,
                  message: copy.analysingRequest,
                } satisfies ProgressAnnotation);

                summary = await createSummary({
                  messages: [...processedMessages],
                  env: context.cloudflare?.env,
                  apiKeys,
                  providerSettings,
                  promptId,
                  contextOptimization,
                  abortSignal: request.signal,
                  onProviderStart: ensureCanonicalUserSpendStarted,
                  onFinish(resp, identity) {
                    addProviderCall({
                      callId: 'summary',
                      kind: 'summary',
                      provider: identity.provider,
                      model: identity.model,
                      inputTokens: resp.usage?.promptTokens || 0,
                      outputTokens: resp.usage?.completionTokens || 0,
                    });

                    if (resp.usage) {
                      logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                      cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                      cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                      cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
                    }
                  },
                });

                if (conversationId) {
                  setMemoizedSummary(conversationId, summaryKey, summary);
                }

                dataStream.writeData({
                  type: 'progress',
                  label: API_CHAT_PROGRESS_LABELS.summary,
                  status: 'complete',
                  order: progressCounter++,
                  message: copy.analysisComplete,
                } satisfies ProgressAnnotation);
              }

              dataStream.writeMessageAnnotation({
                type: 'chatSummary',
                summary,
                chatId: processedMessages.slice(-1)?.[0]?.id,
              } as ContextAnnotation);
            } else {
              /*
               * INFO (not debug): prod drops debug/trace logs (see app/utils/logger.ts),
               * so this skip decision must be INFO to be countable in prod logs. Emitted
               * as a structured event so the saved createSummary LLM call is greppable.
               */
              logger.info(
                JSON.stringify({
                  event: 'chat.summary.skipped',
                  projectId,
                  reason: SUMMARY_SKIP_RECENT_WINDOW_REASON,
                  messages: processedMessages.length,
                  estimatedHistoryTokens,
                }),
              );
            }

            logger.debug('Updating Context Buffer');
            dataStream.writeData({
              type: 'progress',
              label: API_CHAT_PROGRESS_LABELS.context,
              status: 'in-progress',
              order: progressCounter++,
              message: copy.determiningFilesToRead,
            } satisfies ProgressAnnotation);

            /*
             * A1 (Wave A): memoise the context-selection LLM call per conversation.
             * When the selection INPUTS (sorted file paths + the message history +
             * the summary) are byte-for-byte identical to the previous turn, reuse
             * the previously-selected FileMap and skip the round-trip entirely — the
             * main call still receives the exact same files. Any change → recompute.
             * The memo is in-process, so a cold pod just recomputes (no regression).
             */
            const selectionKey = computeSelectionCacheKey({
              filePaths,
              messages: processedMessages,
              summary,
            });

            const memoizedSelection = conversationId ? getMemoizedSelection(conversationId, selectionKey) : undefined;

            if (memoizedSelection) {
              // INFO (not debug): prod drops debug logs, so this reuse must be INFO to be countable.
              logger.info(
                JSON.stringify({
                  event: 'chat.contextSelection.reused',
                  projectId,
                  reason: CONTEXT_SELECTION_REUSE_REASON,
                }),
              );
              filteredFiles = memoizedSelection;
            } else {
              filteredFiles = await selectContext({
                messages: [...processedMessages],
                env: context.cloudflare?.env,
                apiKeys,
                files,
                providerSettings,
                promptId,
                contextOptimization,
                summary: summary ?? '',
                abortSignal: request.signal,
                onProviderStart: ensureCanonicalUserSpendStarted,
                onFinish(resp, identity) {
                  addProviderCall({
                    callId: 'context',
                    kind: 'context',
                    provider: identity.provider,
                    model: identity.model,
                    inputTokens: resp.usage?.promptTokens || 0,
                    outputTokens: resp.usage?.completionTokens || 0,
                  });

                  if (resp.usage) {
                    logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                    cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                    cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                    cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
                  }
                },
              });

              if (conversationId && filteredFiles) {
                setMemoizedSelection(conversationId, selectionKey, filteredFiles);
              }
            }

            if (filteredFiles) {
              logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
            }

            dataStream.writeMessageAnnotation({
              type: 'codeContext',
              files: Object.keys(filteredFiles).map((key) => {
                let path = key;

                if (path.startsWith(WORK_DIR)) {
                  path = path.replace(WORK_DIR, '');
                }

                return path;
              }),
            } as ContextAnnotation);

            dataStream.writeData({
              type: 'progress',
              label: API_CHAT_PROGRESS_LABELS.context,
              status: 'complete',
              order: progressCounter++,
              message: copy.codeFilesSelected,
            } satisfies ProgressAnnotation);
          } catch (contextError) {
            logger.warn('Context optimization failed; continuing without selected context', contextError);
            filteredFiles = undefined;
            summary = undefined;
            dataStream.writeData({
              type: 'progress',
              label: API_CHAT_PROGRESS_LABELS.context,
              status: 'complete',
              order: progressCounter++,
              message: copy.contextOptimizationSkipped,
            } satisfies ProgressAnnotation);
          }
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          maxSteps: resolvedMaxSteps,
          onStepFinish: ({ toolCalls }) => {
            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall, dataStream);
            });
          },
          onFinish: async ({ text: content, finishReason, usage, ...rest }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            const segmentUserMessage = processedMessages.filter((message) => message.role === 'user').at(-1);

            const segmentTagged = segmentUserMessage
              ? extractPropertiesFromMessage(segmentUserMessage)
              : { provider: 'unknown', model: 'unknown' };
            const segmentProvider = agentTargetLine
              ? (routedTurnProvider ?? boltProviderName(agentTargetLine.provider))
              : segmentTagged.provider;

            const segmentModel = agentTargetLine ? (routedTurnModel ?? agentTargetLine.model) : segmentTagged.model;
            const mainCallIndex = [...providerCalls.values()].filter((call) => call.kind === 'main').length;
            addProviderCall({
              callId: `main:${mainCallIndex + 1}`,
              kind: 'main',
              provider: segmentProvider,
              model: segmentModel,
              inputTokens: Math.max(0, Math.trunc(usage?.promptTokens || estimatedInputTokens)),
              outputTokens: Math.max(0, Math.trunc(usage?.completionTokens || 0)),
            });

            accumulateCacheUsage(cumulativeUsage, (rest as Record<string, unknown>).providerMetadata);

            /*
             * DIAG (cache): dump the SHAPE of the per-segment usage + providerMetadata
             * (numeric fields + keys only, never content/PII) so we can see, live, the
             * exact native cache-token fields each provider returns — and disambiguate
             * "provider isn't caching" from "SDK doesn't surface the cache metadata".
             * Safe/read-only; never throws out of onFinish.
             */
            try {
              const pm = (rest as Record<string, unknown>).providerMetadata;
              const shape: Record<string, unknown> = {};

              if (pm && typeof pm === 'object') {
                for (const [k, v] of Object.entries(pm as Record<string, unknown>)) {
                  if (v && typeof v === 'object') {
                    const nums: Record<string, number> = {};

                    for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
                      if (typeof nv === 'number') {
                        nums[nk] = nv;
                      }
                    }
                    shape[k] = { keys: Object.keys(v as Record<string, unknown>), nums };
                  }
                }
              }

              logger.info(
                JSON.stringify({
                  event: 'cache.metadata.shape',
                  projectId,
                  usageKeys: usage ? Object.keys(usage as Record<string, unknown>) : [],
                  usagePrompt: usage?.promptTokens ?? null,
                  providerMetadataKeys: pm && typeof pm === 'object' ? Object.keys(pm as Record<string, unknown>) : [],
                  shape,
                }),
              );
            } catch {
              // diagnostics must never break the stream
            }

            // Latch once any segment emits a real file action (accumulates across continuations).
            emittedFileAction = emittedFileAction || responseEmittedFileAction(content);

            /*
             * A build that ends without EVER emitting a `<boltAction type="file">`
             * produced no app — typically a weak model (gpt-3.5) that narrated the
             * plan in prose. Rather than a silent "Response Generated" + a preview
             * stuck PENDING, surface a clear, actionable message. Build mode only
             * (discuss mode legitimately writes no files). Best-effort — never
             * throws out of onFinish.
             */
            const warnIfNoFilesGenerated = () => {
              if (chatMode !== 'build' || emittedFileAction) {
                return;
              }

              try {
                dataStream.writeData({
                  type: 'progress',
                  label: API_CHAT_PROGRESS_LABELS.response,
                  status: 'complete',
                  order: progressCounter++,
                  message: copy.noFilesGenerated,
                } satisfies ProgressAnnotation);
                logger.warn(
                  `[chat] build produced no file actions (model likely too weak); projectId=${projectId ?? 'n/a'}`,
                );
              } catch (error) {
                logger.warn(`failed to write no-files annotation: ${error instanceof Error ? error.message : error}`);
              }
            };

            /*
             * Record token usage to the structured log + api-side ledger/quota.
             * Must run on EVERY terminal exit — including the two 'length'
             * terminal branches below (max-segments / empty-content). Earlier
             * this only fired on the non-'length' path, so tokens burned on a
             * capped or empty generation were never billed (quota leak).
             */
            const flushUsage = async (terminalFinishReason: string) => {
              const lastUserMessageForUsage = processedMessages.filter((x) => x.role === 'user').slice(-1)[0];

              /*
               * AGM: when mode routing decided the model, report THAT (the model
               * actually called — captured via onModelDecision) instead of the
               * client's message tags.
               */
              const tagged = lastUserMessageForUsage
                ? extractPropertiesFromMessage(lastUserMessageForUsage)
                : { provider: 'unknown', model: 'unknown' };

              const completionProvider = agentTargetLine
                ? (routedTurnProvider ?? boltProviderName(agentTargetLine.provider))
                : tagged.provider;

              const completionModel = agentTargetLine ? (routedTurnModel ?? agentTargetLine.model) : tagged.model;

              /*
               * Fold in the off-wire Anthropic cache tokens when the SDK surfaced
               * none (some provider/API variants omit cache metadata). Guarded on
               * cachedPromptTokens===0 so providers that DO report via metadata
               * (OpenAI, Google) are never double-counted, and the tally only ever
               * holds Anthropic data (no other provider reports into it).
               */
              const anthropicWireCache = anthropicCacheStore.getStore();

              if (
                anthropicWireCache &&
                cumulativeUsage.cachedPromptTokens === 0 &&
                cumulativeUsage.cacheWriteTokens === 0 &&
                (anthropicWireCache.read > 0 || anthropicWireCache.write > 0)
              ) {
                cumulativeUsage.cachedPromptTokens = anthropicWireCache.read;
                cumulativeUsage.cacheWriteTokens = anthropicWireCache.write;
              }

              logger.info(
                JSON.stringify({
                  event: 'chat.completion.usage',
                  projectId,
                  chatMode,
                  finishReason: terminalFinishReason,
                  provider: completionProvider,
                  model: completionModel,
                  promptTokens: cumulativeUsage.promptTokens,
                  completionTokens: cumulativeUsage.completionTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                  cachedPromptTokens: cumulativeUsage.cachedPromptTokens,
                  cacheWriteTokens: cumulativeUsage.cacheWriteTokens,
                  timestamp: new Date().toISOString(),
                }),
              );

              if (projectId) {
                await settleCanonicalUsage(terminalFinishReason);

                /*
                 * F18 — record the provider request outcome (latency + errored) for
                 * the admin p95/error-rate metrics. A clean terminal finish is a
                 * success unless the finishReason is itself an error. Fire-and-forget:
                 * recordProviderMetric never throws.
                 */
                void recordProviderMetric({
                  projectId,
                  provider: completionProvider,
                  model: completionModel,
                  latencyMs: Date.now() - providerCallStartedAt,
                  errored: terminalFinishReason === 'error',
                  cookieHeader: request.headers.get('Cookie') ?? undefined,
                });
              }

              try {
                dataStream.writeMessageAnnotation({
                  type: 'usage',
                  value: {
                    completionTokens: cumulativeUsage.completionTokens,
                    promptTokens: cumulativeUsage.promptTokens,
                    totalTokens: cumulativeUsage.totalTokens,
                  },
                });
              } catch (error) {
                logger.warn(`failed to write usage annotation: ${error instanceof Error ? error.message : error}`);
              }
            };

            // Release this request's MCP clients without ever throwing out of onFinish.
            const safeCloseMcp = async () => {
              try {
                await mcpService.close();
              } catch (error) {
                logger.warn(`failed to close MCP clients: ${error instanceof Error ? error.message : error}`);
              }
            };

            /*
             * onFinish runs the terminal cleanup for the stream (usage flush,
             * memory persistence, MCP client release, and the 'length'
             * continuation). ANY uncaught throw here corrupts the data stream and
             * leaks the MCP stdio/HTTP clients + the recovery idle timer. Wrap the
             * whole body so a failure degrades gracefully: stop recovery, release
             * MCP best-effort, and surface a clean error progress annotation.
             */
            try {
              if (finishReason !== 'length') {
                streamRecovery.stop();

                await flushUsage(finishReason);

                warnIfNoFilesGenerated();

                dataStream.writeData({
                  type: 'progress',
                  label: API_CHAT_PROGRESS_LABELS.response,
                  status: 'complete',
                  order: progressCounter++,
                  message: copy.responseGenerated,
                } satisfies ProgressAnnotation);
                await new Promise((resolve) => setTimeout(resolve, 0));
                await persistAgentMemoryCandidate(request, {
                  messages: processedMessages,
                  assistantText: content,
                  projectId,
                });

                // Release this request's MCP clients (idempotent with the abort handler).
                await safeCloseMcp();

                // stream.close();
                return;
              }

              if (continuationSegments >= MAX_RESPONSE_SEGMENTS) {
                /*
                 * Hard stop after MAX_RESPONSE_SEGMENTS continuations. End the
                 * stream cleanly with a truncation note rather than throwing (a
                 * throw here surfaces as a stream error to the client). Without
                 * this bound the 'length' continuation recursed forever.
                 */
                streamRecovery.stop();
                await flushUsage('length');
                warnIfNoFilesGenerated();
                dataStream.writeData({
                  type: 'progress',
                  label: API_CHAT_PROGRESS_LABELS.response,
                  status: 'complete',
                  order: progressCounter++,
                  message: copy.responseTruncatedSegments,
                } satisfies ProgressAnnotation);

                await safeCloseMcp();

                return;
              }

              /*
               * A 'length' finish with no usable text (all budget consumed by
               * reasoning/tool tokens) would push an empty assistant turn followed
               * by CONTINUE_PROMPT — many providers error on empty assistant
               * content, and at best it loops producing empty segments until the
               * cap, burning quota for zero output. Treat it as a terminal response.
               */
              if (content.trim().length === 0) {
                streamRecovery.stop();
                await flushUsage('length');
                warnIfNoFilesGenerated();
                dataStream.writeData({
                  type: 'progress',
                  label: API_CHAT_PROGRESS_LABELS.response,
                  status: 'complete',
                  order: progressCounter++,
                  message: copy.responseTruncatedNoContent,
                } satisfies ProgressAnnotation);

                await safeCloseMcp();

                return;
              }

              continuationSegments += 1;

              const switchesLeft = MAX_RESPONSE_SEGMENTS - continuationSegments;

              logger.info(
                `Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} segments left)`,
              );

              const lastUserMessage = processedMessages.filter((x) => x.role == 'user').slice(-1)[0];
              const { model, provider } = extractPropertiesFromMessage(lastUserMessage);

              /*
               * Prefer the CONCRETE model the first segment resolved to (Auto is
               * downgraded to a concrete id before the provider call). Reusing it
               * keeps the model stable across every continuation segment; falls
               * back to the message-prefix model for explicit (non-Auto) turns.
               */
              const continuationModel = routedTurnModel ?? model;
              const continuationProvider = routedTurnProvider ?? provider;
              processedMessages.push({ id: generateId(), role: 'assistant', content });
              processedMessages.push({
                id: generateId(),
                role: 'user',
                content: `[Model: ${continuationModel}]\n\n[Provider: ${continuationProvider}]\n\n${CONTINUE_PROMPT}`,
              });

              /*
               * The continuation streamText() can throw (provider error, aborted
               * request, network). Unprotected, that exception escaped onFinish —
               * corrupting the stream and leaking the MCP clients + recovery timer.
               * On failure, stop recovery, release MCP, and emit a clean error note.
               */
              try {
                providerCallStartedAt = Date.now();

                const result = await streamText({
                  messages: [...processedMessages],
                  forcedRoute: agentTargetLine
                    ? { provider: boltProviderName(agentTargetLine.provider), model: agentTargetLine.model }
                    : undefined,
                  env: context.cloudflare?.env,
                  options,
                  apiKeys,
                  files,
                  providerSettings,
                  promptId,
                  contextOptimization,
                  contextFiles: filteredFiles,
                  chatMode,
                  designScheme,
                  summary,
                  messageSliceId,
                  abortSignal: request.signal,
                  agentOrchestrationPlan: orchestrationPlan,
                  agentOrchestrationContext,
                  agentMemoryContext: agentMemory?.context,
                  projectRulesContext: projectRules?.context,
                  skillsContext: projectSkills?.context,
                  chatId: conversationId,
                  onModelDecision: (decidedModel, decidedProvider) => {
                    routedTurnModel = decidedModel;
                    routedTurnProvider = decidedProvider;
                  },
                  skipProviderProbe: true,
                  onProviderStart: ensureCanonicalUserSpendStarted,
                });

                result.mergeIntoDataStream(dataStream);
              } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                  // Client went away mid-continuation — expected, just clean up.
                  streamRecovery.stop();
                  await safeCloseMcp();

                  return;
                }

                logger.error(`continuation streamText failed: ${error instanceof Error ? error.message : error}`);
                streamRecovery.stop();
                await safeCloseMcp();
                dataStream.writeData({
                  type: 'progress',
                  label: API_CHAT_PROGRESS_LABELS.response,
                  status: 'complete',
                  order: progressCounter++,
                  message: copy.responseInterrupted,
                } satisfies ProgressAnnotation);
              }

              return;
            } catch (error) {
              /*
               * Last-resort guard for the whole onFinish body — never let a throw
               * here tear down the data stream or leak resources.
               */
              logger.error(`onFinish failed: ${error instanceof Error ? error.message : error}`);
              streamRecovery.stop();
              await safeCloseMcp();

              if (projectId && providerCalls.size > 0 && !canonicalUsageFlushed) {
                throw new ChatQuotaError(copy.usageSettlementUnavailable, 503, 'CANONICAL_AI_USAGE_SETTLEMENT_FAILED');
              }
            }
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: API_CHAT_PROGRESS_LABELS.response,
          status: 'in-progress',
          order: progressCounter++,
          message: copy.generatingResponse,
        } satisfies ProgressAnnotation);

        /*
         * AGM: settle High effort escalation for THIS request, then announce the
         * routing to the client (mode, multiplier, and the "+0 credit" signal
         * when High effort did NOT need to escalate). Model names never appear
         * in the annotation.
         */
        if (agentRoute) {
          if (agentSelection.highEffort && agentRoute.escalation) {
            const lastUserTextForHardness = (() => {
              const lastUser = [...processedMessages].reverse().find((message) => message.role === 'user');
              return typeof lastUser?.content === 'string' ? lastUser.content : '';
            })();

            const hardness = await decideTaskHardness({
              task: {
                chatMode,
                lastUserMessage: lastUserTextForHardness,
                contextFileCount: filteredFiles ? Object.keys(filteredFiles).length : 0,
                planFirst: orchestrationPlan.enabled,
                isReasoningModel: false,
              },
              lastUserMessage: lastUserTextForHardness,
              classifier: agentRoute.classifier,
              apiKeys,
              providerSettings,
              serverEnv: context.cloudflare?.env as unknown as Record<string, string>,
              classifierReplay: canonicalPlatformReceipt,
              onClassifierStart: async (intent) => {
                if (!projectId || !userSpendReservationId || !canonicalExecutionToken) {
                  throw new ChatQuotaError(copy.entitlementsUnavailable, 503, 'CANONICAL_AI_RESERVATION_REQUIRED');
                }

                await markPlatformChatUsageStarted({
                  projectId,
                  requestId: quotaIdempotencyKey,
                  executionToken: canonicalExecutionToken,
                  userSpendReservationId,
                  agentRouting: {
                    mode: agentSelection.mode,
                    highEffort: agentSelection.highEffort,
                    turbo: agentSelection.turbo,
                    lineKey: 'classifier',
                    routingCardVersion: agentRoute.routingVersion,
                    source: 'classifier',
                  },
                  call: intent,
                  cookieHeader: cookieHeader ?? undefined,
                });
              },
            });

            agentEscalated = hardness.hard;
            agentHardnessDecidedBy = hardness.decidedBy;
            agentClassifierUsage = hardness.classifierUsage;
            agentTargetLine = hardness.hard ? agentRoute.escalation : agentRoute.base;

            /* Persist the operator-only classifier receipt before any user-billed call. */
            if (agentClassifierUsage && projectId) {
              if (!userSpendReservationId || !canonicalExecutionToken) {
                throw new ChatQuotaError(copy.entitlementsUnavailable, 503, 'CANONICAL_AI_RESERVATION_REQUIRED');
              }

              await recordPlatformChatUsage({
                projectId,
                requestId: quotaIdempotencyKey,
                executionToken: canonicalExecutionToken,
                userSpendReservationId,
                outcome: hardness.hard ? 'hard' : 'easy',
                agentRouting: {
                  mode: agentSelection.mode,
                  highEffort: agentSelection.highEffort,
                  escalated: hardness.hard,
                  turbo: agentSelection.turbo,
                  lineKey: 'classifier',
                  routingCardVersion: agentRoute.routingVersion,
                  source: 'classifier',
                },
                call: {
                  callId: 'classifier',
                  kind: 'classifier',
                  billedToUser: false,
                  provider: agentClassifierUsage.provider,
                  model: agentClassifierUsage.model,
                  inputTokens: agentClassifierUsage.inputTokens,
                  outputTokens: agentClassifierUsage.outputTokens,
                },
                cookieHeader: cookieHeader ?? undefined,
              });
            }
          }

          logger.info(
            JSON.stringify({
              event: 'agent-mode.routed',
              projectId,
              mode: agentSelection.mode,
              highEffort: agentSelection.highEffort,
              turbo: agentSelection.turbo,
              escalated: agentEscalated,
              decidedBy: agentHardnessDecidedBy,
              lineKey: agentTargetLine?.lineKey,
              provider: agentTargetLine?.provider,
              model: agentTargetLine?.model,
              routingVersion: agentRoute.routingVersion,
            }),
          );

          dataStream.writeMessageAnnotation({
            type: 'agentModeRouting',
            mode: agentSelection.mode,
            highEffort: agentSelection.highEffort,
            turbo: agentSelection.turbo,
            escalated: agentEscalated,
            multiplier: agentTargetLine?.multiplier ?? 1,
            routingVersion: agentRoute.routingVersion,

            /*
             * High effort transparency: when ON but the task did not need the
             * escalation, say so — the surcharge is NOT systematic.
             */
            extraCharge: agentSelection.highEffort ? agentEscalated : undefined,
          } as unknown as ContextAnnotation);
        }

        providerCallStartedAt = Date.now();

        const result = await streamText({
          messages: [...processedMessages],
          forcedRoute: agentTargetLine
            ? { provider: boltProviderName(agentTargetLine.provider), model: agentTargetLine.model }
            : undefined,
          env: context.cloudflare?.env,
          options,
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          messageSliceId,

          /*
           * Audit v3 (H): thread the request's abort signal into the *initial*
           * generation too. Previously only the continuation call (above) got
           * it, so clicking Stop aborted the client read but the provider kept
           * generating the first segment server-side — and kept billing tokens.
           */
          abortSignal: request.signal,
          agentOrchestrationPlan: orchestrationPlan,
          agentOrchestrationContext,
          agentMemoryContext: agentMemory?.context,
          skillsContext: projectSkills?.context,
          chatId: conversationId,
          onModelDecision: (decidedModel, decidedProvider) => {
            routedTurnModel = decidedModel;
            routedTurnProvider = decidedProvider;
          },
          skipProviderProbe: true,
          onProviderStart: ensureCanonicalUserSpendStarted,
        });

        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        streamRecovery.stop();

        /*
         * Release this request's MCP clients (stdio child processes / HTTP
         * transports) on the error path too. The success/terminal paths close
         * them in onFinish and the abort handler covers client disconnects, but a
         * generation error WITHOUT a disconnect previously leaked them. Idempotent.
         */
        void mcpService.close();

        /*
         * A pre-flight quota block throws ChatQuotaError so the agent never
         * stalls silently. Serialise it as a JSON error part so the client's
         * handleError can JSON.parse the statusCode/message and render the quota
         * alert, instead of the opaque "Custom error: [...]" string below.
         */
        if (error instanceof ChatQuotaError) {
          logger.info(`stream onError code=${error.code} (quota)`);

          return serializeLocalizedStreamError(error);
        }

        const code = clientDisconnected ? 'STREAM_ABORTED' : classifyStreamError(error);
        const detail = error?.message ? ` (${error.message})` : '';

        logger.info(`stream onError code=${code}${detail}`);

        /*
         * Signaler la panne au repli multi-fournisseur. La sonde d'un jeton de
         * `stream-text` attrape déjà le cas « crédit à sec » AVANT la génération,
         * mais elle ne peut rien voir d'une panne qui n'apparaît qu'en cours de
         * flux (429 sous charge, 5xx, coupure réseau). Marquer ici fait partir le
         * tour SUIVANT chez le fournisseur de repli au lieu de re-provoquer la
         * même erreur. Un abandon client n'est pas une panne fournisseur.
         */
        if (!clientDisconnected && routedTurnProvider) {
          const kind = classifyProviderFailure(error);

          if (kind) {
            markProviderUnhealthy(routedTurnProvider, kind, String(error?.message ?? code).slice(0, 300));
          }
        }

        /*
         * F18 — count a GENUINE provider/stream error toward the admin 24h error
         * rate. A client disconnect (STREAM_ABORTED) is the user's doing, not a
         * provider fault, so it is excluded; quota blocks already returned above.
         * Fire-and-forget; uses the routed provider/model captured by onModelDecision.
         * If the error fired before the model resolved, there is nothing to attribute,
         * so the metric is skipped.
         */
        if (projectId && !clientDisconnected && routedTurnProvider) {
          void recordProviderMetric({
            projectId,
            provider: routedTurnProvider,
            model: routedTurnModel,
            latencyMs: Date.now() - providerCallStartedAt,
            errored: true,
            cookieHeader: request.headers.get('Cookie') ?? undefined,
          });
        }

        /*
         * Serialise as a structured JSON error part carrying the stable code and
         * retryability. English retains the provider diagnostic; French maps the
         * code to reviewed copy so SDK details and secrets never reach the UI.
         */
        return serializeLocalizedStreamError(error);
      },
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"__boltThought__\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
        flush: (controller) => {
          /*
           * If the stream ended while still emitting reasoning tokens (the model
           * was truncated mid-thought), the opening __boltThought__ div was never
           * closed by the next non-`g` chunk. Close it here so the rest of the
           * persisted message isn't swallowed into the (hidden) thought block.
           */
          if (typeof lastChunk === 'string' && lastChunk.startsWith('g')) {
            controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
          }
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: responseHeaders({
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      }),
    });
  } catch (error: any) {
    logger.error(error);

    const errorCode = classifyStreamError(error);
    const rawMessage = typeof error?.message === 'string' ? error.message : '';

    const errorResponse = {
      error: true,
      message: localizeApiChatStreamError(language, errorCode, rawMessage || copy.unexpectedError),
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: copy.invalidApiKey,
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: responseHeaders({ 'Content-Type': 'application/json' }),
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: responseHeaders({ 'Content-Type': 'application/json' }),
      statusText: 'Error',
    });
  }
}

interface AccountConnectionResponse {
  id: string;
  provider: string;
  externalAccountLabel: string;
  scopes: string[];
  status: 'active' | 'needs_reconnect' | 'revoked';
}

/**
 * Detect which connectors the latest user message references and, when
 * a needed provider is not already covered by an active UserConnection,
 * emit a connection_request data part into the chat stream so the
 * client can render an inline Connect card.
 *
 * The detection runs against the prompt only (recent generated code is
 * not yet stitched back into the chat route — the agent orchestration
 * already has it). Account-level connections are fetched best-effort:
 * a failed fetch silently disables the surfacing so chat never breaks
 * because of a connector-side error.
 */
async function emitConnectorConnectionRequests(input: {
  dataStream: { writeMessageAnnotation: (annotation: JSONValue) => void };
  language: string;
  processedMessages: Messages;
  projectId?: string;
  request: Request;
}): Promise<void> {
  const latestUserMessage = [...input.processedMessages].reverse().find((message) => message.role === 'user');

  if (!latestUserMessage) {
    return;
  }

  const prompt = typeof latestUserMessage.content === 'string' ? latestUserMessage.content : '';

  if (!prompt) {
    return;
  }

  const detected = detectConnectorNeeds({ prompt, language: input.language });

  if (detected.length === 0) {
    return;
  }

  let accountConnections: AccountConnectionResponse[] = [];

  try {
    const response = await apiRequest<{ connections: AccountConnectionResponse[] }>(
      input.request,
      '/api/account/connections',
    );
    accountConnections = response.connections ?? [];
  } catch {
    /*
     * Best-effort: the chat continues even if the account-connections
     * lookup is unreachable. The card will simply not pre-populate
     * existingAccountConnections.
     */
    accountConnections = [];
  }

  for (const need of detected) {
    const matchingAccount = accountConnections.find(
      (connection) => connection.provider === need.provider && connection.status === 'active',
    );

    /*
     * The Phase 1 minimum-viable detection emits a request whenever the
     * provider is mentioned. The client-side card de-duplicates against
     * the project's actual link state when the user clicks Connect; the
     * cost of a spurious card is small compared to the cost of missing
     * one.
     */

    const existingAccountConnections: ExistingAccountConnection[] = matchingAccount
      ? [
          {
            userConnectionId: matchingAccount.id,
            accountLabel: matchingAccount.externalAccountLabel,
            scopes: matchingAccount.scopes,
            scopesMatch: true,
          },
        ]
      : [];

    let dataPart: ConnectorDataPart;

    try {
      dataPart = createConnectionRequestDataPart({
        messageId: generateId(),
        provider: need.provider,
        reason: formatApiChatCopy(input.language, 'connectorReason', { provider: need.provider }),
        resumeToken: generateId(),
        existingAccountConnections: existingAccountConnections.length > 0 ? existingAccountConnections : undefined,
        language: input.language,
      });
    } catch {
      /*
       * Unknown provider in the catalog — skip silently. The detection
       * catalog and the data-part catalog can drift while new providers
       * are being added; the safer behaviour is to fall through rather
       * than crash the chat.
       */
      continue;
    }

    /*
     * The connector annotation is not in the typed ContextAnnotation
     * union because its discriminated payload would break the
     * JSONObject constraint of writeMessageAnnotation. We cast through
     * JSONValue so the client renderer (which structurally matches
     * type === 'connector') still picks it up.
     */
    input.dataStream.writeMessageAnnotation({
      type: 'connector',
      payload: dataPart.payload as unknown as JSONValue,
    });
  }

  /*
   * projectId is not consumed yet because the per-project link state
   * ships with the IDE Integrations panel in Phase 3; the parameter
   * stays here so the call sites already pass it.
   */
  void input.projectId;
}
