import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';
import { computeRewindTruncation } from './chat-rewind';

function msg(id: string, role: Message['role'], content = id): Message {
  return { id, role, content } as Message;
}

describe('computeRewindTruncation', () => {
  const conversation: Message[] = [
    msg('u1', 'user'),
    msg('a1', 'assistant'),
    msg('u2', 'user'),
    msg('a2', 'assistant'),
  ];

  it('drops the targeted assistant message and everything after it', () => {
    const result = computeRewindTruncation(conversation, 'a2');
    expect(result?.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
  });

  it('regenerating the first assistant response keeps only the first user prompt', () => {
    const result = computeRewindTruncation(conversation, 'a1');
    expect(result?.map((m) => m.id)).toEqual(['u1']);
  });

  it('returns null for an unknown message id', () => {
    expect(computeRewindTruncation(conversation, 'nope')).toBeNull();
  });

  it('returns null when the target is the first message (nothing precedes it)', () => {
    expect(computeRewindTruncation(conversation, 'u1')).toBeNull();
  });

  it('returns null when no user prompt would remain to regenerate from', () => {
    // assistant-led conversation: truncating before a1 leaves [system] only
    const odd: Message[] = [msg('s1', 'system'), msg('a1', 'assistant')];
    expect(computeRewindTruncation(odd, 'a1')).toBeNull();
  });

  it('does not mutate the input array', () => {
    const copy = [...conversation];
    computeRewindTruncation(conversation, 'a2');
    expect(conversation).toEqual(copy);
  });
});
