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

const { buildAnthropicModelLabel, createAnthropicCachingFetch } = await import('./anthropic');

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
