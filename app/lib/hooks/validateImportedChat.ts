import { generateId } from 'ai';

/**
 * Normalize and validate a single chat record from an imported chats export.
 *
 * This is intentionally a *pure, per-chat* validator: it returns the cleaned
 * chat object when the record is structurally valid, or `null` when it is not
 * (missing `id`, non-array `messages`, or any message missing `role`/`content`).
 *
 * Why return `null` instead of throwing: the import write loop iterates every
 * chat and skips+counts invalid ones — exactly like the per-`put` ConstraintError
 * skip path. Throwing here would abort the WHOLE import (the previous behaviour),
 * so a single legacy/partial chat lacking a `role` on one message would lose ALL
 * other chats in a large export. Returning `null` lets the valid chats import.
 *
 * @param chat An untrusted chat record parsed from the import file.
 * @returns The normalized chat record, or `null` if the record is invalid.
 */
export function validateImportedChat(chat: any): {
  id: string;
  description: string;
  messages: any[];
  timestamp: string;
  urlId: string | null;
  metadata: any;
} | null {
  if (!chat || typeof chat !== 'object') {
    return null;
  }

  if (!chat.id || !Array.isArray(chat.messages)) {
    return null;
  }

  const validatedMessages: any[] = [];

  for (const msg of chat.messages) {
    /*
     * content can legitimately be an empty string (e.g. an assistant message
     * carrying only tool/function calls), so only reject genuinely-missing
     * content — not falsy-but-valid values.
     */
    if (!msg || typeof msg !== 'object' || !msg.role || msg.content === undefined || msg.content === null) {
      // One malformed message invalidates the chat; skip the whole chat.
      return null;
    }

    validatedMessages.push({
      id: msg.id || generateId(),
      role: msg.role,
      content: msg.content,
      name: msg.name,
      function_call: msg.function_call,
      timestamp: msg.timestamp || Date.now(),

      /*
       * Preserve structured message data on import so an exported chat
       * round-trips losslessly (tool calls, reasoning/parts, attachments).
       */
      ...(msg.annotations !== undefined ? { annotations: msg.annotations } : {}),
      ...(msg.parts !== undefined ? { parts: msg.parts } : {}),
      ...(msg.experimental_attachments !== undefined ? { experimental_attachments: msg.experimental_attachments } : {}),
      ...(msg.toolInvocations !== undefined ? { toolInvocations: msg.toolInvocations } : {}),
      ...(msg.createdAt !== undefined ? { createdAt: msg.createdAt } : {}),
    });
  }

  return {
    id: chat.id,
    description: chat.description || '',
    messages: validatedMessages,
    timestamp: chat.timestamp || new Date().toISOString(),
    urlId: chat.urlId || null,
    metadata: chat.metadata || null,
  };
}
