import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

export default class OpenAIProvider extends BaseProvider {
  name = 'OpenAI';
  getApiKeyLink = 'https://platform.openai.com/api-keys';

  config = {
    apiTokenKey: 'OPENAI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most stable/reliable ones.
     * GPT-4.1 family: 1M (1,047,576) token context window, 32k output. These MUST be
     * listed statically with their true context window so multi-file generation is not
     * truncated when the OpenAI /models endpoint is unavailable or mis-classifies them.
     */
    {
      name: 'gpt-4.1',
      label: 'GPT-4.1',
      provider: 'OpenAI',
      maxTokenAllowed: 1047576,
      maxCompletionTokens: 32768,
    },
    {
      name: 'gpt-4.1-mini',
      label: 'GPT-4.1 mini',
      provider: 'OpenAI',
      maxTokenAllowed: 1047576,
      maxCompletionTokens: 32768,
    },
    {
      name: 'gpt-4.1-nano',
      label: 'GPT-4.1 nano',
      provider: 'OpenAI',
      maxTokenAllowed: 1047576,
      maxCompletionTokens: 32768,
    },

    // GPT-4o: 128k context, 16k output on current snapshots.
    { name: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 16384 },

    // GPT-4o Mini: 128k context, cost-effective alternative
    {
      name: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 4096,
    },

    // GPT-3.5-turbo: 16k context, fast and cost-effective
    {
      name: 'gpt-3.5-turbo',
      label: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      maxTokenAllowed: 16000,
      maxCompletionTokens: 4096,
    },

    // o1-preview: 128k context, 32k output limit (reasoning model)
    {
      name: 'o1-preview',
      label: 'o1-preview',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32000,
    },

    // o1-mini: 128k context, 65k output limit (reasoning model)
    { name: 'o1-mini', label: 'o1-mini', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 65000 },
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
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://api.openai.com/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: this.createTimeoutSignal(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.name} models: ${response.status} ${response.statusText}`);
    }

    const res = (await response.json()) as any;
    const staticModelIds = this.staticModels.map((m) => m.name);

    const data = (Array.isArray(res?.data) ? res.data : []).filter(
      (model: any) =>
        model.object === 'model' &&
        (model.id.startsWith('gpt-') || model.id.startsWith('o') || model.id.startsWith('chatgpt-')) &&
        !staticModelIds.includes(model.id),
    );

    return data.map((m: any) => {
      // Get accurate context window from OpenAI API
      let contextWindow = 32000; // default fallback

      // OpenAI provides context_length in their API response
      if (m.context_length) {
        contextWindow = m.context_length;
      } else if (m.id?.includes('gpt-4.1') || m.id?.includes('gpt-4.5')) {
        /*
         * Must be checked BEFORE the generic `gpt-4` branch below, otherwise
         * `gpt-4.1`.includes('gpt-4') matches and truncates it to 8k.
         */
        contextWindow = 1047576;
      } else if (m.id?.includes('gpt-4o')) {
        contextWindow = 128000; // GPT-4o has 128k context
      } else if (m.id?.includes('gpt-4-turbo') || m.id?.includes('gpt-4-1106')) {
        contextWindow = 128000; // GPT-4 Turbo has 128k context
      } else if (m.id?.includes('gpt-4')) {
        contextWindow = 8192; // Standard GPT-4 has 8k context
      } else if (m.id?.includes('gpt-3.5-turbo')) {
        contextWindow = 16385; // GPT-3.5-turbo has 16k context
      }

      // Determine completion token limits based on model type (accurate 2025 limits)
      let maxCompletionTokens = 4096; // default for most models

      if (m.id?.startsWith('o1-preview')) {
        maxCompletionTokens = 32000; // o1-preview: 32K output limit
      } else if (m.id?.startsWith('o1-mini')) {
        maxCompletionTokens = 65000; // o1-mini: 65K output limit
      } else if (m.id?.startsWith('o1')) {
        maxCompletionTokens = 32000; // Other o1 models: 32K limit
      } else if (m.id?.includes('o3') || m.id?.includes('o4')) {
        maxCompletionTokens = 100000; // o3/o4 models: 100K output limit
      } else if (m.id?.includes('gpt-4.1') || m.id?.includes('gpt-4.5')) {
        maxCompletionTokens = 32768; // GPT-4.1 family: 32K output limit
      } else if (m.id?.includes('gpt-4o')) {
        maxCompletionTokens = 16384; // GPT-4o current snapshots support 16K output
      } else if (m.id?.includes('gpt-4')) {
        maxCompletionTokens = 8192; // Standard GPT-4: 8K output limit
      } else if (m.id?.includes('gpt-3.5-turbo')) {
        maxCompletionTokens = 4096; // GPT-3.5-turbo: 4K output limit
      }

      const label =
        contextWindow >= 1_000_000
          ? `${m.id} (${Math.round(contextWindow / 100_000) / 10}M context)`
          : `${m.id} (${Math.floor(contextWindow / 1000)}k context)`;

      return {
        name: m.id,
        label,
        provider: this.name,
        maxTokenAllowed: contextWindow,
        maxCompletionTokens,
      };
    });
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
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      apiKey,
    });

    return openai(model);
  }
}
