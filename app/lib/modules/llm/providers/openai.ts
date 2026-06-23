import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

/**
 * True when a model id from OpenAI's /v1/models listing is a chat-completion
 * model we should surface as selectable. The endpoint returns many non-chat
 * entries that begin with 'o' (e.g. `omni-moderation-latest`) or other prefixes
 * (embeddings, tts, whisper, dall-e); selecting those as a chat model produces
 * a failing chat/completions stream, so they are excluded here.
 */
export function isSelectableOpenAIChatModel(id: string | undefined): boolean {
  if (!id) {
    return false;
  }

  // Exclude known non-chat product families even when the prefix would otherwise match.
  if (/moderation|embedding|tts|whisper|dall-e|audio|realtime|image|transcribe|search/i.test(id)) {
    return false;
  }

  // Reasoning families are the only legitimate 'o'-prefixed chat models.
  const isReasoning = id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');

  return id.startsWith('gpt-') || id.startsWith('chatgpt-') || isReasoning;
}

/**
 * Best-effort context window (max input tokens) for a dynamically-listed OpenAI
 * model. OpenAI's /v1/models payload carries no context length, so this is a
 * heuristic keyed on the model id. The o-series reasoning branch is required:
 * without it o3/o4/o1 fall through to the 32k default while their completion
 * budget is 100k+, producing maxTokenAllowed < maxCompletionTokens and silently
 * truncating multi-file context.
 */
export function inferOpenAIContextWindow(id: string | undefined, contextLength?: number): number {
  if (typeof contextLength === 'number' && contextLength > 0) {
    return contextLength;
  }

  if (id?.includes('gpt-5')) {
    /*
     * gpt-5 family ships a ~400k context window. Must be checked BEFORE the
     * gpt-4 branches (it does not contain 'gpt-4', but keeping it first mirrors
     * the gpt-4.1 special-case) and BEFORE the 32k default, otherwise a live
     * gpt-5 model is advertised with maxTokenAllowed=32000 while its completion
     * budget is 128k, producing maxTokenAllowed < maxCompletionTokens and
     * silently truncating multi-file context in select-context.
     */
    return 400000;
  } else if (id?.includes('gpt-4.1') || id?.includes('gpt-4.5')) {
    /*
     * Must be checked BEFORE the generic `gpt-4` branch below, otherwise
     * `gpt-4.1`.includes('gpt-4') matches and truncates it to 8k.
     */
    return 1047576;
  } else if (id?.includes('gpt-4o')) {
    return 128000; // GPT-4o has 128k context
  } else if (id?.includes('gpt-4-turbo') || id?.includes('gpt-4-1106')) {
    return 128000; // GPT-4 Turbo has 128k context
  } else if (id?.includes('gpt-4')) {
    return 8192; // Standard GPT-4 has 8k context
  } else if (id?.includes('gpt-3.5-turbo')) {
    return 16385; // GPT-3.5-turbo has 16k context
  } else if (id?.startsWith('o1') || id?.includes('o3') || id?.includes('o4')) {
    /*
     * o-series reasoning models support 200k context. Must keep this >= the
     * 100k completion budget assigned below, or select-context truncates input.
     */
    return 200000;
  }

  return 32000; // default fallback
}

/**
 * Best-effort completion token budget for a dynamically-listed OpenAI model.
 */
export function inferOpenAIMaxCompletionTokens(id: string | undefined): number {
  if (id?.startsWith('o1-preview')) {
    return 32000; // o1-preview: 32K output limit
  } else if (id?.startsWith('o1-mini')) {
    return 65000; // o1-mini: 65K output limit
  } else if (id?.startsWith('o1')) {
    return 32000; // Other o1 models: 32K limit
  } else if (id?.includes('o3') || id?.includes('o4')) {
    return 100000; // o3/o4 models: 100K output limit
  } else if (id?.includes('gpt-5')) {
    /*
     * gpt-5 supports a 128K output budget. Must be checked BEFORE the gpt-4
     * branches (and ahead of the 4096 default), otherwise gpt-5 — which
     * isReasoningModel() routes through maxCompletionTokens — is capped at 4k
     * and generation stops mid-file.
     */
    return 128000;
  } else if (id?.includes('gpt-4.1') || id?.includes('gpt-4.5')) {
    return 32768; // GPT-4.1 family: 32K output limit
  } else if (id?.includes('gpt-4o')) {
    return 16384; // GPT-4o current snapshots support 16K output
  } else if (id?.includes('gpt-4')) {
    return 8192; // Standard GPT-4: 8K output limit
  } else if (id?.includes('gpt-3.5-turbo')) {
    return 4096; // GPT-3.5-turbo: 4K output limit
  }

  return 4096; // default for most models
}

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
        model.object === 'model' && isSelectableOpenAIChatModel(model.id) && !staticModelIds.includes(model.id),
    );

    return data.map((m: any) => {
      // OpenAI's /v1/models response carries no context length, so infer it from the id.
      const contextWindow = inferOpenAIContextWindow(m.id, m.context_length);

      // Determine completion token limits based on model type (accurate 2025 limits).
      const maxCompletionTokens = inferOpenAIMaxCompletionTokens(m.id);

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
