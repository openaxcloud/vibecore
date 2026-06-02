import type { Message } from 'ai';

/**
 * Compute the message list for an IDE-mode "Regenerate from this prompt"
 * (rewind) action.
 *
 * Given the current conversation and the id of the assistant message the user
 * clicked, returns the list truncated to just before that message — so that a
 * subsequent `reload()` regenerates a fresh assistant response from the
 * preceding user prompt. Returns `null` when the rewind is not valid:
 *  - the message id is not present,
 *  - it is the very first message (nothing precedes it), or
 *  - no user prompt remains to regenerate from.
 *
 * Kept pure (no React/SDK state) so the rewind semantics are unit-testable.
 */
export function computeRewindTruncation(messages: Message[], messageId: string): Message[] | null {
  const index = messages.findIndex((message) => message.id === messageId);

  if (index <= 0) {
    return null;
  }

  const truncated = messages.slice(0, index);

  if (!truncated.some((message) => message.role === 'user')) {
    return null;
  }

  return truncated;
}
