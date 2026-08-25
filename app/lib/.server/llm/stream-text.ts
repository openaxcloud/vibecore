import { convertToCoreMessages, smoothStream, streamText as _streamText, type Message } from 'ai';
import {
  areParallelSubagentsAvailable,
  type AgentOrchestrationPlan,
  buildAgentOrchestrationPlan,
  createAgentOrchestrationPrompt,
} from './agent-orchestration';
import {
  MAX_TOKENS,
  PROVIDER_COMPLETION_LIMITS,
  isReasoningModel,
  modelDisallowsTemperature,
  temperatureOptionsForModel,
  type FileMap,
} from './constants';
import { anchoredHistoryDrop, HISTORY_WINDOW_STEP } from './context-optimization';
import { applyManagedProviderKeys } from './managed-provider-keys';
import { removeUnsupportedModelSettings } from './model-compat';
import { AUTO_MODEL, decideRoute, resolveRouteTable, type RouteDecision } from './model-routing';
import { estimateOutputBudget, clampOutputBudget, type OutputBudgetInput } from './output-budget';
import { resolveUsableProvider } from './provider-credentials';
import { ensureProviderProbed, resolveRuntimeProvider } from './provider-fallback';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { ANTHROPIC_CACHE_BREAKPOINT, shouldInsertCacheBreakpoint } from '~/lib/modules/llm/cache-breakpoint';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { DesignScheme } from '~/types/design-scheme';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';
import { allowedHTMLElements } from '~/utils/markdown';

export type Messages = Message[];

export const DEFAULT_STREAM_MAX_RETRIES = 4;

/**
 * How many times the AI SDK should retry a RETRYABLE transient provider failure
 * (throttling, 5xx, connection reset, Bedrock "[UNKNOWN]" stream errors) with
 * exponential backoff before surfacing an error. Bounded to [0, 8] and defaults
 * to {@link DEFAULT_STREAM_MAX_RETRIES}; override with STREAM_MAX_RETRIES.
 */
export function resolveStreamMaxRetries(env?: Record<string, string | undefined>): number {
  const raw = env?.STREAM_MAX_RETRIES ?? (typeof process !== 'undefined' ? process.env?.STREAM_MAX_RETRIES : undefined);
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_STREAM_MAX_RETRIES;
  }

  return Math.min(Math.floor(parsed), 8);
}

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');

/**
 * Cheap, deterministic (djb2) fingerprint of a string — used only to compare
 * whether the stable prompt head is byte-identical across turns in the logs. Not
 * cryptographic; collisions are irrelevant for equality-across-turns comparison.
 */
export function fingerprintPrompt(text: string): string {
  let hash = 5381;

  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }

  return (hash >>> 0).toString(16);
}

export function getCompletionTokenLimit(modelDetails: any): number {
  // 1. If model specifies completion tokens, use that
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return modelDetails.maxCompletionTokens;
  }

  // 2. Use provider-specific default
  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];

  if (providerDefault) {
    return providerDefault;
  }

  // 3. Final fallback to MAX_TOKENS, but cap at reasonable limit for safety
  return Math.min(MAX_TOKENS, 16384);
}

function sanitizeText(text: string): string {
  /*
   * Assistant messages can carry their payload in `parts` only, leaving `content`
   * undefined; calling `.replace` on that would throw and kill the whole stream.
   */
  if (typeof text !== 'string') {
    return text;
  }

  /*
   * Plain quotes: the persisted/decoded assistant content is
   * `<div class="__boltThought__">`, not the SSE-escaped `\"` wire form. The
   * previous `\\"` pattern never matched, so hidden reasoning blocks were
   * re-fed to the model every turn, inflating prompt tokens.
   */
  let sanitized = text.replace(/<div class="__boltThought__">.*?<\/div>/gs, '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/gs, '');
  sanitized = sanitized.replace(/<boltAction type="file" filePath="package-lock\.json">[\s\S]*?<\/boltAction>/g, '');

  return sanitized.trim();
}

export function applyContextOptimizedHistoryWindow<T>(
  messages: T[],
  recentMessageCount?: number,
  step: number = HISTORY_WINDOW_STEP,
) {
  /*
   * ANCHORED window (cache-max Rév.5): keep a recent slice whose START only advances
   * in whole steps of `step` messages. A naive `slice(-recentMessageCount)` slid the
   * start by one message per turn, so message[0] changed every turn and the cross-turn
   * cache prefix collapsed to the system head (measured: cachedPromptTokens pinned at
   * 3968). Dropping `anchoredHistoryDrop` (the surplus quantized DOWN to a multiple of
   * `step`) instead keeps the first retained message byte-identical for a full step of
   * growth — so the shared prefix covers system + the whole prior window — then jumps
   * one step (a single cold miss, then a run of hits). Retained count stays bounded in
   * [recentMessageCount, recentMessageCount + step - 1]: the built-in budget guardrail.
   */
  if (typeof recentMessageCount !== 'number' || recentMessageCount <= 0) {
    return messages;
  }

  const drop = anchoredHistoryDrop(messages.length, recentMessageCount, step);

  return drop > 0 ? messages.slice(drop) : messages;
}

/**
 * Cache-max (LOT 1 / Rév.4 "strict append-only history"): carry a per-turn
 * VOLATILE context block — the CONTEXT BUFFER of project files (+ optional CHAT
 * SUMMARY) + the orchestration prompt / exec-context — in a SEPARATE trailing
 * user message of the CURRENT turn, never glued onto a real conversation message.
 *
 * Why not append to the last user message (Rév.3, the previous approach): on
 * turn 1 the last user message IS the first message, so the volatile block was
 * cached AS PART of message[0]. On turn 2 the client replays message[0] CLEAN —
 * the block is server-side only and never persisted — so OpenAI's automatic
 * common-prefix cache diverged right at message[0] and collapsed back to the
 * system head (measured live: cachedPromptTokens stuck at 3968 = system only,
 * even though the whole system was byte-stable). Isolated in its own throwaway
 * trailing message, EVERY real conversation message stays byte-identical
 * turn-to-turn (strict append-only), so the shared prefix grows with the history
 * and the cache extends to system + tools + the entire prior conversation. The
 * model still receives the exact same context, just as the last message adjacent
 * to the request. The trailing message is the ONLY per-turn-variable message and
 * is deliberately the last one (excluded from every provider's cacheable prefix).
 *
 * The block is set on BOTH `content` (string) and `parts` (convertToCoreMessages
 * reads whichever the message carries), kept in sync. No-op when the block is
 * empty — discuss mode carries no volatile tail, so it stays byte-identical.
 */
export function appendContextAsTrailingUserMessage<T extends { role: string }>(
  messages: T[],
  contextBlock: string,
): T[] {
  if (!contextBlock.trim()) {
    return messages;
  }

  const trailing = {
    role: 'user',
    content: contextBlock,
    parts: [{ type: 'text', text: contextBlock }],
  } as unknown as T;

  return [...messages, trailing];
}

/**
 * The `MODEL_ROUTING_DISABLED` kill-switch. Truthy (`1`/`true`/`yes`/`on`,
 * case-insensitive) → complexity routing is globally OFF and every request keeps
 * the model it selected. Read defensively from the request env first, then the
 * genuine Node runtime env (Vite shims `process.env` to `{}` in client bundles).
 * Never throws.
 */
export function isModelRoutingDisabled(env?: Record<string, string | undefined>): boolean {
  const raw =
    env?.MODEL_ROUTING_DISABLED ?? (typeof process !== 'undefined' ? process.env?.MODEL_ROUTING_DISABLED : undefined);

  if (raw == null) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();

  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/** The outcome of {@link resolveTurnModel}: a CONCRETE model id + the raw decision. */
export interface TurnModelResolution {
  /** The concrete model id to actually use this turn. NEVER the `'auto'` sentinel. */
  model: string;

  /** The full routing decision (telemetry / assertions). */
  decision: RouteDecision;

  /** The frontier model that was considered (provider frontier or DEFAULT_MODEL). */
  frontierModel: string;

  /** Whether the kill-switch was active. */
  routingDisabled: boolean;
}

/**
 * Wire the pure {@link decideRoute} into a single turn. This is the ONE model
 * decision point: it resolves the provider frontier, reads the kill-switch,
 * classifies the task, asks `decideRoute`, and guarantees a CONCRETE model id
 * comes out (the `'auto'` sentinel is replaced with the frontier as a safety net
 * so it can never reach `getModelInstance`).
 *
 * Telemetry (`opt.routing`) is emitted ONLY for opt-in Auto requests — an
 * explicit model selection routes nothing, so there is nothing to log. Emission
 * is best-effort and never throws. Extracted and exported so the exact wiring
 * (frontier resolution, usability probe, kill-switch, `'auto'`-never-escapes,
 * telemetry gating) is unit-testable without booting the whole LLM stack.
 */
export function resolveTurnModel(
  input: {
    /** The model the request selected (post `resolveUsableProvider`); `AUTO_MODEL` opts in. */
    selectedModel: string;

    /** The resolved provider name (a routing-table key). */
    providerName: string;

    /** The classifier signals for this turn (same ones `estimateOutputBudget` uses). */
    task: OutputBudgetInput;

    /** Probe: is this small-model id usable on the resolved (already-credentialed) provider? */
    isModelUsable: (modelId: string) => boolean;

    /** Request env for the routing table + kill-switch (defaults to the runtime env). */
    env?: Record<string, string | undefined>;
  },
  emit: (event: string, meta: Record<string, unknown>) => void = (event, meta) => logger.info(event, meta),
): TurnModelResolution {
  const table = resolveRouteTable(input.env);

  /*
   * For Auto, the frontier is the resolved provider's frontier; a provider with
   * no table entry (xAI, …) falls back to DEFAULT_MODEL. On the default provider
   * this equals DEFAULT_MODEL, so Auto's hard-task path is byte-identical to
   * today's default.
   */
  const frontierModel = table[input.providerName]?.frontier ?? DEFAULT_MODEL;
  const routingDisabled = isModelRoutingDisabled(input.env);

  const decision = decideRoute({
    selectedModel: input.selectedModel,
    provider: input.providerName,
    frontierModel,
    task: input.task,
    isProviderModelUsable: input.isModelUsable,
    routingDisabled,
    table,
  });

  // Safety net: a concrete id MUST come out; never let the `'auto'` sentinel escape.
  const model = decision.model === AUTO_MODEL ? frontierModel : decision.model;

  // Telemetry — opt-in Auto only, best-effort, never throws.
  if (input.selectedModel === AUTO_MODEL) {
    try {
      emit('opt.routing', {
        from: decision.from,
        to: decision.to,
        reason: decision.reason,
        taskClass: decision.taskClass,
        routed: decision.routed,
        provider: input.providerName,
      });
    } catch {
      // Telemetry must never break a generation.
    }
  }

  return { model, decision, frontierModel, routingDisabled };
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
  abortSignal?: AbortSignal;
  agentOrchestrationPlan?: AgentOrchestrationPlan;
  agentOrchestrationContext?: string;
  agentMemoryContext?: string;
  skillsContext?: string;
  projectRulesContext?: string;

  /*
   * A7 (Wave A): stable per-conversation id threaded from the chat route. Used
   * only as a provider cache-affinity hint (never in the prompt bytes).
   */
  chatId?: string;

  /*
   * Model routing (Vague C): fired once with the CONCRETE model this turn
   * resolved to (after any Auto downgrade). The chat route captures it so the
   * auto-continuation segments reuse the SAME concrete id — keeping the model
   * stable across a generation (correctness + prompt cache) instead of
   * re-classifying the CONTINUE_PROMPT and risking a mid-stream flip.
   */
  onModelDecision?: (decidedModel: string, decidedProvider: string) => void;

  /*
   * AGM mode routing: when the chat route resolved a mode (Lite/Economy/Power
   * + switches) against the api's routing card, the concrete provider+model
   * land here and OVERRIDE whatever the message tags said — the mode, not the
   * client, decides the model. Credential fallback (resolveUsableProvider)
   * still applies afterwards.
   */
  forcedRoute?: { provider: string; model: string };
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
    abortSignal,
    agentOrchestrationPlan,
    agentOrchestrationContext,
    agentMemoryContext,
    skillsContext,
    projectRulesContext,
    chatId,
  } = props;

  /*
   * DB-first managed keys: overlay any admin-set platform provider key/baseUrl
   * (fetched from the API's internal endpoint, cached ~60s) onto a per-request
   * copy of serverEnv, keyed by each provider's apiTokenKey/baseUrlKey. This makes
   * base-provider's `managedApiKey` (which reads serverEnv first) resolve DB-first
   * while: a user BYOK cookie still wins (apiKeys is checked before managedApiKey),
   * the anti-exfil guard still applies (managed keys are never sent to a
   * user-supplied baseUrl), and env stays the fallback when no DB key. A no-op
   * (env-identical) when no managed keys are configured; never throws.
   */
  const effectiveServerEnv = (await applyManagedProviderKeys(
    serverEnv as Record<string, string> | undefined,
  )) as typeof serverEnv;

  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;

  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };

    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;
      newMessage.content = sanitizeText(content);
    } else if (message.role == 'assistant') {
      newMessage.content = sanitizeText(message.content);
    }

    // Sanitize all text parts in parts array, if present
    if (Array.isArray(message.parts)) {
      newMessage.parts = message.parts.map((part) =>
        part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part,
      );
    }

    return newMessage;
  });

  /*
   * An assistant message whose entire content was a reasoning block sanitizes
   * to ''. Several providers (notably Anthropic) reject empty assistant turns
   * with a stream error, so drop such messages unless they carry non-text parts
   * (tool calls / attachments) that still need to be sent.
   */
  processedMessages = processedMessages.filter((message) => {
    if (message.role !== 'assistant') {
      return true;
    }

    const hasContent = typeof message.content === 'string' && message.content.trim().length > 0;

    const hasNonTextParts = Array.isArray(message.parts) && message.parts.some((part) => part.type !== 'text');

    return hasContent || hasNonTextParts;
  });

  // AGM: the mode-routed decision beats any client-suggested model tags.
  if (props.forcedRoute) {
    currentModel = props.forcedRoute.model;
    currentProvider = props.forcedRoute.provider;
  }

  /*
   * If the user picked a provider we have no credential for (e.g. AmazonBedrock
   * without AWS_BEDROCK_CONFIG in a managed deployment), provider.getModelInstance
   * would throw "Missing API key" and the client renders a fatal "Authentication
   * Error", killing code generation. Resolve to a credentialed provider instead.
   */
  const resolved = resolveUsableProvider({
    requestedProvider: currentProvider,
    requestedModel: currentModel,
    apiKeys,
    serverEnv: effectiveServerEnv as Record<string, string> | undefined,
  });

  /*
   * Deuxième repli, à l'EXÉCUTION cette fois. `resolveUsableProvider` ci-dessus
   * ne bascule que sur une clé ABSENTE ; il ne voit pas le mode de panne mesuré
   * en production le 19/08, où la clé Anthropic est bien présente et c'est
   * l'appel qui rend « Your credit balance is too low ». La sonde marque alors
   * le fournisseur comme indisponible et le tour part chez OpenAI puis Gemini,
   * au lieu de rendre un 500 « Service indisponible » sur une plateforme dont
   * deux autres fournisseurs répondent.
   *
   * La sonde coûte UN jeton et n'est tirée qu'une fois par fournisseur toutes
   * les cinq minutes ; un échec qui ne désigne pas le fournisseur (prompt,
   * abandon client) ne déclenche aucune bascule.
   */
  await ensureProviderProbed({
    provider: resolved.provider,
    model: resolved.model,
    apiKeys,
    serverEnv: effectiveServerEnv as Record<string, string> | undefined,
    abortSignal,
  });

  const runtimeChoice = resolveRuntimeProvider({
    provider: resolved.provider,
    model: resolved.model,
    apiKeys,
    serverEnv: effectiveServerEnv as Record<string, string> | undefined,
  });

  const provider = runtimeChoice.provider;
  currentModel = runtimeChoice.model;

  if (runtimeChoice.switchedFrom) {
    logger.warn(
      JSON.stringify({
        event: 'provider.fallback',
        from: runtimeChoice.switchedFrom.provider,
        reason: runtimeChoice.switchedFrom.reason,
        to: provider.name,
        model: currentModel,
      }),
    );
  }

  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);

  /*
   * Model routing by complexity (Vague C, increment 2). This is the SINGLE model
   * decision point. It runs AFTER `resolveUsableProvider` fixed the provider and
   * model, and BEFORE the `modelDetails` lookup / `getModelInstance`, so whatever
   * it decides is a CONCRETE id downstream. Opt-in only: unless the request
   * selected AUTO_MODEL ('auto'), `decideRoute` returns the explicit model
   * unchanged — this whole block is byte-identical to before for every existing
   * (non-Auto) request. `orchestrationPlan` and `lastUserText` are hoisted here so
   * the routing classifier and the (unchanged) output-budget estimate below share
   * the exact same task signals.
   */
  const orchestrationPlan =
    agentOrchestrationPlan ??
    buildAgentOrchestrationPlan({
      messages: processedMessages,
      chatMode,
      subagentsAvailable: areParallelSubagentsAvailable(
        effectiveServerEnv as Record<string, string | undefined> | undefined,
      ),
    });

  const lastUserText = (() => {
    const lastUser = [...processedMessages].reverse().find((message) => message.role === 'user');
    return typeof lastUser?.content === 'string' ? lastUser.content : '';
  })();

  const routingSelectedModel = currentModel;

  const turnModelResolution = resolveTurnModel({
    selectedModel: routingSelectedModel,
    providerName: provider.name,
    task: {
      chatMode,
      lastUserMessage: lastUserText,
      contextFileCount: contextFiles ? Object.keys(contextFiles).length : 0,
      planFirst: orchestrationPlan.enabled,
      isReasoningModel: isReasoningModel(routingSelectedModel),
    },

    /*
     * Small model of the SAME resolved provider: the provider already passed
     * resolveUsableProvider (credentialed), so "usable" reduces to "the id exists
     * in the provider's static model list" — a cheap, allocation-free probe.
     */
    isModelUsable: (modelId) => staticModels.some((m) => m.name === modelId),
    env: effectiveServerEnv as Record<string, string | undefined> | undefined,
  });

  /*
   * Replace `currentModel` with the concrete decided id BEFORE the modelDetails
   * lookup — `'auto'` must never reach getStaticModelList / getModelInstance.
   */
  currentModel = turnModelResolution.model;

  // Let the chat route capture the concrete model so continuations reuse it.
  props.onModelDecision?.(currentModel, provider.name);

  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: effectiveServerEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model with warning
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  // Model completion ceiling — the hard upper bound for the adaptive budget computed below.
  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

  /*
   * A3 (Wave A): load the heavy <database_instructions> / <mobile_app_instructions>
   * blocks only when this turn plausibly needs them. Err toward INCLUDING the DB
   * block when ambiguous, and toward INCLUDING the mobile block whenever the
   * project already looks like a React-Native/Expo app, so the DB and mobile build
   * paths are never silently stripped. A plain web build (no DB/mobile signal)
   * drops both — that (intended) reduction is the whole saving. Every other caller
   * of the prompt builders passes no flags → today's byte-identical prompt.
   */
  const lastUserSignalText = (() => {
    const lastUser = [...processedMessages].reverse().find((message) => message.role === 'user');
    return typeof lastUser?.content === 'string' ? lastUser.content : '';
  })();

  const projectFilePaths = files ? Object.keys(files) : [];

  const packageJsonEntry = files?.['/home/project/package.json'] ?? files?.['package.json'];

  const packageJsonContent =
    packageJsonEntry && packageJsonEntry.type === 'file' ? String(packageJsonEntry.content ?? '') : '';

  const contextSignalHaystack = [
    lastUserSignalText,
    summary ?? '',
    ...projectFilePaths,
    ...(contextFiles ? Object.keys(contextFiles) : []),
    packageJsonContent,
  ].join('\n');

  const includeDatabaseInstructions =
    Boolean(options?.supabaseConnection?.isConnected) ||
    /supabase|database|postgres|prisma|drizzle|migration|\bsql\b|\bdb\b/i.test(contextSignalHaystack);

  const looksLikeExpoProject = projectFilePaths.some((path) =>
    /app\.json$|\/app\/\(tabs\)\/|metro\.config|expo/i.test(path),
  );
  const includeMobileInstructions =
    /expo|react[ -]?native|mobile app|\bios\b|\bandroid\b/i.test(contextSignalHaystack) || looksLikeExpoProject;

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      designScheme,
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
      includeDatabaseInstructions,
      includeMobileInstructions,
    }) ?? getSystemPrompt();

  /*
   * Cache-prefix diagnostics: the stable HEAD is exactly the assembled base
   * prompt captured HERE, before any per-turn-variable block (orchestration,
   * agent memory, CONTEXT BUFFER, summary) is appended below. Logging its real
   * char length + a cheap deterministic fingerprint lets us prove, from PROD
   * turns (not a static render), (1) whether the head clears OpenAI's ~1024-token
   * cache minimum and (2) whether it is byte-identical across two consecutive
   * turns of the same conversation — i.e. whether the auto-cache prefix is stable.
   */
  const stableHeadChars = systemPrompt.length;
  const stableHeadFingerprint = fingerprintPrompt(systemPrompt);

  /*
   * Cross-turn cache breakpoint (P0-a): everything appended below this line —
   * orchestration exec-context, agent memory/skills, the CONTEXT BUFFER of
   * project files, the chat summary, locked-file lists — is the VARIABLE tail
   * that changes every turn. Mark the head/tail boundary HERE, right after the
   * stable Bolt prompt and before the first variable block, so the Anthropic
   * caching fetch can cache the stable head across turns instead of re-billing
   * the whole system string. Inserted ONLY for Anthropic-family providers; every
   * other provider's system stays byte-identical (the sentinel never appears).
   * The sentinel is stripped from the wire body by createAnthropicCachingFetch /
   * the OpenRouter caching fetch, so the model never sees it.
   */
  const insertCacheBreakpoint = shouldInsertCacheBreakpoint(provider.name, modelDetails.name);

  /*
   * Adaptive output ceiling (É1): size max_tokens to the task class instead of
   * always requesting the model's full completion limit. The model ceiling stays
   * the hard upper bound (clampOutputBudget) and the caller's MAX_RESPONSE_SEGMENTS
   * auto-continuation finishes anything that runs past a conservative estimate, so
   * this never truncates a generation — it only stops reserving, e.g., 64k of
   * Anthropic output-rate-limit budget for a one-line edit. A from-scratch build
   * lands in the `scaffold` class whose budget equals the OpenAI ceiling, so the
   * certified OpenAI build path is unchanged.
   */
  const outputBudgetEstimate = estimateOutputBudget({
    chatMode,
    lastUserMessage: lastUserText,
    contextFileCount: contextFiles ? Object.keys(contextFiles).length : 0,
    planFirst: orchestrationPlan.enabled,
    isReasoningModel: isReasoningModel(modelDetails.name),
  });

  const safeMaxTokens = clampOutputBudget(outputBudgetEstimate, dynamicMaxTokens);

  logger.info(
    `Token limits for model ${modelDetails.name}: adaptive maxTokens=${safeMaxTokens} (estimate=${outputBudgetEstimate}, ceiling=${dynamicMaxTokens}, mode=${chatMode}), maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

  /*
   * Cache-max (LOT 1, targeted): the orchestration prompt and its exec-context are
   * DERIVED FROM THE CURRENT TURN (roles/mode/plan are recomputed from the latest
   * user message), so they are per-turn VOLATILE — measured live drifting turn to
   * turn (orchestration e317037a→80f5d344, orchestrationCtx 1f503e2f→f36c3786) while
   * everything else in the tail was byte-stable (skills 4f8abd8d both turns). Left in
   * the system they rotated the systemHash every turn and capped the cached prefix at
   * the head. They are therefore carried in a throwaway trailing user message (like the
   * CONTEXT BUFFER) rather than the cached system — the model still receives them, just lower in the
   * prompt. memory/skills/rules stay in the system: measured stable across turns.
   */
  const orchestrationPrompt = createAgentOrchestrationPrompt(orchestrationPlan);
  const orchestrationTailBlock = [orchestrationPrompt, agentOrchestrationContext].filter(Boolean).join('\n\n');

  if (agentMemoryContext) {
    systemPrompt = `${systemPrompt}

${agentMemoryContext}`;
  }

  if (skillsContext) {
    systemPrompt = `${systemPrompt}

${skillsContext}`;
  }

  if (projectRulesContext) {
    systemPrompt = `${systemPrompt}

${projectRulesContext}`;
  }

  /*
   * Accumulate ALL per-turn volatile blocks (CONTEXT BUFFER + CHAT SUMMARY,
   * orchestration prompt + exec-context) and carry them in ONE throwaway trailing
   * user message, so every real conversation message stays byte-identical
   * turn-to-turn and the cached prefix grows with the history (see
   * appendContextAsTrailingUserMessage). Order preserved: context buffer first,
   * orchestration last, exactly as the model saw them before.
   */
  const volatileTailBlocks: string[] = [];

  if (chatMode === 'build' && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);

    /*
     * Cache-max (LOT 1): the CONTEXT BUFFER (full project files) and CHAT SUMMARY
     * are the per-turn-volatile blocks that used to rotate the system prompt and
     * defeat prefix caching. Build them here but DO NOT append them to the system
     * — carry them in the throwaway trailing user message, after the stable cache
     * boundary. The model still receives the identical context, just lower in the
     * prompt.
     */
    let contextBufferBlock = `Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
CONTEXT BUFFER:
---
${codeContext}
---
`;

    if (summary) {
      contextBufferBlock = `${contextBufferBlock}
below is the summarized chat history before the recent exact messages
CHAT SUMMARY:
---
${props.summary}
---
`;
      processedMessages = applyContextOptimizedHistoryWindow(processedMessages, props.messageSliceId);
    }

    volatileTailBlocks.push(contextBufferBlock);
  }

  if (orchestrationTailBlock) {
    volatileTailBlocks.push(orchestrationTailBlock);
  }

  // Cache-max: carry all per-turn volatile context in ONE trailing user message (see above).
  processedMessages = appendContextAsTrailingUserMessage(processedMessages, volatileTailBlocks.join('\n\n'));

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

    IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files. You can proceed with the request but DO NOT make any changes to these files specifically:
    ${lockedFilesListString}
    ---
    `;
  } else {
    console.log('No locked files found from any source for prompt.');
  }

  /*
   * Cross-turn cache breakpoint (Anthropic-family only) — placed at the END of the
   * system assembly. Now that the volatile CONTEXT BUFFER + CHAT SUMMARY are carried
   * in a throwaway trailing user message (appendContextAsTrailingUserMessage) — along
   * with the per-turn orchestration prompt + exec-context — the ENTIRE system (base + memory +
   * skills + rules + locked list) is stable across turns of a conversation, so
   * marking the boundary here lets Anthropic cache the
   * whole system instead of only the head. The sentinel is Anthropic-only and is
   * stripped from the wire body by createAnthropicCachingFetch / the OpenRouter
   * caching fetch, so the model never sees it; every other provider's system stays
   * byte-identical and auto-caches the stable prefix with no sentinel. stableHead*
   * above is still measured on the base head, before this line.
   */
  if (insertCacheBreakpoint) {
    systemPrompt = `${systemPrompt}${ANTHROPIC_CACHE_BREAKPOINT}`;
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // Log reasoning model detection and token parameters
  const isReasoning = isReasoningModel(modelDetails.name);
  logger.info(
    `Model "${modelDetails.name}" is reasoning model: ${isReasoning}, using ${isReasoning ? 'maxCompletionTokens' : 'maxTokens'}: ${safeMaxTokens}`,
  );

  // Validate token limits before API call
  if (safeMaxTokens > (modelDetails.maxTokenAllowed || 128000)) {
    logger.warn(
      `Token limit warning: requesting ${safeMaxTokens} tokens but model supports max ${modelDetails.maxTokenAllowed || 128000}`,
    );
  }

  /*
   * Always pass `maxTokens`. The AI SDK has no top-level `maxCompletionTokens`
   * option — passing it was silently dropped, leaving reasoning models (o1/o3/
   * gpt-5) with NO output cap (unbounded cost/latency). The @ai-sdk/openai
   * provider itself maps `max_tokens` → `max_completion_tokens` for reasoning
   * models, so the single `maxTokens` key is correct for both families.
   */
  const tokenParams = { maxTokens: safeMaxTokens };

  // Filter out unsupported parameters for reasoning models
  const disallowsTemperature = modelDisallowsTemperature(modelDetails.name, modelDetails.provider);

  const unsupportedOptionKeys = [
    ...(isReasoning || disallowsTemperature ? ['temperature'] : []),
    ...(isReasoning ? ['topP', 'presencePenalty', 'frequencyPenalty', 'logprobs', 'topLogprobs', 'logitBias'] : []),
  ];

  const filteredOptions =
    unsupportedOptionKeys.length > 0 && options
      ? Object.fromEntries(Object.entries(options).filter(([key]) => !unsupportedOptionKeys.includes(key)))
      : options || {};

  /*
   * DEBUG: log only the option KEYS, never the values. The options object can
   * carry non-serializable / circular values (MCP `tools`, onFinish/onError
   * closures); a circular ref in `JSON.stringify` would throw here and kill the
   * generation before the LLM call.
   */
  logger.info(
    `DEBUG STREAM: Options filtering for model "${modelDetails.name}":`,
    JSON.stringify({
      isReasoning,
      disallowsTemperature,
      originalOptionsKeys: options ? Object.keys(options) : [],
      filteredOptionsKeys: Object.keys(filteredOptions),
      removedParams: options ? Object.keys(options).filter((key) => !(key in filteredOptions)) : [],
    }),
  );

  const modelInstance = provider.getModelInstance({
    model: modelDetails.name,
    serverEnv: effectiveServerEnv,
    apiKeys,
    providerSettings,
    cacheAffinityKey: chatId,
  });

  /*
   * Discuss/Ask/Plan mode uses discussPrompt() instead of the build systemPrompt,
   * which previously DROPPED the agent-memory + skills context (they were only
   * appended to systemPrompt above). Re-append them here so persistent memory and
   * enabled skills actually inform discuss-mode answers too, not just builds.
   */
  const discussSystem = [discussPrompt(), agentMemoryContext, skillsContext, projectRulesContext]
    .filter(Boolean)
    .join('\n\n');

  const streamParams = {
    model: removeUnsupportedModelSettings(modelInstance, modelDetails.name, modelDetails.provider),
    system: chatMode === 'build' ? systemPrompt : discussSystem,

    /*
     * Auto-retry transient provider failures (Bedrock "[UNKNOWN]" stream errors,
     * throttling, 5xx, connection resets) at the request layer. The AI SDK only
     * retries RETRYABLE errors and applies exponential backoff between attempts,
     * so a pre-stream transient failure is recovered server-side and the first
     * generation succeeds without the user clicking Regenerate. Idempotent: the
     * retry re-issues the request before any output is committed to the stream,
     * so already-written files are never duplicated. Default 4, env-overridable.
     */
    maxRetries: resolveStreamMaxRetries(effectiveServerEnv as Record<string, string | undefined> | undefined),

    /*
     * Smooth the provider stream into WORD-sized chunks before it reaches the
     * client (BUG-QA-STREAM-CHOPPY-001, « ça saute, impossible de lire »).
     *
     * Measured on the running agent: the provider delivered ~110 characters
     * every ~700 ms (14 chunks over 9.36 s, median gap 695 ms). Between two
     * blocks the client has nothing to paint, so the transcript advances in
     * visible jumps. nginx was cleared — the same cadence is observed from
     * inside the pod — and the 40 ms client-side smoothing cannot invent frames
     * that never arrived: only the SERVER can subdivide them.
     *
     * `smoothStream` is a first-class transform of the `ai` SDK and was
     * available but wired NOWHERE. Placed BEFORE `...filteredOptions` so an
     * explicit caller-supplied `experimental_transform` still wins.
     */
    experimental_transform: smoothStream({ chunking: 'word' }),
    ...tokenParams,
    messages: convertToCoreMessages(processedMessages as any),
    ...filteredOptions,

    ...temperatureOptionsForModel(modelDetails.name, modelDetails.provider),
    ...(abortSignal ? { abortSignal } : {}),
  };

  /*
   * Log only the SHAPE of the streaming params, never the values. The previous
   * `streamParams: Object.fromEntries(...)` dump serialized the full option
   * values (provider options can carry Supabase credentials, MCP tool schemas,
   * etc.) into application logs at INFO, defeating the keys-only intent.
   */
  logger.info(
    `DEBUG STREAM: Final streaming params for model "${modelDetails.name}":`,
    JSON.stringify(
      {
        hasTemperature: 'temperature' in streamParams,
        hasMaxTokens: 'maxTokens' in streamParams,
        hasMaxCompletionTokens: 'maxCompletionTokens' in streamParams,
        paramKeys: Object.keys(streamParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
      },
      null,
      2,
    ),
  );

  /*
   * Greppable as `prompt.fingerprint`. Two consecutive turns of the same chat
   * with an IDENTICAL `stableHeadFingerprint` prove the auto-cache prefix is
   * byte-stable; `stableHeadChars` (÷~3.5 ≈ tokens) shows whether it clears the
   * ~1024-token OpenAI/Gemini/DeepSeek cache minimum — measured from real prod
   * turns instead of a static render.
   */
  const systemTail = systemPrompt.slice(stableHeadChars);
  const blockFingerprint = (block?: string): [string, number] => [fingerprintPrompt(block ?? ''), (block ?? '').length];

  logger.info(
    JSON.stringify({
      event: 'prompt.fingerprint',
      provider: provider.name,
      model: modelDetails.name,
      conversation: chatId ?? null,
      stableHeadChars,
      stableHeadFingerprint,
      fullSystemChars: systemPrompt.length,

      /*
       * Tail = everything after the stable head. If tailFingerprint drifts across
       * two turns of the same conversation, a post-head system block is still
       * volatile and caps the cached prefix at the head. The per-block prints below
       * pinpoint WHICH block drifts so it can be moved to the message tail too.
       */
      tailChars: systemTail.length,
      tailFingerprint: fingerprintPrompt(systemTail),
      blocks: {
        orchestration: blockFingerprint(orchestrationPrompt),
        orchestrationCtx: blockFingerprint(agentOrchestrationContext),
        memory: blockFingerprint(agentMemoryContext),
        skills: blockFingerprint(skillsContext),
        rules: blockFingerprint(projectRulesContext),
      },
      contextFiles: contextFiles ? Object.keys(contextFiles).length : 0,
      cacheBreakpoint: insertCacheBreakpoint,
    }),
  );

  return await _streamText(streamParams);
}
