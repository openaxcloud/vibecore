/**
 * Default ceiling for completion tokens advertised for Together models when the
 * API does not expose a more specific limit.
 */
export const TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS = 8192;

/**
 * Resolve the completion-token budget for a Together model.
 *
 * Together's `/models` response may include an explicit output cap (under a few
 * possible field names). When present we honour it; otherwise we fall back to the
 * default ceiling. In all cases the result is clamped to the model's context
 * window (`ctx`) so we never advertise a completion budget larger than the model
 * can actually accept — a model with, say, a 4k context cannot emit 8192
 * completion tokens.
 *
 * @param model Raw model metadata from the Together `/models` endpoint.
 * @param ctx   The resolved context window (maxTokenAllowed) for the model.
 */
export function resolveTogetherCompletionTokens(model: unknown, ctx: number): number {
  const safeCtx = Number.isFinite(ctx) && ctx > 0 ? Math.floor(ctx) : TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS;

  const advertised = readOutputCap(model);
  const desired = advertised ?? TOGETHER_DEFAULT_MAX_COMPLETION_TOKENS;

  return Math.min(desired, safeCtx);
}

/**
 * Try to read an explicit output/completion-token cap from Together model
 * metadata. Together has used a few field names over time, so we probe the most
 * likely ones and accept the first valid positive integer.
 */
function readOutputCap(model: unknown): number | undefined {
  if (!model || typeof model !== 'object') {
    return undefined;
  }

  const record = model as Record<string, unknown>;

  const candidates = [
    record.max_completion_tokens,
    record.max_output_tokens,
    record.max_tokens,
    (record.config as Record<string, unknown> | undefined)?.max_output_tokens,
    (record.config as Record<string, unknown> | undefined)?.max_tokens,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate);
    }
  }

  return undefined;
}
