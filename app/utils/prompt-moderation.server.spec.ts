import { describe, expect, it, vi } from 'vitest';
import { describeFlaggedCategories, moderateProjectPrompt } from './prompt-moderation.server';

/**
 * Build a minimal Response stand-in compatible with the moderation function.
 * We can't use the real `Response` class everywhere because the
 * Cloudflare-Workers types in this project sometimes ship without it.
 */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function firstFetchCall(fetchImpl: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
}

describe('moderateProjectPrompt', () => {
  const env = { OPENAI_API_KEY: 'sk-test-key' };

  it('returns checked=false / reason=empty_input on whitespace-only input', async () => {
    const fetchImpl = vi.fn();
    const result = await moderateProjectPrompt('   ', { serverEnv: env, fetchImpl });
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('empty_input');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns checked=false / reason=no_provider_configured when the API key is missing', async () => {
    const fetchImpl = vi.fn();

    const result = await moderateProjectPrompt('build a polished portfolio', {
      serverEnv: {},
      fetchImpl,
    });
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no_provider_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows a clean prompt and returns the raw scores', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            flagged: false,
            categories: { sexual: false, violence: false },
            category_scores: { sexual: 0.001, violence: 0.0005 },
          },
        ],
      }),
    );

    const result = await moderateProjectPrompt('Build a polished portfolio website.', {
      serverEnv: env,
      fetchImpl,
    });

    expect(result.checked).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.flaggedCategories).toEqual([]);
    expect(result.scores.sexual).toBeCloseTo(0.001, 4);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = firstFetchCall(fetchImpl);
    expect(url).toBe('https://api.openai.com/v1/moderations');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as { model: string; input: string };
    expect(body.model).toBe('omni-moderation-latest');
    expect(body.input).toBe('Build a polished portfolio website.');
  });

  it('blocks a prompt when OpenAI flags any category', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            flagged: true,
            categories: { violence: true, harassment: false },
            category_scores: { violence: 0.94, harassment: 0.1 },
          },
        ],
      }),
    );

    const result = await moderateProjectPrompt('Some prompt that trips the policy.', {
      serverEnv: env,
      fetchImpl,
    });

    expect(result.checked).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.flaggedCategories).toEqual(['violence']);
  });

  it('blocks even when only the flagged: true bit is set without per-category booleans', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [
          {
            flagged: true,
            categories: {},
            category_scores: {},
          },
        ],
      }),
    );

    const result = await moderateProjectPrompt('borderline input', { serverEnv: env, fetchImpl });
    expect(result.allowed).toBe(false);
    expect(result.flaggedCategories).toEqual([]);
  });

  it('fail-opens on a 5xx response with reason=provider_error', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, { ok: false, status: 502 }));
    const result = await moderateProjectPrompt('build a portfolio', { serverEnv: env, fetchImpl });
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('provider_error');
    expect(result.error).toBe('MODERATION_HTTP_ERROR');
    expect(result.providerStatus).toBe(502);
  });

  it('fail-opens on a network exception with reason=provider_error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    const result = await moderateProjectPrompt('build a portfolio', { serverEnv: env, fetchImpl });
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('provider_error');
    expect(result.error).toBe('MODERATION_TRANSPORT_ERROR');
  });

  it('fail-opens when the response body is missing results[]', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const result = await moderateProjectPrompt('hello', { serverEnv: env, fetchImpl });
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('provider_error');
    expect(result.error).toBe('MODERATION_RESULTS_MISSING');
  });

  it('forwards a bounded AbortSignal to fetch so the request can time out', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      }),
    );

    const signal = AbortSignal.timeout(8_000);

    await moderateProjectPrompt('build a portfolio', { serverEnv: env, fetchImpl, signal });

    const [, init] = firstFetchCall(fetchImpl);
    expect(init.signal).toBe(signal);
  });

  it('fail-opens with reason=provider_error when the signal aborts (timeout)', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      void init;

      throw error;
    });

    const result = await moderateProjectPrompt('build a portfolio', {
      serverEnv: env,
      fetchImpl,
      signal: AbortSignal.abort(),
    });

    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('provider_error');
  });

  it('respects custom endpoint and model overrides', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      }),
    );

    await moderateProjectPrompt('hello world', {
      serverEnv: env,
      fetchImpl,
      endpoint: 'https://example.com/v1/moderations',
      model: 'my-test-model',
    });

    const [url, init] = firstFetchCall(fetchImpl);
    expect(url).toBe('https://example.com/v1/moderations');

    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('my-test-model');
  });
});

describe('describeFlaggedCategories', () => {
  it('returns "content policy" for an empty array', () => {
    expect(describeFlaggedCategories([])).toBe('content policy');
  });

  it('returns a single category label readable to humans', () => {
    expect(describeFlaggedCategories(['violence'])).toBe('violence');
    expect(describeFlaggedCategories(['sexual/minors'])).toBe('sexual / minors');
  });

  it('joins multiple categories with commas + "and"', () => {
    expect(describeFlaggedCategories(['hate', 'violence', 'self-harm'])).toBe('hate, violence and self-harm');
  });
});
