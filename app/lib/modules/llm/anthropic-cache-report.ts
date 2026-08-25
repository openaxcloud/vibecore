/**
 * Client-safe indirection for reporting Anthropic off-wire cache usage.
 *
 * The provider normally surfaces cache tokens now; the wire middleware remains a
 * compatibility fail-safe and reports them here only for the route's zero-metadata
 * fallback. The provider module (`providers/anthropic.ts`) is reachable from the
 * CLIENT bundle through the model registry, so it must NOT import `node:async_hooks`.
 * This tiny module has zero node builtins: it forwards to a handler that the
 * SERVER-ONLY ALS module installs at import time. On the client the handler stays
 * null and every call is a silent no-op.
 */
export type AnthropicCacheHandler = (readTokens: number, writeTokens: number) => void;

let handler: AnthropicCacheHandler | null = null;

/** Installed once by the server-only ALS module; never called on the client. */
export function setAnthropicCacheHandler(next: AnthropicCacheHandler | null): void {
  handler = next;
}

/** Called by the provider's wire reader; routes to the server ALS tally (or no-ops). */
export function reportAnthropicCacheUsage(readTokens: number, writeTokens: number): void {
  try {
    handler?.(readTokens, writeTokens);
  } catch {
    // Reporting must never affect the generation stream.
  }
}

/**
 * Provider-agnostic alias. The per-request ALS tally is not Anthropic-specific —
 * only ONE provider runs per request, so the Google wire reader (which surfaces
 * `cachedContentTokenCount` the SDK drops) reports read tokens through the same
 * indirection. Kept as a named alias so callers read clearly and the certified
 * Anthropic call site is untouched.
 */
export const reportWireCacheUsage = reportAnthropicCacheUsage;
