export type AiProviderId =
  | 'openai'
  | 'anthropic'
  | 'google-gemini'
  | 'openrouter'
  | 'mistral'
  | 'groq'
  | 'xai'
  | 'ollama';

export type AiPlanKey = 'free' | 'pro' | 'business' | 'enterprise' | 'self-host';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface AiModel {
  id: string;
  provider: AiProviderId;
  displayName: string;
  plans: AiPlanKey[];
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
  contextWindow: number;
}

export interface AiChatRequest {
  organizationId?: string;
  plan?: AiPlanKey;
  provider?: AiProviderId;
  model?: string;
  messages: AiMessage[];
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface AiChatChunk {
  type: 'delta' | 'done' | 'error';
  content?: string;
  provider?: AiProviderId;
  model?: string;
  usage?: AiUsage;
  error?: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
}

interface ProviderConfig {
  id: AiProviderId;
  kind: 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama';
  baseUrl: string;
  apiKeyEnv?: string;
  defaultModel: string;
  healthPath?: string;
}

function providerConfigs(): ProviderConfig[] {
  return [
    {
      id: 'openai',
      kind: 'openai-compatible',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
      defaultModel: 'gpt-4.1',
    },
    {
      id: 'anthropic',
      kind: 'anthropic',
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      defaultModel: 'claude-3-5-sonnet-latest',
    },
    {
      id: 'google-gemini',
      kind: 'gemini',
      baseUrl: process.env.GOOGLE_GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta',
      apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
      defaultModel: 'gemini-1.5-pro',
    },
    {
      id: 'openrouter',
      kind: 'openai-compatible',
      baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      defaultModel: 'openai/gpt-4.1',
    },
    {
      id: 'mistral',
      kind: 'openai-compatible',
      baseUrl: process.env.MISTRAL_BASE_URL ?? 'https://api.mistral.ai/v1',
      apiKeyEnv: 'MISTRAL_API_KEY',
      defaultModel: 'mistral-large-latest',
    },
    {
      id: 'groq',
      kind: 'openai-compatible',
      baseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
      defaultModel: 'llama-3.3-70b-versatile',
    },
    {
      id: 'xai',
      kind: 'openai-compatible',
      baseUrl: process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1',
      apiKeyEnv: 'XAI_API_KEY',
      defaultModel: 'grok-2-latest',
    },
    {
      id: 'ollama',
      kind: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
      defaultModel: 'llama3.1',
    },
  ];
}

export const modelCatalog: AiModel[] = [
  {
    id: 'gpt-4.1',
    provider: 'openai',
    displayName: 'GPT-4.1',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 800,
    contextWindow: 1_000_000,
  },
  {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    displayName: 'GPT-4.1 Mini',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 40,
    outputCentsPerMillion: 160,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-3-5-sonnet-latest',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 200_000,
  },
  {
    id: 'gemini-1.5-pro',
    provider: 'google-gemini',
    displayName: 'Gemini 1.5 Pro',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 125,
    outputCentsPerMillion: 500,
    contextWindow: 1_000_000,
  },
  {
    id: 'openai/gpt-4.1',
    provider: 'openrouter',
    displayName: 'OpenRouter GPT-4.1',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 800,
    contextWindow: 1_000_000,
  },
  {
    id: 'mistral-large-latest',
    provider: 'mistral',
    displayName: 'Mistral Large',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 600,
    contextWindow: 128_000,
  },
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    displayName: 'Llama 3.3 70B',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 59,
    outputCentsPerMillion: 79,
    contextWindow: 128_000,
  },
  {
    id: 'grok-2-latest',
    provider: 'xai',
    displayName: 'Grok 2',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 1000,
    contextWindow: 128_000,
  },
  {
    id: 'llama3.1',
    provider: 'ollama',
    displayName: 'Ollama Llama 3.1',
    plans: ['self-host', 'enterprise'],
    inputCentsPerMillion: 0,
    outputCentsPerMillion: 0,
    contextWindow: 128_000,
  },
];

export function countTokens(messages: AiMessage[] | string) {
  const content = typeof messages === 'string' ? messages : messages.map((message) => message.content).join('\n');
  return Math.max(1, Math.ceil(content.length / 4));
}

function canonicalModelName(modelName: string) {
  return modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function modelDisallowsTemperature(modelName: string) {
  return canonicalModelName(modelName).includes('claude-opus-4-7');
}

function optionalTemperature(request: AiChatRequest, model: string) {
  return request.temperature === undefined || modelDisallowsTemperature(model)
    ? {}
    : { temperature: request.temperature };
}

function estimateCost(model: AiModel, inputTokens: number, outputTokens: number) {
  return Math.ceil((inputTokens * model.inputCentsPerMillion + outputTokens * model.outputCentsPerMillion) / 1_000_000);
}

function configured(config: ProviderConfig) {
  return config.kind === 'ollama' || Boolean(config.apiKeyEnv && process.env[config.apiKeyEnv]);
}

function bearer(config: ProviderConfig) {
  return config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;
}

function headers(config: ProviderConfig) {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const token = bearer(config);

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (config.kind === 'anthropic') {
    delete headers.authorization;
    headers['x-api-key'] = token ?? '';
    headers['anthropic-version'] = '2023-06-01';
  }

  return headers;
}

async function retry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 80 * attempt * attempt));
      }
    }
  }

  throw lastError;
}

async function readJson(response: Response) {
  const text = await response.text();

  if (!response.ok) {
    throw Object.assign(new Error(`Provider request failed: ${response.status}`), {
      statusCode: 502,
      providerBody: text.slice(0, 500),
    });
  }

  return text ? JSON.parse(text) : {};
}

function extractContent(payload: any) {
  if (typeof payload?.choices?.[0]?.message?.content === 'string') {
    return payload.choices[0].message.content;
  }

  if (Array.isArray(payload?.content)) {
    return payload.content.map((part: any) => part.text ?? '').join('');
  }

  if (Array.isArray(payload?.candidates?.[0]?.content?.parts)) {
    return payload.candidates[0].content.parts.map((part: any) => part.text ?? '').join('');
  }

  if (typeof payload?.message?.content === 'string') {
    return payload.message.content;
  }

  return '';
}

function openAiPayload(request: AiChatRequest, model: string, stream: boolean) {
  return {
    model,
    messages: request.messages,
    stream,
    max_tokens: request.maxTokens,
    ...optionalTemperature(request, model),
  };
}

function anthropicPayload(request: AiChatRequest, model: string, stream: boolean) {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const messages = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));
  return {
    model,
    system: system || undefined,
    messages,
    stream,
    max_tokens: request.maxTokens ?? 1024,
    ...optionalTemperature(request, model),
  };
}

function geminiPayload(request: AiChatRequest, model: string) {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const contents = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: request.maxTokens, ...optionalTemperature(request, model) },
  };
}

async function providerCompletion(config: ProviderConfig, request: AiChatRequest, model: string) {
  if (config.kind === 'openai-compatible') {
    return extractContent(
      await readJson(
        await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: headers(config),
          body: JSON.stringify(openAiPayload(request, model, false)),
        }),
      ),
    );
  }

  if (config.kind === 'anthropic') {
    return extractContent(
      await readJson(
        await fetch(`${config.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
          method: 'POST',
          headers: headers(config),
          body: JSON.stringify(anthropicPayload(request, model, false)),
        }),
      ),
    );
  }

  if (config.kind === 'gemini') {
    const key = bearer(config);
    return extractContent(
      await readJson(
        await fetch(
          `${config.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key ?? '')}`,
          { method: 'POST', headers: headers(config), body: JSON.stringify(geminiPayload(request, model)) },
        ),
      ),
    );
  }

  return extractContent(
    await readJson(
      await fetch(`${config.baseUrl.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: headers(config),
        body: JSON.stringify({ model, messages: request.messages, stream: false }),
      }),
    ),
  );
}

async function* providerStream(config: ProviderConfig, request: AiChatRequest, model: string): AsyncGenerator<string> {
  const url =
    config.kind === 'anthropic'
      ? `${config.baseUrl.replace(/\/+$/, '')}/v1/messages`
      : config.kind === 'gemini'
        ? `${config.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(bearer(config) ?? '')}`
        : config.kind === 'ollama'
          ? `${config.baseUrl.replace(/\/+$/, '')}/api/chat`
          : `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body =
    config.kind === 'anthropic'
      ? anthropicPayload(request, model, true)
      : config.kind === 'gemini'
        ? geminiPayload(request, model)
        : config.kind === 'ollama'
          ? { model, messages: request.messages, stream: true }
          : openAiPayload(request, model, true);
  const response = await fetch(url, { method: 'POST', headers: headers(config), body: JSON.stringify(body) });

  if (!response.ok || !response.body) {
    throw Object.assign(new Error(`Provider stream failed: ${response.status}`), { statusCode: 502 });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line === 'data: [DONE]') {
        continue;
      }

      const jsonLine = line.startsWith('data:') ? line.slice(5).trim() : line;
      try {
        const payload = JSON.parse(jsonLine);
        const delta =
          payload.choices?.[0]?.delta?.content ??
          payload.delta?.text ??
          payload.contentBlockDelta?.delta?.text ??
          payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('') ??
          payload.message?.content ??
          '';

        if (delta) {
          yield delta;
        }
      } catch {
        yield jsonLine;
      }
    }
  }
}

export class AiGateway {
  models(plan: AiPlanKey = 'free') {
    return modelCatalog.filter((model) => model.plans.includes(plan));
  }

  async health() {
    return Promise.all(
      providerConfigs().map(async (config) => {
        if (!configured(config)) {
          return { provider: config.id, healthy: false, configured: false };
        }

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1500);
          const response = await fetch(
            config.kind === 'ollama' ? `${config.baseUrl.replace(/\/+$/, '')}/api/tags` : config.baseUrl,
            { method: 'GET', signal: controller.signal },
          );
          clearTimeout(timer);
          return { provider: config.id, healthy: response.status < 500, configured: true };
        } catch {
          return { provider: config.id, healthy: false, configured: true };
        }
      }),
    );
  }

  route(request: AiChatRequest) {
    const plan = request.plan ?? 'free';
    const requestedModel = request.model ? modelCatalog.find((model) => model.id === request.model) : undefined;
    const selectedModel = requestedModel ?? this.models(plan)[0] ?? modelCatalog[0];

    if (!selectedModel.plans.includes(plan)) {
      throw Object.assign(new Error('Model is not available on this plan'), {
        statusCode: 403,
        code: 'AI_MODEL_PLAN_BLOCKED',
      });
    }

    const providerIds = [
      request.provider ?? selectedModel.provider,
      ...((process.env.AI_FALLBACK_PROVIDERS?.split(',').filter(Boolean) as AiProviderId[] | undefined) ?? []),
    ];
    const providers = providerIds
      .map((providerId) => providerConfigs().find((config) => config.id === providerId))
      .filter((config): config is ProviderConfig => Boolean(config))
      .filter(configured);

    if (providers.length === 0) {
      throw Object.assign(new Error('No configured AI provider is available'), {
        statusCode: 503,
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    }

    return { model: selectedModel, providers };
  }

  async complete(request: AiChatRequest) {
    const routed = this.route(request);
    const inputTokens = countTokens(request.messages);
    let lastError: unknown;

    for (const provider of routed.providers) {
      try {
        const content = await retry(() => providerCompletion(provider, request, request.model ?? routed.model.id));
        const outputTokens = countTokens(content);
        return {
          provider: provider.id,
          model: request.model ?? routed.model.id,
          content,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCostCents: estimateCost(routed.model, inputTokens, outputTokens),
          },
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async *stream(request: AiChatRequest): AsyncGenerator<AiChatChunk> {
    const routed = this.route(request);
    const inputTokens = countTokens(request.messages);
    let content = '';

    for (const provider of routed.providers) {
      try {
        for await (const delta of providerStream(provider, request, request.model ?? routed.model.id)) {
          content += delta;
          yield { type: 'delta', content: delta, provider: provider.id, model: request.model ?? routed.model.id };
        }

        const outputTokens = countTokens(content);
        yield {
          type: 'done',
          provider: provider.id,
          model: request.model ?? routed.model.id,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCostCents: estimateCost(routed.model, inputTokens, outputTokens),
          },
        };
        return;
      } catch (error) {
        yield {
          type: 'error',
          provider: provider.id,
          model: request.model ?? routed.model.id,
          error: error instanceof Error ? error.message : 'Provider stream failed',
        };
      }
    }
  }
}
