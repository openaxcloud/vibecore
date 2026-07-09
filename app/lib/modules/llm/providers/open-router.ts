import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import { ANTHROPIC_CACHE_BREAKPOINT } from '~/lib/modules/llm/cache-breakpoint';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

/**
 * Wrap `fetch` so OpenRouter requests for Anthropic-backed models pass a
 * `cache_control` breakpoint through to the underlying Anthropic API.
 *
 * OpenRouter speaks the OpenAI chat-completions shape (`messages: [{ role, content }]`).
 * For an Anthropic-backed model it forwards Anthropic's prompt-caching if the
 * breakpoint is expressed inside the message CONTENT blocks. `stream-text`
 * inserts the {@link ANTHROPIC_CACHE_BREAKPOINT} sentinel into the system for
 * OpenRouter+anthropic/claude models (P0-a), so here we split the `system`
 * message's string content on the sentinel into content-array form — a head block
 * carrying `cache_control: { type: 'ephemeral' }` and a plain tail block — and
 * strip the sentinel. Only Anthropic-backed models (`/anthropic|claude/i`) are
 * touched; everything else passes through byte-identical. Any parse/shape issue
 * falls through to the original request (never throws).
 */
export function createOpenRouterCachingFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      if (init && typeof init.body === 'string' && init.body.includes(ANTHROPIC_CACHE_BREAKPOINT)) {
        const parsed = JSON.parse(init.body);
        const modelId = typeof parsed?.model === 'string' ? parsed.model : '';

        if (/anthropic|claude/i.test(modelId) && Array.isArray(parsed.messages)) {
          let rewrote = false;

          parsed.messages = parsed.messages.map((message: any) => {
            if (
              message &&
              message.role === 'system' &&
              typeof message.content === 'string' &&
              message.content.includes(ANTHROPIC_CACHE_BREAKPOINT)
            ) {
              const [rawHead, ...rawTailParts] = message.content.split(ANTHROPIC_CACHE_BREAKPOINT);
              const head = rawHead.trim();
              const tail = rawTailParts.join(ANTHROPIC_CACHE_BREAKPOINT).trim();

              const content: Array<Record<string, unknown>> = [];

              if (head.length > 0) {
                content.push({ type: 'text', text: head, cache_control: { type: 'ephemeral' } });
              }

              if (tail.length > 0) {
                content.push({ type: 'text', text: tail });
              }

              if (content.length > 0) {
                rewrote = true;
                return { ...message, content };
              }
            }

            return message;
          });

          if (rewrote) {
            init = { ...init, body: JSON.stringify(parsed) };
          }
        }
      }
    } catch {
      /*
       * Never let a body rewrite break the generation: on any JSON/shape issue,
       * send the request exactly as the SDK built it (no caching, but no failure).
       */
    }

    return baseFetch(input as any, init);
  };
}

interface OpenRouterModel {
  name: string;
  id: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export default class OpenRouterProvider extends BaseProvider {
  name = 'OpenRouter';
  getApiKeyLink = 'https://openrouter.ai/settings/keys';

  config = {
    apiTokenKey: 'OPEN_ROUTER_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most stable/reliable ones
     * Claude 3.5 Sonnet via OpenRouter: 200k context
     */
    {
      name: 'anthropic/claude-3.5-sonnet',
      label: 'Claude 3.5 Sonnet',
      provider: 'OpenRouter',
      maxTokenAllowed: 200000,
    },

    // GPT-4o via OpenRouter: 128k context
    {
      name: 'openai/gpt-4o',
      label: 'GPT-4o',
      provider: 'OpenRouter',
      maxTokenAllowed: 128000,
    },
  ];

  async getDynamicModels(
    _apiKeys?: Record<string, string>,
    _settings?: IProviderSetting,
    _serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${this.name} models: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OpenRouterModelsResponse;

      return (Array.isArray(data?.data) ? data.data : [])
        .sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || ''))
        .map((m) => {
          // Get accurate context window from OpenRouter API
          const contextWindow = m.context_length || 32000; // Use API value or fallback

          // Cap at reasonable limits to prevent issues (OpenRouter has some very large models)
          const maxAllowed = 1000000; // 1M tokens max for safety
          const finalContext = Math.min(contextWindow, maxAllowed);

          const promptPrice = Number(m.pricing?.prompt) || 0;
          const completionPrice = Number(m.pricing?.completion) || 0;

          return {
            name: m.id,
            label: `${m.name} - in:$${(promptPrice * 1_000_000).toFixed(2)} out:$${(completionPrice * 1_000_000).toFixed(2)} - context ${finalContext >= 1000000 ? Math.floor(finalContext / 1000000) + 'M' : Math.floor(finalContext / 1000) + 'k'}`,
            provider: this.name,
            maxTokenAllowed: finalContext,
          };
        });
    } catch (error) {
      console.error('Error getting OpenRouter models:', error);
      return [];
    }
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'OPEN_ROUTER_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openRouter = createOpenRouter({
      apiKey,

      /*
       * Pass the P0-a cache breakpoint through to Anthropic-backed models. For
       * every other model the sentinel is never inserted (stream-text only marks
       * OpenRouter+anthropic/claude), so this fetch is a transparent passthrough.
       */
      fetch: createOpenRouterCachingFetch(globalThis.fetch),
    });

    const instance = openRouter.chat(model) as LanguageModelV1;

    return instance;
  }
}
