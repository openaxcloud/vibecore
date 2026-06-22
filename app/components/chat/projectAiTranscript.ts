import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import type { Message } from 'ai';

export type ProjectAiToolCallResponse = {
  id?: string;
  name?: string;
  input?: unknown;
  output?: unknown;
  createdAt?: string;
};

export type ProjectAiMessageResponse = {
  id?: string;
  role?: string;
  content?: string;
  toolCalls?: ProjectAiToolCallResponse[];
};

export type ProjectAiMessagesResponse = {
  messages?: ProjectAiMessageResponse[];
};

const persistedMessageRoles = new Set(['system', 'user', 'assistant', 'tool']);

function projectAiToolCallsToParts(
  toolCalls: ProjectAiToolCallResponse[] | undefined,
  messageId: string,
): ToolInvocationUIPart[] {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return [];
  }

  return toolCalls.map((toolCall, index) => {
    const toolName = typeof toolCall.name === 'string' && toolCall.name.trim() ? toolCall.name.trim() : 'tool';

    return {
      type: 'tool-invocation',
      toolInvocation: {
        state: 'result',
        toolCallId: toolCall.id || `${messageId}:tool:${index}`,
        toolName,
        args: toolCall.input ?? {},
        result: toolCall.output ?? null,
      },
    };
  });
}

export function projectAiMessagesToChatMessages(messages: ProjectAiMessageResponse[] = []): Message[] {
  return messages
    .map((message, index) => {
      const role = String(message.role);

      if (!persistedMessageRoles.has(role)) {
        return undefined;
      }

      const id = message.id || `${role}:${index}`;
      const parts = projectAiToolCallsToParts(message.toolCalls, id);

      return {
        id,
        role: role === 'tool' ? 'assistant' : role,
        content: message.content ?? '',
        ...(parts.length > 0 ? { parts } : {}),
      } as Message;
    })
    .filter((message): message is Message => Boolean(message));
}

/**
 * Maximum number of automatic transcript-hydration retries before we give up and
 * surface a manual retry affordance. A cold/GC'd workspace can 502 a few times
 * before the agent pod is reachable, so a small bounded auto-retry recovers the
 * common transient case without spinning forever.
 */
export const MAX_TRANSCRIPT_HYDRATION_RETRIES = 3;

export type TranscriptHydrationRetryPlan = {
  shouldRetry: boolean;
  delayMs: number;
};

/**
 * Pure decision for whether a failed transcript hydration should be retried
 * automatically, and after what backoff delay. Exponential backoff capped so a
 * returning user is never left staring at a silently-empty chat panel.
 *
 * @param attempt - zero-based index of the attempt that just failed.
 */
export function planTranscriptHydrationRetry(attempt: number): TranscriptHydrationRetryPlan {
  if (!Number.isFinite(attempt) || attempt < 0 || attempt >= MAX_TRANSCRIPT_HYDRATION_RETRIES) {
    return { shouldRetry: false, delayMs: 0 };
  }

  const delayMs = Math.min(8000, 1000 * 2 ** attempt);

  return { shouldRetry: true, delayMs };
}
