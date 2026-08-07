/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const streamTextMock = vi.fn();

vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: streamTextMock,
}));

vi.mock('~/lib/.server/require-session', () => ({
  requireWebSession: vi.fn(),
}));

async function loadAction() {
  const mod = await import('./api.agent.self-repair');
  return mod.action;
}

function makeRequest(init: { method?: string; body?: string; cookie?: string } = {}): Request {
  return new Request('https://test.local/api/agent/self-repair', {
    method: init.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body,
  });
}

function actionArgs(request: Request) {
  return { request, context: { cloudflare: { env: {} } }, params: {} } as any;
}

describe('POST /api/agent/self-repair', () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 405 for non-POST methods', async () => {
    const action = await loadAction();
    const response = await action(actionArgs(makeRequest({ method: 'GET' })));

    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({
      error: 'This request method is not supported.',
      code: 'METHOD_NOT_ALLOWED',
    });
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const action = await loadAction();
    const response = await action(actionArgs(makeRequest({ body: 'not-json' })));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'The request body must contain valid JSON.',
      code: 'INVALID_JSON_BODY',
    });
  });

  it('returns 400 when prompt is missing or empty', async () => {
    const action = await loadAction();

    const missing = await action(actionArgs(makeRequest({ body: JSON.stringify({}) })));
    expect(missing.status).toBe(400);

    const empty = await action(actionArgs(makeRequest({ body: JSON.stringify({ prompt: '' }) })));
    expect(empty.status).toBe(400);
  });

  it('returns 413 when prompt exceeds the size budget', async () => {
    const action = await loadAction();
    const huge = 'x'.repeat(64_001);
    const response = await action(actionArgs(makeRequest({ body: JSON.stringify({ prompt: huge }) })));

    expect(response.status).toBe(413);
  });

  it('forwards the prompt to streamText and returns the resolved content', async () => {
    streamTextMock.mockResolvedValueOnce({ text: Promise.resolve('corrected file body') });

    const action = await loadAction();

    const response = await action(
      actionArgs(
        makeRequest({
          body: JSON.stringify({ prompt: 'fix this hunk' }),
          cookie:
            'apiKeys=' +
            encodeURIComponent(JSON.stringify({ Anthropic: 'sk-test' })) +
            '; providers=' +
            encodeURIComponent(JSON.stringify({ Anthropic: { enabled: true } })),
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: 'corrected file body' });

    expect(streamTextMock).toHaveBeenCalledTimes(1);

    const call = streamTextMock.mock.calls[0][0];
    expect(call.messages).toEqual([{ id: 'self-repair', role: 'user', content: 'fix this hunk' }]);
    expect(call.apiKeys).toEqual({ Anthropic: 'sk-test' });
    expect(call.providerSettings).toEqual({ Anthropic: { enabled: true } });
    expect(call.promptId).toBe('self-repair');
  });

  it('forwards request.signal as abortSignal so a client Stop/timeout cancels the upstream provider', async () => {
    streamTextMock.mockResolvedValueOnce({ text: Promise.resolve('ok') });

    const action = await loadAction();
    const request = makeRequest({ body: JSON.stringify({ prompt: 'fix this hunk' }) });

    await action(actionArgs(request));

    const call = streamTextMock.mock.calls[0][0];

    /*
     * The abort signal must be the *same* signal the client connection carries,
     * otherwise a disconnect/Stop cannot cancel the in-flight provider request.
     */
    expect(call.abortSignal).toBe(request.signal);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('prepends [Model:]/[Provider:] tags so streamText routes to the active model', async () => {
    streamTextMock.mockResolvedValueOnce({ text: Promise.resolve('corrected file body') });

    const action = await loadAction();

    const response = await action(
      actionArgs(
        makeRequest({
          body: JSON.stringify({
            prompt: 'fix this hunk',
            model: 'claude-3-5-sonnet-latest',
            provider: 'Anthropic',
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);

    const call = streamTextMock.mock.calls[0][0];

    /*
     * MODEL_REGEX is anchored to the start; the Provider tag follows. Both are
     * double-newline terminated so extractPropertiesFromMessage can strip them.
     */
    expect(call.messages).toEqual([
      {
        id: 'self-repair',
        role: 'user',
        content: '[Model: claude-3-5-sonnet-latest]\n\n[Provider: Anthropic]\n\nfix this hunk',
      },
    ]);
  });

  it('leaves the prompt untagged when no model/provider is supplied', async () => {
    streamTextMock.mockResolvedValueOnce({ text: Promise.resolve('ok') });

    const action = await loadAction();

    await action(actionArgs(makeRequest({ body: JSON.stringify({ prompt: 'fix this hunk' }) })));

    const call = streamTextMock.mock.calls[0][0];
    expect(call.messages).toEqual([{ id: 'self-repair', role: 'user', content: 'fix this hunk' }]);
  });

  it('returns 502 when the LLM call rejects', async () => {
    streamTextMock.mockRejectedValueOnce(new Error('SECRET_PROVIDER_DETAIL: quota exhausted'));

    const action = await loadAction();
    const response = await action(actionArgs(makeRequest({ body: JSON.stringify({ prompt: 'fix this hunk' }) })));

    expect(response.status).toBe(502);

    const body = await response.json();

    expect(body).toMatchObject({
      error: 'Self-repair could not be completed. Please try again.',
      code: 'SELF_REPAIR_FAILED',
    });
    expect(JSON.stringify(body)).not.toContain('SECRET_PROVIDER_DETAIL');
  });

  it('localizes errors from the manual language cookie before Accept-Language', async () => {
    const action = await loadAction();
    const request = makeRequest({ method: 'GET' });

    const localizedRequest = new Request(request, {
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        cookie: 'vibecore-lang=fr',
        'accept-language': 'en-US,en;q=0.9',
      },
    });

    const response = await action(actionArgs(localizedRequest));

    expect(response.status).toBe(405);
    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('Vary')).toContain('Cookie');
    expect(await response.json()).toMatchObject({
      error: 'Cette méthode de requête n’est pas prise en charge.',
      code: 'METHOD_NOT_ALLOWED',
    });
  });

  it('returns 400 when the apiKeys cookie is malformed JSON', async () => {
    const action = await loadAction();

    const response = await action(
      actionArgs(
        makeRequest({
          body: JSON.stringify({ prompt: 'fix' }),
          cookie: 'apiKeys=' + encodeURIComponent('not-json'),
        }),
      ),
    );

    expect(response.status).toBe(400);
  });
});
