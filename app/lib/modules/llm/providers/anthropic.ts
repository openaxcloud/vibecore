import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

/**
 * Builds the model-picker label for an Anthropic dynamic model.
 *
 * The Anthropic /v1/models response may omit (or null) `display_name` for some
 * entries. Mirror the Google provider's behaviour and fall back to the model id
 * so the selector never renders a literal "undefined (200k context)" entry.
 */
export function buildAnthropicModelLabel(model: { display_name?: string | null; id: string }, contextWindow: number) {
  return `${model.display_name || model.id} (${Math.floor(contextWindow / 1000)}k context)`;
}

/**
 * Wrap `fetch` so every Anthropic `/v1/messages` call caches its stable prefix.
 *
 * The installed `@ai-sdk/anthropic@0.0.39` predates the SDK's `cacheControl`
 * plumbing (it flattens `system` to a plain string and exposes no way to mark a
 * cache breakpoint), so we inject the breakpoint at the wire level instead of
 * upgrading the provider SDK (which would touch the certified OpenAI path).
 *
 * The request body's `system` — the large, turn-stable prefix (Bolt system
 * prompt + CONTEXT BUFFER + orchestration/memory blocks appended by
 * stream-text) — is rewritten from a string into a single text block carrying
 * `cache_control: { type: 'ephemeral' }`. Anthropic then serves that prefix from
 * cache on the next turn / each of the 8 auto-continuation segments at ~10% of
 * the input price, instead of re-billing it in full every time. Below Anthropic's
 * ~1024-token cache minimum this is a silent no-op (no error), and the response
 * stream is never touched, so generation output is byte-for-byte unchanged.
 * Any parse/shape surprise falls through to the original request untouched.
 */
export function createAnthropicCachingFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      if (init && typeof init.body === 'string' && init.body.includes('"system"')) {
        const parsed = JSON.parse(init.body);

        if (parsed && typeof parsed.system === 'string' && parsed.system.trim().length > 0) {
          parsed.system = [{ type: 'text', text: parsed.system, cache_control: { type: 'ephemeral' } }];
          init = { ...init, body: JSON.stringify(parsed) };
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

export default class AnthropicProvider extends BaseProvider {
  name = 'Anthropic';
  getApiKeyLink = 'https://console.anthropic.com/settings/keys';

  config = {
    apiTokenKey: 'ANTHROPIC_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'claude-opus-4-8',
      label: 'Claude Opus 4.8',
      provider: 'Anthropic',
      maxTokenAllowed: 1_000_000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      provider: 'Anthropic',
      maxTokenAllowed: 1_000_000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-sonnet-4-5-20250929',
      label: 'Claude Sonnet 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-opus-4-7',
      label: 'Claude Opus 4.7',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 32000,
    },
    {
      name: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://api.anthropic.com/v1/models`, {
      headers: {
        'x-api-key': `${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      signal: this.createTimeoutSignal(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.name} models: ${response.status} ${response.statusText}`);
    }

    const res = (await response.json()) as any;
    const staticModelIds = this.staticModels.map((m) => m.name);

    const data = (Array.isArray(res?.data) ? res.data : []).filter(
      (model: any) => model.type === 'model' && !staticModelIds.includes(model.id),
    );

    return data.map((m: any) => {
      // Anthropic's Models API exposes input and output limits separately.
      let contextWindow = 32000; // default fallback

      if (m.max_input_tokens) {
        contextWindow = m.max_input_tokens;
      } else if (m.id?.includes('claude-opus-4-8') || m.id?.includes('claude-sonnet-4-6')) {
        contextWindow = 1_000_000;
      } else if (m.id?.includes('claude-3-5-sonnet')) {
        contextWindow = 200000; // Claude 3.5 Sonnet has 200k context
      } else if (m.id?.includes('claude-3-haiku')) {
        contextWindow = 200000; // Claude 3 Haiku has 200k context
      } else if (m.id?.includes('claude-3-opus')) {
        contextWindow = 200000; // Claude 3 Opus has 200k context
      } else if (m.id?.includes('claude-3-sonnet')) {
        contextWindow = 200000; // Claude 3 Sonnet has 200k context
      }

      let maxCompletionTokens = 64000;

      if (m.max_tokens) {
        maxCompletionTokens = m.max_tokens;
      } else if (m.id?.includes('claude-opus-4-8')) {
        maxCompletionTokens = 128000; // Claude Opus 4.8 synchronous Messages API limit
      } else if (m.id?.includes('claude-opus-4')) {
        maxCompletionTokens = 32000; // Claude 4 Opus: 32K output limit
      } else if (m.id?.includes('claude-sonnet-4') || m.id?.includes('claude-haiku-4')) {
        maxCompletionTokens = 64000; // Claude 4 Sonnet: 64K output limit
      } else if (m.id?.includes('claude-4')) {
        maxCompletionTokens = 32000; // Other Claude 4 models: conservative 32K limit
      }

      return {
        name: m.id,
        label: buildAnthropicModelLabel(m, contextWindow),
        provider: this.name,
        maxTokenAllowed: contextWindow,
        maxCompletionTokens,
      };
    });
  }

  getModelInstance: (options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1 = (options) => {
    const { apiKeys, providerSettings, serverEnv, model } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });
    const anthropic = createAnthropic({
      apiKey,

      /*
       * `prompt-caching-2024-07-31` enables the `cache_control` breakpoint that
       * createAnthropicCachingFetch injects into the request body; kept alongside
       * the existing 128k-output beta (comma-separated, both honoured).
       */
      headers: { 'anthropic-beta': 'output-128k-2025-02-19,prompt-caching-2024-07-31' },
      fetch: createAnthropicCachingFetch(globalThis.fetch),
    });

    return anthropic(model);
  };
}
