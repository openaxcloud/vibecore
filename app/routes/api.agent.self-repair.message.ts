/*
 * Pure helper for the AST self-repair route. Phase 0 #2.
 *
 * The self-repair prompt built by `buildSelfRepairPrompt` (hunk-validate.ts)
 * carries no `[Model: ...]` / `[Provider: ...]` tag, so `streamText` (which
 * derives the target model/provider solely from those tags in the first user
 * message) silently falls back to the gateway DEFAULT_MODEL/DEFAULT_PROVIDER.
 *
 * That means a project generated on e.g. Anthropic gets repaired on the
 * default provider — a different/weaker model than the rest of the generation,
 * and an outright 502 when the user's `apiKeys` cookie only holds the chosen
 * provider's key.
 *
 * To pin self-repair to the same model/provider that produced the file, the
 * caller may forward `model` / `provider`; this helper prepends the tag in the
 * EXACT shape `extractPropertiesFromMessage` expects:
 *   MODEL_REGEX    = /^\[Model: (.*?)\]\n\n/      (must be at the very start)
 *   PROVIDER_REGEX = /\[Provider: (.*?)\]\n\n/
 *
 * When neither is supplied the prompt is returned untouched, preserving the
 * prior default-routing behavior.
 */
export function buildSelfRepairMessageContent(prompt: string, model?: string | null, provider?: string | null): string {
  const modelTag = typeof model === 'string' && model.trim().length > 0 ? model.trim() : null;
  const providerTag = typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : null;

  /*
   * MODEL_REGEX is anchored with `^`, so the Model tag must lead. PROVIDER_REGEX
   * is not anchored, so the Provider tag can follow. extractPropertiesFromMessage
   * strips both tags before the prompt reaches the model, so only emit a tag we
   * actually have a value for — never a hollow `[Model: ]` that resolves to ''.
   */
  let prefix = '';

  if (modelTag) {
    prefix += `[Model: ${modelTag}]\n\n`;
  }

  if (providerTag) {
    prefix += `[Provider: ${providerTag}]\n\n`;
  }

  return prefix + prompt;
}
