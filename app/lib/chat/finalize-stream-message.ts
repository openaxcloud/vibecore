import type { Message } from 'ai';

/** Consume the actual final bytes before scheduling cleanup of unclosed file actions. */
export function finalizeStreamMessage(
  message: Message,
  messages: Message[],
  parseMessages: (messages: Message[], isLoading: boolean) => void,
  finishFileActions: (messageId: string) => void,
): void {
  const found = messages.some((entry) => entry.id === message.id);

  // Never inject a late callback message into a different transcript.
  if (!found) {
    return;
  }

  const snapshot = messages.map((entry) => (entry.id === message.id ? message : entry));

  // Do not synthesize close tags here: genuine EOF leftovers must remain distinguishable.
  parseMessages(snapshot, true);
  finishFileActions(message.id);
}

/** Process only the active sampled transcript, preserving Stop and navigation boundaries. */
export function processStreamSnapshot(options: {
  messages: Message[];
  initialMessages: Message[];
  isLoading: boolean;
  isCurrent: () => boolean;
  isAborted: () => boolean;
  parseMessages: (messages: Message[], isLoading: boolean) => void;
  finishFileActions: (messageId: string) => void;
}): boolean {
  if (!options.isCurrent()) {
    return false;
  }

  const { messages, initialMessages, isLoading, parseMessages, finishFileActions } = options;

  if (options.isAborted()) {
    // Stop blocks new actions, not restoration of the transcript marked as reloaded.
    if (initialMessages.length > 0) {
      parseMessages(initialMessages, false);
    }

    return false;
  }

  if (!isLoading) {
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

    if (lastAssistant && !initialMessages.some((message) => message.id === lastAssistant.id)) {
      finalizeStreamMessage(lastAssistant, messages, parseMessages, finishFileActions);
    }
  }

  parseMessages(messages, isLoading);

  return true;
}
