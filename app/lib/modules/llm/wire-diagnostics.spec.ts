import { describe, expect, it, vi } from 'vitest';
import { createOpenAiWireDiagnosticFetch, describeOpenAiWireBody, hashString } from './wire-diagnostics';

describe('describeOpenAiWireBody', () => {
  it('measures the real system + messages sizes on the wire', () => {
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'SYSTEM PROMPT HEAD' },
        { role: 'user', content: 'make footer bold' },
      ],
    });

    const shape = describeOpenAiWireBody(body)!;
    expect(shape.messagesCount).toBe(2);
    expect(shape.systemChars).toBe('SYSTEM PROMPT HEAD'.length);
    expect(shape.firstUserChars).toBe('make footer bold'.length);
    expect(shape.systemHash).toBe(hashString('SYSTEM PROMPT HEAD'));
  });

  it('handles array-of-parts content', () => {
    const body = JSON.stringify({
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'AB' },
            { type: 'text', text: 'CD' },
          ],
        },
      ],
    });
    expect(describeOpenAiWireBody(body)!.systemChars).toBe(4);
  });

  it('returns null for a non-chat body', () => {
    expect(describeOpenAiWireBody(JSON.stringify({ foo: 1 }))).toBeNull();
  });
});

describe('createOpenAiWireDiagnosticFetch', () => {
  it('logs wire.payload for a chat-completions request and forwards it unchanged', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const logs: string[] = [];

    const wrapped = createOpenAiWireDiagnosticFetch(base as unknown as typeof fetch, {
      info: (...a: unknown[]) => logs.push(String(a[0])),
    });

    const body = JSON.stringify({ messages: [{ role: 'system', content: 'HEAD' }] });
    await wrapped('https://api.openai.com/v1/chat/completions', { method: 'POST', body });

    expect(base).toHaveBeenCalledOnce();
    expect((base.mock.calls[0][1] as RequestInit).body).toBe(body); // unchanged
    expect(logs.some((l) => l.includes('wire.payload') && l.includes('"systemChars":4'))).toBe(true);
  });

  it('does not log for non-chat URLs and never throws on a bad body', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const logs: string[] = [];

    const wrapped = createOpenAiWireDiagnosticFetch(base as unknown as typeof fetch, {
      info: (...a: unknown[]) => logs.push(String(a[0])),
    });

    await wrapped('https://api.openai.com/v1/models', { method: 'GET' });
    await expect(
      wrapped('https://api.openai.com/v1/chat/completions', { method: 'POST', body: 'not json' }),
    ).resolves.toBeInstanceOf(Response);
    expect(logs).toHaveLength(0);
  });
});
