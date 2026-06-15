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
