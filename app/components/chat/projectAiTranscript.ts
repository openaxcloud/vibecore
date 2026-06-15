import type { Message } from 'ai';

export type ProjectAiMessageResponse = {
  id?: string;
  role?: string;
  content?: string;
};

export type ProjectAiMessagesResponse = {
  messages?: ProjectAiMessageResponse[];
};

const persistedMessageRoles = new Set(['system', 'user', 'assistant', 'tool']);

export function projectAiMessagesToChatMessages(messages: ProjectAiMessageResponse[] = []): Message[] {
  return messages
    .map((message, index) => {
      const role = String(message.role);

      if (!persistedMessageRoles.has(role)) {
        return undefined;
      }

      return {
        id: message.id || `${role}:${index}`,
        role,
        content: message.content ?? '',
      } as Message;
    })
    .filter((message): message is Message => Boolean(message));
}
