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

let gptTokenEncoder: ((text: string) => number[] | Uint32Array) | undefined;
let gptTokenizerLoadAttempted = false;

export async function ensureGptTokenizer() {
  if (gptTokenEncoder || gptTokenizerLoadAttempted) return;
  gptTokenizerLoadAttempted = true;
  try {
    const tokenizer = (await import('gpt-tokenizer')) as { encode: (text: string) => number[] | Uint32Array };
    gptTokenEncoder = (text) => tokenizer.encode(text);
  } catch {
    // tokenizer optional; fall back to length/4
  }
}

export function countTokens(messages: AiMessage[] | string) {
  const content = typeof messages === 'string' ? messages : messages.map((message) => message.content).join('\n');
  if (gptTokenEncoder) {
    try {
      const encoded = gptTokenEncoder(content);
      const length = encoded instanceof Uint32Array ? encoded.length : encoded.length;
      return Math.max(1, length);
    } catch {
      // fall through
    }
  }
  return Math.max(1, Math.ceil(content.length / 4));
}

export function modelDisallowsTemperature(modelName: string) {
  void modelName;

  return true;
}

function optionalTemperature(request: AiChatRequest, model: string) {
  void request;
  void model;

  return {};
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

async function retry<T>(operation: () => Promise<T>, attempts = 3, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't burn the remaining attempts (and their backoff sleeps) once the
      // client has aborted — fail fast instead.
      if (signal?.aborted) {
        throw error;
      }

      /*
       * Don't retry deterministic client errors (4xx except 429): a bad request /
       * auth failure / not-found won't change on retry, and retrying wastes the
       * backoff budget (and re-bills paid providers). 5xx, 429 and network errors
       * stay retryable.
       */
      const upstreamStatus = (error as { upstreamStatus?: number })?.upstreamStatus;

      if (typeof upstreamStatus === 'number' && upstreamStatus >= 400 && upstreamStatus < 500 && upstreamStatus !== 429) {
        throw error;
      }

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
      upstreamStatus: response.status,
      providerBody: text.slice(0, 500),
    });
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Provider returned a non-JSON response'), {
      statusCode: 502,
      providerBody: text.slice(0, 500),
    });
  }
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

/*
 * Bound the output tokens. Without a cap, an unset maxTokens lets the provider
 * run to its (often very large) model default on every call — unbounded cost and
 * latency. Default to a sane size and hard-clamp any caller-supplied value.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const HARD_MAX_OUTPUT_TOKENS = 32768;

function resolveMaxOutputTokens(request: AiChatRequest): number {
  const requested = typeof request.maxTokens === 'number' && request.maxTokens > 0 ? request.maxTokens : DEFAULT_MAX_OUTPUT_TOKENS;

  return Math.min(requested, HARD_MAX_OUTPUT_TOKENS);
}

function openAiPayload(request: AiChatRequest, model: string, stream: boolean) {
  return {
    model,
    messages: request.messages,
    stream,
    max_tokens: resolveMaxOutputTokens(request),
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
    max_tokens: resolveMaxOutputTokens(request),
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
    generationConfig: { maxOutputTokens: resolveMaxOutputTokens(request), ...optionalTemperature(request, model) },
  };
}

async function providerCompletion(config: ProviderConfig, request: AiChatRequest, model: string, signal?: AbortSignal) {
  // Combine the caller's abort signal (client disconnect) with the per-request timeout.
  const reqSignal = signal
    ? ((AbortSignal as any).any?.([signal, AbortSignal.timeout(60_000)]) ?? signal)
    : AbortSignal.timeout(60_000);

  if (config.kind === 'openai-compatible') {
    return extractContent(
      await readJson(
        await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: headers(config),
          body: JSON.stringify(openAiPayload(request, model, false)),
          signal: reqSignal,
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
          signal: reqSignal,
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
          {
            method: 'POST',
            headers: headers(config),
            body: JSON.stringify(geminiPayload(request, model)),
            signal: reqSignal,
          },
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
        signal: reqSignal,
      }),
    ),
  );
}

async function* providerStream(
  config: ProviderConfig,
  request: AiChatRequest,
  model: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
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
  const timeout = AbortSignal.timeout(60_000);
  const upstreamSignal = signal ? ((AbortSignal as any).any?.([signal, timeout]) ?? signal) : timeout;
  const response = await fetch(url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
    signal: upstreamSignal,
  });

  if (!response.ok || !response.body) {
    // Drain/cancel the error body before throwing. An error status (429/5xx,
    // common during provider incidents) often carries a body; throwing without
    // consuming it leaks the upstream connection until GC, exhausting sockets.
    await response.body?.cancel().catch(() => {});
    throw Object.assign(new Error(`Provider stream failed: ${response.status}`), { statusCode: 502 });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
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
          // A malformed SSE chunk is not assistant content — yielding the raw JSON would
          // splice literal `{"choices":...}` text into the streamed message. Skip it.
          continue;
        }
      }
    }
  } finally {
    // Cancel the upstream body so a client disconnect (generator .return()) or error
    // tears down the provider request instead of leaving it streaming (cost/socket leak).
    await reader.cancel().catch(() => {});
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

  /*
   * Resolve which model id to send to a given provider. A model id is
   * provider-specific (e.g. "gpt-4.1" is meaningless to Anthropic), so reusing
   * the primary provider's model id on a fallback provider always 4xx-failed —
   * the cross-provider fallback never actually worked. The primary provider keeps
   * the selected model; a fallback provider gets a catalog model that belongs to
   * IT and is allowed on the plan, falling back to the provider's defaultModel.
   */
  private resolveModelForProvider(
    provider: ProviderConfig,
    request: AiChatRequest,
    selectedModel: AiModel,
    plan: AiPlanKey,
    primaryProviderId: AiProviderId,
  ): { id: string; catalog?: AiModel } {
    // The primary provider honors the explicitly requested model id (which may be
    // a valid provider model outside our catalog). Only FALLBACK providers need a
    // provider-appropriate substitute, since a model id is provider-specific.
    if (provider.id === primaryProviderId) {
      return { id: request.model ?? selectedModel.id, catalog: selectedModel };
    }

    const catalog = modelCatalog.find((model) => model.provider === provider.id && model.plans.includes(plan));

    if (catalog) {
      return { id: catalog.id, catalog };
    }

    return { id: provider.defaultModel };
  }

  async complete(request: AiChatRequest, signal?: AbortSignal) {
    await ensureGptTokenizer();
    const routed = this.route(request);
    const plan = request.plan ?? 'free';
    const primaryProviderId = request.provider ?? routed.model.provider;
    const inputTokens = countTokens(request.messages);
    let lastError: unknown;

    for (const provider of routed.providers) {
      try {
        if (signal?.aborted) {
          throw new Error('aborted');
        }

        const resolved = this.resolveModelForProvider(provider, request, routed.model, plan, primaryProviderId);
        const content = await retry(() => providerCompletion(provider, request, resolved.id, signal), 3, signal);
        const outputTokens = countTokens(content);
        return {
          provider: provider.id,
          model: resolved.id,
          content,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCostCents: estimateCost(resolved.catalog ?? routed.model, inputTokens, outputTokens),
          },
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async *stream(request: AiChatRequest, signal?: AbortSignal): AsyncGenerator<AiChatChunk> {
    await ensureGptTokenizer();
    const routed = this.route(request);
    const plan = request.plan ?? 'free';
    const primaryProviderId = request.provider ?? routed.model.provider;
    const inputTokens = countTokens(request.messages);

    for (const provider of routed.providers) {
      // Stop before trying another provider if the client already went away —
      // otherwise an aborted stream keeps falling through and re-billing.
      if (signal?.aborted) {
        return;
      }

      /*
       * Remap the model id for THIS provider, exactly as complete() does. The old
       * code sent `request.model ?? routed.model.id` (the primary provider's id)
       * verbatim to every fallback provider, so cross-provider fallback always
       * failed with an unknown-model error instead of recovering.
       */
      const resolved = this.resolveModelForProvider(provider, request, routed.model, plan, primaryProviderId);

      // Reset per provider so a failed provider's partial deltas aren't concatenated
      // onto the fallback provider's output (garbled message + double-counted cost).
      let content = '';
      let yieldedDelta = false;

      try {
        for await (const delta of providerStream(provider, request, resolved.id, signal)) {
          content += delta;
          yieldedDelta = true;
          yield { type: 'delta', content: delta, provider: provider.id, model: resolved.id };
        }

        const outputTokens = countTokens(content);
        yield {
          type: 'done',
          provider: provider.id,
          model: resolved.id,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCostCents: estimateCost(resolved.catalog ?? routed.model, inputTokens, outputTokens),
          },
        };
        return;
      } catch (error) {
        // A client abort surfaces as a throw here — don't fall through to a
        // fallback provider (which would re-bill); just stop.
        if (signal?.aborted) {
          return;
        }

        yield {
          type: 'error',
          provider: provider.id,
          model: resolved.id,
          error: error instanceof Error ? error.message : 'Provider stream failed',
        };

        /*
         * If partial deltas already reached the client, the fallback provider's
         * fresh full generation would be appended onto that partial text,
         * producing a garbled, concatenated message. Stop rather than fall
         * through once any output has been streamed.
         */
        if (yieldedDelta) {
          return;
        }
      }
    }
  }
}
