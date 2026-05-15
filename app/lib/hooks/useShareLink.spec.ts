import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';

import { buildShareUrl } from './useShareLink';

const MESSAGES: Message[] = [
  { id: 'u1', role: 'user', content: 'Build a todo app' },
  { id: 'a1', role: 'assistant', content: 'Here is the plan…' },
  { id: 'u2', role: 'user', content: 'Add dark mode' },
];

describe('buildShareUrl', () => {
  it('produces a URL under /share/ with a base64url token', () => {
    const url = buildShareUrl({
      origin: 'https://vibecore.io',
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      title: 'Demo',
      messages: MESSAGES,
      now: () => new Date('2026-05-15T12:00:00.000Z'),
    });

    expect(url.startsWith('https://vibecore.io/share/')).toBe(true);

    const token = url.split('/share/')[1];
    expect(token).not.toMatch(/[+/=]/);
  });

  it('honours allowedMessageIds', () => {
    const url = buildShareUrl({
      origin: 'https://vibecore.io',
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      messages: MESSAGES,
      allowedMessageIds: new Set(['u1', 'a1']),
    });

    const token = url.split('/share/')[1];
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const padding = pad === 0 ? '' : '='.repeat(4 - pad);
    const decoded = JSON.parse(Buffer.from(padded + padding, 'base64').toString('utf-8'));

    expect(decoded.visibleMessageIds).toEqual(['u1', 'a1']);
  });

  it('strips trailing slash from the origin', () => {
    const url = buildShareUrl({
      origin: 'https://vibecore.io/',
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      messages: MESSAGES,
    });

    expect(url.startsWith('https://vibecore.io/share/')).toBe(true);
    expect(url).not.toContain('//share');
  });

  it('drops messages without an id from visibleMessageIds', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'has id' },
      { role: 'user', content: 'no id' } as Message,
    ];

    const url = buildShareUrl({
      origin: 'https://vibecore.io',
      conversationId: 'conv-1',
      projectId: 'proj-1',
      authorUserId: 'user-1',
      messages,
    });

    const token = url.split('/share/')[1];
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const padding = pad === 0 ? '' : '='.repeat(4 - pad);
    const decoded = JSON.parse(Buffer.from(padded + padding, 'base64').toString('utf-8'));

    expect(decoded.visibleMessageIds).toEqual(['u1']);
  });
});
