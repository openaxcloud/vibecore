import { AsyncLocalStorage } from 'node:async_hooks';

import { setAnthropicCacheHandler } from '~/lib/modules/llm/anthropic-cache-report';

/**
 * Per-request Anthropic cache tally, threaded via AsyncLocalStorage so the
 * provider's wire reader (which runs in the request's async context) can
 * accumulate off-wire cache tokens that `@ai-sdk/anthropic@0.0.39` throws away.
 * SERVER-ONLY (imports `node:async_hooks`) — the client-reachable provider talks
 * to it only through the node-free `anthropic-cache-report` indirection.
 */
export interface AnthropicCacheTally {
  read: number;
  write: number;
}

export const anthropicCacheStore = new AsyncLocalStorage<AnthropicCacheTally>();

/*
 * Install the handler exactly once (module side-effect on first server import).
 * The provider calls `reportAnthropicCacheUsage`, which lands here and accumulates
 * into whatever request's tally is currently on the async stack. Outside a
 * `run()` scope `getStore()` is undefined and the report is dropped.
 */
setAnthropicCacheHandler((readTokens, writeTokens) => {
  const tally = anthropicCacheStore.getStore();

  if (tally) {
    tally.read += readTokens;
    tally.write += writeTokens;
  }
});
