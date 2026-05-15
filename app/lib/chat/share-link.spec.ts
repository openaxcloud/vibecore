import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  buildShareLinkUrl,
  decodeShareLinkPayload,
  encodeShareLinkPayload,
  selectShareableMessages,
  type ShareLinkPayload,
} from './share-link';

const PAYLOAD: ShareLinkPayload = {
  conversationId: 'conv-1',
  title: 'Build a todo app',
  projectId: 'proj-1',
  authorUserId: 'user-42',
  createdAt: '2026-05-15T12:00:00.000Z',
  visibleMessageIds: ['u1', 'a1', 'u2', 'a2'],
  allowFork: false,
};

describe('encodeShareLinkPayload / decodeShareLinkPayload', () => {
  it('round-trips a payload through base64url', () => {
    const encoded = encodeShareLinkPayload(PAYLOAD);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');

    expect(decodeShareLinkPayload(encoded)).toEqual(PAYLOAD);
  });

  it('rejects invalid payloads', () => {
    const bogus = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
    expect(() => decodeShareLinkPayload(bogus)).toThrowError(/Invalid share-link payload/);
  });

  it('rejects payloads that exceed the size cap', () => {
    const huge: ShareLinkPayload = {
      ...PAYLOAD,
      visibleMessageIds: Array.from({ length: 5000 }, (_unused, idx) => `m${idx}-${'x'.repeat(80)}`),
    };

    expect(() => encodeShareLinkPayload(huge)).toThrowError(/exceeds/);
  });
});

describe('buildShareLinkUrl', () => {
  it('appends the encoded payload under /share/', () => {
    expect(buildShareLinkUrl('https://vibecore.io', 'token-123')).toBe('https://vibecore.io/share/token-123');
  });

  it('strips a trailing slash from the origin', () => {
    expect(buildShareLinkUrl('https://vibecore.io/', 'token-123')).toBe('https://vibecore.io/share/token-123');
  });

  it('rejects an empty token', () => {
    expect(() => buildShareLinkUrl('https://vibecore.io', '')).toThrowError(/empty/);
  });
});

describe('selectShareableMessages', () => {
  it('returns every message when no filter is supplied', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a1', role: 'assistant', content: 'hello' },
    ];
    expect(selectShareableMessages(messages)).toEqual(messages);
  });

  it('filters to the allow-list', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a1', role: 'assistant', content: 'hello' },
      { id: 'u2', role: 'user', content: 'private' },
    ];

    const allowed = new Set(['u1', 'a1']);
    expect(selectShareableMessages(messages, { allowedIds: allowed }).map((message) => message.id)).toEqual([
      'u1',
      'a1',
    ]);
  });

  it('drops messages without an id when a filter is in effect', () => {
    const messages: Message[] = [
      { role: 'user', content: 'no id' } as Message,
      { id: 'u1', role: 'user', content: 'has id' },
    ];

    expect(selectShareableMessages(messages, { allowedIds: new Set(['u1']) })).toHaveLength(1);
  });
});
