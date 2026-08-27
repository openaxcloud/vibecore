import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1 } from 'ai';
import { reportAnthropicCacheUsage } from '~/lib/modules/llm/anthropic-cache-report';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import { ANTHROPIC_CACHE_BREAKPOINT } from '~/lib/modules/llm/cache-breakpoint';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

const anthropicCacheLogger = createScopedLogger('anthropic-cache');

/**
 * DIAGNOSTIC — `@ai-sdk/anthropic@0.0.39` reads ONLY `input_tokens`/`output_tokens`
 * from the wire and DISCARDS `cache_read_input_tokens` / `cache_creation_input_tokens`,
 * so our normalized telemetry is blind to Anthropic caching (it reports
 * cachedPromptTokens=0 even on a real hit). To PROVE the cache live we tee the SSE
 * response stream and read Anthropic's raw usage off the wire (message_start carries
 * the cache fields). Read-only, best-effort, memory-capped: it must NEVER break or
 * delay the generation stream the SDK consumes.
 */
function teeAndLogAnthropicWireUsage(response: Response): Response {
  try {
    if (!response.ok || !response.body) {
      return response;
    }

    const [forward, inspect] = response.body.tee();

    void (async () => {
      try {
        const reader = inspect.getReader();
        const decoder = new TextDecoder();

        let buf = '';

        const usage: Record<string, number> = {};
        const keys = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];

        /*
         * The cache tokens arrive in `message_start` — the FIRST SSE event — so we
         * report them into the request's ALS tally as soon as they appear (well
         * before onFinish fires at stream end), exactly once per stream, so the
         * normalized telemetry can fill cachedPromptTokens/cacheWriteTokens that the
         * SDK dropped. `reportAnthropicCacheUsage` no-ops off a request context.
         */
        let reported = false;

        for (;;) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buf += decoder.decode(value, { stream: true });

          for (const key of keys) {
            const m = buf.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));

            if (m) {
              usage[key] = Number(m[1]);
            }
          }

          if (
            !reported &&
            ('cache_read_input_tokens' in usage || 'cache_creation_input_tokens' in usage) &&
            'input_tokens' in usage
          ) {
            reportAnthropicCacheUsage(usage.cache_read_input_tokens || 0, usage.cache_creation_input_tokens || 0);
            reported = true;
          }

          // Cap memory; already-found values persist in `usage`.
          if (buf.length > 200_000) {
            buf = buf.slice(-50_000);
          }
        }

        anthropicCacheLogger.info(JSON.stringify({ event: 'anthropic.wire.usage', usage }));
      } catch {
        // diagnostics only — swallow
      }
    })();

    // Strip encoding/length headers that no longer describe the re-wrapped stream.
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(forward, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

/**
 * Builds the model-picker label for an Anthropic dynamic model.
 *
 * The Anthropic /v1/models response may omit (or null) `display_name` for some
 * entries. Mirror the Google provider's behaviour and fall back to the model id
 * so the selector never renders a literal "undefined (200k context)" entry.
 */
export function buildAnthropicModelLabel(model: { display_name?: string | null; id: string }, contextWindow: number) {
  return `${model.display_name || model.id} (${Math.floor(contextWindow / 1000)}k context)`;
}

/**
 * Wrap `fetch` so every Anthropic `/v1/messages` call caches its stable prefix.
 *
 * The installed `@ai-sdk/anthropic@0.0.39` predates the SDK's `cacheControl`
 * plumbing (it flattens `system` to a plain string and exposes no way to mark a
 * cache breakpoint), so we inject the breakpoint at the wire level instead of
 * upgrading the provider SDK (which would touch the certified OpenAI path).
 *
 * The request body's `system` — the large, turn-stable prefix (Bolt system
 * prompt + CONTEXT BUFFER + orchestration/memory blocks appended by
 * stream-text) — is rewritten from a string into one or two text blocks carrying
 * `cache_control`. Anthropic then serves that prefix from cache on the next turn
 * / each of the 8 auto-continuation segments at ~10% of the input price, instead
 * of re-billing it in full every time. Below Anthropic's ~1024-token cache
 * minimum this is a silent no-op (no error), and the response stream is never
 * touched, so generation output is byte-for-byte unchanged. Any parse/shape
 * surprise falls through to the original request untouched.
 *
 * Cross-turn split (P0-a): when `stream-text` inserted the
 * {@link ANTHROPIC_CACHE_BREAKPOINT} sentinel, the `system` is the STABLE Bolt
 * head + sentinel + the VARIABLE tail (orchestration exec-context, CONTEXT
 * BUFFER, chat summary, locked files). We split on the sentinel into two cache
 * blocks: the head with `ttl: '1h'` so it survives ACROSS user turns, and the
 * tail with the default ephemeral (5min) TTL so the full context still caches
 * across the continuation segments WITHIN one generation. The sentinel itself is
 * stripped from both texts — the model never sees it. Without the sentinel we
 * keep the original single-block behaviour (backward safe).
 *
 * `ttl: '1h'` requires the `extended-cache-ttl-2025-04-11` beta, added to the
 * `anthropic-beta` header alongside the prompt-caching beta.
 */
/**
 * Anthropic minimum cacheable prompt length, in tokens, per model. Below this
 * Anthropic silently IGNORES `cache_control` (no error, just no cache), so we gate
 * the message-history breakpoint on it to avoid spending one of the 4 breakpoints on
 * a too-small conversation prefix. Values from the Anthropic prompt-caching docs
 * (Rév.3 guide): Haiku = 2048, Sonnet / Opus = 1024. The stable SYSTEM head
 * (~5k tokens) always clears this, so the system breakpoints are unconditional.
 */
const ANTHROPIC_CACHE_MIN_TOKENS: Array<[RegExp, number]> = [
  [/haiku/i, 2048],
  [/opus|sonnet/i, 1024],
];

export function anthropicCacheMinTokens(model: string | undefined): number {
  if (typeof model === 'string') {
    for (const [pattern, min] of ANTHROPIC_CACHE_MIN_TOKENS) {
      if (pattern.test(model)) {
        return min;
      }
    }
  }

  return 1024;
}

/** Cheap chars≈tokens/4 estimate (never for billing) — gates the message breakpoint. */
function estimateBlockTokens(content: unknown): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }

  if (Array.isArray(content)) {
    let chars = 0;

    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        chars += (part as { text: string }).text.length;
      }
    }

    return Math.ceil(chars / 4);
  }

  return 0;
}

/**
 * Set `cache_control: ephemeral` on the LAST text block of a message, converting a
 * string content to block form when needed. Returns true if a breakpoint was set.
 */
function markMessageCacheBreakpoint(message: Record<string, unknown>): boolean {
  if (typeof message.content === 'string') {
    if (message.content.trim().length === 0) {
      return false;
    }

    message.content = [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' } }];

    return true;
  }

  if (Array.isArray(message.content) && message.content.length > 0) {
    for (let i = message.content.length - 1; i >= 0; i--) {
      const block = message.content[i];

      if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
        (block as Record<string, unknown>).cache_control = { type: 'ephemeral' };

        return true;
      }
    }
  }

  return false;
}

export function createAnthropicCachingFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      if (init && typeof init.body === 'string' && init.body.includes('"system"')) {
        const parsed = JSON.parse(init.body);

        let mutated = false;

        if (parsed && typeof parsed.system === 'string' && parsed.system.includes(ANTHROPIC_CACHE_BREAKPOINT)) {
          /*
           * System split (2 breakpoints): stable head cached 1h (cross-turn),
           * variable tail cached 5min (across the continuation segments of this turn).
           */
          const [rawHead, ...rawTailParts] = parsed.system.split(ANTHROPIC_CACHE_BREAKPOINT);
          const head = rawHead.trim();
          const tail = rawTailParts.join(ANTHROPIC_CACHE_BREAKPOINT).trim();

          const blocks: Array<Record<string, unknown>> = [];

          if (head.length > 0) {
            blocks.push({ type: 'text', text: head, cache_control: { type: 'ephemeral', ttl: '1h' } });
          }

          if (tail.length > 0) {
            blocks.push({ type: 'text', text: tail, cache_control: { type: 'ephemeral' } });
          }

          if (blocks.length > 0) {
            parsed.system = blocks;
            mutated = true;
          }
        } else if (parsed && typeof parsed.system === 'string' && parsed.system.trim().length > 0) {
          // No sentinel (non-split path, e.g. below the cache minimum): single block, unchanged behaviour.
          parsed.system = [{ type: 'text', text: parsed.system, cache_control: { type: 'ephemeral' } }];
          mutated = true;
        }

        /*
         * MESSAGE-HISTORY breakpoint (up to 2 more, total ≤ Anthropic's max of 4):
         * the anchored-window design keeps every message except the LAST (the
         * per-turn volatile trailing block) byte-stable turn-to-turn, so a
         * cache_control on the last STABLE message (messages[len-2]) caches the whole
         * conversation prefix cross-turn — the same win the anchored window gives
         * OpenAI's auto-cache. Gated on the prefix clearing the per-model minimum so a
         * tiny conversation doesn't waste a breakpoint (Anthropic would ignore it).
         */
        if (Array.isArray(parsed.messages) && parsed.messages.length >= 2) {
          const minTokens = anthropicCacheMinTokens(parsed.model);
          const prefix = parsed.messages.slice(0, -1);

          const prefixTokens = prefix.reduce(
            (sum: number, m: unknown) => sum + estimateBlockTokens((m as { content?: unknown })?.content),
            0,
          );

          if (prefixTokens >= minTokens) {
            const boundary = parsed.messages[parsed.messages.length - 2] as Record<string, unknown>;

            if (markMessageCacheBreakpoint(boundary)) {
              mutated = true;
            }
          }
        }

        if (mutated) {
          init = { ...init, body: JSON.stringify(parsed) };
        }
      }
    } catch {
      /*
       * Never let a body rewrite break the generation: on any JSON/shape issue,
       * send the request exactly as the SDK built it (no caching, but no failure).
       */
    }

    const response = await baseFetch(input as any, init);

    // Only the streaming /v1/messages call carries usage worth tracing.
    const url = typeof input === 'string' ? input : ((input as Request)?.url ?? String(input));

    if (url.includes('/v1/messages')) {
      return teeAndLogAnthropicWireUsage(response);
    }

    return response;
  };
}

export default class AnthropicProvider extends BaseProvider {
  name = 'Anthropic';
  getApiKeyLink = 'https://console.anthropic.com/settings/keys';

  config = {
    apiTokenKey: 'ANTHROPIC_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      /*
       * Platform default generation model (agent routing card v3). 1M context,
       * 128k output. Opus 5 runs ADAPTIVE THINKING BY DEFAULT — unlike Opus 4.8,
       * omitting the `thinking` param no longer means "no thinking" — and those
       * thinking tokens share the same `max_tokens` ceiling as the visible answer.
       * `@ai-sdk/anthropic@0.0.39` exposes no `thinking` knob, so we cannot pin it
       * off; the declared 128k completion ceiling plus the existing
       * finishReason:'length' auto-continue is what keeps a long build from
       * stopping mid-file.
       */
      name: 'claude-opus-5',
      label: 'Claude Opus 5',
      provider: 'Anthropic',
      maxTokenAllowed: 1_000_000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-fable-5',
      label: 'Claude Fable 5',
      provider: 'Anthropic',
      maxTokenAllowed: 1_000_000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-opus-4-8',
      label: 'Claude Opus 4.8',
      provider: 'Anthropic',
      maxTokenAllowed: 1_000_000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      provider: 'Anthropic',
      maxTokenAllowed: 1_000_000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-sonnet-4-5-20250929',
      label: 'Claude Sonnet 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-opus-4-7',
      label: 'Claude Opus 4.7',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 32000,
    },
    {
      name: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      // Alias id (no date suffix) — the agent routing card addresses Haiku by alias.
      name: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://api.anthropic.com/v1/models`, {
      headers: {
        'x-api-key': `${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      signal: this.createTimeoutSignal(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.name} models: ${response.status} ${response.statusText}`);
    }

    const res = (await response.json()) as any;
    const staticModelIds = this.staticModels.map((m) => m.name);

    const data = (Array.isArray(res?.data) ? res.data : []).filter(
      (model: any) => model.type === 'model' && !staticModelIds.includes(model.id),
    );

    return data.map((m: any) => {
      // Anthropic's Models API exposes input and output limits separately.
      let contextWindow = 32000; // default fallback

      if (m.max_input_tokens) {
        contextWindow = m.max_input_tokens;
      } else if (
        m.id?.includes('claude-opus-5') ||
        m.id?.includes('claude-opus-4-8') ||
        m.id?.includes('claude-sonnet-4-6')
      ) {
        contextWindow = 1_000_000;
      } else if (m.id?.includes('claude-3-5-sonnet')) {
        contextWindow = 200000; // Claude 3.5 Sonnet has 200k context
      } else if (m.id?.includes('claude-3-haiku')) {
        contextWindow = 200000; // Claude 3 Haiku has 200k context
      } else if (m.id?.includes('claude-3-opus')) {
        contextWindow = 200000; // Claude 3 Opus has 200k context
      } else if (m.id?.includes('claude-3-sonnet')) {
        contextWindow = 200000; // Claude 3 Sonnet has 200k context
      }

      let maxCompletionTokens = 64000;

      if (m.max_tokens) {
        maxCompletionTokens = m.max_tokens;
      } else if (m.id?.includes('claude-opus-4-8')) {
        maxCompletionTokens = 128000; // Claude Opus 4.8 synchronous Messages API limit
      } else if (m.id?.includes('claude-opus-4')) {
        maxCompletionTokens = 32000; // Claude 4 Opus: 32K output limit
      } else if (m.id?.includes('claude-sonnet-4') || m.id?.includes('claude-haiku-4')) {
        maxCompletionTokens = 64000; // Claude 4 Sonnet: 64K output limit
      } else if (m.id?.includes('claude-4')) {
        maxCompletionTokens = 32000; // Other Claude 4 models: conservative 32K limit
      }

      return {
        name: m.id,
        label: buildAnthropicModelLabel(m, contextWindow),
        provider: this.name,
        maxTokenAllowed: contextWindow,
        maxCompletionTokens,
      };
    });
  }

  getModelInstance: (options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1 = (options) => {
    const { apiKeys, providerSettings, serverEnv, model } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });
    const anthropic = createAnthropic({
      apiKey,

      /*
       * `prompt-caching-2024-07-31` enables the `cache_control` breakpoint that
       * createAnthropicCachingFetch injects into the request body;
       * `extended-cache-ttl-2025-04-11` enables the `ttl: '1h'` on the stable head
       * block (cross-turn cache). Kept alongside the existing 128k-output beta
       * (comma-separated, all honoured). If the account lacks the extended-ttl
       * beta the ttl field is ignored and the head falls back to the default
       * 5-minute ephemeral cache — never an error.
       */
      headers: {
        'anthropic-beta': 'output-128k-2025-02-19,prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11',
      },
      fetch: createAnthropicCachingFetch(globalThis.fetch),
    });

    return anthropic(model);
  };
}
