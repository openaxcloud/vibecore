/**
 * Pure helpers for surfacing a pre-flight chat-quota rejection to the client.
 *
 * Background: when a project hits its AI quota, the chat route used to write a
 * `progress` + `{type:'error'}` message annotation and then `return` from the
 * data-stream `execute` callback with a clean HTTP 200. Because nothing threw,
 * the AI SDK never emitted a stream error part, so `useChat`'s `onError` (and
 * therefore Chat.client's `handleError` → "Quota Exceeded" alert) never fired.
 * The user saw the streaming spinner vanish with zero explanation.
 *
 * The fix throws a {@link ChatQuotaError} on the quota path. The data stream's
 * `onError` serialises it via {@link serializeChatStreamError} into a JSON
 * string that the AI SDK writes as an error part. Chat.client's `handleError`
 * then `JSON.parse`s that string, picks up `statusCode`/`message`, and renders
 * the existing quota alert.
 */

/** Structured failure raised on the pre-flight quota-block path. */
export class ChatQuotaError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'ChatQuotaError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface SerializedChatStreamError {
  error: true;
  message: string;
  statusCode: number;
  code: string;
  isRetryable: boolean;
}

/**
 * Build the JSON-string payload the AI SDK emits as a stream error part.
 *
 * The shape mirrors the route's top-level catch error response so the client's
 * `handleError` parses it identically: `error.message` is JSON-parsed and its
 * `statusCode`/`message` merged into the alert. A quota rejection is marked
 * non-retryable (re-sending the same prompt will just hit the same wall).
 */
export function buildChatStreamErrorPayload(error: unknown): SerializedChatStreamError {
  if (error instanceof ChatQuotaError) {
    return {
      error: true,
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
      isRetryable: false,
    };
  }

  const message = error instanceof Error && error.message ? error.message : 'An unexpected error occurred';

  return {
    error: true,
    message,
    statusCode: 500,
    code: 'STREAM_ERROR',
    isRetryable: true,
  };
}

/**
 * Serialise a stream-execute failure into the error-part string consumed by the
 * AI SDK's data-stream `onError`. Returns a JSON string so the client can
 * `JSON.parse` it back into a structured alert.
 */
export function serializeChatStreamError(error: unknown): string {
  return JSON.stringify(buildChatStreamErrorPayload(error));
}
