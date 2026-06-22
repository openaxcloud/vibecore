import { describe, it, expect } from 'vitest';
import { validateImportedChat } from '~/lib/hooks/validateImportedChat';

describe('validateImportedChat', () => {
  it('returns a normalized chat for a valid record', () => {
    const result = validateImportedChat({
      id: 'chat-1',
      description: 'hello',
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      timestamp: '2026-01-01T00:00:00.000Z',
      urlId: 'u1',
      metadata: { foo: 'bar' },
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('chat-1');
    expect(result!.description).toBe('hello');
    expect(result!.urlId).toBe('u1');
    expect(result!.metadata).toEqual({ foo: 'bar' });
    expect(result!.messages).toHaveLength(1);
    expect(result!.messages[0]).toMatchObject({ id: 'm1', role: 'user', content: 'hi' });
  });

  it('accepts an empty-string content (assistant tool-call message)', () => {
    const result = validateImportedChat({
      id: 'chat-2',
      messages: [{ role: 'assistant', content: '', function_call: { name: 'x' } }],
    });

    expect(result).not.toBeNull();
    expect(result!.messages[0].content).toBe('');
    expect(result!.messages[0].function_call).toEqual({ name: 'x' });
  });

  it('preserves structured message fields for lossless round-trip', () => {
    const result = validateImportedChat({
      id: 'chat-3',
      messages: [
        {
          role: 'assistant',
          content: 'done',
          annotations: ['a'],
          parts: [{ type: 'text', text: 'done' }],
          toolInvocations: [{ toolName: 't' }],
          experimental_attachments: [{ name: 'f' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.messages[0]).toMatchObject({
      annotations: ['a'],
      parts: [{ type: 'text', text: 'done' }],
      toolInvocations: [{ toolName: 't' }],
      experimental_attachments: [{ name: 'f' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('generates a message id when one is missing', () => {
    const result = validateImportedChat({
      id: 'chat-4',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).not.toBeNull();
    expect(typeof result!.messages[0].id).toBe('string');
    expect(result!.messages[0].id.length).toBeGreaterThan(0);
  });

  it('returns null when the chat id is missing', () => {
    expect(validateImportedChat({ messages: [{ role: 'user', content: 'hi' }] })).toBeNull();
  });

  it('returns null when messages is not an array', () => {
    expect(validateImportedChat({ id: 'chat-5', messages: 'nope' })).toBeNull();
  });

  it('returns null when a message is missing role (the regression that lost whole imports)', () => {
    expect(validateImportedChat({ id: 'chat-6', messages: [{ content: 'orphan' }] })).toBeNull();
  });

  it('returns null when a message has genuinely-missing content (null/undefined)', () => {
    expect(validateImportedChat({ id: 'chat-7', messages: [{ role: 'user', content: null }] })).toBeNull();
    expect(validateImportedChat({ id: 'chat-8', messages: [{ role: 'user' }] })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(validateImportedChat(null)).toBeNull();
    expect(validateImportedChat(undefined)).toBeNull();
    expect(validateImportedChat('chat')).toBeNull();
  });

  it('lets a batch skip only the invalid chats instead of aborting the whole import', () => {
    const incoming = [
      { id: 'good-1', messages: [{ role: 'user', content: 'a' }] },
      { id: 'bad-no-role', messages: [{ content: 'orphan' }] }, // previously threw and killed everything
      { id: 'good-2', messages: [{ role: 'assistant', content: 'b' }] },
      { messages: [{ role: 'user', content: 'c' }] }, // missing id
    ];

    let invalid = 0;

    const validated = incoming.reduce<ReturnType<typeof validateImportedChat>[]>((acc, chat) => {
      const v = validateImportedChat(chat);

      if (v) {
        acc.push(v);
      } else {
        invalid++;
      }

      return acc;
    }, []);

    expect(invalid).toBe(2);
    expect(validated.map((c) => c!.id)).toEqual(['good-1', 'good-2']);
  });
});
