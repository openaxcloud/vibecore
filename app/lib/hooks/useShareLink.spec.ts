import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';

import { buildShareRequestBody } from './useShareLink';

const MESSAGES: Message[] = [
  { id: 'u1', role: 'user', content: 'Build a todo app' },
  { id: 'a1', role: 'assistant', content: 'Here is the plan…' },
  { id: 'u2', role: 'user', content: 'Add dark mode' },
];

describe('buildShareRequestBody', () => {
  it('carries the conversation metadata and visible message ids', () => {
    const body = buildShareRequestBody({
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      title: 'Demo',
      messages: MESSAGES,
    });

    expect(body.conversationId).toBe('conv-1');
    expect(body.projectId).toBe('proj-1');
    expect(body.title).toBe('Demo');
    expect(body.visibleMessageIds).toEqual(['u1', 'a1', 'u2']);
    expect(body.allowFork).toBe(false);
    expect(body.inlineMessages).toHaveLength(3);
  });

  it('honours allowedMessageIds', () => {
    const body = buildShareRequestBody({
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      messages: MESSAGES,
      allowedMessageIds: new Set(['u1', 'a1']),
    });

    expect(body.visibleMessageIds).toEqual(['u1', 'a1']);
    expect(body.inlineMessages?.map((message) => message.id)).toEqual(['u1', 'a1']);
  });

  it('drops messages without an id from visibleMessageIds', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'has id' },
      { role: 'user', content: 'no id' } as Message,
    ];

    const body = buildShareRequestBody({
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      messages,
    });

    expect(body.visibleMessageIds).toEqual(['u1']);
  });

  it('passes through allowFork', () => {
    const body = buildShareRequestBody({
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      messages: MESSAGES,
      allowFork: true,
    });

    expect(body.allowFork).toBe(true);
  });
});
