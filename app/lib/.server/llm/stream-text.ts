import { convertToCoreMessages, streamText as _streamText, type Message } from 'ai';
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
import { applyManagedProviderKeys } from './managed-provider-keys';
import { removeUnsupportedModelSettings } from './model-compat';
import { estimateOutputBudget, clampOutputBudget } from './output-budget';
import { resolveUsableProvider } from './provider-credentials';
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

export function applyContextOptimizedHistoryWindow<T>(messages: T[], recentMessageCount?: number) {
  /*
   * Keep the last `recentMessageCount` messages of THIS array. Previously the
   * caller passed an absolute index computed on a DIFFERENT (unfiltered) array
   * and we did messages.slice(index) — once the array differed, the window was
   * wrong (dropped too many or too few). Slicing from the end is array-agnostic.
   */
  if (typeof recentMessageCount === 'number' && recentMessageCount > 0 && messages.length > recentMessageCount) {
    return messages.slice(-recentMessageCount);
  }

  return messages;
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

  const provider = resolved.provider;
  currentModel = resolved.model;

  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);

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

  if (insertCacheBreakpoint) {
    systemPrompt = `${systemPrompt}${ANTHROPIC_CACHE_BREAKPOINT}`;
  }

  const orchestrationPlan =
    agentOrchestrationPlan ??
    buildAgentOrchestrationPlan({
      messages: processedMessages,
      chatMode,
      subagentsAvailable: areParallelSubagentsAvailable(
        effectiveServerEnv as Record<string, string | undefined> | undefined,
      ),
    });

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
  const lastUserText = (() => {
    const lastUser = [...processedMessages].reverse().find((message) => message.role === 'user');
    return typeof lastUser?.content === 'string' ? lastUser.content : '';
  })();
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

  const orchestrationPrompt = createAgentOrchestrationPrompt(orchestrationPlan);

  if (orchestrationPrompt) {
    systemPrompt = `${systemPrompt}

${orchestrationPrompt}`;
  }

  if (agentOrchestrationContext) {
    systemPrompt = `${systemPrompt}

${agentOrchestrationContext}`;
  }

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

  if (chatMode === 'build' && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);

    systemPrompt = `${systemPrompt}

    Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
    CONTEXT BUFFER:
    ---
    ${codeContext}
    ---
    `;

    if (summary) {
      systemPrompt = `${systemPrompt}
      below is the summarized chat history before the recent exact messages
      CHAT SUMMARY:
      ---
      ${props.summary}
      ---
      `;
      processedMessages = applyContextOptimizedHistoryWindow(processedMessages, props.messageSliceId);
    }
  }

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

  return await _streamText(streamParams);
}
