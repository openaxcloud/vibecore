import { generateText } from 'ai';
import { type ActionFunctionArgs } from 'react-router';
import {
  MAX_TOKENS,
  PROVIDER_COMPLETION_LIMITS,
  isReasoningModel,
  temperatureOptionsForModel,
} from '~/lib/.server/llm/constants';
import { removeUnsupportedModelSettings } from '~/lib/.server/llm/model-compat';
import { streamText } from '~/lib/.server/llm/stream-text';
import { requireWebSession } from '~/lib/.server/require-session';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { getApiRuntimeRoutesCopy } from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting, ProviderInfo } from '~/types/model';
import { PROVIDER_LIST } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

export async function action(args: ActionFunctionArgs) {
  return llmCallAction(args);
}

async function getModelList(options: {
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  serverEnv?: Record<string, string>;
}) {
  const llmManager = LLMManager.getInstance(import.meta.env);
  return llmManager.updateModelList(options);
}

const logger = createScopedLogger('api.llmcall');

function getCompletionTokenLimit(modelDetails: ModelInfo): number {
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

function validateTokenLimits(modelDetails: ModelInfo, requestedTokens: number): { valid: boolean } {
  const modelMaxTokens = modelDetails.maxTokenAllowed || 128000;
  const maxCompletionTokens = getCompletionTokenLimit(modelDetails);

  // Check against model's context window
  if (requestedTokens > modelMaxTokens) {
    return {
      valid: false,
    };
  }

  // Check against completion token limits
  if (requestedTokens > maxCompletionTokens) {
    return {
      valid: false,
    };
  }

  return { valid: true };
}

async function llmCallAction({ context, request }: ActionFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);

  const responseHeaders = (initial?: HeadersInit) => {
    const headers = localeResponseHeaders(request, localeResolution);

    new Headers(initial).forEach((value, key) => headers.set(key, value));

    return headers;
  };

  // Gate the platform's managed provider keys behind a valid session.
  try {
    await requireWebSession(request);
  } catch (error) {
    if (error instanceof Response) {
      logger.warn(`LLM session validation failed with status ${error.status}`);

      const message =
        error.status === 503
          ? copy['apiRuntime.generic.authenticationUnavailable']
          : copy['apiRuntime.generic.authenticationRequired'];

      throw new Response(JSON.stringify({ error: message, code: 'AUTH_REQUIRED' }), {
        status: error.status,
        headers: responseHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
      });
    }

    throw error;
  }

  let body: {
    system: string;
    message: string;
    model: string;
    provider: ProviderInfo;
    streamOutput?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    throw new Response(copy['apiRuntime.generic.invalidJson'], {
      status: 400,
      headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const { system, message, model, provider, streamOutput } = body;

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    throw new Response(copy['apiRuntime.generic.invalidModel'], {
      status: 400,
      headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  /*
   * `provider` may be absent or not an object; reading provider.name on a
   * non-object would throw a TypeError before validation, escaping as a 500.
   */
  if (!provider || typeof provider !== 'object') {
    throw new Response(copy['apiRuntime.generic.invalidProvider'], {
      status: 400,
      headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const { name: providerName } = provider;

  if (!providerName || typeof providerName !== 'string') {
    throw new Response(copy['apiRuntime.generic.invalidProvider'], {
      status: 400,
      headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const cookieHeader = request.headers.get('Cookie');

  let apiKeys: Record<string, string>;
  let providerSettings: Record<string, IProviderSetting>;

  try {
    apiKeys = getApiKeysFromCookie(cookieHeader);
    providerSettings = getProviderSettingsFromCookie(cookieHeader);
  } catch {
    /*
     * Malformed apiKeys/providers cookie — JSON.parse inside the helpers would
     * otherwise throw here, before the try blocks below, as an unhandled 500.
     */
    apiKeys = {};
    providerSettings = {};
  }

  if (streamOutput) {
    try {
      const result = await streamText({
        options: {
          system,
        },
        messages: [
          {
            role: 'user',
            content: `${message}`,
          },
        ],
        env: context.cloudflare?.env as any,
        apiKeys,
        providerSettings,
      });

      return new Response(result.textStream, {
        status: 200,
        headers: {
          ...Object.fromEntries(responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })),
        },
      });
    } catch (error: unknown) {
      logger.error('Streaming LLM request failed', error);

      if (error instanceof Error && error.message?.includes('API key')) {
        throw new Response(copy['apiRuntime.generic.invalidApiKey'], {
          status: 401,
          headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
        });
      }

      // Handle token limit errors with helpful messages
      if (
        error instanceof Error &&
        (error.message?.includes('max_tokens') ||
          error.message?.includes('token') ||
          error.message?.includes('exceeds') ||
          error.message?.includes('maximum'))
      ) {
        throw new Response(copy['apiRuntime.generic.tokenLimit'], {
          status: 400,
          headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
        });
      }

      throw new Response(copy['apiRuntime.generic.requestFailed'], {
        status: 500,
        headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
      });
    }
  } else {
    try {
      const models = await getModelList({ apiKeys, providerSettings, serverEnv: context.cloudflare?.env as any });

      let modelDetails = models.find((m: ModelInfo) => m.name === model);

      if (!modelDetails) {
        modelDetails = models.find((m: ModelInfo) => m.provider === provider.name) || models[0];

        if (!modelDetails) {
          throw Object.assign(new Error(), { code: 'MODEL_NOT_FOUND' });
        }

        logger.warn(`Model ${model} not found for ${provider.name}; falling back to ${modelDetails.name}`);
      }

      const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);

      // Validate token limits before making API request
      const validation = validateTokenLimits(modelDetails, dynamicMaxTokens);

      if (!validation.valid) {
        throw new Response(copy['apiRuntime.generic.tokenLimit'], {
          status: 400,
          headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
        });
      }

      const providerInfo = PROVIDER_LIST.find((p) => p.name === provider.name);

      if (!providerInfo) {
        throw Object.assign(new Error(), { code: 'PROVIDER_NOT_FOUND' });
      }

      logger.info(`Generating response Provider: ${provider.name}, Model: ${modelDetails.name}`);

      // DEBUG: Log reasoning model detection
      const isReasoning = isReasoningModel(modelDetails.name);
      logger.info(`DEBUG: Model "${modelDetails.name}" detected as reasoning model: ${isReasoning}`);

      // Use maxCompletionTokens for reasoning models (o1, GPT-5), maxTokens for traditional models
      const tokenParams = isReasoning ? { maxCompletionTokens: dynamicMaxTokens } : { maxTokens: dynamicMaxTokens };

      // Filter out unsupported parameters for reasoning models
      const baseParams = {
        system,
        messages: [
          {
            role: 'user' as const,
            content: `${message}`,
          },
        ],
        model: removeUnsupportedModelSettings(
          providerInfo.getModelInstance({
            model: modelDetails.name,
            serverEnv: context.cloudflare?.env as any,
            apiKeys,
            providerSettings,
          }),
          modelDetails.name,
          modelDetails.provider,
        ),
        ...tokenParams,
        toolChoice: 'none' as const,
      };

      const finalParams = {
        ...baseParams,
        ...temperatureOptionsForModel(modelDetails.name, modelDetails.provider),
      };

      // DEBUG: Log final parameters
      logger.info(
        `DEBUG: Final params for model "${modelDetails.name}":`,
        JSON.stringify(
          {
            isReasoning,
            hasTemperature: 'temperature' in finalParams,
            hasMaxTokens: 'maxTokens' in finalParams,
            hasMaxCompletionTokens: 'maxCompletionTokens' in finalParams,
            paramKeys: Object.keys(finalParams).filter((key) => !['model', 'messages', 'system'].includes(key)),
            tokenParams,
            finalParams: Object.fromEntries(
              Object.entries(finalParams).filter(([key]) => !['model', 'messages', 'system'].includes(key)),
            ),
          },
          null,
          2,
        ),
      );

      const result = await generateText(finalParams);
      logger.info(`Generated response`);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          ...Object.fromEntries(responseHeaders({ 'Content-Type': 'application/json; charset=utf-8' })),
        },
      });
    } catch (error: unknown) {
      logger.error('LLM request failed', error);

      const errorResponse = {
        error: true,
        message: copy['apiRuntime.generic.requestFailed'],
        statusCode: normalizeErrorStatus(error),
        isRetryable: (error as any).isRetryable !== false,
        provider: (error as any).provider || 'unknown',
      };

      if (error instanceof Error && error.message?.includes('API key')) {
        return new Response(
          JSON.stringify({
            ...errorResponse,
            message: copy['apiRuntime.generic.invalidApiKey'],
            statusCode: 401,
            isRetryable: false,
          }),
          {
            status: 401,
            headers: responseHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
          },
        );
      }

      // Handle token limit errors with helpful messages
      if (
        error instanceof Error &&
        (error.message?.includes('max_tokens') ||
          error.message?.includes('token') ||
          error.message?.includes('exceeds') ||
          error.message?.includes('maximum'))
      ) {
        return new Response(
          JSON.stringify({
            ...errorResponse,
            message: copy['apiRuntime.generic.tokenLimit'],
            statusCode: 400,
            isRetryable: false,
          }),
          {
            status: 400,
            headers: responseHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
          },
        );
      }

      return new Response(JSON.stringify(errorResponse), {
        status: errorResponse.statusCode,
        headers: responseHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
      });
    }
  }
}

function normalizeErrorStatus(error: unknown): number {
  const status = Number((error as { statusCode?: unknown; status?: unknown } | undefined)?.statusCode);

  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }

  const responseStatus = Number((error as { status?: unknown } | undefined)?.status);

  return Number.isInteger(responseStatus) && responseStatus >= 400 && responseStatus <= 599 ? responseStatus : 500;
}
