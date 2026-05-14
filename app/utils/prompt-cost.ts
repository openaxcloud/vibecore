/**
 * Best-effort token + USD estimate for the project-creation prompt.
 *
 * Tokens: each LLM ships its own tokenizer (Claude uses one, GPT uses
 * tiktoken, Gemini another) and shipping the right tokenizer per model would
 * add a megabyte of bundle weight for an estimate. We use the industry
 * "1 token ≈ 4 characters of English" heuristic, which is within 10–20 % of
 * the real value for typical product descriptions and is the same rule the
 * OpenAI dashboard ships. The estimate is explicitly labelled "~" in the UI.
 *
 * Pricing: stored in a hand-maintained table dated `LAST_REVIEWED`. It only
 * needs to cover the models the project-creation form actually exposes. When
 * a model is missing from the table, `estimatePromptCost` returns
 * `hasPricing: false` and the caller falls back to showing the token count
 * alone.
 */

/** Date the pricing table was last reconciled against provider pages. */
export const PROMPT_PRICING_LAST_REVIEWED = '2026-05-14';

export interface ModelPricing {
  /** USD per 1 000 000 input tokens. */
  inputPer1MUsd: number;

  /** USD per 1 000 000 output tokens. Currently unused by the form but kept for completeness. */
  outputPer1MUsd: number;
}

/**
 * Lower-cased exact-match table. We also fall back to substring matches
 * (`claude-opus-4-7-*` aliases all resolve to the canonical row) via
 * `resolveModelPricing` so dated suffixes don't break the lookup.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // Anthropic Claude 4.x family (USD / 1M tokens, public list price 2026-05).
  'claude-opus-4-7': { inputPer1MUsd: 15, outputPer1MUsd: 75 },
  'claude-opus-4-6': { inputPer1MUsd: 15, outputPer1MUsd: 75 },
  'claude-sonnet-4-6': { inputPer1MUsd: 3, outputPer1MUsd: 15 },
  'claude-sonnet-4-5': { inputPer1MUsd: 3, outputPer1MUsd: 15 },
  'claude-haiku-4-5': { inputPer1MUsd: 0.8, outputPer1MUsd: 4 },

  // OpenAI GPT-4.x family.
  'gpt-4o': { inputPer1MUsd: 5, outputPer1MUsd: 15 },
  'gpt-4o-mini': { inputPer1MUsd: 0.15, outputPer1MUsd: 0.6 },
  'gpt-4-turbo': { inputPer1MUsd: 10, outputPer1MUsd: 30 },
  o1: { inputPer1MUsd: 15, outputPer1MUsd: 60 },
  'o1-mini': { inputPer1MUsd: 3, outputPer1MUsd: 12 },

  // Google Gemini.
  'gemini-1.5-pro': { inputPer1MUsd: 1.25, outputPer1MUsd: 5 },
  'gemini-1.5-flash': { inputPer1MUsd: 0.075, outputPer1MUsd: 0.3 },
  'gemini-2.0-flash': { inputPer1MUsd: 0.075, outputPer1MUsd: 0.3 },
};

const PRICING_LOOKUP_PREFIXES: Readonly<Array<{ prefix: string; key: keyof typeof MODEL_PRICING }>> = [
  { prefix: 'claude-opus-4-7', key: 'claude-opus-4-7' },
  { prefix: 'claude-opus-4-6', key: 'claude-opus-4-6' },
  { prefix: 'claude-sonnet-4-6', key: 'claude-sonnet-4-6' },
  { prefix: 'claude-sonnet-4-5', key: 'claude-sonnet-4-5' },
  { prefix: 'claude-haiku-4-5', key: 'claude-haiku-4-5' },
  { prefix: 'gpt-4o-mini', key: 'gpt-4o-mini' },
  { prefix: 'gpt-4o', key: 'gpt-4o' },
  { prefix: 'gpt-4-turbo', key: 'gpt-4-turbo' },
  { prefix: 'o1-mini', key: 'o1-mini' },
  { prefix: 'o1', key: 'o1' },
  { prefix: 'gemini-1.5-pro', key: 'gemini-1.5-pro' },
  { prefix: 'gemini-1.5-flash', key: 'gemini-1.5-flash' },
  { prefix: 'gemini-2.0-flash', key: 'gemini-2.0-flash' },
];

/**
 * Resolve a (possibly versioned / suffixed) model name to a pricing row.
 * Returns `null` for unknown models so the UI can degrade to "tokens only".
 */
export function resolveModelPricing(modelName: string | null | undefined): ModelPricing | null {
  if (!modelName || typeof modelName !== 'string') {
    return null;
  }

  const lower = modelName.trim().toLowerCase();

  if (!lower) {
    return null;
  }

  if (MODEL_PRICING[lower]) {
    return MODEL_PRICING[lower];
  }

  for (const { prefix, key } of PRICING_LOOKUP_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return MODEL_PRICING[key];
    }
  }

  return null;
}

/**
 * Industry-standard chars/4 token heuristic. Floors at 0 for empty input.
 */
export function estimatePromptTokens(text: string | null | undefined): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export interface PromptCostEstimate {
  tokens: number;

  /**
   * Estimated USD cost of feeding `text` as INPUT to `modelName`. Null when
   * the model has no entry in `MODEL_PRICING`.
   */
  inputUsd: number | null;
  hasPricing: boolean;

  /** The pricing row used, if any — exposed for the UI tooltip. */
  pricing: ModelPricing | null;
}

export function estimatePromptCost(
  text: string | null | undefined,
  modelName: string | null | undefined,
): PromptCostEstimate {
  const tokens = estimatePromptTokens(text);
  const pricing = resolveModelPricing(modelName);

  if (!pricing) {
    return { tokens, inputUsd: null, hasPricing: false, pricing: null };
  }

  const inputUsd = (tokens * pricing.inputPer1MUsd) / 1_000_000;

  return { tokens, inputUsd, hasPricing: true, pricing };
}

/**
 * Format a USD cost for the status-line label. Sub-cent amounts collapse to
 * "<$0.01" so the user never sees a misleading "$0.00".
 */
export function formatEstimatedCost(inputUsd: number): string {
  if (inputUsd <= 0) {
    return '$0.00';
  }

  if (inputUsd < 0.01) {
    return '<$0.01';
  }

  if (inputUsd < 1) {
    return `$${inputUsd.toFixed(3)}`;
  }

  return `$${inputUsd.toFixed(2)}`;
}
