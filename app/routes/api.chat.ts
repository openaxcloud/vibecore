/* eslint-disable import/order */
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
import { ChatQuotaError, serializeChatStreamError } from './api.chat.quota-error';
import { apiRequest } from '~/lib/enterprise-api.server';
import type { ConnectorDataPart, ExistingAccountConnection } from '~/lib/chat/connector-messages';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import { checkChatQuota, recordChatUsage } from '~/lib/.server/ai-usage';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { filterEnabledMcpServers, MCPService } from '~/lib/services/mcpService';
import { loadUserMcpConfig } from '~/lib/.server/mcp/load-config.server';
import { retrieveSkillsForAgentContext } from '~/lib/.server/llm/project-skills';
import { retrieveProjectRulesContext } from '~/lib/.server/llm/project-rules';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { classifyStreamError, streamErrorCodeMessages } from '~/types/context';
import type { DesignScheme } from '~/types/design-scheme';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { WORK_DIR } from '~/utils/constants';
import {
  createPortfolioTemplateArtifact,
  createPortfolioTemplateStreamChunks,
  shouldUsePortfolioTemplate,
} from '~/utils/portfolio-template';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');
const RECENT_HISTORY_MESSAGES = 12;

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
    return new Response(JSON.stringify({ error: true, message: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Bad Request',
    });
  }

  const {
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

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
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

  const encoder: TextEncoder = new TextEncoder();

  let progressCounter: number = 1;

  try {
    /*
     * Per-request instance — NOT the shared singleton. This request loads THIS
     * user's MCP servers (config, tools and credential-bearing clients are
     * instance state); a shared instance would leak one tenant's tools and
     * credentials into another tenant's concurrent chat. Closed on disconnect
     * and on completion below.
     */
    const mcpService = new MCPService();
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

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        streamRecovery.startMonitoring();

        /*
         * C1.b.4 — Pre-flight quota check. We over-estimate (×1.2) on
         * char/4 so a chat that would clip the limit by a hair is
         * rejected up front rather than mid-stream. Fail-open inside
         * checkChatQuota when the api is unreachable; the post-stream
         * recordChatUsage call will still try to charge the ledger.
         */
        // Turbo / high-power are paid-plan-only premium modes (Replit parity).
        // Resolved from the quota check's plan below; fail-open (stays true) so an
        // unknown/degraded plan lookup NEVER blocks a paying user's request.
        let premiumModesEligible = true;

        if (projectId) {
          const estimatedInputTokens = Math.ceil((totalMessageContent.length / 4) * 1.2);

          const quota = await checkChatQuota({
            projectId,
            estimatedInputTokens,
            cookieHeader: cookieHeader ?? undefined,
          });

          if (!quota.ok) {
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
              label: 'quota-exceeded',
              status: 'complete',
              order: progressCounter++,
              message: quota.message,
            } satisfies ProgressAnnotation);
            dataStream.writeMessageAnnotation({
              type: 'error',
              value: {
                code: quota.code,
                statusCode: quota.statusCode,
                message: quota.message,
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
            throw new ChatQuotaError(quota.message, quota.statusCode, quota.code);
          }

          /*
           * Premium-mode (Turbo / high-power) eligibility from the resolved plan.
           * Mirrors premiumAgentModesEligible in @vibecore/billing: only the
           * unambiguous free/Starter tier is ineligible; an absent byok payload
           * leaves premium modes enabled (fail-open).
           */
          premiumModesEligible = quota.byok ? quota.byok.plan !== 'free' && quota.byok.plan !== 'starter' : true;

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

        if (shouldUsePortfolioTemplate({ messages, chatMode, files })) {
          const streamChunks = createPortfolioTemplateStreamChunks(messages);
          const assistantText = createPortfolioTemplateArtifact(messages);

          const zeroUsage = {
            completionTokens: 0,
            promptTokens: 0,
            totalTokens: 0,
          };

          dataStream.writeData({
            type: 'progress',
            label: 'portfolio-template',
            status: 'complete',
            order: progressCounter++,
            message: 'Loaded cached portfolio template',
          } satisfies ProgressAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'response',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Streaming cached portfolio files',
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
            label: 'response',
            status: 'complete',
            order: progressCounter++,
            message: 'Response Generated',
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
        const agentMemory = await retrieveMemoryForAgentContext(request, { messages: processedMessages, projectId });

        if (agentMemory?.memories.length) {
          dataStream.writeMessageAnnotation(agentMemoryAnnotation(agentMemory.memories) as ContextAnnotation);
        }

        /*
         * Project Skills → agent context. Enabled skills (managed in the IDE
         * "Skills" panel) are injected into the system prompt so toggling a skill
         * actually changes agent behaviour. Fails open to "no skills".
         */
        const projectSkills = await retrieveSkillsForAgentContext(request, { projectId });

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
          processedMessages,
          projectId,
          request,
        });

        /*
         * Composer power controls → parallel-agent cap. Lite=1 (single lane, no
         * orchestration), Economy=3, Power=5 (+1 for High-power). This is what
         * makes the Lite/Economy/Power selector VISIBLY change how many specialist
         * agents run, instead of every request silently fanning out all 5.
         */
        /*
         * Enforce Turbo / high-power gating on BEHAVIOUR: an ineligible (free)
         * plan can't fan out the full Turbo roster nor add the high-power lane —
         * strip those modes so the org gets (and is billed for) only what its plan
         * allows. Fail-open: premiumModesEligible defaults true on any ambiguity.
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
            reason: 'plan',
            gated: ['turboMode', 'highPowerModel'].filter(
              (mode) => (agentPower as Record<string, unknown>)[mode],
            ),
          } as unknown as ContextAnnotation);
        }

        const parallelAgents = effectivePower
          ? effectivePower.turboMode
            ? /* Turbo: fan out the full roster for the fastest wall-clock (more lanes
               * finishing concurrently), at the higher cost the control advertises. */
              parallelAgentsForBuildTier('power', effectivePower.highPowerModel)
            : parallelAgentsForBuildTier(effectivePower.buildTier, effectivePower.highPowerModel)
          : undefined;

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
          dataStream.writeMessageAnnotation({
            type: 'agentPlan',
            planned: true,
            needsApproval: true,
            tasks: agentPlanTasks,
          } satisfies ContextAnnotation);

          streamRecovery.stop();

          dataStream.writeData({
            type: 'progress',
            label: 'response',
            status: 'complete',
            order: progressCounter++,
            message: 'Plan ready — approve to build',
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
              label: 'orchestration',
              status: 'in-progress',
              order: progressCounter++,
              message: 'Executing specialist agent lanes',
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
                   * Cancelling the chat must abort the upstream agent-run stream so
                   * the org isn't billed for lanes nobody is watching.
                   */
                  signal: request.signal,
                  onEvent: (event) => {
                    if (event.type === 'lane-start') {
                      dataStream.writeMessageAnnotation({
                        type: 'agentLaneStream',
                        kind: 'start',
                        roleId: event.roleId,
                        title: event.title,
                      } satisfies ContextAnnotation);
                    } else if (event.type === 'lane-delta') {
                      dataStream.writeMessageAnnotation({
                        type: 'agentLaneStream',
                        kind: 'delta',
                        roleId: event.roleId,
                        text: event.content,
                      } satisfies ContextAnnotation);
                    } else if (event.type === 'lane-done') {
                      dataStream.writeMessageAnnotation({
                        type: 'agentLaneStream',
                        kind: 'done',
                        roleId: event.roleId,
                        status: event.result.status,
                        summary: event.result.summary,
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
                  signal: request.signal,
                });
              }

              agentOrchestrationContext = [agentOrchestrationContext, createAgentExecutionContext(execution)]
                .filter(Boolean)
                .join('\n');
              dataStream.writeMessageAnnotation(buildAgentExecutionAnnotation(execution) satisfies ContextAnnotation);
            } catch (error) {
              const message =
                error instanceof AgentExecutorError
                  ? `${error.message} Falling back to single-model lanes.`
                  : 'Sub-agent executor failed. Falling back to single-model lanes.';
              logger.warn(message);
              orchestrationPlan = {
                ...orchestrationPlan,
                mode: 'single-model-lanes',
                reason: message,
              };
            }
          }

          dataStream.writeMessageAnnotation({
            type: 'agentOrchestration',
            mode: orchestrationPlan.mode,
            reason: orchestrationPlan.reason,
            roles: orchestrationPlan.roles.map((role) => ({
              id: role.id,
              title: role.title,
              responsibility: role.responsibility,
            })),
          } satisfies ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'orchestration',
            status: 'complete',
            order: progressCounter++,
            message: `Agent lanes planned: ${orchestrationPlan.roles.map((role) => role.title).join(', ')}`,
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
            logger.debug('Generating Chat Summary');
            dataStream.writeData({
              type: 'progress',
              label: 'summary',
              status: 'in-progress',
              order: progressCounter++,
              message: 'Analysing Request',
            } satisfies ProgressAnnotation);

            summary = await createSummary({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              apiKeys,
              providerSettings,
              promptId,
              contextOptimization,
              abortSignal: request.signal,
              onFinish(resp) {
                if (resp.usage) {
                  logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                  cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                  cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                  cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
                }
              },
            });
            dataStream.writeData({
              type: 'progress',
              label: 'summary',
              status: 'complete',
              order: progressCounter++,
              message: 'Analysis Complete',
            } satisfies ProgressAnnotation);

            dataStream.writeMessageAnnotation({
              type: 'chatSummary',
              summary,
              chatId: processedMessages.slice(-1)?.[0]?.id,
            } as ContextAnnotation);

            logger.debug('Updating Context Buffer');
            dataStream.writeData({
              type: 'progress',
              label: 'context',
              status: 'in-progress',
              order: progressCounter++,
              message: 'Determining Files to Read',
            } satisfies ProgressAnnotation);

            filteredFiles = await selectContext({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              summary,
              abortSignal: request.signal,
              onFinish(resp) {
                if (resp.usage) {
                  logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                  cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                  cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                  cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
                }
              },
            });

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
              label: 'context',
              status: 'complete',
              order: progressCounter++,
              message: 'Code Files Selected',
            } satisfies ProgressAnnotation);
          } catch (contextError) {
            logger.warn('Context optimization failed; continuing without selected context', contextError);
            filteredFiles = undefined;
            summary = undefined;
            dataStream.writeData({
              type: 'progress',
              label: 'context',
              status: 'complete',
              order: progressCounter++,
              message: 'Context optimization skipped',
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
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            /*
             * Record token usage to the structured log + api-side ledger/quota.
             * Must run on EVERY terminal exit — including the two 'length'
             * terminal branches below (max-segments / empty-content). Earlier
             * this only fired on the non-'length' path, so tokens burned on a
             * capped or empty generation were never billed (quota leak).
             */
            const flushUsage = async (terminalFinishReason: string) => {
              const lastUserMessageForUsage = processedMessages.filter((x) => x.role === 'user').slice(-1)[0];

              const { provider: completionProvider, model: completionModel } = lastUserMessageForUsage
                ? extractPropertiesFromMessage(lastUserMessageForUsage)
                : { provider: 'unknown', model: 'unknown' };

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
                  timestamp: new Date().toISOString(),
                }),
              );

              if (projectId) {
                /*
                 * Fire-and-log: a billing/quota write failure must never break the
                 * data stream or abort the rest of onFinish (cleanup still runs).
                 */
                try {
                  await recordChatUsage({
                    projectId,
                    provider: completionProvider,
                    model: completionModel,
                    inputTokens: cumulativeUsage.promptTokens,
                    outputTokens: cumulativeUsage.completionTokens,
                    finishReason: terminalFinishReason,
                    cookieHeader: request.headers.get('Cookie') ?? undefined,
                    source: 'remix-chat',
                  });
                } catch (error) {
                  logger.error(`failed to record chat usage: ${error instanceof Error ? error.message : error}`);
                }
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

                dataStream.writeData({
                  type: 'progress',
                  label: 'response',
                  status: 'complete',
                  order: progressCounter++,
                  message: 'Response Generated',
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
                dataStream.writeData({
                  type: 'progress',
                  label: 'response',
                  status: 'complete',
                  order: progressCounter++,
                  message: 'Response truncated: maximum continuation segments reached',
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
                dataStream.writeData({
                  type: 'progress',
                  label: 'response',
                  status: 'complete',
                  order: progressCounter++,
                  message: 'Response truncated: model returned no further content',
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
              processedMessages.push({ id: generateId(), role: 'assistant', content });
              processedMessages.push({
                id: generateId(),
                role: 'user',
                content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
              });

              /*
               * The continuation streamText() can throw (provider error, aborted
               * request, network). Unprotected, that exception escaped onFinish —
               * corrupting the stream and leaking the MCP clients + recovery timer.
               * On failure, stop recovery, release MCP, and emit a clean error note.
               */
              try {
                const result = await streamText({
                  messages: [...processedMessages],
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
                  label: 'response',
                  status: 'complete',
                  order: progressCounter++,
                  message: 'Response interrupted: continuation failed',
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
            }
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...processedMessages],
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

          return serializeChatStreamError(error);
        }

        const code = clientDisconnected ? 'STREAM_ABORTED' : classifyStreamError(error);
        const baseMessage = streamErrorCodeMessages[code];
        const detail = error?.message ? ` (${error.message})` : '';

        logger.info(`stream onError code=${code}${detail}`);

        return `Custom error: [${code}] ${baseMessage}`;
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
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    logger.error(error);

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' },
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

  const detected = detectConnectorNeeds({ prompt });

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
        reason: `The request mentions ${need.provider}. Connect it so the agent can read or write ${need.provider} data on your behalf.`,
        resumeToken: generateId(),
        existingAccountConnections: existingAccountConnections.length > 0 ? existingAccountConnections : undefined,
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
