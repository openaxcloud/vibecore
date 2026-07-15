import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import { createGoogleCachingFetch } from '~/lib/modules/llm/google-cache';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only GA/stable ids (Gemini 1.5 aliases were
     * removed by Google and 404 under v1beta generateContent; 2.0 is deprecated).
     * Index 0 (gemini-2.5-flash) is the universal fallback: cheap, fast, always available.
     * 2.5/3.x: 1M input context, 64K output limit.
     */
    {
      name: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65536,
    },
    {
      name: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65536,
    },
    {
      name: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65536,
    },
    {
      name: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65536,
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
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: {
        ['Content-Type']: 'application/json',
      },
      signal: this.createTimeoutSignal(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models from Google API: ${response.status} ${response.statusText}`);
    }

    const res = (await response.json()) as any;

    if (!res.models || !Array.isArray(res.models)) {
      throw new Error('Invalid response format from Google API');
    }

    // Filter out models with very low token limits and experimental/unstable models
    const data = res.models.filter((model: any) => {
      if (typeof model?.name !== 'string') {
        return false;
      }

      const hasGoodTokenLimit = (model.outputTokenLimit || 0) > 8000;
      const isStable = !model.name.includes('exp') || model.name.includes('flash-exp');

      return hasGoodTokenLimit && isStable;
    });

    return data.map((m: any) => {
      const modelName = m.name.replace('models/', '');

      // Get accurate context window from Google API
      let contextWindow = 32000; // default fallback

      if (m.inputTokenLimit && m.outputTokenLimit) {
        // Use the input limit as the primary context window (typically larger)
        contextWindow = m.inputTokenLimit;
      } else if (modelName.includes('gemini-2.5') || modelName.includes('gemini-3')) {
        contextWindow = 1048576; // Gemini 2.5/3.x have 1M context
      } else if (modelName.includes('gemini-1.5-pro')) {
        contextWindow = 2000000; // Gemini 1.5 Pro has 2M context
      } else if (modelName.includes('gemini-1.5-flash')) {
        contextWindow = 1000000; // Gemini 1.5 Flash has 1M context
      } else if (modelName.includes('gemini-2.0-flash')) {
        contextWindow = 1000000; // Gemini 2.0 Flash has 1M context
      } else if (modelName.includes('gemini-pro')) {
        contextWindow = 32000; // Gemini Pro has 32k context
      } else if (modelName.includes('gemini-flash')) {
        contextWindow = 32000; // Gemini Flash has 32k context
      }

      // Cap at reasonable limits to prevent issues
      const maxAllowed = 2000000; // 2M tokens max
      const finalContext = Math.min(contextWindow, maxAllowed);

      // Get completion token limit from Google API
      let completionTokens = 8192; // default fallback (Gemini 1.5 standard limit)

      if (m.outputTokenLimit && m.outputTokenLimit > 0) {
        completionTokens = Math.min(m.outputTokenLimit, 128000); // Use API value, cap at reasonable limit
      }

      return {
        name: modelName,
        label: `${m.displayName || modelName} (${finalContext >= 1000000 ? Math.floor(finalContext / 1000000) + 'M' : Math.floor(finalContext / 1000) + 'k'} context)`,
        provider: this.name,
        maxTokenAllowed: finalContext,
        maxCompletionTokens: completionTokens,
      };
    });
  }

  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    /*
     * Explicit `cachedContents` caching: wrap fetch so the large, turn-stable
     * systemInstruction is pinned as a cached resource and referenced by name on
     * every turn (mirrors the Anthropic wire caching). Fully fail-safe — any error
     * or a stale cache name falls back to the original inline request (see
     * google-cache.ts). The wrapper also tees the SSE stream to surface
     * `cachedContentTokenCount`, which @ai-sdk/google@0.0.52 drops.
     */
    const google = createGoogleGenerativeAI({
      apiKey,
      fetch: createGoogleCachingFetch(globalThis.fetch, apiKey),
    });

    return google(model);
  }
}
