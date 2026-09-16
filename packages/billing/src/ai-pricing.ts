/**
 * AI model pricing tables, shared between services/ai-gateway (which routes
 * outbound LLM traffic) and services/api (which charges the cost ledger
 * after the Remix chat route finishes). Keeping a single source of truth
 * here means a price change lands in one file instead of three.
 *
 * Prices are quoted in **cents per million tokens** (×10000 = cents-per-token,
 * /100 = dollars) and are conservatively rounded up: better to bill 0.1¢
 * too high than to silently absorb the cost.
 */

export type AiPlanKey = 'free' | 'pro' | 'business' | 'enterprise' | 'self-host';
export type AiProviderId =
  | 'openai'
  | 'anthropic'
  | 'google-gemini'
  | 'openrouter'
  | 'mistral'
  | 'groq'
  | 'xai'
  | 'ollama';

export interface AiModel {
  id: string;
  provider: AiProviderId;
  displayName: string;
  plans: AiPlanKey[];
  /** Cents per 1,000,000 input tokens. */
  inputCentsPerMillion: number;
  /** Cents per 1,000,000 output tokens. */
  outputCentsPerMillion: number;
  /** Max combined context window the model supports, in tokens. */
  contextWindow: number;
}

export const aiModelCatalog: AiModel[] = [
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
    id: 'claude-3-5-haiku-latest',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Haiku',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 80,
    outputCentsPerMillion: 400,
    contextWindow: 200_000,
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    plans: ['pro', 'business', 'enterprise'],
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 5',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 500,
    outputCentsPerMillion: 2500,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.8',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 500,
    outputCentsPerMillion: 2500,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-fable-5',
    provider: 'anthropic',
    displayName: 'Claude Fable 5',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 1000,
    outputCentsPerMillion: 5000,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    plans: ['free', 'pro', 'business', 'enterprise'],
    inputCentsPerMillion: 100,
    outputCentsPerMillion: 500,
    contextWindow: 200_000,
  },
  {
    id: 'gpt-5.6-sol',
    provider: 'openai',
    displayName: 'GPT-5.6 Sol',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 500,
    outputCentsPerMillion: 3000,
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-opus-4-7',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.7',
    plans: ['business', 'enterprise'],
    inputCentsPerMillion: 1500,
    outputCentsPerMillion: 7500,
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

/** Lookup by id; provider is used as a tiebreaker when the id is ambiguous (e.g. OpenRouter re-hosting). */
export function findAiModel(id: string, provider?: AiProviderId): AiModel | undefined {
  if (provider) {
    const exact = aiModelCatalog.find((m) => m.id === id && m.provider === provider);
    if (exact) {
      return exact;
    }
  }
  return aiModelCatalog.find((m) => m.id === id);
}

export interface ComputeCostInput {
  model: string;
  provider?: AiProviderId;
  inputTokens: number;
  outputTokens: number;
}

export interface ComputedCost {
  matched: boolean;
  model: AiModel | undefined;
  costCents: number;
}

/**
 * Compute the cost in **cents** (rounded up to the next cent) for an
 * (input, output) token pair against the catalog. When the model isn't in
 * the catalog we return `matched: false` with `costCents: 0` so the caller
 * can choose to log + zero-bill rather than crashing on every new model.
 */
export function computeAiCostCents(input: ComputeCostInput): ComputedCost {
  const model = findAiModel(input.model, input.provider);

  if (!model) {
    return { matched: false, model: undefined, costCents: 0 };
  }

  /*
   * Harden token counts: only the `record-usage` HTTP route zod-validates these,
   * but the gateway path (and any other caller) can pass non-finite or negative
   * values. `Math.ceil(NaN)` is NaN and a negative outputTokens would under-bill,
   * both of which flow straight into the cost ledger. Clamp to finite, non-negative.
   */
  const inputTokens = Number.isFinite(input.inputTokens) ? Math.max(0, input.inputTokens) : 0;
  const outputTokens = Number.isFinite(input.outputTokens) ? Math.max(0, input.outputTokens) : 0;

  const costCents = Math.ceil(
    (inputTokens * model.inputCentsPerMillion + outputTokens * model.outputCentsPerMillion) / 1_000_000,
  );

  return { matched: true, model, costCents };
}
