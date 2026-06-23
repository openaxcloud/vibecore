import type { LanguageModelV1 } from 'ai';
import { resolveTogetherCompletionTokens } from './together-completion-tokens';
import { BaseProvider, getOpenAILikeModel } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

export default class TogetherProvider extends BaseProvider {
  name = 'Together';
  getApiKeyLink = 'https://api.together.xyz/settings/api-keys';

  config = {
    baseUrlKey: 'TOGETHER_API_BASE_URL',
    apiTokenKey: 'TOGETHER_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most stable/reliable ones
     * Llama 3.2 90B Vision: 128k context, multimodal capabilities
     */
    {
      name: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      label: 'Llama 3.2 90B Vision',
      provider: 'Together',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 8192,
    },

    // Mixtral 8x7B: 32k context, strong performance
    {
      name: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      label: 'Mixtral 8x7B Instruct',
      provider: 'Together',
      maxTokenAllowed: 32000,
      maxCompletionTokens: 8192,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const { baseUrl: fetchBaseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: 'TOGETHER_API_BASE_URL',
      defaultApiTokenKey: 'TOGETHER_API_KEY',
    });

    const baseUrl = fetchBaseUrl || 'https://api.together.xyz/v1';

    if (!baseUrl || !apiKey) {
      return [];
    }

    // console.log({ baseUrl, apiKey });

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: this.createTimeoutSignal(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.name} models: ${response.status} ${response.statusText}`);
    }

    const res = (await response.json()) as any;
    const list = Array.isArray(res) ? res : res?.data || [];
    const data = list.filter((model: any) => model.type === 'chat');

    return data.map((m: any) => {
      const inPrice = m.pricing?.input;
      const outPrice = m.pricing?.output;
      const ctx = m.context_length || 8000;

      const priceLabel =
        typeof inPrice === 'number' && typeof outPrice === 'number'
          ? ` - in:$${inPrice.toFixed(2)} out:$${outPrice.toFixed(2)}`
          : '';

      return {
        name: m.id,
        label: `${m.display_name || m.id}${priceLabel} - context ${Math.floor(ctx / 1000)}k`,
        provider: this.name,
        maxTokenAllowed: ctx,
        maxCompletionTokens: resolveTogetherCompletionTokens(m, ctx),
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

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'TOGETHER_API_BASE_URL',
      defaultApiTokenKey: 'TOGETHER_API_KEY',
    });

    if (!baseUrl || !apiKey) {
      throw new Error(`Missing configuration for ${this.name} provider`);
    }

    return getOpenAILikeModel(baseUrl, apiKey, model);
  }
}
