/**
 * Cross-turn prompt-cache breakpoint sentinel.
 *
 * The Bolt system prompt is a STABLE head (the large, turn-invariant instruction
 * block) followed by a VARIABLE tail (orchestration exec-context, the CONTEXT
 * BUFFER of project files, the chat summary, locked-file lists). Anthropic caches
 * a prefix up to a `cache_control` breakpoint; if the whole `system` string is
 * wrapped as one block the cached entry is rewritten every turn (the tail always
 * changes), so there is almost no cross-turn cache READ.
 *
 * This sentinel marks the head/tail boundary. `stream-text` inserts it right
 * after the stable Bolt prompt and BEFORE the first appended variable block, and
 * ONLY for Anthropic-family providers (native Anthropic, or an Anthropic-backed
 * model routed through OpenRouter). The caching `fetch` middleware splits the
 * `system` on it, sets the breakpoint on the head, and STRIPS the sentinel from
 * the wire body. Non-Anthropic providers never receive it, so their request
 * bytes are byte-identical to before this change.
 *
 * The value is a byte sequence that never appears in a real prompt.
 */
export const ANTHROPIC_CACHE_BREAKPOINT = ' __ECODE_CACHE_BP__ ';

/**
 * True when the resolved provider/model is Anthropic-family and therefore should
 * receive the {@link ANTHROPIC_CACHE_BREAKPOINT} sentinel: native Anthropic, or
 * an Anthropic-backed model served through OpenRouter (id contains
 * `anthropic`/`claude`). Every other provider returns false → no sentinel → the
 * system string stays exactly as it is today.
 */
export function shouldInsertCacheBreakpoint(providerName: string | undefined, modelId: string | undefined): boolean {
  if (providerName === 'Anthropic') {
    return true;
  }

  if (providerName === 'OpenRouter' && typeof modelId === 'string' && /anthropic|claude/i.test(modelId)) {
    return true;
  }

  return false;
}
