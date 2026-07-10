import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiWireDiagnosticFetch,
  describeOpenAiWireBody,
  fingerprintOpenAiPrefix,
  hashString,
} from './wire-diagnostics';

const chatUrl = 'https://api.openai.com/v1/chat/completions';

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

describe('fingerprintOpenAiPrefix', () => {
  const tools = [
    { type: 'function', function: { name: 'read_file', description: 'Read a file' } },
    { type: 'function', function: { name: 'write_file', description: 'Write a file' } },
  ];
  const base = {
    model: 'gpt-4o',
    tools,
    messages: [
      { role: 'system', content: 'SYSTEM HEAD' },
      { role: 'user', content: 'first turn' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'second turn' },
    ],
  };

  it('hashes tools/system/messages/response_format separately and gives a combined hash', () => {
    const fp = fingerprintOpenAiPrefix(JSON.stringify(base))!;
    expect(fp.toolsCount).toBe(2);
    expect(fp.responseFormatHash).toBeNull();
    expect(typeof fp.toolsHash).toBe('string');
    expect(typeof fp.systemHash).toBe('string');
    expect(typeof fp.firstMessagesHash).toBe('string');
    expect(typeof fp.effectivePrefixHash).toBe('string');
  });

  it('is stable for identical tools + system (the cache-hit case)', () => {
    const a = fingerprintOpenAiPrefix(JSON.stringify(base))!;
    const b = fingerprintOpenAiPrefix(JSON.stringify({ ...base, messages: [...base.messages] }))!;
    expect(b.toolsHash).toBe(a.toolsHash);
    expect(b.systemHash).toBe(a.systemHash);
    expect(b.effectivePrefixHash).toBe(a.effectivePrefixHash);
  });

  it('toolsHash flips when tool ORDER changes (the invalidator we hunt)', () => {
    const reordered = { ...base, tools: [tools[1], tools[0]] };
    const a = fingerprintOpenAiPrefix(JSON.stringify(base))!;
    const b = fingerprintOpenAiPrefix(JSON.stringify(reordered))!;
    expect(b.toolsHash).not.toBe(a.toolsHash);
    expect(b.systemHash).toBe(a.systemHash); // system unaffected
  });

  it('toolsHash flips when a tool DESCRIPTION changes', () => {
    const edited = {
      ...base,
      tools: [tools[0], { type: 'function', function: { name: 'write_file', description: 'CHANGED' } }],
    };
    expect(fingerprintOpenAiPrefix(JSON.stringify(edited))!.toolsHash).not.toBe(
      fingerprintOpenAiPrefix(JSON.stringify(base))!.toolsHash,
    );
  });

  it('firstMessagesHash excludes the final (current) user turn', () => {
    const nextTurn = {
      ...base,
      messages: [...base.messages, { role: 'assistant', content: 'done' }, { role: 'user', content: 'third turn' }],
    };
    // Same append-only prefix through the previous turn → prefix hash must NOT change with a new final turn.
    const a = fingerprintOpenAiPrefix(
      JSON.stringify({ ...base, messages: base.messages.slice(0, -1).concat({ role: 'user', content: 'X' }) }),
    )!;
    const b = fingerprintOpenAiPrefix(
      JSON.stringify({ ...base, messages: base.messages.slice(0, -1).concat({ role: 'user', content: 'DIFFERENT' }) }),
    )!;
    expect(b.firstMessagesHash).toBe(a.firstMessagesHash);
    expect(nextTurn).toBeTruthy();
  });

  it('reports a responseFormatHash when response_format is present', () => {
    const withFormat = { ...base, response_format: { type: 'json_object' } };
    const fp = fingerprintOpenAiPrefix(JSON.stringify(withFormat))!;
    expect(fp.responseFormatHash).toBe(hashString(JSON.stringify({ type: 'json_object' })));
  });

  it('returns null on a malformed / non-chat body and never throws', () => {
    expect(fingerprintOpenAiPrefix('not json')).toBeNull();
    expect(fingerprintOpenAiPrefix(JSON.stringify({ foo: 1 }))).toBeNull();
  });

  it('treats an absent tools array as zero tools without throwing', () => {
    const fp = fingerprintOpenAiPrefix(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }))!;
    expect(fp.toolsCount).toBe(0);
  });
});

describe('createOpenAiWireDiagnosticFetch — prefix.fingerprint + drift', () => {
  const makeBody = (toolsFirst: boolean) =>
    JSON.stringify({
      model: 'gpt-4o',
      tools: toolsFirst
        ? [{ function: { name: 'a' } }, { function: { name: 'b' } }]
        : [{ function: { name: 'b' } }, { function: { name: 'a' } }],
      messages: [
        { role: 'system', content: 'HEAD' },
        { role: 'user', content: 'turn' },
      ],
    });

  it('emits a prefix.fingerprint line for a chat request', async () => {
    const logs: string[] = [];
    const wrapped = createOpenAiWireDiagnosticFetch(
      (async () => new Response('ok')) as unknown as typeof fetch,
      { info: (...a: unknown[]) => logs.push(String(a[0])) },
      { cacheAffinityKey: 'conv-1' },
    );
    await wrapped(chatUrl, { method: 'POST', body: makeBody(true) });
    expect(logs.some((l) => l.includes('prefix.fingerprint') && l.includes('"conversation":"conv-1"'))).toBe(true);
  });

  it('WARNs prefix.drift when toolsHash flips between two consecutive turns of the same conversation', async () => {
    const infos: string[] = [];
    const warns: string[] = [];
    const wrapped = createOpenAiWireDiagnosticFetch(
      (async () => new Response('ok')) as unknown as typeof fetch,
      { info: (...a: unknown[]) => infos.push(String(a[0])), warn: (...a: unknown[]) => warns.push(String(a[0])) },
      { cacheAffinityKey: 'conv-drift' },
    );
    await wrapped(chatUrl, { method: 'POST', body: makeBody(true) });
    await wrapped(chatUrl, { method: 'POST', body: makeBody(false) }); // tools reordered → drift
    expect(warns.some((l) => l.includes('prefix.drift') && l.includes('"toolsHashChanged":true'))).toBe(true);
  });

  it('does NOT warn when the prefix is byte-stable across turns', async () => {
    const warns: string[] = [];
    const wrapped = createOpenAiWireDiagnosticFetch(
      (async () => new Response('ok')) as unknown as typeof fetch,
      { info: () => {}, warn: (...a: unknown[]) => warns.push(String(a[0])) },
      { cacheAffinityKey: 'conv-stable' },
    );
    await wrapped(chatUrl, { method: 'POST', body: makeBody(true) });
    await wrapped(chatUrl, { method: 'POST', body: makeBody(true) });
    expect(warns).toHaveLength(0);
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
