/**
 * @vitest-environment node
 */
import { createDataStream } from 'ai';
import { describe, expect, it } from 'vitest';
import { buildChatStreamErrorPayload, ChatQuotaError, serializeChatStreamError } from './api.chat.quota-error';

/**
 * Mirror of Chat.client.handleError: it JSON-parses the AI SDK error part's
 * message and merges it into the alert info, deriving statusCode + a visible
 * message. The regression these tests guard: a quota block used to `return`
 * 200 with only an annotation, so the SDK emitted NO error part, handleError
 * never ran, and the user saw a silent stall.
 */
function clientHandleError(message: string): { statusCode: number; message: string } {
  const info = { statusCode: 500, message: 'An unexpected error occurred' };

  try {
    const parsed = JSON.parse(message) as { error?: unknown; message?: string; statusCode?: number };

    if (parsed.error || parsed.message) {
      return {
        statusCode: typeof parsed.statusCode === 'number' ? parsed.statusCode : info.statusCode,
        message: typeof parsed.message === 'string' ? parsed.message : info.message,
      };
    }
  } catch {
    return { statusCode: info.statusCode, message };
  }

  return info;
}

async function readErrorPart(stream: ReadableStream<string>): Promise<string | undefined> {
  const reader = stream.getReader();

  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += value;
  }

  const line = buffer.split('\n').find((entry) => entry.startsWith('3:'));

  if (!line) {
    return undefined;
  }

  /* `3:"<escaped json>"` — the part value is itself a JSON string. */
  return JSON.parse(line.slice(2)) as string;
}

describe('buildChatStreamErrorPayload', () => {
  it('serialises a quota error with its statusCode, code, and message', () => {
    const error = new ChatQuotaError('AI quota exceeded for this organization.', 429, 'QUOTA_EXCEEDED');
    const payload = buildChatStreamErrorPayload(error);

    expect(payload).toEqual({
      error: true,
      message: 'AI quota exceeded for this organization.',
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      isRetryable: false,
    });
  });

  it('falls back to a generic retryable 500 for non-quota errors', () => {
    const payload = buildChatStreamErrorPayload(new Error('boom'));

    expect(payload).toMatchObject({ error: true, message: 'boom', statusCode: 500, isRetryable: true });
  });

  it('handles non-Error throws without crashing', () => {
    const payload = buildChatStreamErrorPayload('weird');

    /*
     * A non-Error throw has no usable message, so the payload falls back to the
     * classified default copy (streamErrorCodeMessages) for the unknown code.
     */
    expect(payload.message).toBe('An unknown streaming error occurred.');
    expect(payload.statusCode).toBe(500);
  });
});

describe('serializeChatStreamError → client parse round-trip', () => {
  it('produces a string the client handleError parses back into the quota status + message', () => {
    const serialized = serializeChatStreamError(
      new ChatQuotaError('AI quota exceeded for this organization.', 429, 'QUOTA_EXCEEDED'),
    );

    const parsed = clientHandleError(serialized);

    expect(parsed.statusCode).toBe(429);
    expect(parsed.message).toBe('AI quota exceeded for this organization.');
  });
});

describe('createDataStream quota throw → error part', () => {
  it('emits a parseable error part (not a silent 200) when execute throws ChatQuotaError', async () => {
    /*
     * Reproduces the route wiring: createDataStream({ execute, onError }). The
     * route throws ChatQuotaError on a quota block; onError serialises it. If the
     * route reverted to `return`, no `3:` error part would be emitted and this
     * assertion (and the client alert) would be gone.
     */
    const stream = createDataStream({
      onError: (error) => serializeChatStreamError(error),
      async execute() {
        throw new ChatQuotaError('AI quota exceeded for this organization.', 429, 'QUOTA_EXCEEDED');
      },
    });

    const partValue = await readErrorPart(stream);

    expect(partValue).toBeDefined();

    const parsed = clientHandleError(partValue as string);

    expect(parsed.statusCode).toBe(429);
    expect(parsed.message).toContain('quota');
  });
});
