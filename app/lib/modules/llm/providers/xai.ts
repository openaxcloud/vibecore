import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

export default class XAIProvider extends BaseProvider {
  name = 'xAI';
  getApiKeyLink = 'https://docs.x.ai/docs/quickstart#creating-an-api-key';

  config = {
    apiTokenKey: 'XAI_API_KEY',
  };

  /*
   * Each model must declare maxCompletionTokens explicitly. Without it,
   * getCompletionTokenLimit() in stream-text.ts falls through to the
   * PROVIDER_COMPLETION_LIMITS['xAI'] = 8192 floor, which silently truncates
   * large multi-file generations mid-file. Grok-4 supports far larger outputs,
   * so we widen the completion budget to match (mirroring the OpenAI per-id caps).
   */
  staticModels: ModelInfo[] = [
    { name: 'grok-4', label: 'xAI Grok 4', provider: 'xAI', maxTokenAllowed: 256000, maxCompletionTokens: 32768 },
    {
      name: 'grok-4-07-09',
      label: 'xAI Grok 4 (07-09)',
      provider: 'xAI',
      maxTokenAllowed: 256000,
      maxCompletionTokens: 32768,
    },
    {
      name: 'grok-3-mini',
      label: 'xAI Grok 3 Mini',
      provider: 'xAI',
      maxTokenAllowed: 131000,
      maxCompletionTokens: 16384,
    },
    {
      name: 'grok-3-mini-fast',
      label: 'xAI Grok 3 Mini Fast',
      provider: 'xAI',
      maxTokenAllowed: 131000,
      maxCompletionTokens: 16384,
    },
    {
      name: 'grok-code-fast-1',
      label: 'xAI Grok Code Fast 1',
      provider: 'xAI',
      maxTokenAllowed: 131000,
      maxCompletionTokens: 16384,
    },
  ];

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
      defaultApiTokenKey: 'XAI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey,
    });

    return openai(model);
  }
}
