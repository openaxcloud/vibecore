/**
 * Log-only diagnostic `fetch` middleware for the OpenAI provider.
 *
 * Purpose: reconcile a puzzling gap — `prompt.fingerprint` measures the assembled
 * system prompt at ~27k chars (~3300+ tokens), yet OpenAI reports promptTokens
 * ~2400 total. Those can't both be true if the full system reaches the wire. This
 * middleware logs the size of the body ACTUALLY sent to OpenAI's
 * /chat/completions, so we can tell whether OpenAI receives the long stable
 * prefix (→ cache 0 is genuine provider best-effort) or a truncated/transformed
 * one (→ a real prefix bug to fix).
 *
 * Behaviour is unchanged: the request is forwarded verbatim; only a `wire.payload`
 * INFO line is emitted. Any parse/shape surprise is swallowed.
 */

/** Cheap deterministic djb2 hash (same scheme as stream-text's fingerprintPrompt) for cross-log comparison. */
export function hashString(text: string): string {
  let hash = 5381;

  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }

  return (hash >>> 0).toString(16);
}

/** Extract the size shape of an OpenAI chat-completions request body for logging. */
export function describeOpenAiWireBody(bodyText: string): {
  messagesCount: number;
  systemChars: number;
  systemHash: string;
  firstUserChars: number;
  bodyChars: number;
} | null {
  const parsed = JSON.parse(bodyText) as {
    messages?: Array<{ role?: string; content?: unknown }>;
  };

  if (!parsed || !Array.isArray(parsed.messages)) {
    return null;
  }

  const asText = (content: unknown): string => {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('');
    }

    return '';
  };

  const systemMsg = parsed.messages.find((m) => m.role === 'system');
  const firstUser = parsed.messages.find((m) => m.role === 'user');
  const systemText = systemMsg ? asText(systemMsg.content) : '';

  return {
    messagesCount: parsed.messages.length,
    systemChars: systemText.length,
    systemHash: hashString(systemText),
    firstUserChars: firstUser ? asText(firstUser.content).length : 0,
    bodyChars: bodyText.length,
  };
}

/**
 * Fingerprint of the EFFECTIVE OpenAI cached prefix, not just the system string.
 *
 * OpenAI's automatic prompt-cache prefix is, in wire order: `tools` (the whole
 * array, sent BEFORE system on the chat/completions path) → the `system` message
 * → the leading conversation messages → an optional `response_format`. Any one of
 * those drifting turn-to-turn silently invalidates the cache. `prompt.fingerprint`
 * (stream-text) only hashed `system`, so a flip in the tool ordering or a tool
 * description edit was invisible. This hashes each segment SEPARATELY so a log
 * diff across two consecutive same-conversation turns pinpoints which segment
 * moved.
 *
 * `firstMessagesHash` is the hash of the canonical JSON of every message EXCEPT
 * the final one — i.e. the append-only conversation prefix that is expected to be
 * byte-stable across consecutive turns; the last (current user) message is the
 * only per-turn-variable message and is deliberately excluded.
 *
 * Pure + total: any parse/shape surprise returns null; never throws.
 */
export function fingerprintOpenAiPrefix(bodyText: string): {
  toolsHash: string;
  toolsCount: number;
  systemHash: string;
  firstMessagesHash: string;
  responseFormatHash: string | null;
  effectivePrefixHash: string;
} | null {
  let parsed: {
    messages?: Array<{ role?: string; content?: unknown }>;
    tools?: unknown[];
    response_format?: unknown;
  };

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }

  if (!parsed || !Array.isArray(parsed.messages)) {
    return null;
  }

  const tools = Array.isArray(parsed.tools) ? parsed.tools : [];

  // Canonical JSON preserving array + key order exactly as sent (that order IS the cache-sensitive signal).
  const toolsHash = hashString(JSON.stringify(tools));
  const toolsCount = tools.length;

  const systemMsg = parsed.messages.find((m) => m.role === 'system');
  const systemHash = hashString(JSON.stringify(systemMsg ? (systemMsg.content ?? null) : null));

  // Stable prefix = every message except the final (current) turn.
  const prefixMessages = parsed.messages.length > 1 ? parsed.messages.slice(0, -1) : [];
  const firstMessagesHash = hashString(JSON.stringify(prefixMessages));

  const responseFormatHash =
    parsed.response_format === undefined ? null : hashString(JSON.stringify(parsed.response_format));

  const effectivePrefixHash = hashString(
    `${toolsHash}|${systemHash}|${firstMessagesHash}|${responseFormatHash ?? '∅'}`,
  );

  return { toolsHash, toolsCount, systemHash, firstMessagesHash, responseFormatHash, effectivePrefixHash };
}

type Logger = { info: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };

export interface OpenAiWireDiagnosticOptions {
  /** Stable per-conversation id (chatId). Enables the consecutive-turn drift warning. */
  cacheAffinityKey?: string;
}

/**
 * Last-seen prefix hashes per conversation, so we can WARN when the cached prefix
 * (tools order / system) flips between two consecutive turns of the SAME chat —
 * the smoking gun for a cache invalidation. Module-scoped: persists across turns
 * within a process, best-effort only.
 */
const lastPrefixByConversation = new Map<string, { toolsHash: string; systemHash: string }>();

/**
 * Wrap `fetch` so each OpenAI /chat/completions request emits a `wire.payload`
 * INFO line with the real on-the-wire sizes AND a `prefix.fingerprint` INFO line
 * with the per-segment hashes of the effective cached prefix. Log-only: never
 * alters the request.
 */
export function createOpenAiWireDiagnosticFetch(
  baseFetch: typeof fetch,
  logger: Logger,
  options: OpenAiWireDiagnosticOptions = {},
): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      const url = typeof input === 'string' ? input : ((input as Request)?.url ?? String(input));

      if (init && typeof init.body === 'string' && url.includes('/chat/completions')) {
        const shape = describeOpenAiWireBody(init.body);

        if (shape) {
          logger.info(JSON.stringify({ event: 'wire.payload', provider: 'openai', ...shape }));
        }

        const prefix = fingerprintOpenAiPrefix(init.body);

        if (prefix) {
          logger.info(
            JSON.stringify({
              event: 'prefix.fingerprint',
              provider: 'openai',
              conversation: options.cacheAffinityKey ?? null,
              ...prefix,
            }),
          );

          // Consecutive-turn drift detection (log-only), keyed by conversation id.
          const convId = options.cacheAffinityKey;

          if (convId) {
            const prev = lastPrefixByConversation.get(convId);

            if (prev && (prev.toolsHash !== prefix.toolsHash || prev.systemHash !== prefix.systemHash)) {
              (logger.warn ?? logger.info)(
                JSON.stringify({
                  event: 'prefix.drift',
                  provider: 'openai',
                  conversation: convId,
                  toolsHashChanged: prev.toolsHash !== prefix.toolsHash,
                  systemHashChanged: prev.systemHash !== prefix.systemHash,
                  prevToolsHash: prev.toolsHash,
                  toolsHash: prefix.toolsHash,
                  prevSystemHash: prev.systemHash,
                  systemHash: prefix.systemHash,
                }),
              );
            }

            lastPrefixByConversation.set(convId, { toolsHash: prefix.toolsHash, systemHash: prefix.systemHash });
          }
        }
      }
    } catch {
      // Diagnostics must never affect the request.
    }

    return baseFetch(input as any, init);
  };
}
