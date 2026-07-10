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

type Logger = { info: (...args: unknown[]) => void };

/**
 * Wrap `fetch` so each OpenAI /chat/completions request emits a `wire.payload`
 * INFO line with the real on-the-wire sizes. Never alters the request.
 */
export function createOpenAiWireDiagnosticFetch(baseFetch: typeof fetch, logger: Logger): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      const url = typeof input === 'string' ? input : ((input as Request)?.url ?? String(input));

      if (init && typeof init.body === 'string' && url.includes('/chat/completions')) {
        const shape = describeOpenAiWireBody(init.body);

        if (shape) {
          logger.info(JSON.stringify({ event: 'wire.payload', provider: 'openai', ...shape }));
        }
      }
    } catch {
      // Diagnostics must never affect the request.
    }

    return baseFetch(input as any, init);
  };
}
