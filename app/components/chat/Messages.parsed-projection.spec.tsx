// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

const received = vi.hoisted(() => vi.fn());
vi.mock('./AssistantMessage', () => ({
  AssistantMessage: (props: unknown) => {
    received(props);
    return null;
  },
}));
vi.mock('~/lib/persistence/db', () => ({ forkChat: vi.fn() }));
vi.mock('~/lib/persistence/useChatHistory', () => ({ db: undefined, chatId: { get: () => undefined } }));

const { Messages } = await import('./Messages.client');
afterEach(cleanup);

it('relays an intentionally empty projection while retaining original parts for patch review', () => {
  const parts = [{ type: 'text' as const, text: '<boltArtifact id="private"><boltAction type="file">code' }];
  render(
    <MemoryRouter>
      <Messages
        messages={[
          {
            id: 'project-message',
            role: 'assistant',
            content: '',
            contentIsParsed: true,
            parts,
          },
        ]}
        addToolResult={vi.fn()}
      />
    </MemoryRouter>,
  );
  expect(received).toHaveBeenCalledWith(expect.objectContaining({ content: '', contentIsParsed: true, parts }));
});

it('Chat binds the parser projection by message identity and never substitutes raw content for empty output', () => {
  const source = readFileSync('app/components/chat/Chat.client.tsx', 'utf8');
  expect(source).toContain('content: parsedMessages[message.id] ?? message.content');
  expect(source).toContain('contentIsParsed: parsedMessages[message.id] !== undefined');
});
