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
import { removeUnsupportedModelSettings } from './model-compat';
import { resolveUsableProvider } from './provider-credentials';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
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
  } = props;

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
    serverEnv: serverEnv as Record<string, string> | undefined,
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
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Check if it's a Google provider and the model name looks like it might be incorrect
      if (provider.name === 'Google' && currentModel.includes('2.5')) {
        throw new Error(
          `Model "${currentModel}" not found. Gemini 2.5 Pro doesn't exist. Available Gemini models include: gemini-1.5-pro, gemini-2.0-flash, gemini-1.5-flash. Please select a valid model.`,
        );
      }

      // Fallback to first model with warning
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

  // Use model-specific limits directly - no artificial cap needed
  const safeMaxTokens = dynamicMaxTokens;

  logger.info(
    `Token limits for model ${modelDetails.name}: maxTokens=${safeMaxTokens}, maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

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
    }) ?? getSystemPrompt();

  const orchestrationPlan =
    agentOrchestrationPlan ??
    buildAgentOrchestrationPlan({
      messages: processedMessages,
      chatMode,
      subagentsAvailable: areParallelSubagentsAvailable(serverEnv as Record<string, string | undefined> | undefined),
    });

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
    serverEnv,
    apiKeys,
    providerSettings,
  });

  const streamParams = {
    model: removeUnsupportedModelSettings(modelInstance, modelDetails.name, modelDetails.provider),
    system: chatMode === 'build' ? systemPrompt : discussPrompt(),

    /*
     * Auto-retry transient provider failures (Bedrock "[UNKNOWN]" stream errors,
     * throttling, 5xx, connection resets) at the request layer. The AI SDK only
     * retries RETRYABLE errors and applies exponential backoff between attempts,
     * so a pre-stream transient failure is recovered server-side and the first
     * generation succeeds without the user clicking Regenerate. Idempotent: the
     * retry re-issues the request before any output is committed to the stream,
     * so already-written files are never duplicated. Default 4, env-overridable.
     */
    maxRetries: resolveStreamMaxRetries(serverEnv as Record<string, string | undefined> | undefined),
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
