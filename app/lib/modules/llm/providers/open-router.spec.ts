import { describe, expect, it, vi } from 'vitest';

/*
 * Same circular-import guard as anthropic.spec: stub the manager so importing the
 * provider module for the pure fetch helper doesn't drag the whole registry in.
 */
vi.mock('../manager', () => ({ LLMManager: class {} }));

const { createOpenRouterCachingFetch } = await import('./open-router');
const { ANTHROPIC_CACHE_BREAKPOINT } = await import('~/lib/modules/llm/cache-breakpoint');

describe('createOpenRouterCachingFetch', () => {
  const parseBody = (init: RequestInit | undefined) => JSON.parse((init?.body as string) ?? '{}');

  it('rewrites the system message of an anthropic-backed model into a cache_control content array', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createOpenRouterCachingFetch(base as unknown as typeof fetch);

    await wrapped('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: `STABLE HEAD${ANTHROPIC_CACHE_BREAKPOINT}VARIABLE TAIL` },
          { role: 'user', content: 'hi' },
        ],
      }),
    });

    const sent = parseBody(base.mock.calls[0][1] as RequestInit);
    expect(sent.messages[0]).toEqual({
      role: 'system',
      content: [
        { type: 'text', text: 'STABLE HEAD', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'VARIABLE TAIL' },
      ],
    });

    // The sentinel must never reach the wire.
    expect(JSON.stringify(sent)).not.toContain('__ECODE_CACHE_BP__');
    expect(sent.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('leaves a non-anthropic model body untouched even if a sentinel somehow appears', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createOpenRouterCachingFetch(base as unknown as typeof fetch);

    const body = JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{ role: 'system', content: `HEAD${ANTHROPIC_CACHE_BREAKPOINT}TAIL` }],
    });

    await wrapped('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body });

    /*
     * No sentinel in the body would normally trigger the early-return; this one has it
     * but the model is not anthropic-backed, so the body is forwarded verbatim.
     */
    expect((base.mock.calls[0][1] as RequestInit).body).toBe(body);
  });

  it('leaves a body without the sentinel untouched', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createOpenRouterCachingFetch(base as unknown as typeof fetch);

    const body = JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'system', content: 'plain system' }],
    });

    await wrapped('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body });

    expect((base.mock.calls[0][1] as RequestInit).body).toBe(body);
  });

  it('does not throw and passes through on a malformed body', async () => {
    const base = vi.fn(async () => new Response('ok'));
    const wrapped = createOpenRouterCachingFetch(base as unknown as typeof fetch);

    await expect(
      wrapped('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        body: `not json but ${ANTHROPIC_CACHE_BREAKPOINT} appears`,
      }),
    ).resolves.toBeInstanceOf(Response);
    expect(base).toHaveBeenCalledOnce();
  });
});
