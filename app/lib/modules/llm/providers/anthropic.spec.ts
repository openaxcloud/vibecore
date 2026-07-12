import { describe, expect, it, vi } from 'vitest';

/*
 * `anthropic.ts` -> `base-provider.ts` -> `manager.ts` -> `registry.ts` -> every
 * provider -> `base-provider.ts` is a circular import. During a unit test that
 * only exercises the pure label helper, evaluating the registry is both
 * unnecessary and (because of the cycle) leaves BaseProvider undefined at the
 * point a sibling provider tries to extend it. Stubbing the manager severs the
 * cycle so the real exported helper under test loads cleanly.
 */
vi.mock('../manager', () => ({ LLMManager: class {} }));

const { buildAnthropicModelLabel, createAnthropicCachingFetch, anthropicCacheMinTokens } = await import('./anthropic');
const { ANTHROPIC_CACHE_BREAKPOINT } = await import('~/lib/modules/llm/cache-breakpoint');

describe('createAnthropicCachingFetch', () => {
  const parseBody = (init: RequestInit | undefined) => JSON.parse((init?.body as string) ?? '{}');

  it('rewrites a string system into a cache_control ephemeral block', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);

    await wrapped('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ system: 'STABLE PREFIX', messages: [{ role: 'user', content: 'hi' }] }),
    });

    const sent = parseBody(base.mock.calls[0][1] as RequestInit);
    expect(sent.system).toEqual([{ type: 'text', text: 'STABLE PREFIX', cache_control: { type: 'ephemeral' } }]);

    // The rest of the body is untouched.
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('splits a sentinel-marked system into a 1h-cached head and an ephemeral tail, stripping the sentinel', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);

    await wrapped('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        system: `STABLE HEAD${ANTHROPIC_CACHE_BREAKPOINT}VARIABLE TAIL`,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    const sent = parseBody(base.mock.calls[0][1] as RequestInit);
    expect(sent.system).toEqual([
      { type: 'text', text: 'STABLE HEAD', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: 'VARIABLE TAIL', cache_control: { type: 'ephemeral' } },
    ]);

    // The sentinel must never reach the wire.
    expect(JSON.stringify(sent)).not.toContain('__ECODE_CACHE_BP__');
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('emits a single head block when the sentinel leaves an empty tail', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);

    await wrapped('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ system: `STABLE HEAD${ANTHROPIC_CACHE_BREAKPOINT}`, messages: [] }),
    });

    const sent = parseBody(base.mock.calls[0][1] as RequestInit);
    expect(sent.system).toEqual([
      { type: 'text', text: 'STABLE HEAD', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
  });

  it('leaves a body without a system field unchanged', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });

    await wrapped('https://api.anthropic.com/v1/messages', { method: 'POST', body });

    expect((base.mock.calls[0][1] as RequestInit).body).toBe(body);
  });

  it('does not throw and passes the request through on a non-JSON body', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);

    await expect(
      wrapped('https://api.anthropic.com/v1/messages', { method: 'POST', body: 'not json but "system" appears' }),
    ).resolves.toBeInstanceOf(Response);
    expect(base).toHaveBeenCalledOnce();
  });

  it('ignores an empty/whitespace system (nothing worth caching)', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);
    const body = JSON.stringify({ system: '   ', messages: [] });

    await wrapped('https://api.anthropic.com/v1/messages', { method: 'POST', body });

    expect((base.mock.calls[0][1] as RequestInit).body).toBe(body);
  });

  it('caches the conversation prefix: cache_control on the last STABLE message when the prefix clears the model minimum', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);

    // prefix (all but the last) ≈ 5000 chars / 4 ≈ 1250 tok ≥ 1024 (sonnet).
    await wrapped('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        system: 'S',
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'user', content: 'x'.repeat(5000) },
          { role: 'assistant', content: 'stable answer' },
          { role: 'user', content: 'latest volatile turn' },
        ],
      }),
    });

    const sent = parseBody(base.mock.calls[0][1] as RequestInit);

    // Breakpoint lands on messages[len-2] (the last stable message), not the volatile last turn.
    expect(sent.messages[1].content).toEqual([
      { type: 'text', text: 'stable answer', cache_control: { type: 'ephemeral' } },
    ]);
    expect(sent.messages[2].content).toBe('latest volatile turn'); // last message untouched
  });

  it('does NOT spend a message breakpoint on a conversation below the model minimum', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createAnthropicCachingFetch(base as unknown as typeof fetch);

    await wrapped('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        system: 'S',
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'user', content: 'tiny' },
          { role: 'user', content: 'also tiny' },
        ],
      }),
    });

    const sent = parseBody(base.mock.calls[0][1] as RequestInit);
    expect(sent.messages[0].content).toBe('tiny'); // untouched — below threshold
  });
});

describe('anthropicCacheMinTokens (per-model)', () => {
  it('is 2048 for Haiku, 1024 for Sonnet/Opus, 1024 default', () => {
    expect(anthropicCacheMinTokens('claude-haiku-4-5-20251001')).toBe(2048);
    expect(anthropicCacheMinTokens('claude-sonnet-4-5-20250929')).toBe(1024);
    expect(anthropicCacheMinTokens('claude-opus-4-8')).toBe(1024);
    expect(anthropicCacheMinTokens(undefined)).toBe(1024);
  });
});

describe('buildAnthropicModelLabel', () => {
  it('uses display_name when present', () => {
    expect(buildAnthropicModelLabel({ display_name: 'Claude Opus 4.8', id: 'claude-opus-4-8' }, 1_000_000)).toBe(
      'Claude Opus 4.8 (1000k context)',
    );
  });

  it('falls back to the model id when display_name is missing', () => {
    expect(buildAnthropicModelLabel({ id: 'claude-opus-4-8' }, 200000)).toBe('claude-opus-4-8 (200k context)');
  });

  it('falls back to the model id when display_name is null', () => {
    expect(buildAnthropicModelLabel({ display_name: null, id: 'claude-future-1' }, 200000)).toBe(
      'claude-future-1 (200k context)',
    );
  });

  it('never renders a literal "undefined" label', () => {
    const label = buildAnthropicModelLabel({ id: 'claude-future-1' }, 200000);
    expect(label).not.toContain('undefined');
  });
});
