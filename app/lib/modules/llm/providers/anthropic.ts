import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

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
        label: `${m.display_name} (${Math.floor(contextWindow / 1000)}k context)`,
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
      providerSettings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });
    const anthropic = createAnthropic({
      apiKey,
      headers: { 'anthropic-beta': 'output-128k-2025-02-19' },
    });

    return anthropic(model);
  };
}
