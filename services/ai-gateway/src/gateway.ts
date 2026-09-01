import { clampGatewayOutputBudget, estimateGatewayOutputBudget } from './gateway-output-budget.js';
import { applyGeminiCache, invalidateGeminiCache, logGeminiCacheUsage } from './gemini-cache.js';
import {
  aiGatewayError,
  localizedAiGatewayError,
  normalizeAiGatewayLocale,
  type AiGatewayLocale,
} from './public-i18n.js';

export type AiProviderId =
  | 'openai'
  | 'anthropic'
  | 'google-gemini'
  | 'openrouter'
  | 'mistral'
  | 'groq'
  | 'xai'
  | 'moonshot'
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

  /*
   * Max COMPLETION (output) tokens the model accepts in a single response — the
   * ceiling `max_tokens` must never exceed or the provider hard-rejects the
   * request (e.g. gpt-4-turbo caps at 4096). Distinct from `contextWindow`
   * (total input+output budget). Optional: when unset the model keeps the
   * global hard cap.
   */
  maxCompletionTokens?: number;
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
  locale?: AiGatewayLocale;

  /*
   * When set, a model that is not allowed on the plan is transparently swapped
   * for the plan's default allowed model instead of throwing AI_MODEL_PLAN_BLOCKED.
   * Used by multi-agent lanes so a Free-plan run degrades gracefully (each lane
   * runs on a plan-allowed model) instead of failing the whole consensus. The main
   * chat leaves this unset, keeping its hard plan-gate.
   */
  planFallback?: boolean;
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

export interface ProviderConfig {
  id: AiProviderId;
  kind: 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama';
  baseUrl: string;
  apiKeyEnv?: string;
  defaultModel: string;
  healthPath?: string;

  /*
   * DB-resolved platform API key (admin-set, decrypted from
   * ProviderConfig.apiKeyEnc). When present it takes precedence over
   * process.env[apiKeyEnv]; see resolveProviderKey / withProviderKeyOverride.
   */
  apiKey?: string;
}

export function providerConfigs(): ProviderConfig[] {
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
      defaultModel: 'gemini-2.5-flash',
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
      id: 'moonshot',
      kind: 'openai-compatible',
      baseUrl: process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1',
      apiKeyEnv: 'MOONSHOT_API_KEY',
      defaultModel: 'moonshot-v1-8k',
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
    maxCompletionTokens: 32768,
  },
  {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    displayName: 'GPT-4.1 Mini',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 40,
    outputCentsPerMillion: 160,
    contextWindow: 1_000_000,
    maxCompletionTokens: 32768,
  },
  {
    id: 'claude-3-5-sonnet-latest',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 200_000,
    maxCompletionTokens: 8192,
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'google-gemini',
    displayName: 'Gemini 2.5 Pro',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 125, // pricing approximate, verify
    outputCentsPerMillion: 1000, // pricing approximate, verify
    contextWindow: 1_048_576,
    maxCompletionTokens: 65536,
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google-gemini',
    displayName: 'Gemini 2.5 Flash',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 30, // pricing approximate, verify
    outputCentsPerMillion: 250, // pricing approximate, verify
    contextWindow: 1_048_576,
    maxCompletionTokens: 65536,
  },
  {
    id: 'gemini-3.5-flash',
    provider: 'google-gemini',
    displayName: 'Gemini 3.5 Flash',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 30, // pricing approximate, verify
    outputCentsPerMillion: 250, // pricing approximate, verify
    contextWindow: 1_048_576,
    maxCompletionTokens: 65536,
  },
  {
    id: 'openai/gpt-4.1',
    provider: 'openrouter',
    displayName: 'OpenRouter GPT-4.1',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 800,
    contextWindow: 1_000_000,
    maxCompletionTokens: 32768,
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

  /*
   * Catalogue synced 2026-07-13 with the web providers so a multi-agent lane runs
   * the EXACT model the user chose (previously an id the gateway didn't know was
   * silently downgraded via planFallback — a product lie). Pricing is approximate
   * (cost ESTIMATE only; real billing is computeAiCostCents on the api side).
   */
  // --- OpenAI ---
  {
    id: 'gpt-4.1-nano',
    provider: 'openai',
    displayName: 'GPT-4.1 Nano',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 10,
    outputCentsPerMillion: 40,
    contextWindow: 1_000_000,
    maxCompletionTokens: 32768,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 250,
    outputCentsPerMillion: 1000,
    contextWindow: 128_000,
    maxCompletionTokens: 16384,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 15,
    outputCentsPerMillion: 60,
    contextWindow: 128_000,
    maxCompletionTokens: 16384,
  },
  {
    id: 'gpt-3.5-turbo',
    provider: 'openai',
    displayName: 'GPT-3.5 Turbo',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 50,
    outputCentsPerMillion: 150,
    contextWindow: 16_000,
    maxCompletionTokens: 4096,
  },
  {
    id: 'o1',
    provider: 'openai',
    displayName: 'o1',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 1500,
    outputCentsPerMillion: 6000,
    contextWindow: 200_000,
    maxCompletionTokens: 100000,
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    displayName: 'o3-mini',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 110,
    outputCentsPerMillion: 440,
    contextWindow: 200_000,
    maxCompletionTokens: 100000,
  },
  {
    id: 'o3',
    provider: 'openai',
    displayName: 'o3',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 1000,
    outputCentsPerMillion: 4000,
    contextWindow: 200_000,
    maxCompletionTokens: 100000,
  },

  // --- Anthropic ---
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 5',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 1500,
    outputCentsPerMillion: 7500,
    contextWindow: 1_000_000,
    maxCompletionTokens: 128000,
  },
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.8',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 1500,
    outputCentsPerMillion: 7500,
    contextWindow: 1_000_000,
    maxCompletionTokens: 128000,
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 1_000_000,
    maxCompletionTokens: 64000,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 200_000,
    maxCompletionTokens: 64000,
  },
  {
    id: 'claude-opus-4-7',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.7',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 1500,
    outputCentsPerMillion: 7500,
    contextWindow: 200_000,
    maxCompletionTokens: 32000,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 100,
    outputCentsPerMillion: 500,
    contextWindow: 200_000,
    maxCompletionTokens: 64000,
  },

  // --- Google ---
  {
    id: 'gemini-flash-lite-latest',
    provider: 'google-gemini',
    displayName: 'Gemini Flash Lite (latest)',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 10,
    outputCentsPerMillion: 40,
    contextWindow: 1_048_576,
    maxCompletionTokens: 65536,
  },

  // --- xAI ---
  {
    id: 'grok-4',
    provider: 'xai',
    displayName: 'Grok 4',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 256_000,
    maxCompletionTokens: 32768,
  },
  {
    id: 'grok-4-07-09',
    provider: 'xai',
    displayName: 'Grok 4 (07-09)',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 256_000,
    maxCompletionTokens: 32768,
  },
  {
    id: 'grok-3-mini',
    provider: 'xai',
    displayName: 'Grok 3 Mini',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 30,
    outputCentsPerMillion: 50,
    contextWindow: 131_000,
    maxCompletionTokens: 16384,
  },
  {
    id: 'grok-3-mini-fast',
    provider: 'xai',
    displayName: 'Grok 3 Mini Fast',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 60,
    outputCentsPerMillion: 100,
    contextWindow: 131_000,
    maxCompletionTokens: 16384,
  },
  {
    id: 'grok-code-fast-1',
    provider: 'xai',
    displayName: 'Grok Code Fast 1',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 20,
    outputCentsPerMillion: 150,
    contextWindow: 131_000,
    maxCompletionTokens: 16384,
  },

  // --- Moonshot (openai-compatible) ---
  {
    id: 'moonshot-v1-8k',
    provider: 'moonshot',
    displayName: 'Moonshot v1 8k',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 120,
    outputCentsPerMillion: 120,
    contextWindow: 8_000,
    maxCompletionTokens: 4096,
  },
  {
    id: 'moonshot-v1-32k',
    provider: 'moonshot',
    displayName: 'Moonshot v1 32k',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 240,
    outputCentsPerMillion: 240,
    contextWindow: 32_000,
    maxCompletionTokens: 8192,
  },
  {
    id: 'moonshot-v1-128k',
    provider: 'moonshot',
    displayName: 'Moonshot v1 128k',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 600,
    outputCentsPerMillion: 600,
    contextWindow: 128_000,
    maxCompletionTokens: 8192,
  },
  {
    id: 'kimi-latest',
    provider: 'moonshot',
    displayName: 'Kimi (latest)',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 500,
    contextWindow: 128_000,
    maxCompletionTokens: 8192,
  },
  {
    id: 'kimi-k2-0711-preview',
    provider: 'moonshot',
    displayName: 'Kimi K2',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 60,
    outputCentsPerMillion: 250,
    contextWindow: 128_000,
    maxCompletionTokens: 8192,
  },
  {
    id: 'kimi-k2-turbo-preview',
    provider: 'moonshot',
    displayName: 'Kimi K2 Turbo',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 120,
    outputCentsPerMillion: 500,
    contextWindow: 128_000,
    maxCompletionTokens: 8192,
  },
];

let gptTokenEncoder: ((text: string) => number[] | Uint32Array) | undefined;
let gptTokenizerLoadAttempted = false;

export async function ensureGptTokenizer() {
  if (gptTokenEncoder || gptTokenizerLoadAttempted) {
    return;
  }

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

/**
 * Log Anthropic's real prompt-cache accounting from a `/v1/messages` response so
 * the cache hit-rate is observable (the gateway otherwise estimates usage
 * locally and never reads the provider body). `cache_read_input_tokens` are
 * input tokens served from cache; `cache_creation_input_tokens` is the one-time
 * write. Best-effort — any missing/malformed field is skipped, never thrown.
 */
function logAnthropicCacheUsage(json: unknown): void {
  try {
    const usage = (json as { usage?: Record<string, unknown> } | null)?.usage;

    if (!usage || typeof usage !== 'object') {
      return;
    }

    const read = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;
    const write = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;

    if (read > 0 || write > 0) {
      console.info(
        JSON.stringify({
          event: 'ai-gateway.anthropic.cache',
          cacheReadInputTokens: read,
          cacheCreationInputTokens: write,
        }),
      );
    }
  } catch {
    // Never let cache logging affect the completion path.
  }
}

export function configured(config: ProviderConfig) {
  return config.kind === 'ollama' || Boolean(bearer(config));
}

/*
 * Resolve the auth token for a provider DB-first → env-fallback. A DB-resolved
 * key (config.apiKey, set by withProviderKeyOverride from ProviderConfig.apiKeyEnc)
 * wins; otherwise fall back to process.env[apiKeyEnv]. With no DB key this is
 * byte-identical to the previous env-only behaviour (zero regression).
 */
export function bearer(config: ProviderConfig): string | undefined {
  if (config.apiKey && config.apiKey.trim().length > 0) {
    return config.apiKey;
  }

  return config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;
}

/*
 * --- DB-first provider key resolution -------------------------------------
 *
 * An admin can set a platform API key per provider in /admin (stored encrypted
 * as ProviderConfig.apiKeyEnc). The gateway resolves DB-first, falling back to
 * the *_API_KEY env var. Decrypted keys are cached in-process for a short TTL so
 * a burst of requests doesn't hit Postgres per call; the TTL is enough
 * (invalidation is intentionally skipped — a rotated key takes effect within
 * PROVIDER_KEY_TTL_MS). The pod already carries CONFIG_ENCRYPTION_KEY (mounted on
 * every pod via the shared platform secret), so decryptJson resolves the same key
 * the API used to encrypt.
 */
const PROVIDER_KEY_TTL_MS = 60_000;

/** Gateway provider id → the ProviderConfig row's display-name key. Keyless (ollama) omitted. */
const PROVIDER_ID_TO_DB_NAME: Partial<Record<AiProviderId, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  'google-gemini': 'Google',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  groq: 'Groq',
  xai: 'xAI',
};

const DB_NAME_TO_PROVIDER_ID = new Map(
  Object.entries(PROVIDER_ID_TO_DB_NAME).map(([id, name]) => [name, id as AiProviderId]),
);

interface ProviderKeyOverride {
  apiKey?: string;
  baseUrl?: string;
}

const providerKeyOverrides = new Map<AiProviderId, ProviderKeyOverride>();

let providerKeyOverridesExpiry = 0;

/*
 * Test seam: inject a loader that returns the raw provider rows (as the DB
 * findMany would) so the DB-first resolution can be exercised without a live
 * Postgres. Setting/clearing it also resets the TTL so the next hydrate reloads.
 */
export type ProviderKeyRow = { provider: string; apiKeyEnc?: string | null; baseUrl?: string | null };
type ProviderKeyLoader = () => Promise<ProviderKeyRow[]>;

let providerKeyLoaderForTest: ProviderKeyLoader | undefined;

export function __setProviderKeyLoaderForTest(loader: ProviderKeyLoader | undefined) {
  providerKeyLoaderForTest = loader;
  providerKeyOverridesExpiry = 0;
  providerKeyOverrides.clear();
}

let sharedGatewayDbClient: import('@vibecore/database').DatabaseClient | undefined;

async function loadProviderKeyRows(): Promise<ProviderKeyRow[]> {
  if (providerKeyLoaderForTest) {
    return providerKeyLoaderForTest();
  }

  if (!process.env.DATABASE_URL) {
    return [];
  }

  if (!sharedGatewayDbClient) {
    const { createDatabaseClient } = await import('@vibecore/database');
    sharedGatewayDbClient = createDatabaseClient();
  }

  return sharedGatewayDbClient.providerConfig.findMany({
    where: { provider: { in: Object.values(PROVIDER_ID_TO_DB_NAME) } },
    select: { provider: true, apiKeyEnc: true, baseUrl: true },
  });
}

/*
 * Refresh the decrypted-key cache when the TTL has elapsed. Never throws — on any
 * failure (DB down, undecryptable row) the previous overrides are kept and env
 * fallback still works, so a DB hiccup can never take generation down. Call this
 * before route()/health() so the sync enrichment below sees fresh values.
 */
export async function hydrateProviderKeyOverrides(force = false): Promise<void> {
  if (!force && Date.now() < providerKeyOverridesExpiry) {
    return;
  }

  // Advance the TTL up-front so concurrent requests don't all stampede the DB.
  providerKeyOverridesExpiry = Date.now() + PROVIDER_KEY_TTL_MS;

  try {
    const rows = await loadProviderKeyRows();
    const { decryptJson } = await import('@vibecore/security');

    const next = new Map<AiProviderId, ProviderKeyOverride>();

    for (const row of rows) {
      const id = DB_NAME_TO_PROVIDER_ID.get(row.provider);

      if (!id) {
        continue;
      }

      const override: ProviderKeyOverride = {};

      if (row.apiKeyEnc) {
        try {
          const value = decryptJson<{ value: string }>(row.apiKeyEnc).value;

          if (value && value.trim().length > 0) {
            override.apiKey = value;
          }
        } catch {
          // Undecryptable row → leave the env fallback in place for this provider.
        }
      }

      if (row.baseUrl && row.baseUrl.trim().length > 0) {
        override.baseUrl = row.baseUrl;
      }

      if (override.apiKey || override.baseUrl) {
        next.set(id, override);
      }
    }

    providerKeyOverrides.clear();

    for (const [id, override] of next) {
      providerKeyOverrides.set(id, override);
    }
  } catch {
    // Keep whatever we had; env fallback covers the gap.
  }
}

/*
 * Return a config enriched with any DB override (decrypted key + optional
 * baseUrl). Pure + sync so route()/health() can map over configs after an
 * awaited hydrate. No override → the config is returned unchanged.
 */
export function withProviderKeyOverride(config: ProviderConfig): ProviderConfig {
  const override = providerKeyOverrides.get(config.id);

  if (!override) {
    return config;
  }

  return {
    ...config,
    ...(override.apiKey ? { apiKey: override.apiKey } : {}),
    ...(override.baseUrl ? { baseUrl: override.baseUrl } : {}),
  };
}

export function headers(config: ProviderConfig) {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  const token = bearer(config);

  /*
   * Only the openai-compatible / ollama kinds authenticate via the
   * `Authorization: Bearer <token>` header. Anthropic uses `x-api-key` and
   * Gemini carries the key in the `?key=` query string — sending a bearer
   * header for those kinds is at best ignored by the upstream and at worst
   * leaks the API key into a second header (extra exposure in logs/proxies).
   * So scope the bearer header to the kinds that actually consume it.
   */
  if (token && (config.kind === 'openai-compatible' || config.kind === 'ollama')) {
    headers.authorization = `Bearer ${token}`;
  }

  if (config.kind === 'anthropic') {
    headers['x-api-key'] = token ?? '';
    headers['anthropic-version'] = '2023-06-01';

    /*
     * Enable the `cache_control` breakpoint set on the system block in
     * anthropicPayload. The N specialist lanes re-send an IDENTICAL system prefix
     * (shared preamble + shared context), so caching it collapses the duplicated
     * input cost from N× to ~1× + N×10%. `extended-cache-ttl-2025-04-11` enables
     * the `ttl: '1h'` on that block so the cache survives across turns; if the
     * account lacks the beta the ttl is ignored (default 5-minute cache), never an
     * error.
     */
    headers['anthropic-beta'] = 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11';
  }

  return headers;
}

/*
 * A provider 429 conflates two very different conditions:
 *   - a TRANSIENT per-minute rate limit ("...rate limit exceeded...") that
 *     clears on its own and is worth retrying / falling back on, and
 *   - the provider ACCOUNT's own usage/spend cap configured in the provider
 *     console ("You have reached your specified API usage limits. You will
 *     regain access on <first-of-next-month> at 00:00 UTC."), a hard wall that
 *     does NOT clear until the reset date and will fail identically on retry.
 *
 * Collapsing both into a bare `Provider ... failed: 429` (and, in the stream
 * path, discarding the upstream body entirely) hid the account cap: it was
 * indistinguishable from a provider-side incident, so the same self-inflicted
 * console spend limit could be misread as an internal quota gate — and the
 * retry/backoff budget was burnt against a wall that never moves. Detect the
 * account-cap shape from the upstream body so callers can label it (code
 * `PROVIDER_ACCOUNT_LIMIT`) and skip the pointless retries.
 */
export function isProviderAccountLimit(status: number | undefined, body: string | undefined): boolean {
  if (status !== 429 || !body) {
    return false;
  }

  const text = body.toLowerCase();

  return (
    text.includes('specified api usage') ||
    text.includes('regain access') ||
    text.includes('usage limit') ||
    text.includes('spend limit') ||
    text.includes('monthly limit')
  );
}

/*
 * Pull the human-readable message out of a provider error body without letting
 * a malformed/huge body throw or bloat logs. Anthropic and OpenAI both nest it
 * at `error.message`; fall back to a bounded raw slice for anything else.
 */
export function extractProviderErrorMessage(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown };
    const nested = parsed?.error?.message ?? parsed?.message;

    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim().slice(0, 500);
    }
  } catch {
    // not JSON — fall through to the raw slice
  }

  const trimmed = body.trim();

  return trimmed ? trimmed.slice(0, 500) : undefined;
}

async function retry<T>(operation: () => Promise<T>, attempts = 3, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      /*
       * Don't burn the remaining attempts (and their backoff sleeps) once the
       * client has aborted — fail fast instead.
       */
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

      if (
        typeof upstreamStatus === 'number' &&
        upstreamStatus >= 400 &&
        upstreamStatus < 500 &&
        upstreamStatus !== 429
      ) {
        throw error;
      }

      /*
       * An account usage/spend-cap 429 is a hard wall until the provider's reset
       * date — unlike a transient rate-limit 429 it will fail identically on
       * every retry. Surface it immediately (the cross-provider fallback in
       * generate() still gets its chance) instead of sleeping out the backoff.
       */
      if (upstreamStatus === 429 && (error as { code?: string })?.code === 'PROVIDER_ACCOUNT_LIMIT') {
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
    const accountLimit = isProviderAccountLimit(response.status, text);
    const providerMessage = extractProviderErrorMessage(text);

    throw Object.assign(
      aiGatewayError(accountLimit ? 'providerAccountLimit' : 'providerRequestFailed', {
        statusCode: 502,
        ...(accountLimit ? { code: 'PROVIDER_ACCOUNT_LIMIT' } : {}),
      }),
      {
        statusCode: 502,
        upstreamStatus: response.status,
        providerBody: text.slice(0, 500),
        providerMessage,
      },
    );
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(aiGatewayError('providerNonJson', { statusCode: 502 }), {
      providerBody: text.slice(0, 500),
    });
  }
}

/**
 * Erreur levee quand la reponse d'un fournisseur ne correspond a AUCUNE forme
 * connue. Elle EXISTE parce que le contraire — rendre une chaine vide — a
 * produit une perte de donnees massive et parfaitement silencieuse.
 *
 * Mesure du 2026-09-01 sur la base de production : sur 1039 messages
 * d'assistant, **564 avaient un contenu VIDE (54,3 %)**, contre 0 sur 508 cotes
 * utilisateur. A l'ecran, le fil de conversation affiche l'etiquette « Agent »
 * et sa barre d'actions, mais AUCUN texte : le panneau principal du produit ne
 * sert plus a rien, sans qu'aucune erreur ne soit jamais remontee.
 *
 * Un `return ''` en dernier recours ne distingue pas « le modele a repondu du
 * vide » de « nous n'avons pas compris la reponse ». Le premier cas est rare et
 * legitime ; le second est un bug qui doit etre bruyant.
 */
export class ReponseFournisseurIncomprise extends Error {
  readonly code = 'AI_PROVIDER_SHAPE_UNKNOWN';

  constructor(readonly formesVues: string[]) {
    super(`Forme de reponse non reconnue (cles vues: ${formesVues.join(', ') || 'aucune'})`);
    this.name = 'ReponseFournisseurIncomprise';
  }
}

function extractContent(payload: any): string {
  if (typeof payload?.choices?.[0]?.message?.content === 'string') {
    return payload.choices[0].message.content;
  }

  if (Array.isArray(payload?.content)) {
    /*
     * Anthropic rend un tableau de blocs heterogenes : `text`, mais aussi
     * `thinking`, `tool_use`, `redacted_thinking`. Ceux-la n'ont pas de `.text`.
     * Une reponse composee UNIQUEMENT de tels blocs donnait `''` — un message
     * vide persiste comme s'il avait reussi. On rend le texte concatene, et on
     * signale explicitement le cas ou aucun bloc de texte n'existait.
     */
    const blocsTexte = payload.content.filter((part: any) => typeof part?.text === 'string');

    if (blocsTexte.length === 0) {
      const types = payload.content.map((part: any) => String(part?.type ?? '?'));
      throw new ReponseFournisseurIncomprise([`content[] sans bloc texte: ${types.join('|')}`]);
    }

    return blocsTexte.map((part: any) => part.text).join('');
  }

  if (Array.isArray(payload?.candidates?.[0]?.content?.parts)) {
    return payload.candidates[0].content.parts.map((part: any) => part.text ?? '').join('');
  }

  if (typeof payload?.message?.content === 'string') {
    return payload.message.content;
  }

  /*
   * Aucune forme connue. NE PAS rendre '' : c'est exactement ce qui a rempli la
   * base de 564 messages vides. On leve, l'appelant transforme en 502 comme
   * toute autre panne de passerelle, et l'utilisateur voit une erreur au lieu
   * d'une bulle muette.
   */
  throw new ReponseFournisseurIncomprise(
    payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 8) : [typeof payload],
  );
}

/*
 * Bound the output tokens. Without a cap, an unset maxTokens lets the provider
 * run to its (often very large) model default on every call — unbounded cost and
 * latency. An unset maxTokens is now sized adaptively (estimateGatewayOutputBudget,
 * P1-a) instead of a flat default; every value is still hard-clamped to this cap.
 */
const HARD_MAX_OUTPUT_TOKENS = 32768;

/*
 * The real per-response COMPLETION ceiling for the model we're about to call.
 * Sending a `max_tokens` above it makes the provider hard-reject the whole
 * request (e.g. gpt-4-turbo: "max_tokens is too large: 8192. This model
 * supports at most 4096 completion tokens") — zero output, not a truncation.
 * Prefer the catalog's declared value; else infer from the id for the families
 * (OpenAI, Anthropic, Google) whose real ceiling is BELOW the global hard cap
 * (e.g. gpt-4-turbo 4096, Claude 3.x 4096-8192, Gemini 1.x/2.0 8192). An
 * unrecognised id keeps the global hard cap so a large-output model is never
 * silently over-clamped.
 */
export function maxCompletionTokensForModel(modelId: string | undefined): number {
  if (!modelId) {
    return HARD_MAX_OUTPUT_TOKENS;
  }

  const catalogModel = modelCatalog.find((entry) => entry.id === modelId);

  if (catalogModel?.maxCompletionTokens && catalogModel.maxCompletionTokens > 0) {
    return catalogModel.maxCompletionTokens;
  }

  const id = modelId.toLowerCase();

  if (id.includes('gpt-4.1') || id.includes('gpt-4.5')) {
    return 32768;
  }

  if (id.includes('gpt-4o')) {
    return 16384;
  }

  // GPT-4 Turbo / preview snapshots cap at 4096 — must precede the generic gpt-4.
  if (
    id.includes('gpt-4-turbo') ||
    id.includes('gpt-4-1106') ||
    id.includes('gpt-4-0125') ||
    id.includes('gpt-4-vision') ||
    id.includes('gpt-4-preview')
  ) {
    return 4096;
  }

  if (id.includes('gpt-4')) {
    return 8192; // standard gpt-4 / gpt-4-32k / gpt-4-0613
  }

  if (id.includes('gpt-3.5')) {
    return 4096;
  }

  /*
   * Anthropic — 3.5 / 3.7 cap completion at 8192; 3.x / 2.x at 4096. Newer
   * families (Claude 4/5 …) support far more, so they keep the global hard cap.
   */
  if (
    id.includes('claude-3-5') ||
    id.includes('claude-3.5') ||
    id.includes('claude-3-7') ||
    id.includes('claude-3.7')
  ) {
    return 8192;
  }

  if (id.includes('claude-3') || id.includes('claude-2') || id.includes('claude-instant')) {
    return 4096;
  }

  // Google Gemini — 1.x / 2.0 cap output at 8192; 2.5+ support far more (hard cap).
  if (id.includes('gemini-1.5') || id.includes('gemini-1.0') || id.includes('gemini-2.0')) {
    return 8192;
  }

  return HARD_MAX_OUTPUT_TOKENS;
}

export function resolveMaxOutputTokens(request: AiChatRequest, model: string): number {
  const modelCeiling = Math.min(maxCompletionTokensForModel(model), HARD_MAX_OUTPUT_TOKENS);

  /*
   * Explicit caller value wins (multi-agent lanes pin maxTokens): honour it,
   * clamped to the ceiling — byte-identical to the previous behaviour, zero
   * regression.
   */
  if (typeof request.maxTokens === 'number' && request.maxTokens > 0) {
    return Math.min(request.maxTokens, modelCeiling);
  }

  /*
   * P1-a: no explicit maxTokens → size the budget to the task instead of the old
   * flat DEFAULT_MAX_OUTPUT_TOKENS (4096). The gateway has NO auto-continuation,
   * so the classifier is biased UP (smallest class == the old 4096); a big task
   * now gets 8k–16k instead of being truncated at 4k, and a short discuss turn
   * stays at ~4k. Always clamped to the model ceiling.
   */
  const lastUserMessage = [...request.messages].reverse().find((message) => message.role === 'user')?.content;
  const estimate = estimateGatewayOutputBudget({ lastUserMessage });

  return clampGatewayOutputBudget(estimate, modelCeiling);
}

/** djb2 hash of a string → short base36. Never for billing; keys the prompt-cache routing hint. */
function hashString(text: string): string {
  let h = 5381;

  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }

  return (h >>> 0).toString(36);
}

/**
 * Stable `prompt_cache_key` for the OpenAI-compatible path (mirrors the main
 * chat's stable-head keying that drove OpenAI's 95% cache hit-rate). Keyed to the
 * SYSTEM prefix (SHARED_AGENT_SYSTEM_PREAMBLE + shared context) — byte-identical
 * across every lane of a multi-agent run and across turns — so OpenAI routes all
 * those requests to the same cache node and serves the shared prefix from cache
 * instead of re-billing it per lane. Org-scoped so two orgs never share a key.
 * `prompt_cache_key` is NOT part of the cached prefix (routing hint only), so the
 * prompt bytes are unchanged; unsupported openai-compatible upstreams ignore it.
 */
export function openAiPromptCacheKey(request: AiChatRequest): string {
  /*
   * Key on the SHARED prefix — every message EXCEPT the last (the per-lane role
   * instruction) — so all lanes of ONE multi-agent fan-out route to the same cache
   * node (OpenAI then serves the shared system + shared context from its automatic
   * prefix cache), while distinct fan-outs with a different shared context don't
   * collide on one key. Was keyed on the system block only, which missed the large
   * shared context that rides as user messages.
   */
  const shared = request.messages
    .slice(0, -1)
    .map((message) => message.content)
    .join('\n\n');

  const scope = request.organizationId ?? 'anon';

  return `ecode-${scope}-${hashString(shared)}`;
}

/** chars≈tokens/4 estimate (never for billing) — gates the shared-message breakpoint. */
function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Anthropic minimum cacheable prefix (tokens), per model. Below this Anthropic
 * silently ignores `cache_control`, so we gate the shared-message breakpoint on it.
 * Haiku's effective minimum is higher (~2048); Sonnet/Opus 1024.
 */
function anthropicCacheMinTokens(model: string): number {
  return /haiku/i.test(model) ? 2048 : 1024;
}

function openAiPayload(request: AiChatRequest, model: string, stream: boolean) {
  return {
    model,
    messages: request.messages,
    stream,
    max_tokens: resolveMaxOutputTokens(request, model),

    /*
     * Cache-affinity for the gateway OpenAI path (mirrors the main chat's `user`
     * plumbing): tag the request with the org so OpenAI routes an org's parallel
     * multi-agent lanes to the same cache shard, improving the hit-rate on the
     * shared SHARED_AGENT_SYSTEM_PREAMBLE prefix. NOT part of the prompt-cache
     * prefix (a routing hint only), so it's byte-identical for prompt caching;
     * omitted entirely when no org is bound, and ignored by non-OpenAI
     * openai-compatible upstreams (spec-safe `user` field).
     */
    ...(request.organizationId ? { user: request.organizationId } : {}),

    /*
     * `prompt_cache_key`: finer-grained cache routing than `user` — keyed to the
     * stable SYSTEM prefix so ALL lanes of a run (and successive turns) land on the
     * same cache node, the mechanism behind the main chat's 95% OpenAI hit-rate.
     * Spec-safe extra field: openai-compatible upstreams that don't support it
     * (incl. xAI) ignore it; it never changes the cached prompt bytes.
     */
    prompt_cache_key: openAiPromptCacheKey(request),
    ...optionalTemperature(request, model),
  };
}

export function anthropicPayload(request: AiChatRequest, model: string, stream: boolean) {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const messages: Array<{ role: string; content: unknown }> = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));

  /*
   * SHARED-MESSAGE breakpoint (the multi-agent win). In a fan-out the heavy shared
   * context rides as USER messages (all but the LAST, which is the per-lane role
   * instruction), so a system-only breakpoint missed it. Put a second
   * `cache_control` on the last SHARED message (messages[len-2]) so Anthropic caches
   * the whole shared prefix (system + shared messages) and re-bills it at ~10% on
   * lanes 2..N. Default (5-min) TTL: the shared context is per-turn, but all N lanes
   * fire within seconds. Gated on the shared prefix clearing the per-model minimum
   * (else Anthropic ignores it) — a no-op for the short api→gateway completion path.
   * Fail-safe: any issue leaves `messages` as plain strings (no breakpoint, still valid).
   */
  try {
    if (messages.length >= 2) {
      const sharedText = `${system}\n\n${messages
        .slice(0, -1)
        .map((m) => String(m.content))
        .join('\n\n')}`;

      if (estimateTokensFromText(sharedText) >= anthropicCacheMinTokens(model)) {
        const boundary = messages.length - 2;
        messages[boundary] = {
          role: messages[boundary].role,
          content: [{ type: 'text', text: String(messages[boundary].content), cache_control: { type: 'ephemeral' } }],
        };
      }
    }
  } catch {
    // leave messages untouched — the generation still runs, just without the extra breakpoint
  }

  return {
    model,

    /*
     * System-prefix breakpoint: the hoisted SHARED_AGENT_SYSTEM_PREAMBLE (identical
     * across lanes, re-sent each turn) or the short api→gateway system. `ttl: '1h'`
     * keeps it warm across turns; Anthropic serves it at ~10% input price. Below the
     * ~1024-token minimum this is a silent no-op; missing extended-ttl beta → 5-min
     * fallback. The shared-MESSAGE breakpoint above extends caching to the shared
     * user context (the real multi-lane cost).
     */
    system: system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }] : undefined,
    messages,
    stream,
    max_tokens: resolveMaxOutputTokens(request, model),
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
    generationConfig: {
      maxOutputTokens: resolveMaxOutputTokens(request, model),
      ...optionalTemperature(request, model),
    },
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
    const json = await readJson(
      await fetch(`${config.baseUrl.replace(/\/+$/, '')}/v1/messages`, {
        method: 'POST',
        headers: headers(config),
        body: JSON.stringify(anthropicPayload(request, model, false)),
        signal: reqSignal,
      }),
    );
    logAnthropicCacheUsage(json);

    return extractContent(json);
  }

  if (config.kind === 'gemini') {
    const key = bearer(config) ?? '';
    const url = `${config.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const base = geminiPayload(request, model) as Record<string, unknown>;

    // Explicit cachedContents: reference the stable systemInstruction by name (see gemini-cache.ts).
    const cached = await applyGeminiCache(config.baseUrl, key, model, base);

    const send = (body: Record<string, unknown>) =>
      fetch(url, { method: 'POST', headers: headers(config), body: JSON.stringify(body), signal: reqSignal });

    let response = await send(cached.payload);

    // Fail-safe: a stale/invalid cachedContent name 4xxs — retry once with the inline-system original.
    if (cached.usedCache && !response.ok) {
      invalidateGeminiCache(key, model, cached.keyText);
      await response.body?.cancel().catch(() => {});
      response = await send(base);
    }

    const json = await readJson(response);
    logGeminiCacheUsage(json);

    return extractContent(json);
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

  let body: unknown =
    config.kind === 'anthropic'
      ? anthropicPayload(request, model, true)
      : config.kind === 'gemini'
        ? geminiPayload(request, model)
        : config.kind === 'ollama'
          ? { model, messages: request.messages, stream: true }
          : openAiPayload(request, model, true);

  /*
   * Gemini explicit cachedContents (see gemini-cache.ts): swap the inline
   * systemInstruction for a `cachedContent` reference so the heavy shared
   * multi-agent prefix is billed once, not per lane. Fail-safe — a stale name
   * 4xxs and is retried inline below.
   */
  let geminiCache: { usedCache: boolean; keyText: string } | undefined;

  if (config.kind === 'gemini') {
    const applied = await applyGeminiCache(
      config.baseUrl,
      bearer(config) ?? '',
      model,
      body as Record<string, unknown>,
    );
    body = applied.payload;
    geminiCache = { usedCache: applied.usedCache, keyText: applied.keyText };
  }

  /*
   * Bound only the CONNECT/headers phase with 60s, then clear it. A fixed
   * wall-clock over the whole fetch aborted long but legitimate streaming
   * completions mid-stream at 60s. After headers arrive, the body stream is
   * governed by the caller's `signal` (client disconnect) only.
   */
  const connectController = new AbortController();
  const connectTimer = setTimeout(() => connectController.abort(), 60_000);

  const upstreamSignal = signal
    ? ((AbortSignal as any).any?.([signal, connectController.signal]) ?? connectController.signal)
    : connectController.signal;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
      signal: upstreamSignal,
    });
  } finally {
    clearTimeout(connectTimer);
  }

  /*
   * Gemini cache fail-safe: a stale/invalid cachedContent name 4xxs the whole
   * generate call — invalidate and retry ONCE with the inline-system original so
   * the stream always runs (worst case: one wasted round-trip).
   */
  if (config.kind === 'gemini' && geminiCache?.usedCache && !response.ok) {
    invalidateGeminiCache(bearer(config) ?? '', model, geminiCache.keyText);
    await response.body?.cancel().catch(() => {});
    response = await fetch(url, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(geminiPayload(request, model)),
      signal: upstreamSignal,
    });
  }

  if (!response.ok || !response.body) {
    /*
     * Read (bounded) then release the error body before throwing. An error
     * status (429/5xx, common during provider incidents) almost always carries a
     * body explaining the cause — an account usage-limit 429 puts the real
     * message ("You have reached your specified API usage limits...") there.
     * The old code cancelled the body unread, so that message was lost and the
     * throw was a bare "Provider stream failed: 429" — impossible to tell an
     * account spend cap from a provider incident. Read it (so the caller can
     * surface the actual reason) while still releasing the socket promptly.
     */
    const providerBody = await response
      .text()
      .catch(() => '')
      .then((raw) => raw.slice(0, 500));

    /*
     * Preserve the upstream status instead of masking every failure as a 502.
     * A 401/403 (bad/blocked provider key) or 429 (rate limit) must surface as
     * itself so the caller stops/raises-quota rather than treating it as a
     * transient gateway error and retrying — which re-bills input and hammers a
     * provider that already said "no". Map 4xx + 429 through verbatim; anything
     * else (5xx, network) collapses to 502 Bad Gateway.
     */
    const upstreamStatus = response.status;
    const statusCode = upstreamStatus === 429 || (upstreamStatus >= 400 && upstreamStatus < 500) ? upstreamStatus : 502;
    const accountLimit = isProviderAccountLimit(upstreamStatus, providerBody);
    const providerMessage = extractProviderErrorMessage(providerBody);

    throw Object.assign(
      aiGatewayError(accountLimit ? 'providerAccountLimit' : 'providerStreamFailed', {
        statusCode,
        code: accountLimit ? 'PROVIDER_ACCOUNT_LIMIT' : 'PROVIDER_STREAM_FAILED',
      }),
      {
        statusCode,
        upstreamStatus,
        providerBody,
        providerMessage,
        ...(accountLimit ? { code: 'PROVIDER_ACCOUNT_LIMIT' } : {}),
      },
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  /*
   * Cache-usage observability for the STREAM path (parity with providerCompletion's
   * logAnthropicCacheUsage / logGeminiCacheUsage). The multi-agent lanes stream, so
   * without this the shared-context cache-hit was invisible. The provider carries its
   * cache accounting in the FIRST SSE event — Anthropic `message_start.usage`
   * (cache_read/creation_input_tokens), Gemini `usageMetadata.cachedContentTokenCount`
   * — so we scan each full SSE line and log once. Read-only, best-effort.
   */
  let streamCacheLogged = false;

  const scanStreamCacheUsage = (rawLine: string): void => {
    if (streamCacheLogged) {
      return;
    }

    try {
      if (config.kind === 'anthropic') {
        const read = Number(rawLine.match(/"cache_read_input_tokens"\s*:\s*(\d+)/)?.[1] ?? 0);
        const write = Number(rawLine.match(/"cache_creation_input_tokens"\s*:\s*(\d+)/)?.[1] ?? 0);

        if (read > 0 || write > 0) {
          console.info(
            JSON.stringify({
              event: 'ai-gateway.anthropic.cache',
              cacheReadInputTokens: read,
              cacheCreationInputTokens: write,
              stream: true,
            }),
          );
          streamCacheLogged = true;
        }
      } else if (config.kind === 'gemini') {
        const cached = Number(rawLine.match(/"cachedContentTokenCount"\s*:\s*(\d+)/)?.[1] ?? 0);

        if (cached > 0) {
          console.info(
            JSON.stringify({ event: 'ai-gateway.gemini.cache', cachedContentTokenCount: cached, stream: true }),
          );
          streamCacheLogged = true;
        }
      }
    } catch {
      // observability only — never affect the stream
    }
  };

  /*
   * Idle (between-chunk) timeout. The connect timeout only bounds time-to-headers;
   * after that a provider that sends headers then stalls (or a half-open socket)
   * would hang this read loop — and the caller's request — indefinitely. Bound the
   * gap between chunks; on timeout the throw propagates to the finally below, which
   * cancels the upstream body. Generous default so legitimate slow generation isn't
   * cut (override via env).
   */
  const streamIdleTimeoutMs = Number(process.env.AI_GATEWAY_STREAM_IDLE_TIMEOUT_MS) || 120_000;

  try {
    const parseLine = (rawLine: string): string => {
      const line = rawLine.trim();

      if (!line || line === 'data: [DONE]') {
        return '';
      }

      const jsonLine = line.startsWith('data:') ? line.slice(5).trim() : line;

      try {
        const payload = JSON.parse(jsonLine);

        return (
          payload.choices?.[0]?.delta?.content ??
          payload.delta?.text ??
          payload.contentBlockDelta?.delta?.text ??
          payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('') ??
          payload.message?.content ??
          ''
        );
      } catch {
        /*
         * A malformed SSE chunk is not assistant content — yielding the raw JSON would
         * splice literal `{"choices":...}` text into the streamed message. Skip it.
         */
        return '';
      }
    };

    while (true) {
      let idleTimer: ReturnType<typeof setTimeout> | undefined;

      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          idleTimer = setTimeout(
            () => reject(aiGatewayError('providerStreamTimeout', { statusCode: 504 })),
            streamIdleTimeoutMs,
          );
        }),
      ]).finally(() => clearTimeout(idleTimer));

      if (done) {
        /*
         * Flush the decoder and process the trailing partial line. A provider that
         * sends its LAST SSE event without a terminating newline left that event
         * (often the final content delta) stuck in `buffer` and silently dropped.
         */
        buffer += decoder.decode();

        if (buffer.trim()) {
          const delta = parseLine(buffer);

          if (delta) {
            yield delta;
          }
        }

        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        scanStreamCacheUsage(rawLine);

        const delta = parseLine(rawLine);

        if (delta) {
          yield delta;
        }
      }
    }
  } finally {
    /*
     * Cancel the upstream body so a client disconnect (generator .return()) or error
     * tears down the provider request instead of leaving it streaming (cost/socket leak).
     */
    await reader.cancel().catch(() => {});
  }
}

export class AiGateway {
  models(plan: AiPlanKey = 'free') {
    return modelCatalog.filter((model) => model.plans.includes(plan));
  }

  async health() {
    // Reflect admin-set DB keys in the health/configured flags too.
    await hydrateProviderKeyOverrides();

    return Promise.all(
      providerConfigs()
        .map(withProviderKeyOverride)
        .map(async (config) => {
          if (!configured(config)) {
            return { provider: config.id, healthy: false, configured: false };
          }

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1500);

          try {
            const response = await fetch(
              config.kind === 'ollama' ? `${config.baseUrl.replace(/\/+$/, '')}/api/tags` : config.baseUrl,
              { method: 'GET', signal: controller.signal },
            );

            // Release the probe connection — the body is never read.
            await response.body?.cancel().catch(() => {});

            return { provider: config.id, healthy: response.status < 500, configured: true };
          } catch {
            return { provider: config.id, healthy: false, configured: true };
          } finally {
            /*
             * Clear the abort timer on EVERY path (the catch branch previously left
             * a dangling timer to fire against an already-settled controller).
             */
            clearTimeout(timer);
          }
        }),
    );
  }

  route(request: AiChatRequest) {
    const plan = request.plan ?? 'free';

    /*
     * Plan-fallback (multi-agent lanes): a lane must NEVER hard-fail because the
     * user's selected model isn't on their plan — that failed every lane and made
     * the whole consensus REJECTED (0% agreement) on Free. When planFallback is
     * set and the requested model is missing/blocked for the plan, transparently
     * resolve to the plan's default allowed model (e.g. Free → gpt-4.1-mini) so the
     * lane runs and the run succeeds. The main chat leaves planFallback unset and
     * keeps the hard plan-gate below.
     */
    if (request.planFallback) {
      const requested = request.model ? modelCatalog.find((model) => model.id === request.model) : undefined;

      /*
       * GUARD-RAIL (2026-07-13): an UNKNOWN model must NEVER be silently downgraded
       * to a foreign default — that hands the user a different model than they chose
       * without telling them (a product lie, and it broke the cache measurement).
       * The catalog is now synced with the web providers, so a real chosen model is
       * always `requested`; a still-unknown id is genuinely invalid → fail loud.
       */
      if (request.model && !requested) {
        throw aiGatewayError('modelUnknown', {
          statusCode: 400,
          code: 'AI_MODEL_UNKNOWN',
          values: { model: request.model },
        });
      }

      /*
       * KNOWN but plan-blocked (e.g. a Free user's lane requested a premium model):
       * resolve to the plan's default allowed model so the multi-agent run still
       * succeeds instead of failing the whole consensus. This is legitimate PLAN
       * gating (the user's plan can't use that tier) — surfaced to the user via the
       * web `agentModesGated` annotation — not a silent substitution of an available
       * model. Distinct from the UNKNOWN case above, which now fails loud.
       */
      if (requested && !requested.plans.includes(plan)) {
        const planDefault = this.models(plan)[0];

        if (planDefault) {
          request = { ...request, model: planDefault.id, provider: planDefault.provider };
        }
      }
    }

    const requestedModel = request.model ? modelCatalog.find((model) => model.id === request.model) : undefined;

    let selectedModel: AiModel;

    if (request.model && !requestedModel) {
      /*
       * Uncatalogued requested model (a real provider model we don't price). The
       * old code fell back to the CHEAPEST plan model for plan-check + pricing,
       * then sent the arbitrary model to the provider — a plan bypass + cost
       * undercount (expensive model billed at the cheap rate). Instead, gate and
       * price it against the MOST EXPENSIVE plan-allowed catalog model of the
       * target provider: the caller must be entitled to that provider's top model,
       * and billing is conservative (never cheaper than the catalog).
       */
      const providerId = request.provider;

      /*
       * An uncatalogued model id is provider-specific and meaningless to the
       * wrong upstream. With no explicit provider we can't know which one owns
       * it: the old code picked the most-expensive plan model across ALL
       * providers and sent the unknown id there, so the primary call always 4xx'd
       * and a fallback silently swapped in a different (mis-billed) model. Require
       * the caller to name the provider instead of guessing.
       */
      if (!providerId) {
        throw aiGatewayError('providerRequired', {
          statusCode: 400,
          code: 'AI_PROVIDER_REQUIRED',
        });
      }

      const candidates = modelCatalog.filter((model) => model.plans.includes(plan) && model.provider === providerId);

      if (candidates.length === 0) {
        throw aiGatewayError('modelPlanBlocked', {
          statusCode: 403,
          code: 'AI_MODEL_PLAN_BLOCKED',
        });
      }

      selectedModel = candidates.reduce((most, model) =>
        model.inputCentsPerMillion + model.outputCentsPerMillion >
        most.inputCentsPerMillion + most.outputCentsPerMillion
          ? model
          : most,
      );
    } else if (!request.model && request.provider) {
      /*
       * Provider specified but NO model (a valid shape). The old code fell to
       * this.models(plan)[0] — the global first plan model (gpt-4.1/openai) —
       * regardless of the requested provider, so primaryProviderId (the requested
       * provider) then got sent a foreign provider's model id and 4xx'd. Pick the
       * first plan-allowed model OF THE REQUESTED PROVIDER instead.
       */
      const providerDefault = this.models(plan).find((model) => model.provider === request.provider);

      if (!providerDefault) {
        throw aiGatewayError('providerModelPlanBlocked', {
          statusCode: 403,
          code: 'AI_MODEL_PLAN_BLOCKED',
        });
      }

      selectedModel = providerDefault;
    } else {
      selectedModel = requestedModel ?? this.models(plan)[0] ?? modelCatalog[0];
    }

    if (!selectedModel.plans.includes(plan)) {
      throw aiGatewayError('modelPlanBlocked', {
        statusCode: 403,
        code: 'AI_MODEL_PLAN_BLOCKED',
      });
    }

    const providerIds = [
      request.provider ?? selectedModel.provider,
      ...((process.env.AI_FALLBACK_PROVIDERS?.split(',').filter(Boolean) as AiProviderId[] | undefined) ?? []),
    ];

    /*
     * Dedup: if the primary provider is also listed in AI_FALLBACK_PROVIDERS, the
     * same provider would otherwise be retried back-to-back (wasted call + double
     * cost) instead of falling through to a genuinely different fallback.
     */
    const providers = [...new Set(providerIds)]
      .map((providerId) => providerConfigs().find((config) => config.id === providerId))
      .filter((config): config is ProviderConfig => Boolean(config))
      /*
       * Apply any admin-set DB key/baseUrl (populated by an awaited hydrate in
       * complete()/stream()) BEFORE the `configured` filter, so a DB-only key
       * (no env var) still counts the provider as usable.
       */
      .map(withProviderKeyOverride)
      .filter(configured);

    if (providers.length === 0) {
      throw aiGatewayError('providerUnavailable', {
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
  private _resolveModelForProvider(
    provider: ProviderConfig,
    request: AiChatRequest,
    selectedModel: AiModel,
    plan: AiPlanKey,
    primaryProviderId: AiProviderId,
  ): { id: string; catalog?: AiModel } | undefined {
    /*
     * The primary provider honors the explicitly requested model id — but ONLY
     * when that model actually belongs to this provider. If the caller overrode
     * `provider` to one that doesn't match the model's provider, sending the
     * foreign model id would 4xx at the upstream; fall through to a
     * provider-appropriate catalog model instead (same as a fallback provider).
     */
    if (provider.id === primaryProviderId && (!request.model || selectedModel.provider === provider.id)) {
      return { id: request.model ?? selectedModel.id, catalog: selectedModel };
    }

    const catalog = modelCatalog.find((model) => model.provider === provider.id && model.plans.includes(plan));

    if (catalog) {
      return { id: catalog.id, catalog };
    }

    /*
     * No catalog model for this provider is allowed on the request's plan. The
     * old fallback to provider.defaultModel bypassed plan gating (defaultModel
     * may be a higher tier the plan can't use) AND mis-billed: with no catalog,
     * downstream cost estimation fell back to the PRIMARY model's price. Signal
     * "no eligible model" so the caller skips this provider instead.
     */
    return undefined;
  }

  async complete(request: AiChatRequest, signal?: AbortSignal) {
    await ensureGptTokenizer();

    /*
     * DB-first key resolution: refresh the decrypted-key cache (TTL-guarded)
     * before routing so route() enriches configs with any admin-set key.
     */
    await hydrateProviderKeyOverrides();

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

        const resolved = this._resolveModelForProvider(provider, request, routed.model, plan, primaryProviderId);

        if (!resolved) {
          lastError = aiGatewayError('providerModelPlanBlocked', {
            statusCode: 403,
            code: 'AI_PROVIDER_MODEL_PLAN_BLOCKED',
          });
          continue;
        }

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

    // DB-first key resolution (see complete()).
    await hydrateProviderKeyOverrides();

    const routed = this.route(request);
    const locale = normalizeAiGatewayLocale(request.locale) ?? 'en';
    const plan = request.plan ?? 'free';
    const primaryProviderId = request.provider ?? routed.model.provider;
    const inputTokens = countTokens(request.messages);

    let lastError: unknown;

    for (const provider of routed.providers) {
      /*
       * Stop before trying another provider if the client already went away —
       * otherwise an aborted stream keeps falling through and re-billing.
       */
      if (signal?.aborted) {
        return;
      }

      /*
       * Remap the model id for THIS provider, exactly as complete() does. The old
       * code sent `request.model ?? routed.model.id` (the primary provider's id)
       * verbatim to every fallback provider, so cross-provider fallback always
       * failed with an unknown-model error instead of recovering.
       */
      const resolved = this._resolveModelForProvider(provider, request, routed.model, plan, primaryProviderId);

      if (!resolved) {
        lastError = aiGatewayError('providerModelPlanBlocked', {
          statusCode: 403,
          code: 'AI_PROVIDER_MODEL_PLAN_BLOCKED',
        });
        continue;
      }

      /*
       * Reset per provider so a failed provider's partial deltas aren't concatenated
       * onto the fallback provider's output (garbled message + double-counted cost).
       */
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
        /*
         * A client abort surfaces as a throw here — don't fall through to a
         * fallback provider (which would re-bill); just stop.
         */
        if (signal?.aborted) {
          return;
        }

        lastError = error;

        /*
         * If partial deltas already reached the client, the fallback provider's
         * fresh full generation would be appended onto that partial text,
         * producing a garbled, concatenated message. Emit the error and stop
         * rather than fall through once any output has been streamed.
         */
        if (yieldedDelta) {
          yield {
            type: 'error',
            provider: provider.id,
            model: resolved.id,
            error: localizedAiGatewayError(error, locale, 'providerStreamFailed'),
          };

          return;
        }

        /*
         * No output yet, but only fall through to a fallback provider when the
         * failure is actually retryable (5xx / 429 / network). A non-retryable
         * client 4xx (400 malformed request, 401/403 auth/plan) will fail the same
         * way on every provider — retrying just re-counts input tokens and re-bills
         * the request N times. Surface it immediately instead.
         */
        const upstreamStatus = (error as { upstreamStatus?: unknown }).upstreamStatus;

        const isNonRetryable4xx =
          typeof upstreamStatus === 'number' && upstreamStatus >= 400 && upstreamStatus < 500 && upstreamStatus !== 429;

        if (isNonRetryable4xx) {
          yield {
            type: 'error',
            provider: provider.id,
            model: resolved.id,
            error: localizedAiGatewayError(error, locale, 'providerStreamFailed'),
          };

          return;
        }
      }
    }

    // All providers exhausted without producing output — now surface the failure.
    if (lastError) {
      yield {
        type: 'error',
        provider: primaryProviderId,
        model: routed.model.id,
        error: localizedAiGatewayError(lastError, locale, 'providerStreamFailed'),
      };
    }
  }
}
